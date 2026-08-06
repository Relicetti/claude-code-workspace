import os
from datetime import datetime

from flask import Flask, flash, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

import db


def _agora():
    return datetime.now().isoformat(timespec="seconds")


def _parse_numero(valor):
    """Converte texto de número em float, ou None. Aceita formato BR
    (1.234,5) e US (1234.5)."""
    valor = (valor or "").strip()
    if not valor:
        return None
    if "," in valor:
        valor = valor.replace(".", "").replace(",", ".")
    try:
        return float(valor)
    except ValueError:
        return None

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "chave-de-desenvolvimento-troque-em-producao")
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # upload de PDF (fatura/contrato)
db.iniciar_banco()
db.bootstrap_admin(generate_password_hash)

ROTAS_PUBLICAS = {"login", "static"}


@app.before_request
def exigir_login():
    if request.endpoint in ROTAS_PUBLICAS or request.endpoint is None:
        return None
    if "usuario_id" not in session:
        return redirect(url_for("login", proximo=request.path))
    return None


@app.context_processor
def injetar_usuario():
    return {
        "usuario_logado": session.get("usuario_nome"),
        "usuario_admin": session.get("usuario_admin", False),
    }


# --- login / conta -----------------------------------------------------

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html", erro=None, proximo=request.args.get("proximo", ""))

    username = request.form.get("username", "").strip()
    senha = request.form.get("senha", "")
    with db.conectar() as conn:
        usuario = db.buscar_usuario_por_username(conn, username)

    if usuario is None or not check_password_hash(usuario["senha_hash"], senha):
        return render_template("login.html", erro="Usuário ou senha inválidos.", proximo=request.form.get("proximo", ""))

    session["usuario_id"] = usuario["id"]
    session["usuario_nome"] = usuario["nome"]
    session["usuario_admin"] = bool(usuario["is_admin"])
    proximo = request.form.get("proximo") or url_for("dashboard")
    return redirect(proximo)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# --- painel --------------------------------------------------------------

@app.route("/")
def dashboard():
    with db.conectar() as conn:
        clientes = [dict(c) for c in db.listar_clientes(conn)]
        atividades = [dict(a) for a in db.listar_atividades(conn, limite=20)]
    return render_template("dashboard.html", clientes=clientes, atividades=atividades)


# --- usineiros -------------------------------------------------------------

@app.route("/usineiros")
def usineiros_lista():
    with db.conectar() as conn:
        usineiros = [dict(u) for u in db.listar_usineiros(conn)]
    return render_template("usineiros_lista.html", usineiros=usineiros)


@app.route("/usineiros/novo", methods=["GET", "POST"])
def novo_usineiro():
    if request.method == "GET":
        return render_template("usineiro_form.html")

    nome = request.form.get("nome", "").strip()
    if not nome:
        flash("Informe o nome do usineiro.", "warning")
        return redirect(url_for("novo_usineiro"))

    with db.conectar() as conn:
        db.criar_usineiro(
            conn, nome,
            request.form.get("cpf_cnpj", "").strip() or None,
            request.form.get("email", "").strip() or None,
            request.form.get("telefone", "").strip() or None,
            _agora(),
        )
        db.registrar_atividade(conn, session["usuario_nome"], "Cadastrou o usineiro", nome, _agora())
    flash(f"Usineiro {nome} cadastrado.", "success")
    return redirect(url_for("usineiros_lista"))


# --- usinas GD ---------------------------------------------------------

@app.route("/usinas-gd")
def usinas_gd_lista():
    with db.conectar() as conn:
        usinas = [dict(u) for u in db.listar_usinas_gd(conn)]
    return render_template("usinas_gd_lista.html", usinas=usinas)


@app.route("/usinas-gd/nova", methods=["GET", "POST"])
def nova_usina_gd():
    with db.conectar() as conn:
        usineiros = [dict(u) for u in db.listar_usineiros(conn)]

    if request.method == "GET":
        return render_template("usina_gd_form.html", usineiros=usineiros)

    nome_usina = request.form.get("nome_usina", "").strip()
    if not nome_usina:
        flash("Informe o nome da usina.", "warning")
        return redirect(url_for("nova_usina_gd"))

    with db.conectar() as conn:
        db.criar_usina_gd(
            conn,
            request.form.get("usineiro_id") or None,
            nome_usina,
            _parse_numero(request.form.get("potencia_kwp")),
            request.form.get("concessionaria", "").strip() or None,
            _agora(),
        )
        db.registrar_atividade(conn, session["usuario_nome"], "Cadastrou a usina GD", nome_usina, _agora())
    flash(f"Usina {nome_usina} cadastrada.", "success")
    return redirect(url_for("usinas_gd_lista"))


