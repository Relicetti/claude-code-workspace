"""
Automação: busca faturas pendentes no LexDash (Atualizações > Atualizacao de tarifas usina),
filtra as que têm status AGUARDANDO_TARIFA, baixa o PDF de cada uma e extrai as tarifas
via sistema tarifas/.

Pré-requisito: rodar login_lexdash.py pelo menos uma vez pra salvar a sessão.

Uso:
    python baixar_faturas_lexdash.py [--dry-run] [--debug] [--sem-extracao]

Flags:
    --dry-run       Lista as faturas encontradas mas não baixa nem extrai.
    --debug         Roda com browser visível (útil pra depurar seletores).
    --sem-extracao  Baixa os PDFs mas não chama o extrator de tarifas.
"""
import argparse
import importlib.util
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

URL_ATUALIZACOES = "https://crm-lex.energiacom.vc/fatger/atualizacao-fat"
ARQUIVO_SESSAO   = os.path.join(os.path.dirname(__file__), "lexdash_session.json")
PASTA_BASE = r"D:\Alexandria\OneDrive - Alexandria Industria de Geradores SA\Calculos Tarifas"

# Caminho pro sistema de tarifas (um nível acima de usinas/)
TARIFAS_DIR = os.path.join(os.path.dirname(__file__), "..", "tarifas")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _checar_sessao():
    if not os.path.exists(ARQUIVO_SESSAO):
        raise RuntimeError(
            "Nenhuma sessão salva. Rode 'python login_lexdash.py' primeiro."
        )


def _checar_login(pagina):
    if "login" in pagina.url.lower() or pagina.locator("text=Login").count() > 0:
        raise RuntimeError(
            "Sessão expirada. Rode 'python login_lexdash.py' de novo."
        )


def _abrir_card_tarifas(pagina):
    """Clica no card 'Tarifas pendentes de cadastro' e seleciona filtro 'Definir Tarifa'."""
    seletores = [
        "text=Tarifas pendentes de cadastro",
        "text=Tarifas Pendentes de Cadastro",
    ]
    for sel in seletores:
        loc = pagina.locator(sel).first
        if loc.count() > 0:
            loc.click()
            pagina.wait_for_timeout(2000)
            break
    else:
        # Fallback: clica no 4º card da grade
        cards = pagina.locator(".card, [class*='card'], [class*='Card']").all()
        print(f"  (fallback) {len(cards)} cards encontrados, clicando no 4º")
        if len(cards) >= 4:
            cards[3].click()
            pagina.wait_for_timeout(2000)
        else:
            raise RuntimeError(
                "Não encontrei o card 'Tarifas pendentes de cadastro'. "
                "Verifique a estrutura da página com --debug."
            )

    # Seleciona "Definir Tarifa" no dropdown de filtro
    try:
        dropdown = pagina.locator("select").first
        if dropdown.count() > 0:
            dropdown.select_option(label="Definir Tarifa")
            print("  Filtro 'Definir Tarifa' selecionado.")
            pagina.wait_for_timeout(2000)
        else:
            # Dropdown customizado (não <select> nativo)
            filtro = pagina.locator("text=Definir Tarifa").first
            if filtro.count() > 0:
                filtro.click()
                pagina.wait_for_timeout(2000)
    except Exception as e:
        print(f"  ⚠️  Não consegui selecionar filtro: {e}")


def _ler_linhas_aguardando(pagina) -> list[dict]:
    """
    Lê as linhas da tabela expandida com status AGUARDANDO_TARIFA.
    Tenta várias estratégias de localização da tabela.
    """
    # Aguarda a tabela aparecer (até 10s)
    try:
        pagina.wait_for_selector("tr", timeout=10000)
    except PWTimeout:
        print("  ⚠️  Nenhuma tabela encontrada após clicar no card.")
        return []

    linhas = []
    rows = pagina.locator("tr").all()
    print(f"  {len(rows)} linhas de tabela encontradas no total.")

    # Debug: mostra o texto das primeiras 5 linhas pra diagnosticar
    for i, row in enumerate(rows[:5]):
        try:
            t = row.inner_text(timeout=2000).replace("\n", " | ").strip()
            print(f"  [debug] linha {i}: {t[:120]}")
        except Exception:
            pass

    for row in rows:
        try:
            texto = row.inner_text(timeout=2000)
        except Exception:
            continue

        # Aceita variações: com underline, com espaço, maiúsculas/minúsculas
        if not any(v in texto for v in ("AGUARDANDO_TARIFA", "AGUARDANDO TARIFA", "Aguardando Tarifa", "aguardando")):
            continue

        colunas = row.locator("td").all()
        n_cols = len(colunas)
        if n_cols < 6:
            continue

        try:
            # Ordem: Distribuidora | Mês Ref. | Modalidade | Vencimento | Status | GD2 | Usinas | Ação | Fatura
            distribuidora = colunas[0].inner_text(timeout=1000).strip()
            mes_ref       = colunas[1].inner_text(timeout=1000).strip()
            modalidade    = colunas[2].inner_text(timeout=1000).strip()
            gd2_texto     = colunas[5].inner_text(timeout=1000).strip() if n_cols > 5 else ""
            usinas        = colunas[6].inner_text(timeout=1000).strip() if n_cols > 6 else ""
            col_fatura    = colunas[-1]  # última coluna = Fatura
        except Exception as e:
            print(f"  ⚠️  Erro lendo colunas da linha: {e}")
            continue

        tipo_gd = "GD2" if gd2_texto.lower() in ("sim", "s", "true", "1", "yes", "x", "verdadeiro") else "GD1"

        linhas.append({
            "distribuidora": distribuidora,
            "mes_ref":       mes_ref,
            "modalidade":    modalidade,
            "tipo_gd":       tipo_gd,
            "usinas":        usinas,
            "col_fatura":    col_fatura,
        })

    return linhas


