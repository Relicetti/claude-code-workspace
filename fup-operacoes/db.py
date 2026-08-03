import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime

# No Railway, defina DB_PATH apontando pro volume persistente (ex: /data/fup.db)
# pra o banco não resetar a cada deploy. Local, usa o arquivo ao lado do código.
DB_PATH = os.environ.get("DB_PATH") or os.path.join(os.path.dirname(__file__), "fup.db")

# garante que a pasta do banco exista (ex: /data do volume no Railway); sem isso
# o sqlite dá "unable to open database file" e o container entra em loop de erro.
_pasta_db = os.path.dirname(DB_PATH)
if _pasta_db:
    os.makedirs(_pasta_db, exist_ok=True)

SCHEMA = """
CREATE TABLE IF NOT EXISTS usinas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ug TEXT NOT NULL UNIQUE,
    ug_raw TEXT NOT NULL,
    nome_ufv TEXT NOT NULL,
    concessionaria TEXT,
    dono_carteira TEXT,
    executivo TEXT,
    geracao_media_mensal REAL,
    data_assinatura_contrato TEXT,
    etapa_atual TEXT NOT NULL,
    data_entrada_etapa_atual TEXT NOT NULL,
    situacao_etapa TEXT NOT NULL DEFAULT 'Pendente',
    status TEXT NOT NULL DEFAULT 'ativa'
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
    email TEXT,
    senha_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pendencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usina_id INTEGER NOT NULL REFERENCES usinas(id),
    autor TEXT NOT NULL,
    texto TEXT NOT NULL,
    responsavel TEXT,
    criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    semana TEXT NOT NULL,
    usina_id INTEGER NOT NULL REFERENCES usinas(id),
    nome_ufv TEXT NOT NULL,
    etapa TEXT NOT NULL,
    status TEXT NOT NULL,
    dias_na_etapa INTEGER,
    criado_em TEXT NOT NULL,
    UNIQUE(semana, usina_id)
);

-- log de auditoria pra ações que não ficam registradas nas outras tabelas
-- (cadastro/edição/exclusão de usina, cadastro de usuário, import). Sem FK
-- pra usinas, pra o registro de exclusão sobreviver à remoção da usina.
CREATE TABLE IF NOT EXISTS atividades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL,
    acao TEXT NOT NULL,
    usina_nome TEXT,
    criado_em TEXT NOT NULL
);

-- total de usinas por status (operacao/rescindida) no momento de cada
-- retrato semanal, pra comparar mês a mês além do pipeline ativo.
CREATE TABLE IF NOT EXISTS contadores_semana (
    semana TEXT NOT NULL,
    status TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    PRIMARY KEY (semana, status)
);

-- contratos assinados no Autentique detectados pela sincronização diária,
-- aguardando revisão humana antes de virarem usina de verdade no pipeline.
CREATE TABLE IF NOT EXISTS contratos_pendentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_contrato TEXT NOT NULL UNIQUE,
    nome_ufv TEXT,
    concessionaria TEXT,
    ug_raw TEXT,
    geracao_media_mensal REAL,
    tipo_conexao TEXT,
    potencia_ca TEXT,
    potencia_cc TEXT,
    data_assinatura_contrato TEXT,
    arquivo_pdf TEXT,
    detectado_em TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente',
    usina_id INTEGER REFERENCES usinas(id),
    revisado_por TEXT,
    revisado_em TEXT,
    observacao TEXT
);

CREATE INDEX IF NOT EXISTS idx_historico_usina ON historico_etapas(usina_id);
CREATE INDEX IF NOT EXISTS idx_pendencias_usina ON pendencias(usina_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_semana ON snapshots(semana);
CREATE INDEX IF NOT EXISTS idx_contratos_pendentes_status ON contratos_pendentes(status);
"""

