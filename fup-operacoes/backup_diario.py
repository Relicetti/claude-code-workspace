# -*- coding: utf-8 -*-
"""
Backup diário do banco de produção: loga no sistema (sistema-fup.up.railway.app),
baixa o banco atual via /admin/exportar-banco e salva localmente com a data.

Guarda os últimos 60 dias de backup e apaga os mais antigos automaticamente.

Uso: python backup_diario.py
Agendado via Agendador de Tarefas do Windows pra rodar 1x por dia, no fim do
dia (23:30).
"""
import glob
import json
import os
from datetime import datetime

import requests

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "backup_config.json")
LOG_PATH = os.path.join(os.path.dirname(__file__), "backup_diario.log")
PASTA_BACKUPS = os.path.join(os.path.dirname(__file__), "backups")
URL_BASE = "https://sistema-fup.up.railway.app"
DIAS_PRA_GUARDAR = 60


def log(msg):
    linha = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(linha)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(linha + "\n")


def carregar_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def principal():
    log("Iniciando backup diário...")
    os.makedirs(PASTA_BACKUPS, exist_ok=True)

    config = carregar_config()
    sessao = requests.Session()
    r = sessao.post(
        f"{URL_BASE}/login",
        data={"username": config["username"], "senha": config["senha"]},
        timeout=30,
    )
    if "usuário ou senha inválidos" in r.text.lower():
        log("ERRO: login falhou, confira backup_config.json.")
        return

    r = sessao.get(f"{URL_BASE}/admin/exportar-banco", timeout=60)
    if r.status_code != 200 or not r.content:
        log(f"ERRO: não consegui baixar o banco (HTTP {r.status_code}).")
        return

    nome_arquivo = f"fup_backup_{datetime.now().strftime('%Y%m%d')}.db"
    caminho = os.path.join(PASTA_BACKUPS, nome_arquivo)
    with open(caminho, "wb") as f:
        f.write(r.content)
    log(f"Backup salvo: {nome_arquivo} ({len(r.content) / 1024:.0f} KB)")

    # limpa backups com mais de DIAS_PRA_GUARDAR dias
    todos = sorted(glob.glob(os.path.join(PASTA_BACKUPS, "fup_backup_*.db")))
    if len(todos) > DIAS_PRA_GUARDAR:
        for antigo in todos[:-DIAS_PRA_GUARDAR]:
            os.remove(antigo)
            log(f"Backup antigo removido: {os.path.basename(antigo)}")

    log("Backup diário concluído.")


if __name__ == "__main__":
    principal()
