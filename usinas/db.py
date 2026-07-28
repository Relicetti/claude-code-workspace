import re
import sqlite3
import os
from datetime import datetime

DB_PATH = os.environ.get(
    "DB_PATH",
    os.path.join(os.path.dirname(__file__), "usinas.db")
)
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)

SCHEMA = """
CREATE TABLE IF NOT EXISTS faturas (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    chave_natural           TEXT NOT NULL UNIQUE,
    id_fatura               TEXT,
    uc                      TEXT NOT NULL,
    nome_cliente            TEXT,
    codigo_venda            TEXT,
    concessionaria          TEXT,
    mes_referencia          TEXT NOT NULL,   -- 'YYYY-MM'
    consumo_real_kwh        REAL DEFAULT 0,
    energia_compensada_kwh  REAL DEFAULT 0,
    usina                   TEXT,
    emissao                 TEXT,
    vencimento              TEXT,
    valor_concessionaria    REAL DEFAULT 0,
    valor_a_receber         REAL DEFAULT 0,
    valor_faturado          REAL,
    data_pagamento          TEXT,
    status                  TEXT,
    status_norm             TEXT,            -- pago / atrasado / aberto / outros
    atualizado_em           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_faturas_mes    ON faturas(mes_referencia);
CREATE INDEX IF NOT EXISTS idx_faturas_usina  ON faturas(usina);
CREATE INDEX IF NOT EXISTS idx_faturas_uc     ON faturas(uc);

CREATE TABLE IF NOT EXISTS rateios (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    uc                      TEXT NOT NULL,
    usina                   TEXT,
    codigo_venda            TEXT,
    mes_referencia          TEXT NOT NULL,
    injecao_prevista_kwh    REAL DEFAULT 0,
    porcentagem             REAL DEFAULT 0,
    tipo_gd                 TEXT,
    status_pagamento        TEXT,
    id_status               TEXT,
    ultimo_mes_referencia   TEXT,
    ultimo_valor_pago       REAL DEFAULT 0,
    UNIQUE(uc, usina, mes_referencia, codigo_venda)
);
CREATE INDEX IF NOT EXISTS idx_rateios_uc ON rateios(uc);
CREATE INDEX IF NOT EXISTS idx_rateios_usina ON rateios(usina);

CREATE TABLE IF NOT EXISTS analise_beneficiaria (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    uc                          TEXT NOT NULL,
    codigo_venda                TEXT,
    periodo_snapshot            TEXT NOT NULL,
    media_prevista_consumo      REAL,
    media_real_consumo          REAL,
    pct_consumo_real_x_prev     REAL,
    media_energia_compensada    REAL,
    pct_comp_x_consumo          REAL,
    qtd_faturas                 INTEGER,
    pagas                       INTEGER,
    atrasadas                   INTEGER,
    a_vencer                    INTEGER,
    vol_energia_paga            REAL,
    vol_energia_inadimplente    REAL,
    vol_energia_a_vencer        REAL,
    inadimplencia_pct           REAL,
    UNIQUE(uc, periodo_snapshot)
);
CREATE INDEX IF NOT EXISTS idx_analise_uc ON analise_beneficiaria(uc);

CREATE TABLE IF NOT EXISTS portfolio_mensal (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    usina_selecionada   TEXT NOT NULL,
    periodo_export      TEXT NOT NULL,
    fonte               TEXT NOT NULL,
    indicador           TEXT NOT NULL,
    mes_referencia      TEXT NOT NULL,
    valor               REAL,
    UNIQUE(usina_selecionada, fonte, indicador, mes_referencia, periodo_export)
);

CREATE TABLE IF NOT EXISTS portfolio_kpis (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    usina_selecionada           TEXT NOT NULL,
    periodo_export               TEXT NOT NULL,
    id_usina                    TEXT,
    instalacao                  TEXT,
    concessionaria               TEXT,
    potencia_conexao             TEXT,
    potencia_instalada           TEXT,
    fonte                        TEXT,
    geracao_prevista_acum_mwh    REAL,
    geracao_real_acum_mwh        REAL,
    valor_faturado               REAL,
    valor_pago                   REAL,
    valor_a_vencer               REAL,
    valor_atrasado               REAL,
    inadimplencia_pct            REAL,
    receita_liquida_prevista     REAL,
    receita_liquida_realizada    REAL,
    UNIQUE(usina_selecionada, periodo_export)
);

CREATE TABLE IF NOT EXISTS importacoes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    arquivo_nome    TEXT,
    periodo         TEXT,
    total_faturas   INTEGER,
    total_rateios   INTEGER,
    total_analise   INTEGER,
    importado_em    TEXT NOT NULL
);
"""