# migrações incrementais em bancos já existentes (coluna, tabela, tipo)
COLUNAS_NOVAS = [
    ("historico_etapas", "autor", "TEXT"),
    ("pendencias", "responsavel", "TEXT"),
    ("usuarios", "is_admin", "INTEGER NOT NULL DEFAULT 0"),
    ("usinas", "executivo", "TEXT"),
    ("usuarios", "email", "TEXT"),
    ("pendencias", "concluida_em", "TEXT"),
    ("pendencias", "concluida_por", "TEXT"),
    ("usinas", "geracao_media_mensal", "REAL"),
    ("usinas", "situacao_etapa", "TEXT NOT NULL DEFAULT '-'"),
    ("usinas", "situacao_atualizada_em", "TEXT"),
    ("usinas", "situacao_atualizada_por", "TEXT"),
    ("usinas", "tipo_conexao", "TEXT"),
    ("usinas", "potencia_ca", "TEXT"),
    ("usinas", "potencia_cc", "TEXT"),
    ("usinas", "data_protocolo", "TEXT"),
    ("usinas", "data_aprovacao", "TEXT"),
]

# nessas etapas, mudar a situação da etapa pra "Em Andamento" exige a data do
# protocolo, e pra "Concluído" exige a data da aprovação.
ETAPAS_COM_DATA_SITUACAO = ["TT Usina", "Aguardando Aprovação Rateio"]

# situação da usina DENTRO da etapa atual (diferente do status de ciclo de vida).
# "-" = acabou de chegar na etapa, ninguém começou ainda (padrão).
SITUACOES = ["-", "Pendente", "Em Andamento", "Concluído"]

CAMPOS_EDITAVEIS_USINA = [
    "ug_raw", "nome_ufv", "concessionaria", "dono_carteira", "executivo",
    "geracao_media_mensal", "data_assinatura_contrato",
    "tipo_conexao", "potencia_ca", "potencia_cc",
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
    "Rescisão",
]

ETAPAS_FINAIS = ["Operação", "Rescindida"]

# fluxo obrigatório: de cada etapa, pra quais a usina pode ir a seguir.
# 1 destino = obrigatório; vários = a pessoa escolhe entre eles no dropdown.
FLUXO = {
    "Assinado c/ Pendência": ["TT Usina"],
    "TT Usina": ["Separando Clientes"],
    "Separando Clientes": ["Sem Clientes", "TT Cliente", "Aguardando Rateio"],
    "Sem Clientes": ["Aguardando Rateio"],
    "TT Cliente": ["Aguardando Rateio"],
    "Aguardando Rateio": ["Aguardando Aprovação Rateio"],
    "Aguardando Aprovação Rateio": ["Operação", "Refazer Rateio"],
    "Refazer Rateio": ["Operação"],
    "Consumo de Saldo Acumulado": ["Operação"],
    "Rescisão": ["Rescindida"],
}

# de qualquer etapa do pipeline (menos a própria "Rescisão"), a usina também
# pode ir direto pra "Rescisão" -- um contrato pode ser rescindido a qualquer
# momento, não só quando está em operação.
for _etapa in list(FLUXO.keys()):
    if _etapa != "Rescisão" and "Rescisão" not in FLUXO[_etapa]:
        FLUXO[_etapa].append("Rescisão")

# a partir de "Operando" (status='operacao', fora do pipeline), a usina pode
# voltar pro pipeline por um desses 3 pontos
FLUXO_DESDE_OPERACAO = ["Refazer Rateio", "Consumo de Saldo Acumulado", "Rescisão"]


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
        tabelas = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "observacoes" in tabelas and "pendencias" not in tabelas:
            conn.execute("ALTER TABLE observacoes RENAME TO pendencias")

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


def listar_por_status(conn, status):
    return conn.execute(
        "SELECT * FROM usinas WHERE status = ? ORDER BY nome_ufv", (status,)
    ).fetchall()


def contar_por_status(conn, status):
    row = conn.execute("SELECT COUNT(*) AS qtd FROM usinas WHERE status = ?", (status,)).fetchone()
    return row["qtd"]


def ug_existe(conn, ug_raw):
    ug = normalizar_ug(ug_raw)
    if not ug:
        return False
    return conn.execute("SELECT 1 FROM usinas WHERE ug = ? LIMIT 1", (ug,)).fetchone() is not None


def data_entrada_etapa_final_por_usina(conn, etapa):
    """Data em que cada usina entrou numa etapa final (Operação/Rescindida)."""
    linhas = conn.execute(
        "SELECT usina_id, MAX(data_entrada) AS data FROM historico_etapas WHERE etapa = ? GROUP BY usina_id",
        (etapa,),
    ).fetchall()
    return {row["usina_id"]: row["data"] for row in linhas}


