import hashlib
import json
import os
from datetime import datetime

import requests
from flask import Flask, flash, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

import db
from assinatura import obter_assinatura
from tarifas import processar as tarifas_processar

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads", "contratos")
UPLOADS_FATURAS_DIR = os.path.join(os.path.dirname(__file__), "uploads", "faturas")
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(UPLOADS_FATURAS_DIR, exist_ok=True)


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

ROTAS_PUBLICAS = {"login", "static", "webhook_autentique"}


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


# --- contratos / assinatura eletrônica --------------------------------

@app.route("/cliente/<int:cliente_id>/contrato/novo", methods=["GET", "POST"])
def novo_contrato(cliente_id):
    with db.conectar() as conn:
        cliente = db.buscar_cliente(conn, cliente_id)
    if cliente is None:
        return "Cliente não encontrado", 404

    if request.method == "GET":
        return render_template("contrato_form.html", cliente=dict(cliente), tipos=db.TIPOS_CONTRATO)

    tipo = request.form.get("tipo", "termo_adesao")
    percentual = _parse_numero(request.form.get("percentual_desconto"))
    percentual_fracao = (percentual / 100) if percentual is not None else None
    data_inicio = request.form.get("data_inicio_vigencia", "").strip() or None
    arquivo = request.files.get("arquivo")

    with db.conectar() as conn:
        contrato_id = db.criar_contrato(
            conn, cliente_id, tipo, percentual_fracao, data_inicio, _agora(),
            cobra_band=request.form.get("cobra_band") == "on",
            impostos_com_desconto=request.form.get("impostos_com_desconto") == "on",
        )
        db.registrar_atividade(
            conn, session["usuario_nome"], f"Criou contrato ({tipo})", cliente["nome"], _agora(),
        )

    if arquivo and arquivo.filename:
        destino = os.path.join(UPLOADS_DIR, f"{contrato_id}.pdf")
        arquivo.save(destino)
        flash("Contrato criado e documento anexado. Agora envie para assinatura.", "success")
    else:
        flash("Contrato criado como rascunho. Anexe o PDF antes de enviar para assinatura.", "warning")

    return redirect(url_for("ver_cliente", cliente_id=cliente_id))


@app.route("/contrato/<int:contrato_id>/enviar-assinatura", methods=["POST"])
def enviar_assinatura(contrato_id):
    with db.conectar() as conn:
        contrato = db.buscar_contrato(conn, contrato_id)
        if contrato is None:
            return "Contrato não encontrado", 404
        cliente = db.buscar_cliente(conn, contrato["cliente_id"])

    assinador = obter_assinatura()
    if not assinador.configurado():
        flash(
            "Assinatura eletrônica não configurada (falta ASSINATURA_AUTENTIQUE_API_TOKEN). "
            "Crie a conta na Autentique e defina a variável de ambiente para habilitar o envio.",
            "warning",
        )
        return redirect(url_for("ver_cliente", cliente_id=contrato["cliente_id"]))

    arquivo_path = os.path.join(UPLOADS_DIR, f"{contrato_id}.pdf")
    if not os.path.exists(arquivo_path):
        flash("Anexe o PDF do contrato antes de enviar para assinatura.", "danger")
        return redirect(url_for("ver_cliente", cliente_id=contrato["cliente_id"]))

    if not cliente["email"]:
        flash("O cliente precisa ter um e-mail cadastrado para receber o convite de assinatura.", "danger")
        return redirect(url_for("ver_cliente", cliente_id=contrato["cliente_id"]))

    try:
        documento_externo_id = assinador.enviar_documento(
            dict(contrato), arquivo_path, cliente["nome"], cliente["email"],
        )
    except Exception as e:
        flash(f"Falha ao enviar para assinatura: {e}", "danger")
        return redirect(url_for("ver_cliente", cliente_id=contrato["cliente_id"]))

    with db.conectar() as conn:
        db.registrar_envio_assinatura(conn, contrato_id, "autentique", documento_externo_id, _agora())
        db.mudar_status_contrato(conn, contrato_id, "aguardando_assinatura")
        db.registrar_atividade(
            conn, session["usuario_nome"], "Enviou o contrato para assinatura (Autentique)",
            cliente["nome"], _agora(),
        )
    flash(f"Contrato enviado para assinatura de {cliente['nome']}.", "success")
    return redirect(url_for("ver_cliente", cliente_id=contrato["cliente_id"]))