def _baixar_pdf(pagina, linha: dict, pasta: str) -> bytes | None:
    """
    Clica no ícone/link de fatura e retorna o conteúdo bytes do PDF.
    Tenta: download automático → nova aba → request direto.
    """
    col = linha["col_fatura"]
    nome_label = f"{linha['distribuidora']} {linha['mes_ref']}"

    # Procura um link <a> ou botão dentro da coluna fatura
    link_loc = col.locator("a").first
    btn_loc  = col.locator("button, [role='button']").first

    clicavel = link_loc if link_loc.count() > 0 else (btn_loc if btn_loc.count() > 0 else None)

    if clicavel is None:
        print(f"  ⚠️  Nenhum link/botão de fatura em: {nome_label}")
        return None

    # --- Tentativa 1: download direto via Playwright ---
    try:
        with pagina.expect_download(timeout=15000) as dl_info:
            clicavel.click()
        download = dl_info.value
        caminho_tmp = os.path.join(pasta, "__tmp_dl.pdf")
        download.save_as(caminho_tmp)
        with open(caminho_tmp, "rb") as f:
            dados = f.read()
        os.remove(caminho_tmp)
        return dados
    except PWTimeout:
        pass  # não iniciou download — pode abrir em nova aba
    except Exception as e:
        print(f"  ⚠️  Erro no download direto: {e}")

    # --- Tentativa 2: o link abre PDF em nova aba ---
    try:
        href = link_loc.get_attribute("href") if link_loc.count() > 0 else None
        if href and href.startswith("http"):
            resp = pagina.request.get(href)
            if resp.ok:
                return resp.body()
        elif href and href.startswith("/"):
            resp = pagina.request.get(f"https://crm-lex.energiacom.vc{href}")
            if resp.ok:
                return resp.body()
    except Exception as e:
        print(f"  ⚠️  Erro no request direto: {e}")

    # --- Tentativa 3: nova aba aberta ao clicar ---
    try:
        with pagina.context.expect_page(timeout=10000) as nova_info:
            clicavel.click()
        nova = nova_info.value
        nova.wait_for_load_state("networkidle", timeout=20000)
        url_nova = nova.url
        nova.close()
        if url_nova and url_nova.startswith("http"):
            resp = pagina.request.get(url_nova)
            if resp.ok:
                return resp.body()
    except Exception as e:
        print(f"  ⚠️  Erro aguardando nova aba: {e}")

    return None


def _salvar_pdf(dados: bytes, linha: dict, pasta: str) -> str:
    nome = (
        f"{linha['distribuidora'].replace(' ', '_')}"
        f"_{linha['mes_ref'].replace('/', '-')}"
        f"_{linha['modalidade'][:2].upper()}"
        f"_{linha['tipo_gd']}"
        f"_{int(time.time())}.pdf"
    )
    caminho = os.path.join(pasta, nome)
    with open(caminho, "wb") as f:
        f.write(dados)
    return caminho


