"""
Abre o LexDash, captura todas as chamadas de API que acontecem
quando você marca o checkbox e clica Salvar manualmente.
"""
import os, sys, json

# Carrega .env
env_path = os.path.join(os.path.dirname(__file__), "..", "tarifas", ".env")
if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

from playwright.sync_api import sync_playwright

URL = "https://crm-lex.energiacom.vc/fatger/atualizacao-fat"
ARQUIVO_SESSAO = os.path.join(os.path.dirname(__file__), "lexdash_session.json")

requests_capturados = []

with sync_playwright() as p:
    navegador = p.chromium.launch(headless=False, channel="chrome")
    contexto  = navegador.new_context(storage_state=ARQUIVO_SESSAO)
    pagina    = contexto.new_page()

    # Captura todas as requisições de rede
    def on_request(req):
        if req.method in ("POST", "PUT", "PATCH") and "api" in req.url:
            try:
                body = req.post_data
            except Exception:
                body = None
            requests_capturados.append({
                "method": req.method,
                "url": req.url,
                "body": body,
            })

    pagina.on("request", on_request)

    pagina.goto(URL, wait_until="domcontentloaded", timeout=20000)
    pagina.wait_for_timeout(2000)

    print()
    print("=" * 60)
    print("BROWSER ABERTO — faça manualmente:")
    print("  1. Selecione o mês 08-2026 e clique Ir")
    print("  2. Marque o checkbox da coluna EDP ES / usina 4")
    print("  3. Digite o valor 0,936048")
    print("  4. Clique em Salvar")
    print()
    print("Quando terminar, feche o browser ou pressione ENTER aqui.")
    print("=" * 60)

    try:
        input()
    except Exception:
        pagina.wait_for_timeout(60000)

    print()
    print(f"{len(requests_capturados)} requisição(ões) capturada(s):")
    for r in requests_capturados:
        print()
        print(f"  {r['method']} {r['url']}")
        if r['body']:
            try:
                print(f"  body: {json.dumps(json.loads(r['body']), indent=4, ensure_ascii=False)}")
            except Exception:
                print(f"  body: {r['body'][:500]}")

    navegador.close()
