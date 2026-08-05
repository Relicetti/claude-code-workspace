import csv
import os

import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PVGIS_URL = "https://re.jrc.ec.europa.eu/api/v5_2/seriescalc"

MOUNTING_PADRAO = "free"  # free-standing — usina fixa de solo
AZIMUTE_NORTE = 180       # convencao PVGIS: 0 = sul, +-180 = norte (fixo, sem otimizacao automatica)
ANO_REFERENCIA = 2019     # ano representativo disponivel na base historica do PVGIS

# Perdas de sistema padrao (%), combinadas multiplicativamente. Somam ~14% (default classico do PVGIS).
PERDAS_PADRAO = {
    "cc": 3.0,        # cabeamento CC + mismatch entre modulos/strings
    "ca": 1.0,        # cabeamento CA + transformador
    "sujidade": 3.0,  # sujidade/soiling
    "outras": 7.0,    # inversor, indisponibilidade, degradacao inicial, etc.
}

MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def _carregar_csv(nome):
    caminho = os.path.join(BASE_DIR, "data", nome)
    with open(caminho, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


_ESTADOS = _carregar_csv("estados.csv")
_MUNICIPIOS = _carregar_csv("municipios.csv")


def listar_estados():
    return sorted(_ESTADOS, key=lambda e: e["nome"])


def _codigo_uf(uf):
    return next((e["codigo_uf"] for e in _ESTADOS if e["uf"] == uf), None)


def listar_cidades(uf):
    codigo = _codigo_uf(uf)
    if not codigo:
        return []
    cidades = [m for m in _MUNICIPIOS if m["codigo_uf"] == codigo]
    return sorted(cidades, key=lambda m: m["nome"])


def buscar_coordenadas(uf, nome_cidade):
    for m in listar_cidades(uf):
        if m["nome"] == nome_cidade:
            return float(m["latitude"]), float(m["longitude"])
    return None


def perda_total_pct(perdas):
    """Combina as perdas percentuais multiplicativamente (1 - produto das eficiencias)."""
    fator = 1.0
    for p in perdas.values():
        fator *= (1 - (p or 0) / 100)
    return (1 - fator) * 100


def calcular_geracao(lat, lon, potencia_cc_kwp, potencia_ca_kw,
                      perdas=None, mounting=MOUNTING_PADRAO):
    """Estima geracao mensal via serie horaria do PVGIS, aplicando clipping pela potencia CA.

    Usina fixa de solo, sempre orientada ao Norte (azimute fixo), com inclinacao otima
    calculada automaticamente pelo PVGIS para essa orientacao.
    """
    perdas = perdas or PERDAS_PADRAO
    perda_pct = perda_total_pct(perdas)

    params = {
        "lat": lat,
        "lon": lon,
        "pvcalculation": 1,
        "peakpower": potencia_cc_kwp,
        "loss": perda_pct,
        "mountingplace": mounting,
        "aspect": AZIMUTE_NORTE,
        "optimalinclination": 1,
        "outputformat": "json",
        "startyear": ANO_REFERENCIA,
        "endyear": ANO_REFERENCIA,
    }
    resp = requests.get(PVGIS_URL, params=params, timeout=30)
    resp.raise_for_status()
    dados = resp.json()

    horas = dados["outputs"]["hourly"]
    potencia_ca_w = potencia_ca_kw * 1000

    energia_dc_mes = [0.0] * 12
    energia_ca_mes = [0.0] * 12
    horas_count_mes = [0] * 12

    for h in horas:
        mes = int(h["time"][4:6]) - 1
        p_dc = h["P"]  # W medio na hora, ja com perdas de sistema aplicadas pelo PVGIS
        p_ca = min(p_dc, potencia_ca_w) if potencia_ca_w else p_dc
        energia_dc_mes[mes] += p_dc / 1000.0
        energia_ca_mes[mes] += p_ca / 1000.0
        horas_count_mes[mes] += 1

    meses = []
    for i in range(12):
        horas_mes = horas_count_mes[i] or 1
        fc = (energia_ca_mes[i] / (potencia_ca_kw * horas_mes) * 100) if potencia_ca_kw else 0
        meses.append({
            "mes": MESES[i],
            "energia_dc_kwh": energia_dc_mes[i],
            "energia_ca_kwh": energia_ca_mes[i],
            "fc": fc,
        })

    energia_dc_total = sum(energia_dc_mes)
    energia_ca_total = sum(energia_ca_mes)
    energia_ca_media_mensal = energia_ca_total / 12
    perdas_clipping = energia_dc_total - energia_ca_total
    horas_ano = sum(horas_count_mes) or 1
    fc_medio_anual = (energia_ca_total / (potencia_ca_kw * horas_ano) * 100) if potencia_ca_kw else 0

    mount_info = dados["inputs"]["mounting_system"]["fixed"]

    return {
        "meses": meses,
        "energia_dc_total_kwh": energia_dc_total,
        "energia_ca_total_kwh": energia_ca_total,
        "energia_ca_media_mensal_kwh": energia_ca_media_mensal,
        "perdas_clipping_kwh": perdas_clipping,
        "perdas_clipping_pct": (perdas_clipping / energia_dc_total * 100) if energia_dc_total else 0,
        "fc_medio_anual": fc_medio_anual,
        "dc_ac_ratio": (potencia_cc_kwp / potencia_ca_kw) if potencia_ca_kw else None,
        "ano_referencia": ANO_REFERENCIA,
        "meteo_db": dados["inputs"]["meteo_data"]["radiation_db"],
        "inclinacao_otima": mount_info["slope"]["value"],
        "orientacao": "Norte (fixo)",
        "perdas": perdas,
        "perda_sistema_pct": perda_pct,
    }
