import os
from datetime import date, datetime, time as dtime, timedelta

from flask import Flask, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

import db

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "chave-de-desenvolvimento-troque-em-producao")
db.iniciar_banco()

ROTAS_PUBLICAS = {"login", "registrar", "static"}

HORA_SNAPSHOT = dtime(8, 0)  # toda segunda a partir desse horário


def _segunda_da_semana(d):
    return d - timedelta(days=d.weekday())


def _garantir_snapshot_semanal(conn):
    """Roda a cada request: se já passou das 8h da segunda-feira desta semana
    e ainda não existe um retrato dela, tira um agora. Como o app roda local
    (não fica ligado 24h), essa checagem por demanda garante que a foto seja
    tirada assim que alguém abrir o painel depois desse horário, em vez de
    depender de um agendador rodando no instante exato."""
    agora = datetime.now()
    semana = _segunda_da_semana(agora.date())
    if agora < datetime.combine(semana, HORA_SNAPSHOT):
        return
    db.tirar_snapshot(conn, semana.isoformat(), agora.isoformat(timespec="seconds"))


@app.before_request
def exigir_login():
    if request.endpoint in ROTAS_PUBLICAS or request.endpoint is None:
        return None
    if "usuario_id" not in session:
        return redirect(url_for("login", proximo=request.path))
    with db.conectar() as conn:
        _garantir_snapshot_semanal(conn)
    return None


@app.context_processor
def injetar_usuario():
    return {
        "usuario_logado": session.get("usuario_nome"),
        "usuario_admin": session.get("usuario_admin", False),
    }


def _dias_desde(data_iso, referencia=None):
    if not data_iso:
        return None
    referencia = referencia or date.today()
    d = datetime.strptime(data_iso, "%Y-%m-%d").date()
    return (referencia - d).days


def _eta_dias(etapa_atual, dias_na_etapa, medias):
    if etapa_atual not in db.ETAPAS:
        return None
    idx = db.ETAPAS.index(etapa_atual)
    restante_etapa_atual = medias.get(etapa_atual)
    if restante_etapa_atual is None:
        return None
    total = max(restante_etapa_atual - dias_na_etapa, 0)
    etapas_opcionais = {"Refazer Rateio", "Consumo de Saldo Acumulado"}
    for etapa in db.ETAPAS[idx + 1:]:
        if etapa in etapas_opcionais:
            continue  # etapas de exceção, não fazem parte do caminho padrão da maioria
        media = medias.get(etapa)
        if media is None:
            return None  # sem dado histórico suficiente pra projetar
        total += media
    return round(total)


def _usinas_ativas_com_metricas(conn):
    usinas = [dict(u) for u in db.listar_ativas(conn)]
    medias = db.medias_por_etapa(conn)
    ultimas_pend = db.ultimas_pendencias_por_usina(conn)
    qtd_pend = db.contar_pendencias_por_usina(conn)
    hoje = date.today()
    for u in usinas:
        u["dias_na_etapa"] = _dias_desde(u["data_entrada_etapa_atual"], hoje)
        u["dias_desde_assinatura"] = _dias_desde(u["data_assinatura_contrato"], hoje)
        media_etapa = medias.get(u["etapa_atual"])
        u["media_etapa"] = media_etapa
        u["atrasada"] = media_etapa is not None and u["dias_na_etapa"] > media_etapa
        u["eta_dias"] = _eta_dias(u["etapa_atual"], u["dias_na_etapa"], medias)
        u["ultima_pendencia"] = ultimas_pend.get(u["id"])
        u["qtd_pendencias"] = qtd_pend.get(u["id"], 0)
    return usinas, medias


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


@app.route("/registrar", methods=["GET", "POST"])
def registrar():
    if request.method == "GET":
        return render_template("registrar.html", erro=None)

    nome = request.form.get("nome", "").strip()
    username = request.form.get("username", "").strip().lower()
    senha = request.form.get("senha", "")

    if not nome or not username or len(senha) < 4:
        return render_template("registrar.html", erro="Preencha nome, usuário e uma senha com pelo menos 4 caracteres.")

    with db.conectar() as conn:
        if db.buscar_usuario_por_username(conn, username) is not None:
            return render_template("registrar.html", erro="Esse usuário já existe.")
        usuario_id = db.criar_usuario(
            conn, nome, username, generate_password_hash(senha), datetime.now().isoformat(timespec="seconds")
        )

    session["usuario_id"] = usuario_id
    session["usuario_nome"] = nome
    return redirect(url_for("dashboard"))