@app.route("/cliente/<int:cliente_id>/contrato/upload-assinado", methods=["POST"])
def upload_documento_assinado(cliente_id):
    """Caminho alternativo: se o contrato já foi assinado fora do fluxo
    Autentique (ex: papel escaneado), permite registrar manualmente."""
    contrato_id = request.form.get("contrato_id")
    arquivo = request.files.get("arquivo")
    if not contrato_id or not arquivo or not arquivo.filename:
        flash("Selecione o contrato e o arquivo PDF assinado.", "warning")
        return redirect(url_for("ver_cliente", cliente_id=cliente_id))

    nome_seguro = secure_filename(f"assinado_{contrato_id}.pdf")
    destino = os.path.join(UPLOADS_DIR, nome_seguro)
    arquivo.save(destino)
    conteudo = open(destino, "rb").read()
    hash_sha256 = hashlib.sha256(conteudo).hexdigest()

    with db.conectar() as conn:
        db.registrar_upload_manual_assinado(conn, contrato_id, destino, hash_sha256, _agora(), _agora())
        db.mudar_status_contrato(conn, contrato_id, "assinado")
        db.mudar_status_cliente(conn, cliente_id, "ativo")
        cliente = db.buscar_cliente(conn, cliente_id)
        db.registrar_atividade(
            conn, session["usuario_nome"], "Registrou documento assinado (upload manual)",
            cliente["nome"] if cliente else None, _agora(),
        )
    flash("Documento assinado registrado.", "success")
    return redirect(url_for("ver_cliente", cliente_id=cliente_id))


@app.route("/webhook/autentique", methods=["POST"])
def webhook_autentique():
    assinador = obter_assinatura()
    token_recebido = request.args.get("token")
    if not assinador.validar_webhook(token_recebido):
        return "", 403

    payload = request.get_json(silent=True) or {}
    evento_chave = hashlib.sha256(str(sorted(payload.items())).encode("utf-8")).hexdigest()

    with db.conectar() as conn:
        novo = db.registrar_webhook(conn, "autentique", evento_chave, str(payload), _agora())
        if not novo:
            return "", 200  # já processado antes (reenvio do provedor) -- idempotente

        resultado = assinador.processar_webhook(payload)
        if resultado and resultado["assinado"]:
            arquivo_path = None
            hash_sha256 = None
            if resultado.get("arquivo_url"):
                try:
                    resp = requests.get(resultado["arquivo_url"], timeout=30)
                    resp.raise_for_status()
                    nome_seguro = secure_filename(f"assinado_{resultado['documento_externo_id']}.pdf")
                    arquivo_path = os.path.join(UPLOADS_DIR, nome_seguro)
                    with open(arquivo_path, "wb") as f:
                        f.write(resp.content)
                    hash_sha256 = hashlib.sha256(resp.content).hexdigest()
                except Exception:
                    pass  # documento fica marcado assinado mesmo sem baixar o arquivo final

            contrato_id = db.confirmar_assinatura(
                conn, resultado["documento_externo_id"], arquivo_path, hash_sha256, _agora(),
            )
            if contrato_id:
                db.mudar_status_contrato(conn, contrato_id, "assinado")
                contrato = db.buscar_contrato(conn, contrato_id)
                cliente = db.buscar_cliente(conn, contrato["cliente_id"]) if contrato else None
                if cliente:
                    db.mudar_status_cliente(conn, cliente["id"], "ativo")
                db.registrar_atividade(
                    conn, "Autentique (webhook)", "Contrato assinado eletronicamente",
                    cliente["nome"] if cliente else None, _agora(),
                )
        db.marcar_webhook_processado(conn, "autentique", evento_chave)

    return "", 200


# --- rateio (histórico versionado) --------------------------------------

@app.route("/cliente/<int:cliente_id>/rateio/novo", methods=["GET", "POST"])
def novo_rateio(cliente_id):
    with db.conectar() as conn:
        cliente = db.buscar_cliente(conn, cliente_id)
        if cliente is None:
            return "Cliente não encontrado", 404
        usinas = [dict(u) for u in db.listar_usinas_gd(conn)]
        rateio_atual = db.rateio_vigente(conn, cliente_id)

    if request.method == "GET":
        return render_template(
            "rateio_form.html", cliente=dict(cliente), usinas=usinas,
            rateio_atual=dict(rateio_atual) if rateio_atual else None,
        )

    usina_gd_id = request.form.get("usina_gd_id") or cliente["usina_gd_id"]
    percentual = _parse_numero(request.form.get("percentual_rateio"))
    mes_inicio = request.form.get("mes_inicio", "").strip()

    if not usina_gd_id or percentual is None or not mes_inicio:
        flash("Informe a usina GD, o percentual de rateio e o mês de início.", "warning")
        return redirect(url_for("novo_rateio", cliente_id=cliente_id))

    with db.conectar() as conn:
        db.criar_rateio(conn, cliente_id, usina_gd_id, percentual / 100, mes_inicio, _agora())
        db.registrar_atividade(
            conn, session["usuario_nome"],
            f"Definiu rateio de {percentual}% a partir de {mes_inicio}",
            cliente["nome"], _agora(),
        )
    flash(f"Rateio de {percentual}% cadastrado para {cliente['nome']} a partir de {mes_inicio}.", "success")
    return redirect(url_for("ver_cliente", cliente_id=cliente_id))


