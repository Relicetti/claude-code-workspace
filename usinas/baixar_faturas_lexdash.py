"""
Automação: busca faturas pendentes no LexDash (Atualizações > Tarifas pendentes de cadastro),
filtra as que têm status AGUARDANDO_TARIFA, baixa o PDF de cada uma, extrai as tarifas
via sistema tarifas/ e envia para fila de revisão no app.

Pré-requisito: rodar login_lexdash.py pelo menos uma vez pra salvar a sessão.

Uso:
    python baixar_faturas_lexdash.py [--dry-run] [--debug] [--sem-extracao]

Flags:
    --dry-run       Lista as faturas encontradas mas não baixa nem extrai.
    --debug         Roda com browser visível (útil pra depurar seletores).
    --sem-extracao  Baixa os PDFs mas não extrai nem envia para revisão.

Variáveis de ambiente:
    TARIFAS_API_URL  URL do app de tarifas (default: http://localhost:5001)
    ADMIN_TOKEN      Token de admin (se configurado no app)
"""
import argparse
import importlib.util
import json
import os
import sys
import time

import requests
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

URL_ATUALIZACOES = "https://crm-lex.energiacom.vc/fatger/atualizacao-fat"
ARQUIVO_SESSAO   = os.path.join(os.path.dirname(__file__), "lexdash_session.json")
PASTA_BASE = r"D:\Alexandria\OneDrive - Alexandria Industria de Geradores SA\Calculos Tarifas"

# Caminho pro sistema de tarifas (um nível acima de usinas/)
TARIFAS_DIR     = os.path.join(os.path.dirname(__file__), "..", "tarifas")

# Carrega .env do projeto tarifas (necessário pra ANTHROPIC_API_KEY quando rodado manualmente)
_env_path = os.path.join(TARIFAS_DIR, ".env")
if os.path.exists(_env_path):
    with open(_env_path, encoding="utf-8") as _f:
        for _linha in _f:
            _linha = _linha.strip()
            if _linha and not _linha.startswith("#") and "=" in _linha:
                _k, _v = _linha.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

TARIFAS_API_URL = os.environ.get("TARIFAS_API_URL", "https://alexandria-tarifas-production.up.railway.app")
ADMIN_TOKEN     = os.environ.get("ADMIN_TOKEN", "")

_MESES_PT = {
    "jan": "01", "fev": "02", "mar": "03", "abr": "04",
    "mai": "05", "jun": "06", "jul": "07", "ago": "08",
    "set": "09", "out": "10", "nov": "11", "dez": "12",
}

def _mes_para_lex(mes_ref: str) -> str:
    """'ago. de 2026' → '08-2026'"""
    partes = mes_ref.lower().replace(".", "").split()
    for p in partes:
        if p[:3] in _MESES_PT:
            mes = _MESES_PT[p[:3]]
            ano = next((x for x in partes if len(x) == 4 and x.isdigit()), None)
            if ano:
                return f"{mes}-{ano}"
    return mes_ref


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
    # Aguarda o "Carregando..." sumir e dados aparecerem (até 20s)
    try:
        pagina.wait_for_function(
            "() => !document.body.innerText.includes('Carregando...')",
            timeout=20000,
        )
    except PWTimeout:
        pass  # continua mesmo assim

    try:
        pagina.wait_for_selector("tr td", timeout=10000)
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


def _extrair_fatura(caminho_pdf: str) -> dict | None:
    """Chama extrator.extrair_fatura() e retorna o dict com os campos extraídos."""
    extrator_path = os.path.join(TARIFAS_DIR, "extrator.py")
    if not os.path.exists(extrator_path):
        print(f"  ⚠️  extrator.py não encontrado. Pulando extração.")
        return None
    sys.path.insert(0, TARIFAS_DIR)
    try:
        import extrator
    except ImportError as e:
        print(f"  ⚠️  Erro importando extrator: {e}")
        return None
    finally:
        sys.path.pop(0)
    with open(caminho_pdf, "rb") as f:
        pdf_bytes = f.read()
    try:
        return extrator.extrair_fatura(pdf_bytes)
    except Exception as e:
        print(f"  ❌ Extração falhou: {e}")
        return None


def _enviar_para_revisao(linha: dict, extracao: dict | None, caminho_pdf: str) -> bool:
    """Envia fatura extraída para a fila de revisão no app de tarifas."""
    usinas_raw = linha.get("usinas", "")
    # Normaliza para lista JSON
    usinas_list = [u.strip() for u in str(usinas_raw).split(",") if u.strip()]

    payload = {
        "distribuidora":  linha["distribuidora"],
        "mes_ref":        linha["mes_ref"],
        "mes_lex":        _mes_para_lex(linha["mes_ref"]),
        "modalidade":     linha["modalidade"],
        "tipo_gd":        linha["tipo_gd"],
        "usinas":         json.dumps(usinas_list),
        # extrator retorna tarifa_distribuidora_input = tarifa de geração (R$/kWh)
        "tarifa_geracao": extracao.get("tarifa_distribuidora_input") if extracao else None,
        "tarifa_dist":    extracao.get("tarifa_distribuidora_input") if extracao else None,
        "tarifa_comp":    extracao.get("tarifa_compensada_input") if extracao else None,
        "pdf_path":       caminho_pdf,
    }

    headers = {"Content-Type": "application/json"}
    if ADMIN_TOKEN:
        headers["X-Admin-Token"] = ADMIN_TOKEN

    try:
        resp = requests.post(
            f"{TARIFAS_API_URL}/api/pendentes/add",
            json=[payload],
            headers=headers,
            timeout=15,
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"  ⚠️  Erro ao enviar para revisão: {e}")
        return False


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
        pagina.wait_for_load_state("domcontentloaded", timeout=30000)
        pagina.wait_for_timeout(2000)  # aguarda JS inicial
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
            enviado  = False
            if not sem_extracao:
                print("  Extraindo tarifas com IA...")
                extracao = _extrair_fatura(caminho)
                if extracao:
                    tg = extracao.get("tarifa_geracao")
                    print(f"  ✓ Extração OK: tarifa_geracao={tg}")
                print("  Enviando para fila de revisão...")
                enviado = _enviar_para_revisao(linha, extracao, caminho)
                if enviado:
                    print(f"  ✓ Enviado para {TARIFAS_API_URL}/revisar")

            resultados.append({
                "linha":    linha,
                "caminho":  caminho,
                "extracao": extracao,
                "enviado":  enviado,
            })

        navegador.close()

        ok      = sum(1 for r in resultados if r["caminho"])
        extra   = sum(1 for r in resultados if r.get("extracao"))
        enviado = sum(1 for r in resultados if r.get("enviado"))
        print(f"\n{'='*60}")
        print(f"Concluído: {ok}/{len(resultados)} PDFs baixados, {extra} extraídos, {enviado} enviados para revisão.")
        if enviado:
            print(f"Acesse {TARIFAS_API_URL}/revisar para aprovar.")

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