# Classificacao tolerante a variacoes de rotulo entre exports do painel
def status_norm(status):
    s = status.strip().lower()
    trans = str.maketrans("áàâãäéèêëíìîïóòôõöúùûüçñ", "aaaaaeeeeiiiiooooouuuucn")
    s = s.translate(trans)
    if "renegoc" in s or "cancelad" in s or "arquivad" in s or "auditoria" in s:
        return "outros"
    if "pago" in s:
        return "pago"
    if "atras" in s or "inadimp" in s:
        return "atrasado"
    if "vencer" in s or "pendente" in s or "agendad" in s or "pre-fatura" in s or "prefatura" in s:
        return "aberto"
    return "outros"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def _chave_natural(f):
    if f.get("id_fatura"):
        return f"ID-{f['id_fatura']}"
    return "PEND-" + "-".join([
        f["uc"], f.get("usina") or "", f["mes_referencia"],
        f.get("codigo_venda") or "", f.get("emissao") or "", f.get("vencimento") or "",
    ])


def salvar_importacao(resultado, arquivo_nome):
    agora = datetime.now().isoformat()
    with get_conn() as conn:
        for f in resultado["faturas"]:
            conn.execute("""
                INSERT INTO faturas
                    (chave_natural, id_fatura, uc, nome_cliente, codigo_venda, concessionaria,
                     mes_referencia, consumo_real_kwh, energia_compensada_kwh, usina,
                     emissao, vencimento, valor_concessionaria, valor_a_receber,
                     valor_faturado, data_pagamento, status, status_norm, atualizado_em)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(chave_natural) DO UPDATE SET
                    nome_cliente=excluded.nome_cliente,
                    codigo_venda=excluded.codigo_venda,
                    concessionaria=CASE WHEN excluded.concessionaria != '' THEN excluded.concessionaria ELSE faturas.concessionaria END,
                    consumo_real_kwh=excluded.consumo_real_kwh,
                    energia_compensada_kwh=excluded.energia_compensada_kwh,
                    usina=excluded.usina,
                    emissao=excluded.emissao,
                    vencimento=excluded.vencimento,
                    valor_concessionaria=excluded.valor_concessionaria,
                    valor_a_receber=excluded.valor_a_receber,
                    valor_faturado=excluded.valor_faturado,
                    data_pagamento=excluded.data_pagamento,
                    status=excluded.status,
                    status_norm=excluded.status_norm,
                    atualizado_em=excluded.atualizado_em
            """, (
                _chave_natural(f), f["id_fatura"], f["uc"], f["nome_cliente"], f["codigo_venda"],
                f["concessionaria"], f["mes_referencia"], f["consumo_real_kwh"], f["energia_compensada_kwh"],
                f["usina"], f["emissao"], f["vencimento"], f["valor_concessionaria"], f["valor_a_receber"],
                f["valor_faturado"], f["data_pagamento"], f["status"], status_norm(f["status"]), agora,
            ))

        for r in resultado["rateios"]:
            conn.execute("""
                INSERT INTO rateios
                    (uc, usina, codigo_venda, mes_referencia, injecao_prevista_kwh,
                     porcentagem, tipo_gd, status_pagamento, id_status,
                     ultimo_mes_referencia, ultimo_valor_pago)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(uc, usina, mes_referencia, codigo_venda) DO UPDATE SET
                    injecao_prevista_kwh=excluded.injecao_prevista_kwh,
                    porcentagem=excluded.porcentagem,
                    tipo_gd=excluded.tipo_gd,
                    status_pagamento=excluded.status_pagamento,
                    id_status=excluded.id_status,
                    ultimo_mes_referencia=excluded.ultimo_mes_referencia,
                    ultimo_valor_pago=excluded.ultimo_valor_pago
            """, (
                r["uc"], r["usina"], r["codigo_venda"], r["mes_referencia"], r["injecao_prevista_kwh"],
                r["porcentagem"], r["tipo_gd"], r["status_pagamento"], r["id_status"],
                r["ultimo_mes_referencia"], r["ultimo_valor_pago"],
            ))

        for a in resultado["analise_beneficiaria"]:
            conn.execute("""
                INSERT INTO analise_beneficiaria
                    (uc, codigo_venda, periodo_snapshot, media_prevista_consumo, media_real_consumo,
                     pct_consumo_real_x_prev, media_energia_compensada, pct_comp_x_consumo,
                     qtd_faturas, pagas, atrasadas, a_vencer, vol_energia_paga,
                     vol_energia_inadimplente, vol_energia_a_vencer, inadimplencia_pct)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(uc, periodo_snapshot) DO UPDATE SET
                    codigo_venda=excluded.codigo_venda,
                    media_prevista_consumo=excluded.media_prevista_consumo,
                    media_real_consumo=excluded.media_real_consumo,
                    pct_consumo_real_x_prev=excluded.pct_consumo_real_x_prev,
                    media_energia_compensada=excluded.media_energia_compensada,
                    pct_comp_x_consumo=excluded.pct_comp_x_consumo,
                    qtd_faturas=excluded.qtd_faturas,
                    pagas=excluded.pagas,
                    atrasadas=excluded.atrasadas,
                    a_vencer=excluded.a_vencer,
                    vol_energia_paga=excluded.vol_energia_paga,
                    vol_energia_inadimplente=excluded.vol_energia_inadimplente,
                    vol_energia_a_vencer=excluded.vol_energia_a_vencer,
                    inadimplencia_pct=excluded.inadimplencia_pct
            """, (
                a["uc"], a["codigo_venda"], a["periodo_snapshot"], a["media_prevista_consumo"],
                a["media_real_consumo"], a["pct_consumo_real_x_prev"], a["media_energia_compensada"],
                a["pct_comp_x_consumo"], a["qtd_faturas"], a["pagas"], a["atrasadas"], a["a_vencer"],
                a["vol_energia_paga"], a["vol_energia_inadimplente"], a["vol_energia_a_vencer"],
                a["inadimplencia_pct"],
            ))

        for p in resultado["portfolio_mensal"]:
            conn.execute("""
                INSERT INTO portfolio_mensal
                    (usina_selecionada, periodo_export, fonte, indicador, mes_referencia, valor)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(usina_selecionada, fonte, indicador, mes_referencia, periodo_export)
                DO UPDATE SET valor=excluded.valor
            """, (
                p["usina_selecionada"], p["periodo_export"], p["fonte"],
                p["indicador"], p["mes_referencia"], p["valor"],
            ))

        k = resultado.get("portfolio_kpis")
        if k:
            conn.execute("""
                INSERT INTO portfolio_kpis
                    (usina_selecionada, periodo_export, id_usina, instalacao, concessionaria,
                     potencia_conexao, potencia_instalada, fonte, geracao_prevista_acum_mwh,
                     geracao_real_acum_mwh, valor_faturado, valor_pago, valor_a_vencer,
                     valor_atrasado, inadimplencia_pct, receita_liquida_prevista, receita_liquida_realizada)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(usina_selecionada, periodo_export) DO UPDATE SET
                    id_usina=excluded.id_usina, instalacao=excluded.instalacao,
                    concessionaria=excluded.concessionaria, potencia_conexao=excluded.potencia_conexao,
                    potencia_instalada=excluded.potencia_instalada, fonte=excluded.fonte,
                    geracao_prevista_acum_mwh=excluded.geracao_prevista_acum_mwh,
                    geracao_real_acum_mwh=excluded.geracao_real_acum_mwh,
                    valor_faturado=excluded.valor_faturado, valor_pago=excluded.valor_pago,
                    valor_a_vencer=excluded.valor_a_vencer, valor_atrasado=excluded.valor_atrasado,
                    inadimplencia_pct=excluded.inadimplencia_pct,
                    receita_liquida_prevista=excluded.receita_liquida_prevista,
                    receita_liquida_realizada=excluded.receita_liquida_realizada
            """, (
                k["usina_selecionada"], k["periodo_export"], k.get("id_usina"), k.get("instalacao"),
                k.get("concessionaria"), k.get("potencia_conexao"), k.get("potencia_instalada"),
                k.get("fonte"), k.get("geracao_prevista_acum_mwh"), k.get("geracao_real_acum_mwh"),
                k.get("valor_faturado"), k.get("valor_pago"), k.get("valor_a_vencer"),
                k.get("valor_atrasado"), k.get("inadimplencia_pct"), k.get("receita_liquida_prevista"),
                k.get("receita_liquida_realizada"),
            ))

        conn.execute("""
            INSERT INTO importacoes (arquivo_nome, periodo, total_faturas, total_rateios, total_analise, importado_em)
            VALUES (?,?,?,?,?,?)
        """, (
            arquivo_nome, resultado["periodo_dominante"], len(resultado["faturas"]),
            len(resultado["rateios"]), len(resultado["analise_beneficiaria"]), agora,
        ))


