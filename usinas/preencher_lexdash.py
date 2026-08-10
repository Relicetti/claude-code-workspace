"""
Preenche automaticamente o grid "Atualizacao de tarifas usina" no LexDash
com as tarifas aprovadas na tela de revisão do app.

Fluxo:
  1. Busca itens aprovados via API do app de tarifas
  2. Abre LexDash com sessão salva
  3. Navega para Atualizações > Atualizacao de tarifas usina
  4. Para cada mês encontrado:
     a. Seleciona o mês e clica Ir
     b. Passa GD1 (sem checkbox), GD2, e Cacau Show em passagens separadas
     c. Clica Salvar em cada passagem
  5. Marca os itens como preenchidos na API

Uso:
    python preencher_lexdash.py [--debug] [--dry-run]

Pré-requisito:
    - login_lexdash.py executado ao menos uma vez
    - TARIFAS_API_URL configurado (ex: https://seu-app.railway.app)
      ou rodando localmente (http://localhost:5001)
    - ADMIN_TOKEN configurado (se o app exigir)
"""
import argparse
import json
import os
import sys

import requests
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

ARQUIVO_SESSAO  = os.path.join(os.path.dirname(__file__), "lexdash_session.json")
URL_ATUALIZACOES = "https://crm-lex.energiacom.vc/fatger/atualizacao-fat"

# URL do app de tarifas — configura via variável de ambiente ou .env
TARIFAS_API_URL = os.environ.get("TARIFAS_API_URL", "https://alexandria-tarifas-production.up.railway.app")
ADMIN_TOKEN     = os.environ.get("ADMIN_TOKEN", "")

_MESES_PT = {
    "jan": "01", "fev": "02", "mar": "03", "abr": "04",
    "mai": "05", "jun": "06", "jul": "07", "ago": "08",
    "set": "09", "out": "10", "nov": "11", "dez": "12",
}


def _headers():
    h = {"Content-Type": "application/json"}
    if ADMIN_TOKEN:
        h["X-Admin-Token"] = ADMIN_TOKEN
    return h