def buscar_usina(conn, usina_id):
    return conn.execute("SELECT * FROM usinas WHERE id = ?", (usina_id,)).fetchone()


def buscar_usinas_ativas_por_pessoa(conn, termo):
    """Usinas ativas onde a pessoa é a carteira ou o executivo, ou onde o
    termo bate com o nome da usina (busca parcial)."""
    coringa = f"%{termo}%"
    return conn.execute(
        """SELECT * FROM usinas WHERE status = 'ativa'
           AND (dono_carteira LIKE ? OR executivo LIKE ? OR nome_ufv LIKE ?)
           ORDER BY nome_ufv""",
        (coringa, coringa, coringa),
    ).fetchall()


def buscar_pendencias_por_pessoa(conn, termo):
    """Pendências (de usinas ativas) em que a pessoa é a responsável (busca parcial)."""
    coringa = f"%{termo}%"
    return conn.execute(
        """SELECT p.*, u.nome_ufv, u.etapa_atual
           FROM pendencias p
           JOIN usinas u ON u.id = p.usina_id
           WHERE u.status = 'ativa' AND p.responsavel LIKE ?
           ORDER BY p.criado_em DESC""",
        (coringa,),
    ).fetchall()


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
        # ao entrar numa etapa nova, a situação reinicia (ninguém começou ainda)
        conn.execute(
            "UPDATE usinas SET etapa_atual = ?, data_entrada_etapa_atual = ?, "
            "situacao_etapa = '-', situacao_atualizada_em = NULL, situacao_atualizada_por = NULL WHERE id = ?",
            (nova_etapa, hoje_iso, usina_id),
        )


def mudar_situacao(conn, usina_id, situacao, usuario, quando, data_protocolo=None, data_aprovacao=None):
    sets = ["situacao_etapa = ?", "situacao_atualizada_em = ?", "situacao_atualizada_por = ?"]
    valores = [situacao, quando, usuario]
    if data_protocolo:
        sets.append("data_protocolo = ?")
        valores.append(data_protocolo)
    if data_aprovacao:
        sets.append("data_aprovacao = ?")
        valores.append(data_aprovacao)
    valores.append(usina_id)
    conn.execute(f"UPDATE usinas SET {', '.join(sets)} WHERE id = ?", valores)


def reabrir_para_pipeline(conn, usina_id, nova_etapa, hoje_iso, autor):
    """Usina 'Operando' volta pro pipeline ativo (Refazer Rateio, Consumo de
    Saldo Acumulado ou Em Rescisão)."""
    conn.execute(
        "INSERT INTO historico_etapas (usina_id, etapa, data_entrada, data_saida, autor) VALUES (?,?,?,NULL,?)",
        (usina_id, nova_etapa, hoje_iso, autor),
    )
    conn.execute(
        """UPDATE usinas SET status = 'ativa', etapa_atual = ?, data_entrada_etapa_atual = ?,
           situacao_etapa = '-', situacao_atualizada_em = NULL, situacao_atualizada_por = NULL
           WHERE id = ?""",
        (nova_etapa, hoje_iso, usina_id),
    )


def pendencias_usina(conn, usina_id):
    return conn.execute(
        "SELECT * FROM pendencias WHERE usina_id = ? ORDER BY criado_em DESC",
        (usina_id,),
    ).fetchall()


def ultimas_pendencias_por_usina(conn):
    """Última pendência de cada usina, pra listar sem 1 query por linha."""
    linhas = conn.execute(
        """SELECT p.usina_id, p.autor, p.texto, p.responsavel, p.criado_em, p.concluida_em
           FROM pendencias p
           JOIN (
               SELECT usina_id, MAX(criado_em) AS max_criado_em
               FROM pendencias GROUP BY usina_id
           ) ultima ON ultima.usina_id = p.usina_id AND ultima.max_criado_em = p.criado_em"""
    ).fetchall()
    return {row["usina_id"]: dict(row) for row in linhas}


def contar_pendencias_por_usina(conn):
    linhas = conn.execute(
        "SELECT usina_id, COUNT(*) AS qtd FROM pendencias GROUP BY usina_id"
    ).fetchall()
    return {row["usina_id"]: row["qtd"] for row in linhas}


