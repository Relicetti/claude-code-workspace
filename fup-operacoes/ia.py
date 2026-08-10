"""
Camada de IA: monta um contexto com dados reais do fup.db (via db.py, não
deixa o modelo inventar números) e manda pra API da Anthropic (Claude).

Usa a Claude API em vez de um modelo local porque o app roda no Railway
(nuvem) — um Ollama local só seria alcançável quando o app roda na própria
máquina, não em produção. Precisa da variável de ambiente ANTHROPIC_API_KEY
configurada (no Railway e, se for usar localmente também, no ambiente local).
"""
import json
import os
from datetime import datetime

import anthropic

import db

MODELO = "claude-opus-5"
MAX_TOKENS = 4096

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
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return (
            "A chave da API da Anthropic (variável de ambiente ANTHROPIC_API_KEY) não está "
            "configurada neste servidor. Configure-a no Railway (aba Variables do projeto) "
            "pra habilitar o chat."
        )

    contexto = montar_contexto()
    mensagens = list(historico or [])
    mensagens.append({"role": "user", "content": pergunta})

    client = anthropic.Anthropic(api_key=api_key)
    try:
        resposta = client.messages.create(
            model=MODELO,
            max_tokens=MAX_TOKENS,
            output_config={"effort": "low"},  # perguntas diretas sobre dados; mantém custo baixo
            system=[
                {"type": "text", "text": PROMPT_SISTEMA},
                {"type": "text", "text": contexto, "cache_control": {"type": "ephemeral"}},
            ],
            messages=mensagens,
        )
        return next((b.text for b in resposta.content if b.type == "text"), "(sem resposta)")
    except anthropic.AuthenticationError:
        return "A chave da API da Anthropic configurada é inválida. Verifique o ANTHROPIC_API_KEY no Railway."
    except anthropic.RateLimitError:
        return "Limite de requisições da API da Anthropic atingido no momento. Tente de novo em instantes."
    except anthropic.APIStatusError as e:
        return f"Erro ao falar com a API da Anthropic: {e.message}"
    except anthropic.APIConnectionError:
        return "Não consegui conectar com a API da Anthropic. Verifique a conexão de internet do servidor."
    except Exception as e:
        return f"Erro inesperado ao consultar a IA: {e}"
