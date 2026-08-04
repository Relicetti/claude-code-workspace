import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime

# No Railway, defina DB_PATH apontando pro volume persistente (ex: /data/clientes_gd.db)
# pra o banco não resetar a cada deploy. Local, usa o arquivo ao lado do código.
DB_PATH = os.environ.get("DB_PATH") or os.path.join(os.path.dirname(__file__), "clientes_gd.db")

_pasta_db = os.path.dirname(DB_PATH)
if _pasta_db:
    os.makedirs(_pasta_db, exist_ok=True)

SCHEMA = """
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    senha_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usineiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf_cnpj TEXT,
    email TEXT,
    telefone TEXT,
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usinas_gd (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usineiro_id INTEGER REFERENCES usineiros(id),
    nome_usina TEXT NOT NULL,
    potencia_kwp REAL,
    concessionaria TEXT,
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf_cnpj TEXT,
    email TEXT,
    telefone TEXT,
    endereco TEXT,
    uc TEXT,
    concessionaria TEXT,
    usina_gd_id INTEGER REFERENCES usinas_gd(id),
    status TEXT NOT NULL DEFAULT 'pendente_assinatura',
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contratos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    tipo TEXT NOT NULL DEFAULT 'termo_adesao',
    percentual_desconto_contratado REAL,
    data_inicio_vigencia TEXT,
    status TEXT NOT NULL DEFAULT 'rascunho',
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documentos_assinados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contrato_id INTEGER NOT NULL REFERENCES contratos(id),
    arquivo_path TEXT,
    hash_sha256 TEXT,
    assinado_em TEXT,
    ip_assinante TEXT,
    provedor TEXT NOT NULL DEFAULT 'autentique',
    documento_externo_id TEXT,
    status_externo TEXT,
    criado_em TEXT NOT NULL
);

-- rateio versionado: nunca faz UPDATE destrutivo, cria linha nova e fecha
-- (mes_fim) a anterior. mes_fim = NULL significa vigente.
CREATE TABLE IF NOT EXISTS rateio_clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    usina_gd_id INTEGER NOT NULL REFERENCES usinas_gd(id),
    percentual_rateio REAL NOT NULL,
    mes_inicio TEXT NOT NULL,
    mes_fim TEXT,
    criado_em TEXT NOT NULL
);

-- leituras/faturas da distribuidora por cliente/mês. Fase 1: schema criado
-- vazio; passa a ser populada quando o upload de fatura (tarifas/) entra.
CREATE TABLE IF NOT EXISTS leituras_distribuidora (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    uc TEXT,
    mes_referencia TEXT NOT NULL,
    consumo_kwh REAL,
    energia_injetada_kwh REAL,
    energia_compensada_kwh REAL,
    valor_fatura_concessionaria REAL,
    arquivo_pdf_path TEXT,
    origem TEXT NOT NULL DEFAULT 'upload_manual',
    dados_extraidos TEXT,
    capturado_em TEXT NOT NULL,
    UNIQUE(cliente_id, mes_referencia)
);

-- fatura de cobrança gerada para o cliente a partir da leitura do mês.
CREATE TABLE IF NOT EXISTS faturas_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    mes_referencia TEXT NOT NULL,
    leitura_id INTEGER REFERENCES leituras_distribuidora(id),
    energia_compensada_kwh REAL,
    percentual_desconto_aplicado REAL,
    valor_bruto_energia REAL,
    valor_desconto REAL,
    valor_cobrado REAL,
    status TEXT NOT NULL DEFAULT 'gerada',
    vencimento TEXT,
    criado_em TEXT NOT NULL,
    UNIQUE(cliente_id, mes_referencia)
);

-- log de auditoria, mesmo padrão do fup-operacoes (sem FK pra cliente
-- sobreviver à exclusão do registro relacionado).
CREATE TABLE IF NOT EXISTS atividades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL,
    acao TEXT NOT NULL,
    cliente_nome TEXT,
    criado_em TEXT NOT NULL
);

-- todo evento de webhook recebido (Autentique, e futuramente Asaas) é
-- gravado aqui primeiro, com chave natural única, antes de processar --
-- garante idempotência em caso de reenvio do provedor.
CREATE TABLE IF NOT EXISTS webhooks_recebidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gateway TEXT NOT NULL,
    evento_chave TEXT NOT NULL,
    payload_bruto TEXT,
    processado INTEGER NOT NULL DEFAULT 0,
    recebido_em TEXT NOT NULL,
    UNIQUE(gateway, evento_chave)
);

CREATE INDEX IF NOT EXISTS idx_contratos_cliente ON contratos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_documentos_contrato ON documentos_assinados(contrato_id);
CREATE INDEX IF NOT EXISTS idx_rateio_cliente ON rateio_clientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_leituras_cliente ON leituras_distribuidora(cliente_id);
CREATE INDEX IF NOT EXISTS idx_faturas_cliente ON faturas_cliente(cliente_id);
"""

