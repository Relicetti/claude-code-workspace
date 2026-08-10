"""
Configuração ÚNICA: abre uma janela de navegador de verdade pra você fazer
login manualmente no LexDash. Depois de logar, a sessão (cookies) é salva em
lexdash_session.json — esse arquivo é o que o atualizar_lexdash.py usa depois
pra abrir o relatório sozinho, sem pedir login de novo.

Nunca digite sua senha em nenhum lugar além dessa janela do navegador que abre
aqui. Este script não vê nem grava sua senha, só o resultado do login (cookies).

Uso: python login_lexdash.py
"""
from playwright.sync_api import sync_playwright

URL_LOGIN = "https://crm-lex.energiacom.vc"
ARQUIVO_SESSAO = "lexdash_session.json"


def principal():
    with sync_playwright() as p:
        navegador = p.chromium.launch(headless=False, channel="chrome")
        pagina = navegador.new_page()
        pagina.goto(URL_LOGIN)

        print("=" * 70)
        print("Uma janela do Chrome foi aberta. Faça login normalmente no LexDash.")
        print("Depois de ver o dashboard carregado, volte aqui e aperte ENTER.")
        print("=" * 70)
        input("Pressione ENTER depois de logar com sucesso...")

        pagina.context.storage_state(path=ARQUIVO_SESSAO)
        print(f"Sessão salva em {ARQUIVO_SESSAO}. Pode fechar a janela do navegador.")
        navegador.close()


if __name__ == "__main__":
    principal()
