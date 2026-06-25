"""Inicializa o banco SQLite e insere leads de teste."""
import sqlite3
import os

DB_PATH = os.getenv("DB_PATH", "./db/kora.db")

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    with open("./db/schema.sql") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()
    print(f"Banco criado em {DB_PATH}")

def adicionar_lead(telefone: str, nome: str = None, empresa: str = None):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT OR IGNORE INTO leads (telefone, nome, empresa) VALUES (?, ?, ?)",
        (telefone, nome, empresa),
    )
    conn.commit()
    conn.close()

def buscar_historico(telefone: str) -> list[dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT m.origem, m.conteudo, m.intencao_ia, m.enviado_em
        FROM mensagens m
        JOIN leads l ON l.id = m.lead_id
        WHERE l.telefone = ?
        ORDER BY m.enviado_em ASC
        """,
        (telefone,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def salvar_mensagem(telefone: str, origem: str, conteudo: str, intencao_ia: str = None):
    conn = sqlite3.connect(DB_PATH)
    lead = conn.execute(
        "SELECT id FROM leads WHERE telefone = ?", (telefone,)
    ).fetchone()
    if not lead:
        conn.execute("INSERT INTO leads (telefone) VALUES (?)", (telefone,))
        conn.commit()
        lead = conn.execute(
            "SELECT id FROM leads WHERE telefone = ?", (telefone,)
        ).fetchone()
    conn.execute(
        "INSERT INTO mensagens (lead_id, origem, conteudo, intencao_ia) VALUES (?, ?, ?, ?)",
        (lead[0], origem, conteudo, intencao_ia),
    )
    conn.commit()
    conn.close()

def atualizar_status_lead(telefone: str, status: str, etapa: int = None, conta_energia: float = None, cnpj: str = None):
    conn = sqlite3.connect(DB_PATH)
    campos = ["status = ?"]
    valores = [status]
    if etapa is not None:
        campos.append("etapa = ?")
        valores.append(etapa)
    if conta_energia is not None:
        campos.append("conta_energia = ?")
        valores.append(conta_energia)
    if cnpj is not None:
        campos.append("cnpj = ?")
        valores.append(cnpj)
    valores.append(telefone)
    conn.execute(
        f"UPDATE leads SET {', '.join(campos)} WHERE telefone = ?", valores
    )
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    # Exemplo: carregar lista de leads
    leads_teste = [
        ("5511999990001", "João Silva", "Silva Transportes"),
        ("5511999990002", "Maria Costa", "Padaria Central"),
        ("5511999990003", "Pedro Alves", "Alves Indústria"),
    ]
    for telefone, nome, empresa in leads_teste:
        adicionar_lead(telefone, nome, empresa)
        print(f"Lead adicionado: {nome} ({telefone})")
