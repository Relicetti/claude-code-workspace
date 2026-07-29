"""
Envio do e-mail de boas-vindas pra usuário novo. Depende de configuração de
SMTP via variáveis de ambiente (não tem nenhuma senha de e-mail hardcoded
aqui). Se não estiver configurado, o envio simplesmente falha e quem
cadastrou o usuário vê a senha na tela pra repassar manualmente.
"""
import os
import smtplib
from email.message import EmailMessage

# Padrão pensado pra Microsoft 365 / Outlook (smtp.office365.com); troque via
# env var SMTP_HOST se o domínio usar outro provedor.
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.office365.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)

CONFIGURADO = bool(SMTP_USER and SMTP_PASSWORD)


def enviar_boas_vindas(nome, email, username, senha, url_base):
    if not CONFIGURADO:
        return False, "Envio de e-mail não configurado (faltam variáveis SMTP_USER/SMTP_PASSWORD)."

    msg = EmailMessage()
    msg["Subject"] = "Acesso ao Painel FUP Operações"
    msg["From"] = SMTP_FROM
    msg["To"] = email
    msg.set_content(
        f"Olá, {nome}!\n\n"
        f"Sua conta no Painel FUP Operações foi criada.\n\n"
        f"Link de acesso: {url_base}\n"
        f"Usuário: {username}\n"
        f"Senha: {senha}\n\n"
        f"Recomendamos trocar a senha após o primeiro acesso."
    )

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
        return True, None
    except Exception as e:
        return False, str(e)