def _buscar_aprovados() -> list[dict]:
    resp = requests.get(f"{TARIFAS_API_URL}/api/pendentes/aprovados", headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def _marcar_preenchido(id: int):
    requests.post(f"{TARIFAS_API_URL}/api/pendentes/{id}/preenchido", headers=_headers(), timeout=10)


def _mes_ref_para_lex(mes_ref: str) -> str:
    """'ago. de 2026' → '08-2026'"""
    partes = mes_ref.lower().replace(".", "").split()
    for p in partes:
        if p[:3] in _MESES_PT:
            mes = _MESES_PT[p[:3]]
            ano = next((x for x in partes if len(x) == 4 and x.isdigit()), None)
            if ano:
                return f"{mes}-{ano}"
    return mes_ref


def _abrir_card_usina(pagina):
    """Clica no card 'Atualizacao de tarifas usina' (3º card)."""
    for sel in ["text=Atualizacao de tarifas usina", "text=Atualização de tarifas usina"]:
        loc = pagina.locator(sel).first
        if loc.count() > 0:
            loc.click()
            pagina.wait_for_timeout(2000)
            return
    # fallback: 3º card
    cards = pagina.locator(".card, [class*='card']").all()
    if len(cards) >= 3:
        cards[2].click()
        pagina.wait_for_timeout(2000)
    else:
        raise RuntimeError("Card 'Atualizacao de tarifas usina' não encontrado.")


def _selecionar_mes(pagina, mes_lex: str):
    """Preenche o campo MES DE REFERENCIA e clica Ir."""
    campo = pagina.locator("input[type='text'], input[type='month'], input").filter(
        has_text=""
    ).first

    # tenta por placeholder ou label
    for sel in [
        "input[placeholder*='mês'], input[placeholder*='mes']",
        "input[placeholder*='MM-YYYY'], input[placeholder*='MM-AAAA']",
        "input[name*='mes'], input[name*='mes_referencia']",
        "input",
    ]:
        loc = pagina.locator(sel).first
        if loc.count() > 0:
            try:
                loc.triple_click()
                loc.type(mes_lex)
                break
            except Exception:
                continue

    # clica no botão Ir
    for sel in ["button:has-text('Ir')", "input[value='Ir']", "text=Ir"]:
        btn = pagina.locator(sel).first
        if btn.count() > 0:
            btn.click()
            pagina.wait_for_timeout(3000)
            return

    raise RuntimeError(f"Botão 'Ir' não encontrado na tela.")


def _aguardar_grid(pagina):
    """Aguarda a tabela do grid carregar."""
    try:
        pagina.wait_for_function(
            "() => !document.body.innerText.includes('Carregando')",
            timeout=15000,
        )
    except PWTimeout:
        pass
    pagina.wait_for_timeout(1000)


def _marcar_checkbox_tipo(pagina, tipo: str):
    """
    Marca o checkbox de tipo no topo da grade.
    tipo: 'GD2' | 'CacauShow' | 'GD1' (GD1 = nenhum)
    """
    if tipo == "GD1":
        # Garante que nenhum checkbox de tipo está marcado
        for lbl in ["TARIFA GD2", "TARIFA CACAU SHOW"]:
            cb = pagina.locator(f"label:has-text('{lbl}') input, input[type='checkbox']").filter(
                has_text=""
            )
            for el in cb.all():
                try:
                    if el.is_checked():
                        el.uncheck()
                except Exception:
                    pass
        return

    label_map = {
        "GD2":       "TARIFA GD2",
        "CacauShow": "TARIFA CACAU SHOW",
    }
    texto = label_map.get(tipo, "")
    if not texto:
        return

    # Procura checkbox próximo ao label
    cb = pagina.locator(f"text={texto}").locator("..").locator("input[type='checkbox']").first
    if cb.count() == 0:
        cb = pagina.locator(f"label:has-text('{texto}') input[type='checkbox']").first
    if cb.count() > 0 and not cb.is_checked():
        cb.check()
        pagina.wait_for_timeout(500)


def _preencher_linha(pagina, distribuidora: str, usinas: list, valor: float):
    """
    Encontra a linha da distribuidora no grid, marca os checkboxes e preenche o valor
    nas colunas de usina correspondentes.
    Retorna True se preencheu ao menos uma célula.
    """
    # Localiza a linha por texto da distribuidora
    linha = pagina.locator(f"tr:has-text('{distribuidora}')").first
    if linha.count() == 0:
        print(f"  ⚠️  Linha '{distribuidora}' não encontrada no grid.")
        return False

    preencheu = False
    valor_str = f"{valor:.6f}"

    for usina_id in usinas:
        usina_id = str(usina_id).strip()

        # Cada coluna de usina tem um cabeçalho com o número da usina
        # Descobre o índice da coluna pelo cabeçalho da tabela
        th_cols = pagina.locator("thead tr th").all()
        col_idx = None
        for i, th in enumerate(th_cols):
            th_texto = th.inner_text().strip()
            # Cabeçalho pode ser "USINAS ALEXANDRIA 1 (101)" ou "EDP (5)"
            if f"({usina_id})" in th_texto:
                col_idx = i
                break

        if col_idx is None:
            print(f"  ⚠️  Coluna usina {usina_id} não encontrada.")
            continue

        # Pega a célula na linha e coluna correta
        tds = linha.locator("td").all()
        if col_idx >= len(tds):
            print(f"  ⚠️  Coluna {col_idx} fora do range (linha tem {len(tds)} colunas).")
            continue

        td = tds[col_idx]

        # Marca o checkbox dentro da célula
        cb = td.locator("input[type='checkbox']").first
        if cb.count() > 0 and not cb.is_checked():
            cb.check()
            pagina.wait_for_timeout(200)

        # Preenche o input de valor
        inp = td.locator("input[type='text'], input[type='number'], input:not([type='checkbox'])").first
        if inp.count() > 0:
            inp.triple_click()
            inp.fill(valor_str)
            preencheu = True

    return preencheu


def _salvar(pagina):
    """Clica no botão Salvar e aguarda confirmação."""
    for sel in ["button:has-text('Salvar')", "input[value='Salvar']", "text=Salvar"]:
        btn = pagina.locator(sel).first
        if btn.count() > 0:
            btn.click()
            pagina.wait_for_timeout(3000)
            return
    print("  ⚠️  Botão Salvar não encontrado.")


def _tipo_passagem(item: dict) -> str:
    """Determina o tipo de passagem: 'GD1', 'GD2', ou 'CacauShow'."""
    modal = (item.get("modalidade") or "").lower()
    if "cacau" in modal:
        return "CacauShow"
    if item.get("tipo_gd") == "GD2":
        return "GD2"
    return "GD1"


def preencher(itens: list[dict], dry_run=False, debug=False):
    if not os.path.exists(ARQUIVO_SESSAO):
        raise RuntimeError("Sessão não encontrada. Rode login_lexdash.py primeiro.")

    # Agrupa por mês_lex → tipo → lista de itens
    por_mes: dict[str, dict[str, list]] = {}
    for item in itens:
        mes = item.get("mes_lex") or _mes_ref_para_lex(item.get("mes_ref", ""))
        tipo = _tipo_passagem(item)
        por_mes.setdefault(mes, {}).setdefault(tipo, []).append(item)

    print(f"\nMeses a preencher: {list(por_mes.keys())}")
    for mes, tipos in por_mes.items():
        for tipo, its in tipos.items():
            print(f"  {mes} | {tipo}: {len(its)} distribuidora(s)")

    if dry_run:
        print("\n[dry-run] Nada preenchido.")
        return

    with sync_playwright() as p:
        navegador = p.chromium.launch(headless=not debug, channel="chrome")
        contexto  = navegador.new_context(storage_state=ARQUIVO_SESSAO)
        pagina    = contexto.new_page()

        pagina.goto(URL_ATUALIZACOES)
        pagina.wait_for_load_state("domcontentloaded", timeout=30000)
        pagina.wait_for_timeout(2000)

        if "login" in pagina.url.lower():
            raise RuntimeError("Sessão expirada. Rode login_lexdash.py de novo.")

        _abrir_card_usina(pagina)
        _aguardar_grid(pagina)

        for mes_lex, tipos in por_mes.items():
            print(f"\n── Mês {mes_lex} ──")
            _selecionar_mes(pagina, mes_lex)
            _aguardar_grid(pagina)

            # Ordem: GD1, GD2, CacauShow — cada um com seu Salvar
            for tipo in ["GD1", "GD2", "CacauShow"]:
                its = tipos.get(tipo, [])
                if not its:
                    continue

                print(f"  Passagem {tipo} ({len(its)} itens)")
                _marcar_checkbox_tipo(pagina, tipo)

                algum = False
                for item in its:
                    usinas = json.loads(item.get("usinas", "[]"))
                    if isinstance(usinas, str):
                        usinas = [u.strip() for u in usinas.split(",")]
                    tarifa = item.get("tarifa_geracao")
                    if not tarifa:
                        print(f"  ⚠️  {item['distribuidora']}: sem tarifa_geracao, pulando.")
                        continue
                    print(f"    {item['distribuidora']} → usinas {usinas} → {tarifa:.6f}")
                    ok = _preencher_linha(pagina, item["distribuidora"], usinas, tarifa)
                    if ok:
                        algum = True

                if algum:
                    _salvar(pagina)
                    print(f"  ✓ Salvo ({tipo})")

                    # Marca preenchidos na API
                    for item in its:
                        if item.get("id"):
                            _marcar_preenchido(item["id"])

        navegador.close()
        print("\n✓ Preenchimento concluído.")


def principal():
    ap = argparse.ArgumentParser(description="Preenche grid de tarifas no LexDash")
    ap.add_argument("--debug",   action="store_true", help="Browser visível")
    ap.add_argument("--dry-run", action="store_true", help="Só mostra o que faria")
    args = ap.parse_args()

    print(f"Buscando aprovados em {TARIFAS_API_URL} ...")
    try:
        itens = _buscar_aprovados()
    except Exception as e:
        print(f"Erro ao buscar aprovados: {e}")
        sys.exit(1)

    if not itens:
        print("Nenhum item aprovado aguardando preenchimento.")
        return

    print(f"{len(itens)} item(ns) aprovado(s).")
    preencher(itens, dry_run=args.dry_run, debug=args.debug)


if __name__ == "__main__":
    principal()