def _extrair_e_salvar(caminho_pdf: str, linha: dict):
    """
    Chama extrator.extrair_fatura() do sistema tarifas/ e salva no banco.
    """
    extrator_path = os.path.join(TARIFAS_DIR, "extrator.py")
    db_path       = os.path.join(TARIFAS_DIR, "db.py")

    if not os.path.exists(extrator_path):
        print(f"  ⚠️  {extrator_path} não encontrado. Pulando extração.")
        return None

    # Carrega módulos do sistema tarifas
    sys.path.insert(0, TARIFAS_DIR)
    try:
        import extrator
        import db as tarifas_db
    except ImportError as e:
        print(f"  ⚠️  Erro importando módulo tarifas: {e}")
        return None
    finally:
        sys.path.pop(0)

    with open(caminho_pdf, "rb") as f:
        pdf_bytes = f.read()

    try:
        resultado = extrator.extrair_fatura(pdf_bytes)
    except Exception as e:
        print(f"  ❌ Extração falhou: {e}")
        return None

    # Injeta metadados do LexDash se não vieram na extração
    if not resultado.get("distribuidora"):
        resultado["distribuidora"] = linha["distribuidora"]
    if not resultado.get("modalidade"):
        resultado["modalidade"] = linha["modalidade"]
    if not resultado.get("tipo_gd"):
        resultado["tipo_gd"] = linha["tipo_gd"]

    try:
        tarifas_db.salvar_fatura(resultado)
        print(f"  ✓ Salvo no banco: tarifa_geracao={resultado.get('tarifa_geracao')}")
    except Exception as e:
        print(f"  ⚠️  Extração ok mas erro ao salvar no banco: {e}")
        print(f"     Resultado: {json.dumps(resultado, ensure_ascii=False)}")

    return resultado


# ---------------------------------------------------------------------------
# principal
# ---------------------------------------------------------------------------

def principal(dry_run=False, debug=False, sem_extracao=False):
    _checar_sessao()
    pasta_download = os.path.join(PASTA_BASE, time.strftime("%Y%m"))
    os.makedirs(pasta_download, exist_ok=True)
    print(f"Pasta de destino: {pasta_download}")

    with sync_playwright() as p:
        navegador = p.chromium.launch(headless=not debug, channel="chrome")
        contexto  = navegador.new_context(
            storage_state=ARQUIVO_SESSAO,
            accept_downloads=True,
        )
        pagina = contexto.new_page()

        print(f"Navegando para {URL_ATUALIZACOES} ...")
        pagina.goto(URL_ATUALIZACOES)
        pagina.wait_for_load_state("networkidle", timeout=30000)
        _checar_login(pagina)

        print("Abrindo card 'Atualizacao de tarifas usina'...")
        _abrir_card_tarifas(pagina)

        print("Lendo linhas com AGUARDANDO_TARIFA...")
        linhas = _ler_linhas_aguardando(pagina)

        if not linhas:
            print("✓ Nenhuma fatura AGUARDANDO_TARIFA no momento.")
            navegador.close()
            return []

        print(f"\n{'─'*60}")
        print(f"  {len(linhas)} fatura(s) pendente(s):\n")
        for i, l in enumerate(linhas, 1):
            print(
                f"  {i}. {l['distribuidora']} | {l['mes_ref']} | "
                f"{l['modalidade']} | {l['tipo_gd']} | {l['usinas']}"
            )
        print(f"{'─'*60}\n")

        if dry_run:
            print("[dry-run] Nenhum arquivo baixado.")
            navegador.close()
            return []

        resultados = []
        for linha in linhas:
            label = f"{linha['distribuidora']} {linha['mes_ref']}"
            print(f"► {label}")

            dados = _baixar_pdf(pagina, linha, pasta_download)
            if not dados:
                print(f"  ❌ Não foi possível baixar o PDF.")
                resultados.append({"linha": linha, "caminho": None, "extracao": None})
                continue

            caminho = _salvar_pdf(dados, linha, pasta_download)
            print(f"  ✓ PDF: {os.path.basename(caminho)}")

            extracao = None
            if not sem_extracao:
                print("  Extraindo tarifas com IA...")
                extracao = _extrair_e_salvar(caminho, linha)

            resultados.append({
                "linha":    linha,
                "caminho":  caminho,
                "extracao": extracao,
            })

        navegador.close()

        ok    = sum(1 for r in resultados if r["caminho"])
        extra = sum(1 for r in resultados if r["extracao"])
        print(f"\n{'='*60}")
        print(f"Concluído: {ok}/{len(resultados)} PDFs baixados, {extra} extraídos.")

        return resultados


if __name__ == "__main__":
    ap = argparse.ArgumentParser(
        description="Baixa e extrai faturas pendentes do LexDash"
    )
    ap.add_argument("--dry-run",      action="store_true", help="Só lista, não baixa")
    ap.add_argument("--debug",        action="store_true", help="Browser visível")
    ap.add_argument("--sem-extracao", action="store_true", help="Baixa PDFs, não extrai")
    args = ap.parse_args()

    try:
        principal(
            dry_run=args.dry_run,
            debug=args.debug,
            sem_extracao=args.sem_extracao,
        )
    except RuntimeError as e:
        print(f"Erro: {e}")
        sys.exit(1)