def tem_pendencia_aberta(conn, usina_id):
    row = conn.execute(
        "SELECT COUNT(*) AS abertas FROM pendencias WHERE usina_id = ? AND concluida_em IS NULL",
        (usina_id,),
    ).fetchone()
    return row["abertas"] > 0


def adicionar_pendencia(conn, usina_id, texto, responsavel, autor, criado_em):
    texto = texto.strip()
    if not texto:
        return
    conn.execute(
        "INSERT INTO pendencias (usina_id, autor, texto, responsavel, criado_em) VALUES (?,?,?,?,?)",
        (usina_id, autor, texto, responsavel.strip() if responsavel else None, criado_em),
    )


def marcar_pendencia(conn, pendencia_id, concluir, usuario, quando):
    """Marca (ou desmarca) uma pendência como concluída. Retorna o usina_id
    pra redirecionar de volta pra usina."""
    if concluir:
        conn.execute(
            "UPDATE pendencias SET concluida_em = ?, concluida_por = ? WHERE id = ?",
            (quando, usuario, pendencia_id),
        )
    else:
        conn.execute(
            "UPDATE pendencias SET concluida_em = NULL, concluida_por = NULL WHERE id = ?",
            (pendencia_id,),
        )
    row = conn.execute("SELECT usina_id FROM pendencias WHERE id = ?", (pendencia_id,)).fetchone()
    return row["usina_id"] if row else None


def criar_usina(conn, ug_raw, nome_ufv, concessionaria, dono_carteira, executivo,
                 geracao_media_mensal, data_assinatura, etapa_inicial, hoje_iso,
                 pendencia, responsavel, autor, criado_em,
                 tipo_conexao=None, potencia_ca=None, potencia_cc=None):
    ug = normalizar_ug(ug_raw)
    cur = conn.execute(
        """INSERT INTO usinas
           (ug, ug_raw, nome_ufv, concessionaria, dono_carteira, executivo,
            geracao_media_mensal, data_assinatura_contrato, etapa_atual,
            data_entrada_etapa_atual, status, tipo_conexao, potencia_ca, potencia_cc)
           VALUES (?,?,?,?,?,?,?,?,?,?, 'ativa', ?,?,?)""",
        (ug, ug_raw, nome_ufv, concessionaria, dono_carteira, executivo,
         geracao_media_mensal, data_assinatura or None, etapa_inicial, hoje_iso,
         tipo_conexao, potencia_ca, potencia_cc),
    )
    usina_id = cur.lastrowid
    conn.execute(
        "INSERT INTO historico_etapas (usina_id, etapa, data_entrada, data_saida, autor) VALUES (?,?,?,NULL,?)",
        (usina_id, etapa_inicial, hoje_iso, autor),
    )
    if pendencia and pendencia.strip():
        adicionar_pendencia(conn, usina_id, pendencia, responsavel, autor, criado_em)
    return usina_id


def atualizar_usina(conn, usina_id, campos):
    """campos: dict com um subconjunto de CAMPOS_EDITAVEIS_USINA."""
    sets = []
    valores = []
    for campo in CAMPOS_EDITAVEIS_USINA:
        if campo in campos:
            sets.append(f"{campo} = ?")
            valores.append(campos[campo] or None)
    if not sets:
        return
    if "ug_raw" in campos:
        sets.append("ug = ?")
        valores.append(normalizar_ug(campos["ug_raw"]))
    valores.append(usina_id)
    conn.execute(f"UPDATE usinas SET {', '.join(sets)} WHERE id = ?", valores)


def excluir_usina(conn, usina_id):
    conn.execute("DELETE FROM pendencias WHERE usina_id = ?", (usina_id,))
    conn.execute("DELETE FROM historico_etapas WHERE usina_id = ?", (usina_id,))
    conn.execute("DELETE FROM snapshots WHERE usina_id = ?", (usina_id,))
    conn.execute("DELETE FROM usinas WHERE id = ?", (usina_id,))


# --- snapshot semanal ---------------------------------------------------

