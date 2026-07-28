import os

from flask import Flask, jsonify, render_template, request

import geracao

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html", estados=geracao.listar_estados())


@app.route("/cidades")
def cidades():
    uf = request.args.get("uf", "")
    return jsonify([c["nome"] for c in geracao.listar_cidades(uf)])


@app.route("/calcular", methods=["POST"])
def calcular():
    uf = request.form.get("uf", "")
    cidade = request.form.get("cidade", "")

    try:
        potencia_cc = float(request.form["potencia_cc"].replace(",", "."))
        potencia_ca = float(request.form["potencia_ca"].replace(",", "."))
    except (KeyError, ValueError):
        return render_template("index.html", estados=geracao.listar_estados(),
                                erro="Informe Potência CC e Potência CA válidas.")

    coords = geracao.buscar_coordenadas(uf, cidade)
    if not coords:
        return render_template("index.html", estados=geracao.listar_estados(),
                                erro=f"Cidade '{cidade}' não encontrada em {uf}.")
    lat, lon = coords

    try:
        resultado = geracao.calcular_geracao(lat, lon, potencia_cc, potencia_ca)
    except Exception as e:
        return render_template("index.html", estados=geracao.listar_estados(),
                                erro=f"Erro ao consultar o PVGIS: {e}")

    return render_template(
        "resultado.html",
        cidade=cidade, uf=uf, lat=lat, lon=lon,
        potencia_cc=potencia_cc, potencia_ca=potencia_ca,
        r=resultado,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5003))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
