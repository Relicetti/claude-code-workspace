"""API local usada pelo n8n para consultar e atualizar o banco SQLite."""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import sqlite3
import os

DB_PATH = os.getenv("DB_PATH", "./db/kora.db")
app = FastAPI(title="Kora GD — API de Estado")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.get("/leads/{telefone}/historico")
def buscar_historico(telefone: str):
    conn = get_conn()
    lead = conn.execute("SELECT * FROM leads WHERE telefone = ?", (telefone,)).fetchone()
    if not lead:
        conn.execute("INSERT INTO leads (telefone) VALUES (?)", (telefone,))
        conn.commit()
        lead = conn.execute("SELECT * FROM leads WHERE telefone = ?", (telefone,)).fetchone()

    mensagens = conn.execute(
        """
        SELECT origem, conteudo, intencao_ia, enviado_em
        FROM mensagens WHERE lead_id = ?
        ORDER BY enviado_em ASC
        """,
        (lead["id"],),
    ).fetchall()
    conn.close()

    historico_formatado = "\n".join(
        f"[{m['origem'].upper()}] {m['conteudo']}" for m in mensagens
    )

    return {
        "lead": dict(lead),
        "historico": [dict(m) for m in mensagens],
        "historico_formatado": historico_formatado or "(sem histórico — primeira mensagem)",
    }


class AtualizarPayload(BaseModel):
    telefone: str
    status: str
    mensagem_lead: str
    mensagem_bot: str
    intencao: str
    conta_energia: float | None = None
    cnpj: str | None = None


@app.post("/leads/atualizar")
def atualizar_lead(payload: AtualizarPayload):
    conn = get_conn()
    lead = conn.execute(
        "SELECT id FROM leads WHERE telefone = ?", (payload.telefone,)
    ).fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    lead_id = lead["id"]

    # Salva mensagem do lead
    conn.execute(
        "INSERT INTO mensagens (lead_id, origem, conteudo, intencao_ia) VALUES (?, 'lead', ?, ?)",
        (lead_id, payload.mensagem_lead, payload.intencao),
    )
    # Salva resposta do bot
    conn.execute(
        "INSERT INTO mensagens (lead_id, origem, conteudo) VALUES (?, 'vendedor', ?)",
        (lead_id, payload.mensagem_bot),
    )

    # Atualiza campos do lead
    campos = ["status = ?"]
    valores = [payload.status]
    if payload.conta_energia is not None:
        campos.append("conta_energia = ?")
        valores.append(payload.conta_energia)
    if payload.cnpj is not None:
        campos.append("cnpj = ?")
        valores.append(payload.cnpj)
    valores.append(payload.telefone)
    conn.execute(f"UPDATE leads SET {', '.join(campos)} WHERE telefone = ?", valores)

    conn.commit()
    conn.close()
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
