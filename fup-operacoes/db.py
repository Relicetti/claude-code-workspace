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
    responsavel_acao TEXT,
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

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usina_id INTEGER NOT NULL REFERENCES usinas(id),
    autor TEXT NOT NULL,
    texto TEXT NOT NULL,
    criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_historico_usina ON historico_etapas(usina_id);
CREATE INDEX IF NOT EXISTS idx_observacoes_usina ON observacoes(usina_id);
"""

# migrações incrementais em bancos já existentes (coluna, tabela, tipo)
COLUNAS_NOVAS = [
    ("historico_etapas", "autor", "TEXT"),
    ("usinas", "responsavel_acao", "TEXT"),
]

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
        for tabela, coluna, tipo in COLUNAS_NOVAS:
            colunas_existentes = [r["name"] for r in conn.execute(f"PRAGMA table_info({tabela})")]
            if coluna not in colunas_existentes:
                conn.execute(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {tipo}")


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


def mudar_etapa(conn, usina_id, nova_etapa, hoje_iso, autor):
    conn.execute(
        """UPDATE historico_etapas SET data_saida = ?
           WHERE usina_id = ? AND data_saida IS NULL""",
        (hoje_iso, usina_id),
    )
    if nova_etapa in ETAPAS_FINAIS:
        conn.execute(
            "INSERT INTO historico_etapas (usina_id, etapa, data_entrada, data_saida, autor) VALUES (?,?,?,?,?)",
            (usina_id, nova_etapa, hoje_iso, hoje_iso, autor),
        )
        conn.execute(
            "UPDATE usinas SET status = ? WHERE id = ?",
            ("operacao" if nova_etapa == "Operação" else "rescindida", usina_id),
        )
    else:
        conn.execute(
            "INSERT INTO historico_etapas (usina_id, etapa, data_entrada, data_saida, autor) VALUES (?,?,?,NULL,?)",
            (usina_id, nova_etapa, hoje_iso, autor),
        )
        conn.execute(
            "UPDATE usinas SET etapa_atual = ?, data_entrada_etapa_atual = ? WHERE id = ?",
            (nova_etapa, hoje_iso, usina_id),
        )


def observacoes_usina(conn, usina_id):
    return conn.execute(
        "SELECT * FROM observacoes WHERE usina_id = ? ORDER BY criado_em DESC",
        (usina_id,),
    ).fetchall()


def ultima_observacao(conn, usina_id):
    return conn.execute(
        "SELECT * FROM observacoes WHERE usina_id = ? ORDER BY criado_em DESC LIMIT 1",
        (usina_id,),
    ).fetchone()


def ultimas_observacoes_por_usina(conn):
    """Última observação de cada usina, pra listar sem 1 query por linha."""
    linhas = conn.execute(
        """SELECT o.usina_id, o.autor, o.texto, o.criado_em
           FROM observacoes o
           JOIN (
               SELECT usina_id, MAX(criado_em) AS max_criado_em
               FROM observacoes GROUP BY usina_id
           ) ultima ON ultima.usina_id = o.usina_id AND ultima.max_criado_em = o.criado_em"""
    ).fetchall()
    return {row["usina_id"]: dict(row) for row in linhas}


def contar_observacoes_por_usina(conn):
    linhas = conn.execute(
        "SELECT usina_id, COUNT(*) AS qtd FROM observacoes GROUP BY usina_id"
    ).fetchall()
    return {row["usina_id"]: row["qtd"] for row in linhas}


def adicionar_observacao(conn, usina_id, texto, autor, criado_em):
    texto = texto.strip()
    if not texto:
        return
    conn.execute(
        "INSERT INTO observacoes (usina_id, autor, texto, criado_em) VALUES (?,?,?,?)",
        (usina_id, autor, texto, criado_em),
    )


def criar_usina(conn, ug_raw, nome_ufv, concessionaria, dono_carteira, responsavel_acao,
                 data_assinatura, etapa_inicial, hoje_iso, observacao, autor, criado_em):
    ug = normalizar_ug(ug_raw)
    cur = conn.execute(
        """INSERT INTO usinas
           (ug, ug_raw, nome_ufv, concessionaria, dono_carteira, responsavel_acao,
            data_assinatura_contrato, etapa_atual, data_entrada_etapa_atual, status)
           VALUES (?,?,?,?,?,?,?,?,?, 'ativa')""",
        (ug, ug_raw, nome_ufv, concessionaria, dono_carteira, responsavel_acao,
         data_assinatura or None, etapa_inicial, hoje_iso),
    )
    usina_id = cur.lastrowid
    conn.execute(
        "INSERT INTO historico_etapas (usina_id, etapa, data_entrada, data_saida, autor) VALUES (?,?,?,NULL,?)",
        (usina_id, etapa_inicial, hoje_iso, autor),
    )
    if observacao and observacao.strip():
        adicionar_observacao(conn, usina_id, observacao, autor, criado_em)
    return usina_id


def atualizar_responsavel_acao(conn, usina_id, responsavel_acao):
    conn.execute(
        "UPDATE usinas SET responsavel_acao = ? WHERE id = ?",
        (responsavel_acao.strip() or None, usina_id),
    )


# --- usuários / login -------------------------------------------------

def buscar_usuario_por_username(conn, username):
    return conn.execute(
        "SELECT * FROM usuarios WHERE username = ?", (username.strip().lower(),)
    ).fetchone()


def buscar_usuario(conn, usuario_id):
    return conn.execute("SELECT * FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()


def criar_usuario(conn, nome, username, senha_hash, criado_em):
    cur = conn.execute(
        "INSERT INTO usuarios (nome, username, senha_hash, criado_em) VALUES (?,?,?,?)",
        (nome.strip(), username.strip().lower(), senha_hash, criado_em),
    )
    return cur.lastrowid
