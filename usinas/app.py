import os
import tempfile
import threading
import time

from flask import Flask, render_template, request, redirect, url_for, flash, session, send_file, abort, jsonify

import db
import ia
import importador
import atualizar_lexdash

app = Flask(__name__)
app.secret_key = "usinas-dashboard-2026"

# CORS: permite que páginas externas (Railway) chamem localhost:5002
@app.after_request
def _add_cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Admin-Token"
    return response

@app.route("/gravar-fatura",        methods=["OPTIONS"])
@app.route("/gravar-lexdash",       methods=["OPTIONS"])
@app.route("/gravar-lexdash/status",methods=["OPTIONS"])
@app.route("/extrair-pendente",     methods=["OPTIONS"])
@app.route("/pdf",                  methods=["OPTIONS"])
def _cors_preflight():
    return "", 204

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
        "total_ucs", "consumo_total", "compensado_total", "geracao_prevista_kwh", "geracao_realizada_kwh",
        "valor_a_receber_total", "valor_pago", "valor_atrasado", "valor_aberto", "qtd_atrasados", "qtd_emissao_pendente",
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
    p = request.values.get("periodo") or padrao
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

    nomes_todas = [r["usina"] for r in por_usina]
    nomes_operacao = [r["usina"] for r in por_usina if r["total_ucs"]]
    nomes_sem_clientes = [r["usina"] for r in por_usina if not r["total_ucs"]]
    series_geracao_por_status = {
        "todas": db.serie_mensal_geracao_por_usinas(nomes_todas),
        "operacao": db.serie_mensal_geracao_por_usinas(nomes_operacao),
        "sem-clientes": db.serie_mensal_geracao_por_usinas(nomes_sem_clientes),
    }

    return render_template(
        "dashboard.html",
        periodo=periodo, periodos=periodos,
        resumo=resumo, por_usina=por_usina, por_concessionaria=por_concessionaria,
        series_geracao_por_status=series_geracao_por_status,
        totais_usina=_totais_usina(por_usina), totais_concessionaria=_totais_concessionaria(por_concessionaria),
        kpis=kpis,
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


@app.route("/chat", methods=["GET", "POST"])
def chat():
    periodo, periodos = periodo_atual()
    historico = session.get("chat_historico", [])
    if request.method == "POST":
        pergunta = request.form.get("pergunta", "").strip()
        if pergunta:
            resposta = ia.perguntar(pergunta, historico=historico, periodo=periodo)
            historico.append({"role": "user", "content": pergunta})
            historico.append({"role": "assistant", "content": resposta})
            session["chat_historico"] = historico[-20:]
    return render_template(
        "chat.html", periodo=periodo, periodos=periodos,
        historico=session.get("chat_historico", []),
    )


@app.route("/chat/limpar", methods=["POST"])
def limpar_chat():
    session.pop("chat_historico", None)
    return redirect(url_for("chat"))


@app.route("/atualizar", methods=["POST"])
def atualizar():
    try:
        caminho = atualizar_lexdash.baixar_relatorio()
        resultado = importador.parse_relatorio_completo(caminho)
        db.salvar_importacao(resultado, os.path.basename(caminho))
        flash(
            f"Dados atualizados a partir do LexDash: {len(resultado['faturas'])} faturas, "
            f"{len(resultado['rateios'])} rateios (período {resultado['periodo_dominante']}).",
            "success",
        )
    except RuntimeError as e:
        flash(str(e), "danger")
    except Exception as e:
        flash(f"Erro ao atualizar: {e}", "danger")
    return redirect(url_for("index"))


@app.route("/insights", methods=["GET", "POST"])
def insights():
    periodo, periodos = periodo_atual()
    relatorio = session.get("insights_relatorio")
    relatorio_periodo = session.get("insights_periodo")
    if request.method == "POST":
        relatorio = ia.gerar_insights(periodo)
        session["insights_relatorio"] = relatorio
        session["insights_periodo"] = periodo
        relatorio_periodo = periodo
    return render_template(
        "insights.html", periodo=periodo, periodos=periodos,
        relatorio=relatorio, relatorio_periodo=relatorio_periodo,
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


@app.route("/pdf")
def servir_pdf():
    """Serve um PDF local pelo caminho passado em ?path=... (somente dentro de PASTA_CALCULOS)."""
    PASTA_CALCULOS = r"D:\Alexandria\OneDrive - Alexandria Industria de Geradores SA\Calculos Tarifas"
    caminho = request.args.get("path", "")
    caminho_abs = os.path.abspath(caminho)
    # Segurança: só serve arquivos dentro da pasta de cálculos e com extensão .pdf
    if not caminho_abs.startswith(os.path.abspath(PASTA_CALCULOS)):
        abort(403)
    if not caminho_abs.lower().endswith(".pdf"):
        abort(403)
    if not os.path.isfile(caminho_abs):
        abort(404)
    return send_file(caminho_abs, mimetype="application/pdf")


@app.route("/extrair-pendente")
def extrair_pendente():
    """
    Rota acionada pelo botão Editar do /revisar (Railway).
    1. Busca dados do pendente no Railway (pdf_path).
    2. Lê o PDF local e chama extrator.extrair_fatura().
    3. Envia o extraido_json atualizado de volta ao Railway.
    4. Redireciona para /revisar/<id>/editar já com os dados frescos.
    """
    import sys
    import json
    import requests

    pendente_id = request.args.get("id", "").strip()
    if not pendente_id:
        return "Parâmetro 'id' obrigatório", 400

    SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
    TARIFAS_DIR  = os.path.join(SCRIPT_DIR, "..", "tarifas")
    RAILWAY_URL  = "https://alexandria-tarifas-production.up.railway.app"

    # Lê ADMIN_TOKEN do .env de tarifas
    ADMIN_TOKEN = ""
    env_path = os.path.join(TARIFAS_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as _f:
            for _linha in _f:
                _linha = _linha.strip()
                if _linha.startswith("ADMIN_TOKEN="):
                    ADMIN_TOKEN = _linha.split("=", 1)[1].strip()
                if _linha.startswith("ANTHROPIC_API_KEY="):
                    os.environ.setdefault("ANTHROPIC_API_KEY", _linha.split("=", 1)[1].strip())

    headers = {"X-Admin-Token": ADMIN_TOKEN}

    # 1. Busca pendente no Railway
    try:
        resp = requests.get(f"{RAILWAY_URL}/api/pendentes/{pendente_id}", headers=headers, timeout=15)
    except Exception as e:
        return f"Erro ao buscar pendente: {e}", 502
    if resp.status_code == 404:
        return redirect(f"{RAILWAY_URL}/revisar/{pendente_id}/editar")
    if not resp.ok:
        return f"Erro Railway: {resp.status_code} {resp.text}", 502

    p = resp.json()
    pdf_path = p.get("pdf_path", "")

    if not pdf_path or not os.path.isfile(pdf_path):
        # Sem PDF local: abre o formulário com o que já tem
        return redirect(f"{RAILWAY_URL}/revisar/{pendente_id}/editar")

    # 2. Importa extrator de tarifas/ e roda extração
    if TARIFAS_DIR not in sys.path:
        sys.path.insert(0, TARIFAS_DIR)
    try:
        import extrator  # noqa: E402 (importação tardia intencional)
    except ImportError as e:
        return f"extrator.py não encontrado: {e}", 500

    with open(pdf_path, "rb") as _f:
        pdf_bytes = _f.read()

    try:
        extraido = extrator.extrair_fatura(pdf_bytes)
    except Exception as e:
        # Extração falhou — abre o form com o que havia
        app.logger.warning(f"Extração falhou para pendente {pendente_id}: {e}")
        return redirect(f"{RAILWAY_URL}/revisar/{pendente_id}/editar")

    # 3. Atualiza extraido_json no Railway
    try:
        requests.post(
            f"{RAILWAY_URL}/api/pendentes/{pendente_id}/set-extraido",
            json={"extraido_json": extraido},
            headers=headers,
            timeout=15,
        )
    except Exception as e:
        app.logger.warning(f"Falha ao salvar extraido no Railway: {e}")

    # 4. Redireciona para edição (Railway usará o extraido_json recém-atualizado)
    return redirect(f"{RAILWAY_URL}/revisar/{pendente_id}/editar")


# ── Gravar no LexDash ─────────────────────────────────────────────────────────

_GRAVAR_STATUS = {"estado": "idle", "log": "", "ts": 0}  # estado global do job


def _executar_preencher():
    """Roda preencher_lexdash.preencher() em background e atualiza _GRAVAR_STATUS."""
    import sys, requests as _req

    SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
    TARIFAS_DIR = os.path.join(SCRIPT_DIR, "..", "tarifas")

    # Carrega env (ADMIN_TOKEN + ANTHROPIC_API_KEY)
    env_path = os.path.join(TARIFAS_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as _f:
            for _linha in _f:
                _linha = _linha.strip()
                if _linha and not _linha.startswith("#") and "=" in _linha:
                    _k, _v = _linha.split("=", 1)
                    os.environ.setdefault(_k.strip(), _v.strip())

    TARIFAS_API_URL = "https://alexandria-tarifas-production.up.railway.app"
    ADMIN_TOKEN     = os.environ.get("ADMIN_TOKEN", "")
    headers         = {"X-Admin-Token": ADMIN_TOKEN} if ADMIN_TOKEN else {}

    # Busca aprovados
    try:
        resp = _req.get(f"{TARIFAS_API_URL}/api/pendentes/aprovados", headers=headers, timeout=15)
        resp.raise_for_status()
        itens = resp.json()
    except Exception as e:
        _GRAVAR_STATUS.update({"estado": "erro", "log": f"Erro ao buscar aprovados: {e}", "ts": time.time()})
        return

    if not itens:
        _GRAVAR_STATUS.update({"estado": "ok", "log": "Nenhum item aprovado aguardando preenchimento.", "ts": time.time()})
        return

    _GRAVAR_STATUS["log"] = f"{len(itens)} item(ns) aprovado(s). Abrindo LexDash…"

    # Importa preencher_lexdash do mesmo diretório
    if SCRIPT_DIR not in sys.path:
        sys.path.insert(0, SCRIPT_DIR)

    # Captura prints do preencher para o log
    import io, contextlib
    buf = io.StringIO()
    try:
        import preencher_lexdash
        with contextlib.redirect_stdout(buf):
            preencher_lexdash.preencher(itens, dry_run=False, debug=False)
        _GRAVAR_STATUS.update({"estado": "ok", "log": buf.getvalue(), "ts": time.time()})
    except Exception as e:
        _GRAVAR_STATUS.update({"estado": "erro", "log": buf.getvalue() + f"\n\nERRO: {e}", "ts": time.time()})


def _fatura_para_item_lex(f: dict) -> dict:
    """Converte um dict de fatura do Railway para o formato que preencher_lexdash espera."""
    import json as _json

    # mes_referencia vem como "2026-08-01" ou "2026-08" → precisa virar "08-2026"
    mes_ref = (f.get("mes_referencia") or "")[:7]  # "2026-08"
    if len(mes_ref) == 7 and "-" in mes_ref:
        ano, mes = mes_ref.split("-")
        mes_lex = f"{mes}-{ano}"
    else:
        mes_lex = mes_ref

    # usina_id pode ser "5", "5,6", "[5,6]" ou inteiro
    usina_raw = str(f.get("usina_id") or "").strip().strip("[]")
    usinas = [u.strip() for u in usina_raw.replace(";", ",").split(",") if u.strip()]

    return {
        "id":          None,          # sem ID de pendente → não marca preenchido na API
        "distribuidora": f.get("distribuidora", ""),
        "usinas":      _json.dumps(usinas),
        "tarifa_geracao": f.get("tarifa_geracao"),
        "mes_lex":     mes_lex,
        "modalidade":  f.get("modalidade", ""),
        "tipo_gd":     f.get("tipo_gd", "GD1"),
    }


@app.route("/gravar-fatura", methods=["POST"])
def gravar_fatura_endpoint():
    """Grava UMA fatura específica do dashboard no LexDash (via fatura_id no JSON body)."""
    import requests as _req

    data        = request.get_json(force=True) or {}
    fatura_id   = data.get("fatura_id")
    if not fatura_id:
        return jsonify({"ok": False, "msg": "fatura_id obrigatório"}), 400

    if _GRAVAR_STATUS.get("estado") == "rodando":
        return jsonify({"ok": False, "msg": "Já está rodando outro preenchimento."}), 409

    SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
    TARIFAS_DIR  = os.path.join(SCRIPT_DIR, "..", "tarifas")
    RAILWAY_URL  = "https://alexandria-tarifas-production.up.railway.app"

    # Carrega env
    env_path = os.path.join(TARIFAS_DIR, ".env")
    ADMIN_TOKEN_VAL = ""
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as _f:
            for _linha in _f:
                _linha = _linha.strip()
                if _linha.startswith("ADMIN_TOKEN="):
                    ADMIN_TOKEN_VAL = _linha.split("=", 1)[1].strip()

    headers = {"X-Admin-Token": ADMIN_TOKEN_VAL} if ADMIN_TOKEN_VAL else {}

    # Busca fatura
    try:
        resp = _req.get(f"{RAILWAY_URL}/api/faturas/{fatura_id}", headers=headers, timeout=10)
        resp.raise_for_status()
        fatura = resp.json()
    except Exception as e:
        return jsonify({"ok": False, "msg": f"Erro ao buscar fatura: {e}"}), 502

    item = _fatura_para_item_lex(fatura)
    if not item["tarifa_geracao"]:
        return jsonify({"ok": False, "msg": "Fatura sem tarifa_geracao calculada."}), 400
    if not item["usinas"] or item["usinas"] == "[]":
        return jsonify({"ok": False, "msg": "Fatura sem usina_id definido."}), 400

    _GRAVAR_STATUS.update({"estado": "rodando", "log": f"Gravando {item['distribuidora']} {item['mes_lex']}…", "ts": time.time()})

    def _run():
        import sys, io, contextlib
        if SCRIPT_DIR not in sys.path:
            sys.path.insert(0, SCRIPT_DIR)
        buf = io.StringIO()
        try:
            import preencher_lexdash
            with contextlib.redirect_stdout(buf):
                preencher_lexdash.preencher([item], dry_run=False, debug=False)
            _GRAVAR_STATUS.update({"estado": "ok", "log": buf.getvalue(), "ts": time.time()})
        except Exception as e:
            _GRAVAR_STATUS.update({"estado": "erro", "log": buf.getvalue() + f"\n\nERRO: {e}", "ts": time.time()})

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"ok": True})


@app.route("/gravar-lexdash", methods=["POST"])
def gravar_lexdash():
    """Dispara o preenchimento do LexDash em background e retorna imediatamente."""
    if _GRAVAR_STATUS.get("estado") == "rodando":
        return jsonify({"ok": False, "msg": "Já está rodando."}), 409
    _GRAVAR_STATUS.update({"estado": "rodando", "log": "Iniciando…", "ts": time.time()})
    t = threading.Thread(target=_executar_preencher, daemon=True)
    t.start()
    return jsonify({"ok": True})


@app.route("/gravar-lexdash/status")
def gravar_lexdash_status():
    return jsonify(_GRAVAR_STATUS)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug, threaded=True)