# --- faturas (extração + cálculo de tarifa) -----------------------------

@app.route("/cliente/<int:cliente_id>/fatura/nova", methods=["GET", "POST"])
def nova_fatura(cliente_id):
    with db.conectar() as conn:
        cliente = db.buscar_cliente(conn, cliente_id)
        if cliente is None:
            return "Cliente não encontrado", 404
        contratos = [dict(c) for c in db.listar_contratos_cliente(conn, cliente_id)]

    if request.method == "GET":
        return render_template(
            "fatura_form.html", cliente=dict(cliente), contratos=contratos,
            claude_configurado=bool(os.environ.get("ANTHROPIC_API_KEY")),
        )

    if not os.environ.get("ANTHROPIC_API_KEY"):
        flash(
            "Extração automática não configurada (falta ANTHROPIC_API_KEY). "
            "A fatura não foi processada.", "warning",
        )
        return redirect(url_for("ver_cliente", cliente_id=cliente_id))

    contrato_id = request.form.get("contrato_id")
    arquivo = request.files.get("arquivo")
    if not contrato_id or not arquivo or not arquivo.filename:
        flash("Selecione o contrato e o PDF da fatura da distribuidora.", "warning")
        return redirect(url_for("nova_fatura", cliente_id=cliente_id))

    with db.conectar() as conn:
        contrato = db.buscar_contrato(conn, contrato_id)
    if contrato is None:
        flash("Contrato não encontrado.", "danger")
        return redirect(url_for("nova_fatura", cliente_id=cliente_id))

    pdf_bytes = arquivo.read()
    try:
        dados, saida = tarifas_processar.processar_fatura(pdf_bytes, dict(contrato))
    except Exception as e:
        flash(f"Falha ao extrair/calcular a fatura: {e}. Confira manualmente.", "danger")
        return redirect(url_for("ver_cliente", cliente_id=cliente_id))

    mes_referencia = dados.get("mes_referencia")
    if not mes_referencia:
        flash("Não foi possível identificar o mês de referência na fatura. Confira manualmente.", "danger")
        return redirect(url_for("ver_cliente", cliente_id=cliente_id))

    arquivo_path = os.path.join(UPLOADS_FATURAS_DIR, secure_filename(f"{cliente_id}_{mes_referencia}.pdf"))
    with open(arquivo_path, "wb") as f:
        f.write(pdf_bytes)

    valores = tarifas_processar.valores_fatura_cliente(
        dados, saida, contrato["percentual_desconto_contratado"] or 0,
    )

    with db.conectar() as conn:
        leitura_id = db.gravar_leitura(
            conn, cliente_id, dados.get("instalacao") or cliente["uc"], mes_referencia,
            dados.get("consumo_kwh"), dados.get("injetada_kwh"), valores["energia_compensada_kwh"],
            dados.get("valor_concessionaria"), arquivo_path, "upload_manual",
            json.dumps({**dados, **saida}, ensure_ascii=False), _agora(),
        )
        db.gravar_fatura_cliente(
            conn, cliente_id, mes_referencia, leitura_id, valores["energia_compensada_kwh"],
            contrato["percentual_desconto_contratado"], valores["valor_bruto_energia"],
            valores["valor_desconto"], valores["valor_cobrado"], None, _agora(),
        )
        db.registrar_atividade(
            conn, session["usuario_nome"],
            f"Processou fatura de {mes_referencia} (R$ {valores['valor_cobrado']:.2f} a cobrar)",
            cliente["nome"], _agora(),
        )
    flash(
        f"Fatura de {mes_referencia} processada: R$ {valores['valor_cobrado']:.2f} a cobrar "
        f"({dados.get('injetada_kwh') or 0} kWh compensados).", "success",
    )
    return redirect(url_for("ver_cliente", cliente_id=cliente_id))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5011))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