# --- painel --------------------------------------------------------------

@app.route("/")
def dashboard():
    with db.conectar() as conn:
        usinas, medias = _usinas_ativas_com_metricas(conn)

    resumo = []
    for idx, etapa in enumerate(db.ETAPAS):
        usinas_etapa = [u for u in usinas if u["etapa_atual"] == etapa]
        resumo.append({
            "idx": idx,
            "etapa": etapa,
            "qtd": len(usinas_etapa),
            "atrasadas": sum(1 for u in usinas_etapa if u["atrasada"]),
            "media": medias.get(etapa),
        })

    return render_template(
        "dashboard.html",
        resumo=resumo,
        total_ativas=len(usinas),
    )


@app.route("/etapa/<int:idx>")
def ver_etapa(idx):
    if idx < 0 or idx >= len(db.ETAPAS):
        return "Etapa inválida", 404
    etapa = db.ETAPAS[idx]

    with db.conectar() as conn:
        usinas, medias = _usinas_ativas_com_metricas(conn)

    usinas_etapa = [u for u in usinas if u["etapa_atual"] == etapa]

    return render_template(
        "etapa.html",
        etapa=etapa,
        idx=idx,
        usinas=usinas_etapa,
        media=medias.get(etapa),
        etapas=db.ETAPAS,
        etapas_finais=db.ETAPAS_FINAIS,
        total_etapas=len(db.ETAPAS),
    )


@app.route("/comparativo")
def comparativo():
    with db.conectar() as conn:
        semanas = db.semanas_com_snapshot(conn)
        semana_escolhida = request.args.get("semana") or (semanas[0] if semanas else None)
        snapshot = db.snapshot_da_semana(conn, semana_escolhida) if semana_escolhida else {}
        usinas_atuais, _ = _usinas_ativas_com_metricas(conn)

    atuais_por_id = {u["id"]: u for u in usinas_atuais}

    contagem_antes, contagem_agora = {}, {}
    for etapa in db.ETAPAS:
        contagem_antes[etapa] = sum(1 for s in snapshot.values() if s["etapa"] == etapa)
        contagem_agora[etapa] = sum(1 for u in usinas_atuais if u["etapa_atual"] == etapa)

    avancaram, novas, saidas = [], [], []
    for usina_id, s in snapshot.items():
        atual = atuais_por_id.get(usina_id)
        if atual is None:
            saidas.append({"nome_ufv": s["nome_ufv"], "etapa_antes": s["etapa"]})
        elif atual["etapa_atual"] != s["etapa"]:
            avancaram.append({
                "usina": atual, "etapa_antes": s["etapa"], "etapa_agora": atual["etapa_atual"],
            })
    for u in usinas_atuais:
        if u["id"] not in snapshot:
            novas.append(u)

    return render_template(
        "comparativo.html",
        semanas=semanas,
        semana_escolhida=semana_escolhida,
        etapas=db.ETAPAS,
        contagem_antes=contagem_antes,
        contagem_agora=contagem_agora,
        avancaram=avancaram,
        novas=novas,
        saidas=saidas,
        total_antes=len(snapshot),
        total_agora=len(usinas_atuais),
    )


@app.route("/comparativo/tirar-agora", methods=["POST"])
def tirar_snapshot_agora():
    if not session.get("usuario_admin"):
        return "Só administradores podem forçar um novo retrato.", 403
    agora = datetime.now()
    semana = _segunda_da_semana(agora.date())
    with db.conectar() as conn:
        db.tirar_snapshot(conn, semana.isoformat(), agora.isoformat(timespec="seconds"))
    return redirect(url_for("comparativo"))


