"""
Envio de e-mails do módulo (boas-vindas, avisos). Depende de configuração de
SMTP via variáveis de ambiente (não tem nenhuma senha de e-mail hardcoded
aqui). Se não estiver configurado, o envio simplesmente falha e a tela
mostra a informação pra repassar manualmente.
"""
import os
import smtplib
from email.message import EmailMessage

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.office365.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)

CONFIGURADO = bool(SMTP_USER and SMTP_PASSWORD)


def _enviar(destinatario, assunto, corpo):
    if not CONFIGURADO:
        return False, "Envio de e-mail não configurado (faltam variáveis SMTP_USER/SMTP_PASSWORD)."

    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = SMTP_FROM
    msg["To"] = destinatario
    msg.set_content(corpo)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
        return True, None
    except Exception as e:
        return False, str(e)


def enviar_boas_vindas(nome, email, username, senha, url_base):
    return _enviar(
        email,
        "Acesso ao Painel de Gestão de Clientes GD",
        f"Olá, {nome}!\n\n"
        f"Sua conta no Painel de Gestão de Clientes GD foi criada.\n\n"
        f"Link de acesso: {url_base}\n"
        f"Usuário: {username}\n"
        f"Senha: {senha}\n\n"
        f"Recomendamos trocar a senha após o primeiro acesso.",
    )


def enviar_convite_assinatura(nome_cliente, email_cliente, link_assinatura):
    return _enviar(
        email_cliente,
        "Contrato de adesão pronto para assinatura",
        f"Olá, {nome_cliente}!\n\n"
        f"Seu contrato de adesão está pronto para assinatura eletrônica.\n\n"
        f"Acesse o link abaixo para assinar:\n{link_assinatura}\n",
    )