def get_periodos():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT mes_referencia FROM faturas ORDER BY mes_referencia DESC"
        ).fetchall()
    return [r["mes_referencia"] for r in rows]


def get_importacoes():
    with get_conn() as conn:
        return conn.execute("SELECT * FROM importacoes ORDER BY importado_em DESC").fetchall()


def get_usinas(periodo=None):
    q = "SELECT DISTINCT usina FROM faturas"
    params = []
    if periodo:
        q += " WHERE mes_referencia = ?"
        params.append(periodo)
    q += " ORDER BY usina"
    with get_conn() as conn:
        rows = conn.execute(q, params).fetchall()
    return [r["usina"] for r in rows if r["usina"]]


_STATUS_CASE = """
    CASE status_norm
        WHEN 'pago' THEN 'pago'
        WHEN 'atrasado' THEN 'atrasado'
        WHEN 'aberto' THEN 'aberto'
        ELSE 'outros'
    END
"""


def resumo_geral(periodo):
    with get_conn() as conn:
        return conn.execute(f"""
            SELECT
                COUNT(*) AS total_ucs,
                COUNT(DISTINCT usina) AS total_usinas,
                SUM(consumo_real_kwh) AS consumo_total,
                SUM(energia_compensada_kwh) AS compensado_total,
                SUM(valor_a_receber) AS valor_a_receber_total,
                SUM(CASE WHEN status_norm='pago' THEN valor_a_receber ELSE 0 END) AS valor_pago,
                SUM(CASE WHEN status_norm='atrasado' THEN valor_a_receber ELSE 0 END) AS valor_atrasado,
                SUM(CASE WHEN status_norm='aberto' THEN valor_a_receber ELSE 0 END) AS valor_aberto,
                SUM(CASE WHEN status_norm='atrasado' THEN 1 ELSE 0 END) AS qtd_atrasados
            FROM faturas
            WHERE mes_referencia = ?
        """, (periodo,)).fetchone()


