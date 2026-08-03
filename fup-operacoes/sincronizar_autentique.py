# -*- coding: utf-8 -*-
"""
Sincronização diária com o Autentique: busca contratos de parceria
totalmente assinados, extrai os dados do PDF (usina, concessionária, UG,
geração estimada, GD1/GD2, potência CA/CC) e cria um registro PENDENTE em
contratos_pendentes pra alguém revisar e aprovar na tela /pendentes.

Não cria a usina sozinho -- só deixa pronta a pendência de aprovação.

Uso: python sincronizar_autentique.py
Agendado via Agendador de Tarefas do Windows pra rodar 1x por dia (06:00).
"""
import json
import io
import os
import re
import time
from datetime import datetime, timedelta

import pdfplumber
import requests

import db

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "autentique_config.json")
LOG_PATH = os.path.join(os.path.dirname(__file__), "sincronizar_autentique.log")

RE_CODIGO = re.compile(r"(PP-[A-Z0-9]+-[A-Z]{2}-GD[12]-\d{4,8}-R\d{2}-\d+)", re.IGNORECASE)

GRAPHQL_QUERY = """
query ($page: Int) {
  documents(limit: 60, page: $page) {
    total
    data {
      id
      name
      signatures {
        action { name }
        signed { created_at }
      }
      files { signed }
    }
  }
}
"""


def log(msg):
    linha = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(linha)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(linha + "\n")


def carregar_token():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)["token"]


def buscar_pagina(token, pagina, tentativas=5):
    ultimo_erro = None
    for tentativa in range(1, tentativas + 1):
        try:
            r = requests.post(
                "https://api.autentique.com.br/v2/graphql",
                json={"query": GRAPHQL_QUERY, "variables": {"page": pagina}},
                headers={"Authorization": f"Bearer {token}"},
                timeout=60,
            )
            r.raise_for_status()
            corpo = r.json()
            if "errors" in corpo:
                raise RuntimeError(corpo["errors"])
            return corpo["data"]["documents"]
        except Exception as e:
            ultimo_erro = e
            time.sleep(tentativa * 5)
    raise ultimo_erro


def listar_documentos_assinados(token):
    pagina = 1
    todos = []
    total = None
    while True:
        resultado = buscar_pagina(token, pagina)
        total = resultado["total"]
        todos.extend(resultado["data"])
        if len(todos) >= total or not resultado["data"]:
            break
        pagina += 1

    assinados = []
    for doc in todos:
        signatarios_reais = [s for s in doc["signatures"] if s.get("action")]
        datas = [s["signed"]["created_at"] for s in signatarios_reais if s.get("signed")]
        if signatarios_reais and len(datas) == len(signatarios_reais):
            dt_max = max(
                datetime.strptime(d, "%Y-%m-%dT%H:%M:%S.%fZ") - timedelta(hours=3)
                for d in datas
            )
            assinados.append({
                "name": doc["name"],
                "data_ultima_assinatura": dt_max.date().isoformat(),
                "url_pdf": (doc.get("files") or {}).get("signed"),
            })
    return assinados


def normalizar_codigo(texto):
    m = RE_CODIGO.search(texto or "")
    return m.group(1).upper() if m else None


