import os
from datetime import date, datetime

from flask import Flask, redirect, render_template, request, url_for

import db

app = Flask(__name__)
db.iniciar_banco()


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


@app.route("/")
def dashboard():
    with db.conectar() as conn:
        usinas = [dict(u) for u in db.listar_ativas(conn)]
        medias = db.medias_por_etapa(conn)

    hoje = date.today()
    for u in usinas:
        u["dias_na_etapa"] = _dias_desde(u["data_entrada_etapa_atual"], hoje)
        u["dias_desde_assinatura"] = _dias_desde(u["data_assinatura_contrato"], hoje)
        media_etapa = medias.get(u["etapa_atual"])
        u["media_etapa"] = media_etapa
        u["atrasada"] = media_etapa is not None and u["dias_na_etapa"] > media_etapa
        u["eta_dias"] = _eta_dias(u["etapa_atual"], u["dias_na_etapa"], medias)

    grupos = {}
    for etapa in db.ETAPAS:
        grupos[etapa] = [u for u in usinas if u["etapa_atual"] == etapa]

    return render_template(
        "dashboard.html",
        grupos=grupos,
        etapas=db.ETAPAS,
        etapas_finais=db.ETAPAS_FINAIS,
        medias=medias,
        total_ativas=len(usinas),
    )


@app.route("/usina/<int:usina_id>")
def ver_usina(usina_id):
    with db.conectar() as conn:
        usina = db.buscar_usina(conn, usina_id)
        historico = [dict(h) for h in db.historico_usina(conn, usina_id)]
        medias = db.medias_por_etapa(conn)

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
        etapas=db.ETAPAS,
        etapas_finais=db.ETAPAS_FINAIS,
    )


@app.route("/usina/<int:usina_id>/mudar-etapa", methods=["POST"])
def mudar_etapa(usina_id):
    nova_etapa = request.form.get("nova_etapa", "").strip()
    if nova_etapa not in db.ETAPAS and nova_etapa not in db.ETAPAS_FINAIS:
        return "Etapa inválida", 400
    hoje_iso = date.today().isoformat()
    with db.conectar() as conn:
        db.mudar_etapa(conn, usina_id, nova_etapa, hoje_iso)
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
            observacao=request.form.get("observacao", "").strip(),
        )
    return redirect(url_for("ver_usina", usina_id=usina_id))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5010))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
