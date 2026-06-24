"""Envia a primeira mensagem para um lead e registra no banco."""
import httpx
import sqlite3
import os
import sys
import time
from dotenv import load_dotenv

load_dotenv()

DB_PATH       = os.getenv("DB_PATH", "./db/kora.db")
BRIDGE_URL    = "http://localhost:9000/send"
DELAY_SEGUNDOS = int(os.getenv("DELAY_MSGS_SEGUNDOS", "45"))

MSG_ABERTURA = "Boa tarde! Tudo bem? Aqui é o Luan, da Kora Energia 👋 Falo com {nome}?"


def registrar_mensagem(telefone: str, texto: str):
    conn = sqlite3.connect(DB_PATH)
    lead = conn.execute("SELECT id FROM leads WHERE telefone = ?", (telefone,)).fetchone()
    if not lead:
        conn.execute("INSERT INTO leads (telefone) VALUES (?)", (telefone,))
        conn.commit()
        lead = conn.execute("SELECT id FROM leads WHERE telefone = ?", (telefone,)).fetchone()
    conn.execute(
        "INSERT INTO mensagens (lead_id, origem, conteudo) VALUES (?, 'vendedor', ?)",
        (lead[0], texto),
    )
    conn.commit()
    conn.close()


def disparar(telefone: str, nome: str):
    mensagem = MSG_ABERTURA.format(nome=nome)
    try:
        r = httpx.post(BRIDGE_URL, json={"telefone": telefone, "mensagem": mensagem}, timeout=10)
        r.raise_for_status()
        registrar_mensagem(telefone, mensagem)
        print(f"[OK] Enviado para {nome} ({telefone})")
        return True
    except Exception as e:
        print(f"[ERRO] Ao enviar para {telefone}: {e}")
        return False


def disparar_lista(leads: list[tuple]):
    """leads = [(telefone, nome), ...]"""
    print(f"\nDisparando para {len(leads)} lead(s)...\n")
    for i, (telefone, nome) in enumerate(leads):
        disparar(telefone, nome)
        if i < len(leads) - 1:
            print(f"  aguardando {DELAY_SEGUNDOS}s...")
            time.sleep(DELAY_SEGUNDOS)
    print("\nDisparo concluído.")


if __name__ == "__main__":
    # Uso direto: py -3 scripts/disparar.py 5541995175300 Leandro
    if len(sys.argv) == 3:
        disparar(sys.argv[1], sys.argv[2])
    else:
        # Lista de exemplo — substitua pelos leads reais
        lista = [
            ("5541995175300", "Leandro"),
        ]
        disparar_lista(lista)