def extrair_tabela_anexo1(texto_completo):
    ocorrencias = list(re.finditer(r"ANEXO I[^\n]*Proposta Comercial", texto_completo, re.IGNORECASE))
    if not ocorrencias:
        return {}
    trecho = texto_completo[ocorrencias[-1].end():ocorrencias[-1].end() + 900]

    campos = {}
    m = re.search(r"UFV\s*\n?\s*([^\n]+)", trecho)
    if m and "concession" not in m.group(1).lower():
        campos["usina"] = m.group(1).strip()

    m = re.search(r"Concession[áa]ria\s*\n?\s*([^\n]+)", trecho, re.IGNORECASE)
    if m:
        campos["concessionaria"] = m.group(1).strip()

    m = re.search(r"Unidade Consumidora\s*\n?\s*([^\n]+)", trecho, re.IGNORECASE)
    if m:
        campos["ug_raw"] = m.group(1).strip()

    m = re.search(r"Gera[çc][ãa]o estimada mensal[^\n]*\n?\s*([\d.,]+)", trecho, re.IGNORECASE)
    if m:
        try:
            campos["geracao_media_mensal"] = float(m.group(1).replace(".", "").replace(",", "."))
        except ValueError:
            pass

    m = re.search(r"Tipo de conex[ãa]o\s*\n?\s*(GD ?[12])", trecho, re.IGNORECASE)
    if m:
        campos["tipo_conexao"] = m.group(1).upper().replace(" ", "")

    m = re.search(r"Pot[êe]ncia\s*CA\s*\(?\s*(?:MW|kW)?p?\)?\s*\n?\s*([\d.,]+)", trecho, re.IGNORECASE)
    if m:
        campos["potencia_ca"] = m.group(1).strip()

    m = re.search(r"Pot[êe]ncia\s*CC\s*\(?\s*(?:MW|kW)?p?\)?\s*\n?\s*([\d.,]+)", trecho, re.IGNORECASE)
    if m:
        campos["potencia_cc"] = m.group(1).strip()

    return campos


def extrair_campos_pdf(caminho_ou_stream):
    with pdfplumber.open(caminho_ou_stream) as pdf:
        texto = "\n".join((p.extract_text() or "") for p in pdf.pages)
    return extrair_tabela_anexo1(texto)


def baixar_pdf_do_autentique(url, tentativas=5):
    ultimo_erro = None
    for tentativa in range(1, tentativas + 1):
        try:
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            return io.BytesIO(r.content)
        except Exception as e:
            ultimo_erro = e
            time.sleep(tentativa * 5)
    raise ultimo_erro


def principal():
    log("Iniciando sincronização com Autentique...")
    token = carregar_token()

    assinados = listar_documentos_assinados(token)
    log(f"{len(assinados)} documentos totalmente assinados no Autentique.")

    novos = 0
    with db.conectar() as conn:
        db.iniciar_banco()
        for doc in assinados:
            codigo = normalizar_codigo(doc["name"])
            if not codigo:
                continue
            if db.codigo_contrato_existe(conn, codigo):
                continue  # já processado antes (pendente, aprovado ou rejeitado)

            campos = {}
            if doc.get("url_pdf"):
                try:
                    stream = baixar_pdf_do_autentique(doc["url_pdf"])
                    campos = extrair_campos_pdf(stream)
                except Exception as e:
                    log(f"  Erro ao baixar/ler PDF da API pra {codigo}: {e}")
            else:
                log(f"  {codigo}: documento sem PDF assinado disponível na API.")

            # se já existe usina cadastrada com essa UG, não duplica pendencia
            ug_raw = campos.get("ug_raw")
            if ug_raw and db.ug_existe(conn, ug_raw):
                continue

            dados = {
                "codigo_contrato": codigo,
                "nome_ufv": campos.get("usina"),
                "concessionaria": campos.get("concessionaria"),
                "ug_raw": ug_raw,
                "geracao_media_mensal": campos.get("geracao_media_mensal"),
                "tipo_conexao": campos.get("tipo_conexao"),
                "potencia_ca": campos.get("potencia_ca"),
                "potencia_cc": campos.get("potencia_cc"),
                "data_assinatura_contrato": doc["data_ultima_assinatura"],
                "arquivo_pdf": doc.get("url_pdf"),
                "observacao": None if campos.get("usina") else "Não achou UFV no Anexo I (verificar contrato manualmente).",
            }
            db.inserir_contrato_pendente(conn, dados, datetime.now().isoformat(timespec="seconds"))
            novos += 1
            log(f"  Novo pendente: {codigo} ({dados.get('nome_ufv') or 'usina não identificada'})")

    log(f"Sincronização concluída: {novos} nova(s) pendência(s) criada(s).")


if __name__ == "__main__":
    principal()
