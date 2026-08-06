"""Ponte entre o extrator/calculos (portados do alexandria-tarifas) e o
schema do clientes-gd. Ainda usa a API do Claude para a extração --
decisão registrada no plano; não foi convertido para IA local."""
from . import calculos, extrator


def processar_fatura(pdf_bytes: bytes, contrato: dict) -> tuple[dict, dict]:
    """Extrai os dados da fatura (extrator.extrair_fatura) e calcula a
    tarifa de geração (calculos.calcular), usando o desconto contratado do
    cliente como desconto_base/desconto_aplicado. Retorna
    (dados_extraidos, saida_calculo)."""
    dados = extrator.extrair_fatura(pdf_bytes)
    grupo = (dados.get("grupo") or "").upper()

    desconto = contrato.get("percentual_desconto_contratado") or 0
    dados["desconto_base"] = desconto
    dados["desconto_aplicado"] = desconto
    dados["cobra_band"] = bool(contrato.get("cobra_band"))
    dados["impostos_com_desconto"] = bool(contrato.get("impostos_com_desconto"))

    saida = calculos.calcular(grupo, dados)
    return dados, saida


def valores_fatura_cliente(dados: dict, saida: dict, percentual_desconto: float) -> dict:
    """Deriva os campos de faturas_cliente a partir da saída de
    calculos.calcular(). valor_cobrado = tarifa_geracao × kWh compensado é
    exatamente o que o motor calcula pra cobrar do cliente (já líquido do
    desconto contratado, embutido em desconto_aplicado). valor_bruto é
    reconstituído dividindo pelo desconto contratual, só pra exibição
    (não volta a re-somar impostos/bandeira linha a linha)."""
    energia_compensada = dados.get("injetada_kwh") or 0
    valor_cobrado = round((saida.get("tarifa_geracao") or 0) * energia_compensada, 2)
    if percentual_desconto and percentual_desconto < 1:
        valor_bruto = round(valor_cobrado / (1 - percentual_desconto), 2)
    else:
        valor_bruto = valor_cobrado
    valor_desconto = round(valor_bruto - valor_cobrado, 2)
    return {
        "energia_compensada_kwh": energia_compensada,
        "valor_bruto_energia": valor_bruto,
        "valor_desconto": valor_desconto,
        "valor_cobrado": valor_cobrado,
    }