# --- clientes ----------------------------------------------------------

@app.route("/clientes/novo", methods=["GET", "POST"])
def novo_cliente():
    with db.conectar() as conn:
        usinas = [dict(u) for u in db.listar_usinas_gd(conn)]

    if request.method == "GET":
        return render_template("cliente_form.html", cliente=None, usinas=usinas)

    nome = request.form.get("nome", "").strip()
    if not nome:
        flash("Informe o nome do cliente.", "warning")
        return redirect(url_for("novo_cliente"))

    with db.conectar() as conn:
        cliente_id = db.criar_cliente(
            conn, nome,
            request.form.get("cpf_cnpj", "").strip() or None,
            request.form.get("email", "").strip() or None,
            request.form.get("telefone", "").strip() or None,
            request.form.get("endereco", "").strip() or None,
            request.form.get("uc", "").strip() or None,
            request.form.get("concessionaria", "").strip() or None,
            request.form.get("usina_gd_id") or None,
            _agora(),
        )
        db.registrar_atividade(conn, session["usuario_nome"], "Cadastrou o cliente", nome, _agora())
    flash(f"Cliente {nome} cadastrado.", "success")
    return redirect(url_for("ver_cliente", cliente_id=cliente_id))


@app.route("/cliente/<int:cliente_id>")
def ver_cliente(cliente_id):
    with db.conectar() as conn:
        cliente = db.buscar_cliente(conn, cliente_id)
        if cliente is None:
            return "Cliente não encontrado", 404
        cliente = dict(cliente)
        usina = db.buscar_usina_gd(conn, cliente["usina_gd_id"]) if cliente["usina_gd_id"] else None
        contratos = [dict(c) for c in db.listar_contratos_cliente(conn, cliente_id)]
        rateio_atual = db.rateio_vigente(conn, cliente_id)
        historico_rateio = [dict(r) for r in db.historico_rateio_cliente(conn, cliente_id)]
        faturas = [dict(f) for f in db.listar_faturas_cliente(conn, cliente_id)]
        atividades = [dict(a) for a in db.atividades_cliente(conn, cliente["nome"])]

    return render_template(
        "cliente_detalhe.html",
        cliente=cliente,
        usina=dict(usina) if usina else None,
        contratos=contratos,
        rateio_atual=dict(rateio_atual) if rateio_atual else None,
        historico_rateio=historico_rateio,
        faturas=faturas,
        atividades=atividades,
    )


@app.route("/cliente/<int:cliente_id>/editar", methods=["GET", "POST"])
def editar_cliente(cliente_id):
    with db.conectar() as conn:
        cliente = db.buscar_cliente(conn, cliente_id)
        if cliente is None:
            return "Cliente não encontrado", 404
        usinas = [dict(u) for u in db.listar_usinas_gd(conn)]

        if request.method == "GET":
            return render_template("cliente_form.html", cliente=dict(cliente), usinas=usinas)

        db.atualizar_cliente(conn, cliente_id, {
            "nome": request.form.get("nome", "").strip(),
            "cpf_cnpj": request.form.get("cpf_cnpj", "").strip(),
            "email": request.form.get("email", "").strip(),
            "telefone": request.form.get("telefone", "").strip(),
            "endereco": request.form.get("endereco", "").strip(),
            "uc": request.form.get("uc", "").strip(),
            "concessionaria": request.form.get("concessionaria", "").strip(),
            "usina_gd_id": request.form.get("usina_gd_id") or None,
        })
        db.registrar_atividade(
            conn, session["usuario_nome"], "Editou os dados do cliente",
            request.form.get("nome", "").strip(), _agora(),
        )
    return redirect(url_for("ver_cliente", cliente_id=cliente_id))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5011))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