@app.route("/usina/<int:usina_id>")
def ver_usina(usina_id):
    with db.conectar() as conn:
        usina = db.buscar_usina(conn, usina_id)
        historico = [dict(h) for h in db.historico_usina(conn, usina_id)]
        pendencias = [dict(p) for p in db.pendencias_usina(conn, usina_id)]

    if usina is None:
        return "Usina não encontrada", 404

    usina = dict(usina)
    hoje = date.today()
    for h in historico:
        fim = h["data_saida"] or hoje.isoformat()
        h["dias"] = _dias_desde(h["data_entrada"], datetime.strptime(fim, "%Y-%m-%d").date())

    usina["dias_na_etapa"] = _dias_desde(usina["data_entrada_etapa_atual"], hoje)
    usina["dias_desde_assinatura"] = _dias_desde(usina["data_assinatura_contrato"], hoje)

    return render_template(
        "usina.html",
        usina=usina,
        historico=historico,
        pendencias=pendencias,
        etapas=db.ETAPAS,
        etapas_finais=db.ETAPAS_FINAIS,
    )


@app.route("/usina/<int:usina_id>/pendencia", methods=["POST"])
def adicionar_pendencia(usina_id):
    texto = request.form.get("texto", "").strip()
    responsavel = request.form.get("responsavel", "").strip()
    if texto:
        with db.conectar() as conn:
            db.adicionar_pendencia(
                conn, usina_id, texto, responsavel, session["usuario_nome"],
                datetime.now().isoformat(timespec="seconds"),
            )
    return redirect(url_for("ver_usina", usina_id=usina_id))


@app.route("/usina/<int:usina_id>/mudar-etapa", methods=["POST"])
def mudar_etapa(usina_id):
    nova_etapa = request.form.get("nova_etapa", "").strip()
    if nova_etapa not in db.ETAPAS and nova_etapa not in db.ETAPAS_FINAIS:
        return "Etapa inválida", 400
    hoje_iso = date.today().isoformat()
    with db.conectar() as conn:
        db.mudar_etapa(conn, usina_id, nova_etapa, hoje_iso, session["usuario_nome"])
    return redirect(request.referrer or url_for("dashboard"))


@app.route("/usinas/nova", methods=["GET", "POST"])
def nova_usina():
    if request.method == "GET":
        return render_template("nova_usina.html", etapas=db.ETAPAS)

    hoje_iso = date.today().isoformat()
    data_assinatura = request.form.get("data_assinatura", "").strip() or None
    with db.conectar() as conn:
        usina_id = db.criar_usina(
            conn,
            ug_raw=request.form.get("ug", "").strip(),
            nome_ufv=request.form.get("nome_ufv", "").strip(),
            concessionaria=request.form.get("concessionaria", "").strip(),
            dono_carteira=request.form.get("dono_carteira", "").strip(),
            data_assinatura=data_assinatura,
            etapa_inicial=request.form.get("etapa_inicial", db.ETAPAS[0]),
            hoje_iso=hoje_iso,
            pendencia=request.form.get("pendencia", "").strip(),
            responsavel=request.form.get("responsavel", "").strip(),
            autor=session["usuario_nome"],
            criado_em=datetime.now().isoformat(timespec="seconds"),
        )
    return redirect(url_for("ver_usina", usina_id=usina_id))


@app.route("/usina/<int:usina_id>/editar", methods=["GET", "POST"])
def editar_usina(usina_id):
    if not session.get("usuario_admin"):
        return "Só administradores podem editar os dados da usina.", 403

    with db.conectar() as conn:
        usina = db.buscar_usina(conn, usina_id)
        if usina is None:
            return "Usina não encontrada", 404

        if request.method == "GET":
            return render_template("editar_usina.html", usina=dict(usina))

        db.atualizar_usina(conn, usina_id, {
            "ug_raw": request.form.get("ug", "").strip(),
            "nome_ufv": request.form.get("nome_ufv", "").strip(),
            "concessionaria": request.form.get("concessionaria", "").strip(),
            "dono_carteira": request.form.get("dono_carteira", "").strip(),
            "data_assinatura_contrato": request.form.get("data_assinatura", "").strip() or None,
        })
    return redirect(url_for("ver_usina", usina_id=usina_id))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5010))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
