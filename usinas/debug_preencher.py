"""
Script de diagnóstico — abre o browser visível e tenta preencher EDP ES.
Não busca da API, usa item hardcoded.
"""
import os, sys

# Carrega .env do tarifas/
env_path = os.path.join(os.path.dirname(__file__), "..", "tarifas", ".env")
if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

import preencher_lexdash

# Item de teste — EDP ES, usina 4, 08-2026
item_teste = {
    "id": None,           # não marca como preenchido
    "distribuidora": "EDP ES",
    "mes_lex": "08-2026",
    "mes_ref": "ago. de 2026",
    "tipo_gd": "GD1",
    "modalidade": "Geração Compartilhada",
    "usinas": '["4"]',
    "tarifa_geracao": 0.936048,
}

from playwright.sync_api import sync_playwright
import json

ARQUIVO_SESSAO = os.path.join(os.path.dirname(__file__), "lexdash_session.json")
URL = "https://crm-lex.energiacom.vc/fatger/atualizacao-fat"

print("=== Abrindo LexDash e preenchendo valor... ===")

with sync_playwright() as p:
    navegador = p.chromium.launch(headless=False, channel="chrome")
    contexto  = navegador.new_context(storage_state=ARQUIVO_SESSAO)
    pagina    = contexto.new_page()

    pagina.goto(URL, wait_until="domcontentloaded", timeout=20000)
    pagina.wait_for_timeout(2000)

    # Abre card de tarifas usina
    preencher_lexdash._abrir_card_usina(pagina)
    preencher_lexdash._aguardar_grid(pagina)

    # Seleciona mês
    preencher_lexdash._selecionar_mes(pagina, "08-2026")
    preencher_lexdash._aguardar_grid(pagina)
    pagina.wait_for_timeout(1000)

    # Preenche valor via JS na célula correta (usina 4 = GV Energia)
    th_cols = pagina.locator("thead tr th").all()
    col_idx = None
    for i, th in enumerate(th_cols):
        try:
            txt = th.inner_text(timeout=2000).strip()
            print(f"  col {i}: {txt}")
            if "(4)" in txt:
                col_idx = i
        except Exception:
            pass

    print(f"\nColuna usina 4: índice {col_idx}")

    if col_idx is not None:
        linha = pagina.locator("tr:has-text('EDP ES')").first
        td = linha.locator("td").nth(col_idx)
        inp = td.locator("input[inputmode='decimal'], input:not([type='checkbox'])").first
        if inp.count() > 0:
            inp_el = inp.element_handle(timeout=3000)
            pagina.evaluate("""
                ([el, val]) => {
                    const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value'
                    ).set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input',  {bubbles: true}));
                    el.dispatchEvent(new Event('change', {bubbles: true}));
                }
            """, [inp_el, "0,936048"])
            print("Valor preenchido: 0,936048")
        else:
            print("!! Input nao encontrado na célula")

    print()
    print("=" * 50)
    print("AGORA: marque o checkbox e clique em Salvar.")
    print("Depois pressione ENTER aqui para fechar.")
    print("=" * 50)
    input()

    navegador.close()
    print("Concluído.")