def tirar_snapshot(conn, semana_iso, criado_em):
    """Registra o estado atual de cada usina ativa como retrato da 'semana_iso'
    (segunda-feira de referência). Não sobrescreve um snapshot já existente
    pra essa semana."""
    ja_existe = conn.execute(
        "SELECT 1 FROM snapshots WHERE semana = ? LIMIT 1", (semana_iso,)
    ).fetchone()
    if ja_existe:
        return False

    hoje = datetime.strptime(criado_em[:10], "%Y-%m-%d").date()
    for u in listar_ativas(conn):
        dias_na_etapa = None
        if u["data_entrada_etapa_atual"]:
            entrada = datetime.strptime(u["data_entrada_etapa_atual"], "%Y-%m-%d").date()
            dias_na_etapa = (hoje - entrada).days
        conn.execute(
            """INSERT INTO snapshots (semana, usina_id, nome_ufv, etapa, status, dias_na_etapa, criado_em)
               VALUES (?,?,?,?,?,?,?)""",
            (semana_iso, u["id"], u["nome_ufv"], u["etapa_atual"], u["status"], dias_na_etapa, criado_em),
        )

    for status in ("operacao", "rescindida"):
        conn.execute(
            "INSERT OR REPLACE INTO contadores_semana (semana, status, quantidade) VALUES (?,?,?)",
            (semana_iso, status, contar_por_status(conn, status)),
        )
    return True


def semanas_com_snapshot(conn):
    linhas = conn.execute("SELECT DISTINCT semana FROM snapshots ORDER BY semana DESC").fetchall()
    return [r["semana"] for r in linhas]


def contadores_da_semana(conn, semana_iso):
    """Total de usinas em operação/rescindida no momento do retrato dessa
    semana. Retorna {} se o retrato é de antes dessa métrica existir."""
    linhas = conn.execute(
        "SELECT status, quantidade FROM contadores_semana WHERE semana = ?", (semana_iso,)
    ).fetchall()
    return {r["status"]: r["quantidade"] for r in linhas}


def snapshot_da_semana(conn, semana_iso):
    linhas = conn.execute("SELECT * FROM snapshots WHERE semana = ?", (semana_iso,)).fetchall()
    return {row["usina_id"]: dict(row) for row in linhas}


# --- log de auditoria ---------------------------------------------------

def registrar_atividade(conn, usuario, acao, usina_nome, criado_em):
    conn.execute(
        "INSERT INTO atividades (usuario, acao, usina_nome, criado_em) VALUES (?,?,?,?)",
        (usuario, acao, usina_nome, criado_em),
    )


def listar_atividades(conn, limite=1000):
    """Linha do tempo unificada de tudo que a equipe fez, juntando 3 fontes:
    o log explícito (atividades), as pendências e as mudanças de etapa feitas
    por usuários reais (ignora as da importação inicial)."""
    eventos = []

    for r in conn.execute(
        "SELECT criado_em, usuario, acao, usina_nome FROM atividades"
    ):
        eventos.append({
            "quando": r["criado_em"], "usuario": r["usuario"],
            "acao": r["acao"], "usina": r["usina_nome"],
        })

    for r in conn.execute(
        """SELECT p.criado_em, p.autor, p.texto, u.nome_ufv
           FROM pendencias p JOIN usinas u ON u.id = p.usina_id
           WHERE p.autor != 'Importação'"""
    ):
        eventos.append({
            "quando": r["criado_em"], "usuario": r["autor"],
            "acao": f"Pendência: {r['texto']}", "usina": r["nome_ufv"],
        })

    for r in conn.execute(
        """SELECT h.data_entrada, h.autor, h.etapa, u.nome_ufv
           FROM historico_etapas h JOIN usinas u ON u.id = h.usina_id
           WHERE h.autor IS NOT NULL AND h.autor != 'Importação'"""
    ):
        eventos.append({
            "quando": r["data_entrada"], "usuario": r["autor"],
            "acao": f"Mudou para a etapa \"{r['etapa']}\"", "usina": r["nome_ufv"],
        })

    eventos.sort(key=lambda e: e["quando"] or "", reverse=True)
    return eventos[:limite]


# --- usuários / login -------------------------------------------------

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


def atualizar_senha(conn, usuario_id, senha_hash):
    conn.execute("UPDATE usuarios SET senha_hash = ? WHERE id = ?", (senha_hash, usuario_id))


