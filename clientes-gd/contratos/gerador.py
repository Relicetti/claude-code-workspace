"""Gera o PDF do Termo de Adesão preenchido com os dados reais do cliente e
do contrato, a partir do template termo_adesao_pdf.html. Usa xhtml2pdf (puro
Python, sem depender de LibreOffice/binário externo) -- decisão tomada
depois de confirmar que o LibreOffice não é confiável em todos os
ambientes onde este app pode rodar.

A Proposta Comercial (Anexo IV do modelo original) foi deixada de fora a
pedido do usuário -- o documento gerado cobre só o Termo de Adesão +
Anexo I (Condições) + Anexo II (Unidades Consumidoras).
"""
import os
from datetime import date

from flask import render_template
from xhtml2pdf import pisa

# Dados da empresa/associação: configuráveis via env var pra quando a marca
# for definida, sem precisar mexer em código. Até lá, cai no placeholder
# genérico (mesmo padrão já usado na fatura do cliente).
DADOS_EMPRESA = {
    "nome": os.environ.get("EMPRESA_NOME", "[NOME DA EMPRESA]"),
    "cnpj": os.environ.get("EMPRESA_CNPJ", "[CNPJ DA EMPRESA]"),
    "endereco": os.environ.get("EMPRESA_ENDERECO", "[ENDEREÇO DA EMPRESA]"),
    "telefone": os.environ.get("EMPRESA_TELEFONE", "[TELEFONE]"),
    "email": os.environ.get("EMPRESA_EMAIL", "[E-MAIL DE CONTRATOS]"),
    "representante": os.environ.get("EMPRESA_REPRESENTANTE", "[NOME DO REPRESENTANTE LEGAL]"),
}
ASSOCIACAO_NOME = os.environ.get("ASSOCIACAO_NOME", "[NOME DA ASSOCIAÇÃO]")
CIDADE_DOCUMENTO = os.environ.get("EMPRESA_CIDADE_UF", "[CIDADE/UF]")

MESES_PT = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril", 5: "maio", 6: "junho",
    7: "julho", 8: "agosto", 9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


def _data_por_extenso(d):
    return f"{d.day} de {MESES_PT[d.month]} de {d.year}"


def gerar_termo_adesao_pdf(cliente: dict, contrato: dict) -> bytes:
    """Renderiza o HTML do termo de adesão com os dados reais e converte
    pra PDF. Levanta RuntimeError se a conversão falhar (xhtml2pdf reporta
    erro sem lançar exceção por padrão)."""
    percentual = contrato.get("percentual_desconto_contratado")
    percentual_fmt = f"{round(percentual * 100, 2)}%" if percentual is not None else "[A DEFINIR]"

    html = render_template(
        "termo_adesao_pdf.html",
        empresa=DADOS_EMPRESA,
        associacao_nome=ASSOCIACAO_NOME,
        cidade=CIDADE_DOCUMENTO,
        data_documento=_data_por_extenso(date.today()),
        cliente=cliente,
        contrato=contrato,
        percentual_desconto=percentual_fmt,
    )

    from io import BytesIO
    buffer = BytesIO()
    resultado = pisa.CreatePDF(html, dest=buffer)
    if resultado.err:
        raise RuntimeError(f"Falha ao gerar PDF do termo de adesão (xhtml2pdf err={resultado.err}).")
    return buffer.getvalue()