def resumo_por_usina(periodo):
    with get_conn() as conn:
        return conn.execute("""
            SELECT
                usina,
                COUNT(*) AS total_ucs,
                SUM(consumo_real_kwh) AS consumo_total,
                SUM(energia_compensada_kwh) AS compensado_total,
                SUM(valor_a_receber) AS valor_a_receber_total,
                SUM(CASE WHEN status_norm='pago' THEN valor_a_receber ELSE 0 END) AS valor_pago,
                SUM(CASE WHEN status_norm='atrasado' THEN valor_a_receber ELSE 0 END) AS valor_atrasado,
                SUM(CASE WHEN status_norm='aberto' THEN valor_a_receber ELSE 0 END) AS valor_aberto,
                SUM(CASE WHEN status_norm='atrasado' THEN 1 ELSE 0 END) AS qtd_atrasados,
                CASE WHEN SUM(CASE WHEN status_norm IN ('pago','atrasado') THEN valor_a_receber ELSE 0 END) > 0
                     THEN SUM(CASE WHEN status_norm='atrasado' THEN valor_a_receber ELSE 0 END) * 1.0
                          / SUM(CASE WHEN status_norm IN ('pago','atrasado') THEN valor_a_receber ELSE 0 END)
                     ELSE NULL END AS pct_inadimplencia
            FROM faturas
            WHERE mes_referencia = ?
            GROUP BY usina
            ORDER BY valor_a_receber_total DESC
        """, (periodo,)).fetchall()


def resumo_por_concessionaria(periodo):
    with get_conn() as conn:
        return conn.execute("""
            SELECT
                COALESCE(NULLIF(concessionaria, ''), 'Não informado') AS concessionaria,
                COUNT(*) AS total_ucs,
                SUM(valor_a_receber) AS valor_a_receber_total,
                SUM(CASE WHEN status_norm='pago' THEN valor_a_receber ELSE 0 END) AS valor_pago,
                SUM(CASE WHEN status_norm='atrasado' THEN valor_a_receber ELSE 0 END) AS valor_atrasado,
                CASE WHEN SUM(CASE WHEN status_norm IN ('pago','atrasado') THEN valor_a_receber ELSE 0 END) > 0
                     THEN SUM(CASE WHEN status_norm='atrasado' THEN valor_a_receber ELSE 0 END) * 1.0
                          / SUM(CASE WHEN status_norm IN ('pago','atrasado') THEN valor_a_receber ELSE 0 END)
                     ELSE NULL END AS pct_inadimplencia
            FROM faturas
            WHERE mes_referencia = ?
            GROUP BY concessionaria
            ORDER BY valor_a_receber_total DESC
        """, (periodo,)).fetchall()