def bootstrap_admin(gerar_hash):
    """Cria um admin inicial a partir de variáveis de ambiente, se ainda não
    existir nenhum. Necessário no Railway: num banco vazio, sem isso ninguém
    conseguiria logar pra criar os outros usuários. Não faz nada se a conta já
    existe ou se as variáveis não estão definidas."""
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


TABELAS_ESPERADAS = {"usinas", "historico_etapas", "usuarios", "pendencias"}


def validar_banco_importado(caminho):
    """Confere que o arquivo enviado é um SQLite válido com as tabelas do
    sistema, antes de aceitá-lo. Retorna (ok, mensagem). Sempre fecha a
    conexão (senão, no Windows, o arquivo fica travado e o os.replace falha)."""
    conn = None
    try:
        conn = sqlite3.connect(caminho)
        conn.row_factory = sqlite3.Row
        tabelas = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        faltando = TABELAS_ESPERADAS - tabelas
        if faltando:
            return False, f"Arquivo não parece ser o banco do sistema (faltam tabelas: {', '.join(sorted(faltando))})."
        n = conn.execute("SELECT COUNT(*) FROM usinas").fetchone()[0]
        return True, f"Banco válido: {n} usina(s)."
    except Exception as e:
        return False, f"Arquivo inválido: {e}"
    finally:
        if conn is not None:
            conn.close()


# --- contratos pendentes (sincronização com Autentique) -----------------

def codigo_contrato_existe(conn, codigo_contrato):
    return conn.execute(
        "SELECT 1 FROM contratos_pendentes WHERE codigo_contrato = ? LIMIT 1", (codigo_contrato,)
    ).fetchone() is not None


def inserir_contrato_pendente(conn, dados, detectado_em):
    """dados: dict com codigo_contrato, nome_ufv, concessionaria, ug_raw,
    geracao_media_mensal, tipo_conexao, potencia_ca, potencia_cc,
    data_assinatura_contrato, arquivo_pdf, observacao (todos opcionais exceto
    codigo_contrato)."""
    conn.execute(
        """INSERT INTO contratos_pendentes
           (codigo_contrato, nome_ufv, concessionaria, ug_raw, geracao_media_mensal,
            tipo_conexao, potencia_ca, potencia_cc, data_assinatura_contrato,
            arquivo_pdf, detectado_em, status, observacao)
           VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pendente', ?)
           ON CONFLICT(codigo_contrato) DO NOTHING""",
        (
            dados["codigo_contrato"], dados.get("nome_ufv"), dados.get("concessionaria"),
            dados.get("ug_raw"), dados.get("geracao_media_mensal"), dados.get("tipo_conexao"),
            dados.get("potencia_ca"), dados.get("potencia_cc"), dados.get("data_assinatura_contrato"),
            dados.get("arquivo_pdf"), detectado_em, dados.get("observacao"),
        ),
    )


def listar_contratos_pendentes(conn):
    return conn.execute(
        "SELECT * FROM contratos_pendentes WHERE status = 'pendente' ORDER BY detectado_em DESC"
    ).fetchall()


def contar_contratos_pendentes(conn):
    row = conn.execute(
        "SELECT COUNT(*) AS qtd FROM contratos_pendentes WHERE status = 'pendente'"
    ).fetchone()
    return row["qtd"]


def buscar_contrato_pendente(conn, contrato_id):
    return conn.execute("SELECT * FROM contratos_pendentes WHERE id = ?", (contrato_id,)).fetchone()


def aprovar_contrato_pendente(conn, contrato_id, usina_id, usuario, quando):
    conn.execute(
        """UPDATE contratos_pendentes SET status = 'aprovada', usina_id = ?,
           revisado_por = ?, revisado_em = ? WHERE id = ?""",
        (usina_id, usuario, quando, contrato_id),
    )


def rejeitar_contrato_pendente(conn, contrato_id, usuario, quando, motivo):
    conn.execute(
        """UPDATE contratos_pendentes SET status = 'rejeitada', observacao = ?,
           revisado_por = ?, revisado_em = ? WHERE id = ?""",
        (motivo, usuario, quando, contrato_id),
    )
