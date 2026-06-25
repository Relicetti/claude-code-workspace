"""
Bot principal — recebe mensagem da bridge Node.js,
chama Claude para classificar e retorna a resposta.
A bridge cuida do envio ao WhatsApp.
"""
import json
import os
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import anthropic
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("kora-bot")

ANTHROPIC_API_KEY  = os.getenv("ANTHROPIC_API_KEY")
API_LOCAL_URL      = os.getenv("API_LOCAL_URL", "http://localhost:3000")
VENDEDOR_WHATSAPP  = os.getenv("VENDEDOR_WHATSAPP", "")

with open(os.path.join(os.path.dirname(__file__), "../prompts/sistema.md"), encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read()

claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
app = FastAPI(title="Kora GD — Bot")

STATUS_POR_INTENCAO = {
    "ENCERRAR":       "descartado",
    "LEAD_QUENTE":    "em_negociacao",
    "FORA_DO_PERFIL": "fora_do_perfil",
}


def extrair_numero(remote_jid: str, push_name: str = "") -> str:
    # LID format (@lid) não tem número — usa pushName ou descarta
    if "@lid" in remote_jid:
        return remote_jid  # mantém como identificador único
    return remote_jid.replace("@s.whatsapp.net", "").replace("@g.us", "")


def classificar(historico_formatado: str, ultima_mensagem: str) -> dict:
    user_content = (
        f"Histórico da conversa:\n{historico_formatado}\n\n"
        f"Última mensagem do lead:\n{ultima_mensagem}"
    )
    resp = claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    raw = resp.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


@app.post("/webhook/whatsapp")
async def receber_mensagem(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "erro": "payload inválido"})

    if payload.get("event") != "messages.upsert":
        return JSONResponse({"ok": True, "ignorado": True})

    dados = payload.get("data", {})
    if dados.get("key", {}).get("fromMe"):
        return JSONResponse({"ok": True, "ignorado": True})

    remote_jid = dados.get("key", {}).get("remoteJid", "")
    telefone = extrair_numero(remote_jid)
    ultima_mensagem = (
        dados.get("message", {}).get("conversation") or
        dados.get("message", {}).get("extendedTextMessage", {}).get("text") or
        ""
    ).strip()

    if not ultima_mensagem:
        return JSONResponse({"ok": True, "ignorado": True})

    log.info(f"Mensagem de {telefone}: {ultima_mensagem[:60]}")

    # Busca histórico
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{API_LOCAL_URL}/leads/{telefone}/historico", timeout=10)
            estado = r.json()
    except Exception as e:
        log.error(f"Erro ao buscar histórico: {e}")
        return JSONResponse({"ok": False, "erro": str(e)})

    lead = estado.get("lead", {})
    if lead.get("status") in ("descartado", "fora_do_perfil"):
        log.info(f"Lead {telefone} encerrado — ignorando")
        return JSONResponse({"ok": True, "ignorado": True})

    # Classifica com IA
    try:
        resultado = classificar(estado.get("historico_formatado", ""), ultima_mensagem)
    except Exception as e:
        log.error(f"Erro na IA: {e}")
        return JSONResponse({"ok": False, "erro": str(e)})

    intencao         = resultado.get("intencao", "INDEFINIDO")
    proxima_mensagem = resultado.get("proxima_mensagem", "")
    observacao       = resultado.get("observacao", "")
    novo_status      = STATUS_POR_INTENCAO.get(intencao, lead.get("status", "ativo"))

    log.info(f"Intenção: {intencao} | Lead: {telefone}")

    # Salva estado
    try:
        async with httpx.AsyncClient() as client:
            await client.post(f"{API_LOCAL_URL}/leads/atualizar", json={
                "telefone":      telefone,
                "status":        novo_status,
                "mensagem_lead": ultima_mensagem,
                "mensagem_bot":  proxima_mensagem,
                "intencao":      intencao,
            }, timeout=10)
    except Exception as e:
        log.error(f"Erro ao salvar estado: {e}")

    # Notifica vendedor se lead quente (a bridge envia a mensagem principal)
    if intencao == "LEAD_QUENTE" and VENDEDOR_WHATSAPP:
        notif = (
            f"🔔 *Lead quente — Kora Energia*\n\n"
            f"Nome: {lead.get('nome') or '(não identificado)'}\n"
            f"Telefone: {telefone}\n"
            f"Empresa: {lead.get('empresa') or '-'}\n"
            f"Conta estimada: R$ {lead.get('conta_energia') or '?'}/mês\n"
            f"CNPJ: {lead.get('cnpj') or '?'}\n\n"
            f"Obs: {observacao or '-'}\n\n"
            f"👉 Assuma a conversa agora."
        )
        try:
            async with httpx.AsyncClient() as client:
                await client.post("http://localhost:9000/send", json={
                    "telefone": VENDEDOR_WHATSAPP,
                    "mensagem": notif,
                }, timeout=10)
        except Exception:
            pass  # bridge pode não ter o endpoint /send ainda

    # Retorna mensagem para a bridge enviar
    return JSONResponse({
        "ok": True,
        "intencao": intencao,
        "proxima_mensagem": proxima_mensagem,
    })


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
