import os
import tempfile

from flask import Flask, render_template, request, redirect, url_for, flash

import db
import importador

app = Flask(__name__)
app.secret_key = "usinas-dashboard-2026"

db.init_db()


def _fmt_num(v, casas=0):
    if v is None:
        v = 0
    s = f"{v:,.{casas}f}"
    return s.replace(",", "_").replace(".", ",").replace("_", ".")


@app.template_filter("brl")
def brl(v):
    return "R$ " + _fmt_num(v or 0, 2)


@app.template_filter("numero")
def numero(v, casas=0):
    return _fmt_num(v or 0, casas)


@app.template_filter("pct")
def pct(v, casas=1):
    if v is None:
        return "-"
    return _fmt_num(v * 100, casas) + "%"


@app.template_filter("mesnome")
def mesnome(v):
    if not v or "-" not in v:
        return v or ""
    meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    ano, mes = v.split("-")
    try:
        return f"{meses[int(mes) - 1]}/{ano}"
    except (ValueError, IndexError):
        return v


def _somar(linhas, campos):
    """Soma os campos numericos indicados atraves de uma lista de linhas (sqlite3.Row)."""
    return {campo: sum((r[campo] or 0) for r in linhas) for campo in campos}


def _totais_usina(por_usina):
    t = _somar(por_usina, [
        "total_ucs", "consumo_total", "compensado_total", "valor_a_receber_total",
        "valor_pago", "valor_atrasado", "valor_aberto", "qtd_atrasados", "qtd_emissao_pendente",
    ])
    t["aproveitamento"] = (t["compensado_total"] / t["consumo_total"]) if t["consumo_total"] else None
    base = t["valor_atrasado"] + t["valor_pago"]
    t["pct_inadimplencia"] = (t["valor_atrasado"] / base) if base else None
    return t


def _totais_concessionaria(por_concessionaria):
    t = _somar(por_concessionaria, ["total_ucs", "valor_a_receber_total", "valor_pago", "valor_atrasado"])
    base = t["valor_atrasado"] + t["valor_pago"]
    t["pct_inadimplencia"] = (t["valor_atrasado"] / base) if base else None
    return t


def periodo_atual(padrao=None):
    periodos = db.get_periodos()
    p = request.args.get("periodo") or padrao
    if p and p in periodos:
        return p, periodos
    return (periodos[0] if periodos else None), periodos


@app.route("/")
def index():
    periodo, periodos = periodo_atual()
    if not periodo:
        return redirect(url_for("upload"))

    resumo = db.resumo_geral(periodo)
    por_usina = db.resumo_por_usina(periodo)
    por_concessionaria = db.resumo_por_concessionaria(periodo)
    kpis = db.portfolio_kpis_mais_recente()

    geracao_prevista = [dict(r) for r in db.portfolio_serie_mensal("Geracao Prevista")]
    geracao_real = [dict(r) for r in db.portfolio_serie_mensal("Geracao Realizada")]

    return render_template(
        "dashboard.html",
        periodo=periodo, periodos=periodos,
        resumo=resumo, por_usina=por_usina, por_concessionaria=por_concessionaria,
        totais_usina=_totais_usina(por_usina), totais_concessionaria=_totais_concessionaria(por_concessionaria),
        kpis=kpis, geracao_prevista=geracao_prevista, geracao_real=geracao_real,
    )


@app.route("/usina/<path:nome>")
def usina_detalhe(nome):
    periodo, periodos = periodo_atual()
    evolucao = [dict(r) for r in db.evolucao_usina(nome)]
    registros = db.registros_usina(nome, periodo) if periodo else []
    return render_template(
        "usina.html",
        nome=nome, periodo=periodo, periodos=periodos,
        evolucao=evolucao, registros=registros,
    )


@app.route("/clientes-problematicos")
def clientes_problematicos():
    periodo, periodos = periodo_atual()
    try:
        limite_pct = float(request.args.get("limite", 50)) / 100
    except ValueError:
        limite_pct = 0.5
    try:
        min_atrasos = int(request.args.get("min_atrasos", 2))
    except ValueError:
        min_atrasos = 2

    atraso_recorrente = db.clientes_atraso_recorrente(min_ocorrencias=min_atrasos)
    baixa_compensacao = db.clientes_baixa_compensacao(periodo, limite_pct=limite_pct) if periodo else []

    analise_periodos = db.get_analise_periodos()
    periodo_analise = periodo if periodo in analise_periodos else (analise_periodos[0] if analise_periodos else None)
    inadimplencia_beneficiaria = (
        db.clientes_inadimplencia_beneficiaria(periodo_analise) if periodo_analise else []
    )

    return render_template(
        "problematicos.html",
        periodo=periodo, periodos=periodos, limite_pct=limite_pct, min_atrasos=min_atrasos,
        atraso_recorrente=atraso_recorrente, baixa_compensacao=baixa_compensacao,
        inadimplencia_beneficiaria=inadimplencia_beneficiaria, periodo_analise=periodo_analise,
    )


@app.route("/upload", methods=["GET", "POST"])
def upload():
    if request.method == "POST":
        arq = request.files.get("arquivo")
        if not arq or not arq.filename.lower().endswith(".xlsx"):
            flash("Selecione um arquivo .xlsx.", "danger")
            return render_template("upload.html", importacoes=db.get_importacoes())
        try:
            with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                arq.save(tmp.name)
                caminho_tmp = tmp.name
            try:
                resultado = importador.parse_relatorio_completo(caminho_tmp)
            finally:
                os.unlink(caminho_tmp)

            db.salvar_importacao(resultado, arq.filename)
            flash(
                f"Importado: {len(resultado['faturas'])} faturas, "
                f"{len(resultado['rateios'])} rateios, "
                f"{len(resultado['analise_beneficiaria'])} análises "
                f"(período {resultado['periodo_dominante']}).",
                "success",
            )
            return redirect(url_for("index", periodo=resultado["periodo_dominante"]))
        except Exception as e:
            flash(f"Erro ao importar: {e}", "danger")

    return render_template("upload.html", importacoes=db.get_importacoes())


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
