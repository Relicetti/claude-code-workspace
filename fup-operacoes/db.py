import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "fup.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS usinas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ug TEXT NOT NULL UNIQUE,
    ug_raw TEXT NOT NULL,
    nome_ufv TEXT NOT NULL,
    concessionaria TEXT,
    dono_carteira TEXT,
    data_assinatura_contrato TEXT,
    etapa_atual TEXT NOT NULL,
    data_entrada_etapa_atual TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativa',
    observacao TEXT
);

CREATE TABLE IF NOT EXISTS historico_etapas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usina_id INTEGER NOT NULL REFERENCES usinas(id),
    etapa TEXT NOT NULL,
    data_entrada TEXT NOT NULL,
    data_saida TEXT
);

CREATE INDEX IF NOT EXISTS idx_historico_usina ON historico_etapas(usina_id);
"""

ETAPAS = [
    "Assinado c/ Pendência",
    "TT Usina",
    "Sem Clientes",
    "Separando Clientes",
    "TT Cliente",
    "Refazer Rateio",
    "Aguardando Rateio",
    "Aguardando Aprovação Rateio",
    "Consumo de Saldo Acumulado",
]

ETAPAS_FINAIS = ["Operação", "Rescindida"]


@contextmanager
def conectar():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def iniciar_banco():
    with conectar() as conn:
        conn.executescript(SCHEMA)


def normalizar_ug(valor):
    if valor is None:
        return ""
    return "".join(ch for ch in str(valor).upper() if ch.isalnum())


def listar_ativas(conn):
    return conn.execute(
        "SELECT * FROM usinas WHERE status = 'ativa' ORDER BY nome_ufv"
    ).fetchall()


def buscar_usina(conn, usina_id):
    return conn.execute("SELECT * FROM usinas WHERE id = ?", (usina_id,)).fetchone()


def historico_usina(conn, usina_id):
    return conn.execute(
        "SELECT * FROM historico_etapas WHERE usina_id = ? ORDER BY data_entrada",
        (usina_id,),
    ).fetchall()


def medias_por_etapa(conn):
    """Duração média (dias) de cada etapa, calculada só com etapas já concluídas."""
    linhas = conn.execute(
        """SELECT etapa, AVG(julianday(data_saida) - julianday(data_entrada)) AS media
           FROM historico_etapas
           WHERE data_saida IS NOT NULL AND etapa IN ({})
           GROUP BY etapa""".format(",".join("?" * len(ETAPAS))),
        ETAPAS,
    ).fetchall()
    return {row["etapa"]: round(row["media"], 1) for row in linhas}


def mudar_etapa(conn, usina_id, nova_etapa, hoje_iso):
    usina = buscar_usina(conn, usina_id)
    conn.execute(
        """UPDATE historico_etapas SET data_saida = ?
           WHERE usina_id = ? AND data_saida IS NULL""",
        (hoje_iso, usina_id),
    )
    if nova_etapa in ETAPAS_FINAIS:
        conn.execute(
            "INSERT INTO historico_etapas (usina_id, etapa, data_entrada, data_saida) VALUES (?,?,?,?)",
            (usina_id, nova_etapa, hoje_iso, hoje_iso),
        )
        conn.execute(
            "UPDATE usinas SET status = ? WHERE id = ?",
            ("operacao" if nova_etapa == "Operação" else "rescindida", usina_id),
        )
    else:
        conn.execute(
            "INSERT INTO historico_etapas (usina_id, etapa, data_entrada, data_saida) VALUES (?,?,?,NULL)",
            (usina_id, nova_etapa, hoje_iso),
        )
        conn.execute(
            "UPDATE usinas SET etapa_atual = ?, data_entrada_etapa_atual = ? WHERE id = ?",
            (nova_etapa, hoje_iso, usina_id),
        )


def criar_usina(conn, ug_raw, nome_ufv, concessionaria, dono_carteira, data_assinatura, etapa_inicial, hoje_iso, observacao):
    ug = normalizar_ug(ug_raw)
    cur = conn.execute(
        """INSERT INTO usinas
           (ug, ug_raw, nome_ufv, concessionaria, dono_carteira, data_assinatura_contrato,
            etapa_atual, data_entrada_etapa_atual, status, observacao)
           VALUES (?,?,?,?,?,?,?,?, 'ativa', ?)""",
        (ug, ug_raw, nome_ufv, concessionaria, dono_carteira, data_assinatura or None,
         etapa_inicial, hoje_iso, observacao),
    )
    usina_id = cur.lastrowid
    conn.execute(
        "INSERT INTO historico_etapas (usina_id, etapa, data_entrada, data_saida) VALUES (?,?,?,NULL)",
        (usina_id, etapa_inicial, hoje_iso),
    )
    return usina_id