def evolucao_usina(usina):
    with get_conn() as conn:
        return conn.execute("""
            SELECT
                mes_referencia,
                COUNT(*) AS total_ucs,
                SUM(consumo_real_kwh) AS consumo_total,
                SUM(energia_compensada_kwh) AS compensado_total,
                SUM(valor_a_receber) AS valor_a_receber_total,
                SUM(CASE WHEN status_norm='pago' THEN valor_a_receber ELSE 0 END) AS valor_pago,
                SUM(CASE WHEN status_norm='atrasado' THEN valor_a_receber ELSE 0 END) AS valor_atrasado,
                CASE WHEN SUM(CASE WHEN status_norm IN ('pago','atrasado') THEN valor_a_receber ELSE 0 END) > 0
                     THEN SUM(CASE WHEN status_norm='atrasado' THEN valor_a_receber ELSE 0 END) * 1.0
                          / SUM(CASE WHEN status_norm IN ('pago','atrasado') THEN valor_a_receber ELSE 0 END)
                     ELSE NULL END AS pct_inadimplencia
            FROM faturas
            WHERE usina = ?
            GROUP BY mes_referencia
            ORDER BY mes_referencia
        """, (usina,)).fetchall()


def registros_usina(usina, periodo):
    with get_conn() as conn:
        return conn.execute("""
            SELECT * FROM faturas
            WHERE usina = ? AND mes_referencia = ?
            ORDER BY status_norm, nome_cliente
        """, (usina, periodo)).fetchall()


def clientes_atraso_recorrente(min_ocorrencias=2):
    with get_conn() as conn:
        return conn.execute("""
            SELECT
                uc, nome_cliente, usina, concessionaria,
                COUNT(*) AS qtd_atrasos,
                GROUP_CONCAT(DISTINCT mes_referencia) AS meses,
                SUM(valor_a_receber) AS valor_total_atrasado
            FROM faturas
            WHERE status_norm = 'atrasado'
            GROUP BY uc
            HAVING qtd_atrasos >= ?
            ORDER BY qtd_atrasos DESC, valor_total_atrasado DESC
        """, (min_ocorrencias,)).fetchall()


def clientes_baixa_compensacao(periodo, limite_pct=0.5, limit=200):
    with get_conn() as conn:
        return conn.execute("""
            SELECT
                uc, nome_cliente, usina, concessionaria, status,
                consumo_real_kwh, energia_compensada_kwh,
                CASE WHEN consumo_real_kwh > 0
                     THEN energia_compensada_kwh * 1.0 / consumo_real_kwh
                     ELSE NULL END AS aproveitamento
            FROM faturas
            WHERE mes_referencia = ?
              AND consumo_real_kwh > 0
              AND (energia_compensada_kwh * 1.0 / consumo_real_kwh) < ?
            ORDER BY aproveitamento ASC
            LIMIT ?
        """, (periodo, limite_pct, limit)).fetchall()


def clientes_inadimplencia_beneficiaria(periodo_snapshot, limit=200):
    with get_conn() as conn:
        return conn.execute("""
            SELECT a.*, f.nome_cliente, f.usina, f.concessionaria
            FROM analise_beneficiaria a
            LEFT JOIN faturas f ON f.uc = a.uc AND f.mes_referencia = a.periodo_snapshot
            WHERE a.periodo_snapshot = ? AND a.inadimplencia_pct > 0
            ORDER BY a.inadimplencia_pct DESC, a.vol_energia_inadimplente DESC
            LIMIT ?
        """, (periodo_snapshot, limit)).fetchall()


def get_analise_periodos():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT periodo_snapshot FROM analise_beneficiaria ORDER BY periodo_snapshot DESC"
        ).fetchall()
    return [r["periodo_snapshot"] for r in rows]


def portfolio_kpis_mais_recente():
    with get_conn() as conn:
        return conn.execute("""
            SELECT * FROM portfolio_kpis
            WHERE usina_selecionada = 'Todas as usinas'
            ORDER BY periodo_export DESC LIMIT 1
        """).fetchone()


def portfolio_serie_mensal(indicador, usina_selecionada="Todas as usinas"):
    """Media entre as fontes (dashboard/performance costumam trazer o mesmo
    numero); evita pontos duplicados no grafico."""
    with get_conn() as conn:
        return conn.execute("""
            SELECT mes_referencia, AVG(valor) AS valor
            FROM portfolio_mensal
            WHERE indicador = ? AND usina_selecionada = ?
            GROUP BY mes_referencia
            ORDER BY mes_referencia
        """, (indicador, usina_selecionada)).fetchall()


def portfolio_indicadores_disponiveis(usina_selecionada="Todas as usinas"):
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT DISTINCT indicador FROM portfolio_mensal
            WHERE usina_selecionada = ?
            ORDER BY indicador
        """, (usina_selecionada,)).fetchall()
    return [r["indicador"] for r in rows]