STATUS_CLIENTE = ["pendente_assinatura", "ativo", "suspenso", "cancelado"]
STATUS_CONTRATO = ["rascunho", "aguardando_assinatura", "assinado", "rescindido"]
TIPOS_CONTRATO = ["termo_adesao", "contrato_associacao"]


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


# --- usuários / login (mesmo padrão do fup-operacoes) --------------------

def buscar_usuario_por_username(conn, username):
    return conn.execute(
        "SELECT * FROM usuarios WHERE username = ?", (username.strip().lower(),)
    ).fetchone()


def buscar_usuario(conn, usuario_id):
    return conn.execute("SELECT * FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()


def listar_usuarios(conn):
    return conn.execute("SELECT id, nome FROM usuarios ORDER BY nome").fetchall()


def criar_usuario(conn, nome, username, senha_hash, criado_em, is_admin=False, email=None):
    cur = conn.execute(
        "INSERT INTO usuarios (nome, username, email, senha_hash, is_admin, criado_em) VALUES (?,?,?,?,?,?)",
        (nome.strip(), username.strip().lower(), email.strip().lower() if email else None,
         senha_hash, int(is_admin), criado_em),
    )
    return cur.lastrowid


def bootstrap_admin(gerar_hash):
    """Cria um admin inicial a partir de variáveis de ambiente, se ainda não
    existir nenhum. Não faz nada se a conta já existe ou se as variáveis não
    estão definidas."""
    username = (os.environ.get("BOOTSTRAP_ADMIN_USER") or "").strip().lower()
    senha = os.environ.get("BOOTSTRAP_ADMIN_SENHA") or ""
    nome = (os.environ.get("BOOTSTRAP_ADMIN_NOME") or username or "Admin").strip()
    if not username or not senha:
        return
    with conectar() as conn:
        if buscar_usuario_por_username(conn, username) is not None:
            return
        criar_usuario(
            conn, nome, username, gerar_hash(senha),
            datetime.now().isoformat(timespec="seconds"), is_admin=True,
            email=f"{username}@alexandriabr.com",
        )


# --- usineiros / usinas_gd ------------------------------------------------

def listar_usineiros(conn):
    return conn.execute("SELECT * FROM usineiros ORDER BY nome").fetchall()


def criar_usineiro(conn, nome, cpf_cnpj, email, telefone, criado_em):
    cur = conn.execute(
        "INSERT INTO usineiros (nome, cpf_cnpj, email, telefone, criado_em) VALUES (?,?,?,?,?)",
        (nome.strip(), cpf_cnpj, email, telefone, criado_em),
    )
    return cur.lastrowid


def listar_usinas_gd(conn):
    return conn.execute(
        """SELECT ug.*, u.nome AS usineiro_nome FROM usinas_gd ug
           LEFT JOIN usineiros u ON u.id = ug.usineiro_id
           ORDER BY ug.nome_usina"""
    ).fetchall()


def buscar_usina_gd(conn, usina_gd_id):
    return conn.execute("SELECT * FROM usinas_gd WHERE id = ?", (usina_gd_id,)).fetchone()


def criar_usina_gd(conn, usineiro_id, nome_usina, potencia_kwp, concessionaria, criado_em):
    cur = conn.execute(
        """INSERT INTO usinas_gd (usineiro_id, nome_usina, potencia_kwp, concessionaria, criado_em)
           VALUES (?,?,?,?,?)""",
        (usineiro_id or None, nome_usina.strip(), potencia_kwp, concessionaria, criado_em),
    )
    return cur.lastrowid


# --- clientes --------------------------------------------------------------

def listar_clientes(conn):
    return conn.execute(
        """SELECT c.*, ug.nome_usina FROM clientes c
           LEFT JOIN usinas_gd ug ON ug.id = c.usina_gd_id
           ORDER BY c.nome"""
    ).fetchall()


def buscar_cliente(conn, cliente_id):
    return conn.execute("SELECT * FROM clientes WHERE id = ?", (cliente_id,)).fetchone()


def criar_cliente(conn, nome, cpf_cnpj, email, telefone, endereco, uc, concessionaria,
                   usina_gd_id, criado_em):
    cur = conn.execute(
        """INSERT INTO clientes
           (nome, cpf_cnpj, email, telefone, endereco, uc, concessionaria, usina_gd_id, status, criado_em)
           VALUES (?,?,?,?,?,?,?,?, 'pendente_assinatura', ?)""",
        (nome.strip(), cpf_cnpj, email, telefone, endereco, uc, concessionaria,
         usina_gd_id or None, criado_em),
    )
    return cur.lastrowid


CAMPOS_EDITAVEIS_CLIENTE = ["nome", "cpf_cnpj", "email", "telefone", "endereco", "uc", "concessionaria"]


def atualizar_cliente(conn, cliente_id, campos):
    sets, valores = [], []
    for campo in CAMPOS_EDITAVEIS_CLIENTE:
        if campo in campos:
            sets.append(f"{campo} = ?")
            valores.append(campos[campo] or None)
    if "usina_gd_id" in campos:
        sets.append("usina_gd_id = ?")
        valores.append(campos["usina_gd_id"] or None)
    if not sets:
        return
    valores.append(cliente_id)
    conn.execute(f"UPDATE clientes SET {', '.join(sets)} WHERE id = ?", valores)


def mudar_status_cliente(conn, cliente_id, status):
    conn.execute("UPDATE clientes SET status = ? WHERE id = ?", (status, cliente_id))


# --- contratos / documentos assinados --------------------------------------

def listar_contratos_cliente(conn, cliente_id):
    return conn.execute(
        "SELECT * FROM contratos WHERE cliente_id = ? ORDER BY criado_em DESC", (cliente_id,)
    ).fetchall()


def buscar_contrato(conn, contrato_id):
    return conn.execute("SELECT * FROM contratos WHERE id = ?", (contrato_id,)).fetchone()


def criar_contrato(conn, cliente_id, tipo, percentual_desconto, data_inicio_vigencia, criado_em):
    cur = conn.execute(
        """INSERT INTO contratos
           (cliente_id, tipo, percentual_desconto_contratado, data_inicio_vigencia, status, criado_em)
           VALUES (?,?,?,?, 'rascunho', ?)""",
        (cliente_id, tipo, percentual_desconto, data_inicio_vigencia, criado_em),
    )
    return cur.lastrowid


def mudar_status_contrato(conn, contrato_id, status):
    conn.execute("UPDATE contratos SET status = ? WHERE id = ?", (status, contrato_id))


def documento_assinado_por_contrato(conn, contrato_id):
    return conn.execute(
        "SELECT * FROM documentos_assinados WHERE contrato_id = ? ORDER BY criado_em DESC LIMIT 1",
        (contrato_id,),
    ).fetchone()


def registrar_envio_assinatura(conn, contrato_id, provedor, documento_externo_id, criado_em):
    cur = conn.execute(
        """INSERT INTO documentos_assinados
           (contrato_id, provedor, documento_externo_id, status_externo, criado_em)
           VALUES (?,?,?, 'aguardando_assinatura', ?)""",
        (contrato_id, provedor, documento_externo_id, criado_em),
    )
    return cur.lastrowid


def confirmar_assinatura(conn, documento_externo_id, arquivo_path, hash_sha256, assinado_em, ip_assinante=None):
    conn.execute(
        """UPDATE documentos_assinados
           SET arquivo_path = ?, hash_sha256 = ?, assinado_em = ?, ip_assinante = ?, status_externo = 'assinado'
           WHERE documento_externo_id = ?""",
        (arquivo_path, hash_sha256, assinado_em, ip_assinante, documento_externo_id),
    )
    row = conn.execute(
        "SELECT contrato_id FROM documentos_assinados WHERE documento_externo_id = ?",
        (documento_externo_id,),
    ).fetchone()
    return row["contrato_id"] if row else None


def registrar_upload_manual_assinado(conn, contrato_id, arquivo_path, hash_sha256, assinado_em, criado_em):
    conn.execute(
        """INSERT INTO documentos_assinados
           (contrato_id, provedor, arquivo_path, hash_sha256, assinado_em, status_externo, criado_em)
           VALUES (?, 'upload_manual', ?, ?, ?, 'assinado', ?)""",
        (contrato_id, arquivo_path, hash_sha256, assinado_em, criado_em),
    )


# --- webhooks (idempotência) ------------------------------------------------

def registrar_webhook(conn, gateway, evento_chave, payload_bruto, recebido_em):
    """Retorna True se este é um evento novo (insere), False se já tinha
    sido recebido antes (mesmo gateway+evento_chave) — nesse caso não
    processar de novo."""
    try:
        conn.execute(
            "INSERT INTO webhooks_recebidos (gateway, evento_chave, payload_bruto, recebido_em) VALUES (?,?,?,?)",
            (gateway, evento_chave, payload_bruto, recebido_em),
        )
        return True
    except sqlite3.IntegrityError:
        return False


def marcar_webhook_processado(conn, gateway, evento_chave):
    conn.execute(
        "UPDATE webhooks_recebidos SET processado = 1 WHERE gateway = ? AND evento_chave = ?",
        (gateway, evento_chave),
    )


# --- rateio (histórico versionado) ------------------------------------------

def rateio_vigente(conn, cliente_id):
    return conn.execute(
        "SELECT * FROM rateio_clientes WHERE cliente_id = ? AND mes_fim IS NULL", (cliente_id,)
    ).fetchone()


def historico_rateio_cliente(conn, cliente_id):
    return conn.execute(
        "SELECT * FROM rateio_clientes WHERE cliente_id = ? ORDER BY mes_inicio DESC", (cliente_id,)
    ).fetchall()


def criar_rateio(conn, cliente_id, usina_gd_id, percentual_rateio, mes_inicio, criado_em):
    """Fecha o rateio vigente anterior (se houver) no mês anterior ao novo
    início e cria a linha vigente nova. Nunca faz UPDATE destrutivo do
    percentual antigo -- preserva o histórico."""
    atual = rateio_vigente(conn, cliente_id)
    if atual is not None:
        conn.execute(
            "UPDATE rateio_clientes SET mes_fim = ? WHERE id = ?",
            (mes_inicio, atual["id"]),
        )
    cur = conn.execute(
        """INSERT INTO rateio_clientes (cliente_id, usina_gd_id, percentual_rateio, mes_inicio, mes_fim, criado_em)
           VALUES (?,?,?,?, NULL, ?)""",
        (cliente_id, usina_gd_id, percentual_rateio, mes_inicio, criado_em),
    )
    return cur.lastrowid


# --- leituras / faturas do cliente -----------------------------------------

def gravar_leitura(conn, cliente_id, uc, mes_referencia, consumo_kwh, energia_injetada_kwh,
                    energia_compensada_kwh, valor_fatura_concessionaria, arquivo_pdf_path,
                    origem, dados_extraidos_json, capturado_em):
    conn.execute(
        """INSERT INTO leituras_distribuidora
           (cliente_id, uc, mes_referencia, consumo_kwh, energia_injetada_kwh,
            energia_compensada_kwh, valor_fatura_concessionaria, arquivo_pdf_path,
            origem, dados_extraidos, capturado_em)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(cliente_id, mes_referencia) DO UPDATE SET
             uc=excluded.uc, consumo_kwh=excluded.consumo_kwh,
             energia_injetada_kwh=excluded.energia_injetada_kwh,
             energia_compensada_kwh=excluded.energia_compensada_kwh,
             valor_fatura_concessionaria=excluded.valor_fatura_concessionaria,
             arquivo_pdf_path=excluded.arquivo_pdf_path, origem=excluded.origem,
             dados_extraidos=excluded.dados_extraidos, capturado_em=excluded.capturado_em""",
        (cliente_id, uc, mes_referencia, consumo_kwh, energia_injetada_kwh,
         energia_compensada_kwh, valor_fatura_concessionaria, arquivo_pdf_path,
         origem, dados_extraidos_json, capturado_em),
    )
    row = conn.execute(
        "SELECT id FROM leituras_distribuidora WHERE cliente_id = ? AND mes_referencia = ?",
        (cliente_id, mes_referencia),
    ).fetchone()
    return row["id"]


def gravar_fatura_cliente(conn, cliente_id, mes_referencia, leitura_id, energia_compensada_kwh,
                           percentual_desconto_aplicado, valor_bruto_energia, valor_desconto,
                           valor_cobrado, vencimento, criado_em):
    conn.execute(
        """INSERT INTO faturas_cliente
           (cliente_id, mes_referencia, leitura_id, energia_compensada_kwh,
            percentual_desconto_aplicado, valor_bruto_energia, valor_desconto,
            valor_cobrado, status, vencimento, criado_em)
           VALUES (?,?,?,?,?,?,?,?, 'gerada', ?, ?)
           ON CONFLICT(cliente_id, mes_referencia) DO UPDATE SET
             leitura_id=excluded.leitura_id, energia_compensada_kwh=excluded.energia_compensada_kwh,
             percentual_desconto_aplicado=excluded.percentual_desconto_aplicado,
             valor_bruto_energia=excluded.valor_bruto_energia, valor_desconto=excluded.valor_desconto,
             valor_cobrado=excluded.valor_cobrado, vencimento=excluded.vencimento""",
        (cliente_id, mes_referencia, leitura_id, energia_compensada_kwh,
         percentual_desconto_aplicado, valor_bruto_energia, valor_desconto,
         valor_cobrado, vencimento, criado_em),
    )


def listar_faturas_cliente(conn, cliente_id):
    return conn.execute(
        "SELECT * FROM faturas_cliente WHERE cliente_id = ? ORDER BY mes_referencia DESC", (cliente_id,)
    ).fetchall()


# --- log de auditoria --------------------------------------------------

def registrar_atividade(conn, usuario, acao, cliente_nome, criado_em):
    conn.execute(
        "INSERT INTO atividades (usuario, acao, cliente_nome, criado_em) VALUES (?,?,?,?)",
        (usuario, acao, cliente_nome, criado_em),
    )


def listar_atividades(conn, limite=1000):
    return conn.execute(
        "SELECT * FROM atividades ORDER BY criado_em DESC LIMIT ?", (limite,)
    ).fetchall()


def atividades_cliente(conn, cliente_nome, limite=200):
    return conn.execute(
        "SELECT * FROM atividades WHERE cliente_nome = ? ORDER BY criado_em DESC LIMIT ?",
        (cliente_nome, limite),
    ).fetchall()
