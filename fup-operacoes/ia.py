"""
Camada de IA local: monta um contexto com dados reais do fup.db (via db.py,
não deixa o modelo inventar números) e manda pro Ollama rodando em localhost:11434.
Mesmo padrão usado no app "usinas" (ia.py de lá).
"""
import json
import urllib.request

import db

OLLAMA_URL = "http://localhost:11434/api/chat"
MODELO = "qwen2.5:3b-instruct"

PROMPT_SISTEMA = """Você é um assistente do painel de controle FUP Operações, que
acompanha o pipeline de troca de titularidade + rateio de usinas de energia solar
arrendadas até entrarem em operação. Responda em português, de forma direta e
objetiva, usando APENAS os dados fornecidos no contexto abaixo. Se a pergunta não
puder ser respondida com esses dados, diga isso claramente em vez de inventar
números ou nomes."""


def montar_contexto():
    with db.conectar() as conn:
        usinas = [dict(u) for u in db.listar_ativas(conn)]
        medias = db.medias_por_etapa(conn)
        ultimas_pend = db.ultimas_pendencias_por_usina(conn)
        qtd_pend_por_usina = db.contar_pendencias_por_usina(conn)
        qtd_operacao = db.contar_por_status(conn, "operacao")
        qtd_rescindidas = db.contar_por_status(conn, "rescindida")
        todas_pendencias_abertas = conn.execute(
            """SELECT p.texto, p.responsavel, p.autor, p.criado_em, u.nome_ufv, u.etapa_atual
               FROM pendencias p JOIN usinas u ON u.id = p.usina_id
               WHERE p.concluida_em IS NULL AND u.status = 'ativa'
               ORDER BY p.criado_em DESC"""
        ).fetchall()

    hoje_dt = db.hoje()

    def dias_desde(data_iso):
        if not data_iso:
            return None
        from datetime import datetime
        d = datetime.strptime(data_iso, "%Y-%m-%d").date()
        return (hoje_dt - d).days

    por_etapa = {}
    for u in usinas:
        dias_na_etapa = dias_desde(u["data_entrada_etapa_atual"])
        media_etapa = medias.get(u["etapa_atual"])
        atrasada = media_etapa is not None and dias_na_etapa is not None and dias_na_etapa > media_etapa
        item = {
            "nome": u["nome_ufv"],
            "carteira": u["dono_carteira"],
            "executivo": u["executivo"],
            "situacao": u["situacao_etapa"],
            "dias_na_etapa": dias_na_etapa,
            "dias_desde_assinatura": dias_desde(u["data_assinatura_contrato"]),
            "atrasada_vs_media": atrasada,
            "qtd_pendencias": qtd_pend_por_usina.get(u["id"], 0),
        }
        ult = ultimas_pend.get(u["id"])
        if ult and not ult.get("concluida_em"):
            item["ultima_pendencia"] = ult["texto"]
        por_etapa.setdefault(u["etapa_atual"], []).append(item)

    pendencias_abertas = [
        {
            "usina": p["nome_ufv"], "etapa": p["etapa_atual"], "texto": p["texto"],
            "responsavel": p["responsavel"], "autor": p["autor"], "criado_em": p["criado_em"],
        }
        for p in todas_pendencias_abertas
    ]

    partes = [
        f"Data de hoje: {hoje_dt.isoformat()}", "",
        "RESUMO GERAL:",
        json.dumps({
            "usinas_ativas_no_pipeline": len(usinas),
            "usinas_em_operacao": qtd_operacao,
            "usinas_rescindidas": qtd_rescindidas,
            "total_pendencias_abertas": len(pendencias_abertas),
        }, ensure_ascii=False),
        "",
        "MÉDIA HISTÓRICA DE DIAS POR ETAPA:",
        json.dumps(medias, ensure_ascii=False),
        "",
        "USINAS ATIVAS NO PIPELINE, AGRUPADAS POR ETAPA ATUAL:",
        json.dumps(por_etapa, ensure_ascii=False, default=str),
        "",
        "TODAS AS PENDÊNCIAS ABERTAS (de usinas ativas):",
        json.dumps(pendencias_abertas, ensure_ascii=False, default=str) if pendencias_abertas else "Nenhuma.",
    ]
    return "\n".join(partes)


def perguntar(pergunta, historico=None):
    contexto = montar_contexto()
    mensagens = [{"role": "system", "content": PROMPT_SISTEMA + "\n\nCONTEXTO:\n" + contexto}]
    for h in (historico or []):
        mensagens.append(h)
    mensagens.append({"role": "user", "content": pergunta})

    corpo = json.dumps({"model": MODELO, "messages": mensagens, "stream": False}).encode("utf-8")
    req = urllib.request.Request(OLLAMA_URL, data=corpo, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            resultado = json.loads(resp.read().decode("utf-8"))
        return resultado["message"]["content"]
    except Exception as e:
        return (
            "Não consegui falar com o Ollama local (localhost:11434). "
            f"Verifique se ele está rodando (`ollama serve`) e se o modelo '{MODELO}' foi baixado "
            f"(`ollama pull {MODELO}`). Detalhe do erro: {e}"
        )
