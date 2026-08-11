"""
Agente local: fica rodando em background e monitora o app Railway.
Quando o botão "Iniciar Download" é clicado no app, este agente detecta
e executa baixar_faturas_lexdash.py automaticamente.

Uso:
    python agente_local.py

Deixe rodando numa janela do terminal. Verifica a cada 2 minutos.
"""
import io
import os
import subprocess
import sys
import time

import requests

# Redireciona stdout/stderr para o arquivo de log (garante flush mesmo via VBS/Startup)
_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agente_local.log")
_log_file = open(_LOG_PATH, "a", encoding="utf-8", buffering=1)
sys.stdout = _log_file
sys.stderr = _log_file

TARIFAS_API_URL = os.environ.get(
    "TARIFAS_API_URL",
    "https://alexandria-tarifas-production.up.railway.app"
)
ADMIN_TOKEN  = os.environ.get("ADMIN_TOKEN", "")
INTERVALO    = 30    # segundos entre verificações
SCRIPT_DIR   = os.path.dirname(__file__)
SCRIPT_BAIXAR = os.path.join(SCRIPT_DIR, "baixar_faturas_lexdash.py")

_ultimo_trigger = None


def _headers():
    h = {}
    if ADMIN_TOKEN:
        h["X-Admin-Token"] = ADMIN_TOKEN
    return h


def _checar_trigger() -> str | None:
    """Retorna o valor do trigger se for novo, senão None."""
    global _ultimo_trigger
    try:
        resp = requests.get(
            f"{TARIFAS_API_URL}/api/trigger-download/status",
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        trigger = resp.json().get("trigger")
        if trigger and trigger != _ultimo_trigger:
            _ultimo_trigger = trigger
            return trigger
    except Exception as e:
        print(f"  ⚠️  Erro ao checar trigger: {e}")
    return None


def _carregar_env() -> dict:
    """Carrega variáveis do .env do projeto tarifas."""
    env = os.environ.copy()
    env_path = os.path.join(SCRIPT_DIR, "..", "tarifas", ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for linha in f:
                linha = linha.strip()
                if linha and not linha.startswith("#") and "=" in linha:
                    chave, valor = linha.split("=", 1)
                    env[chave.strip()] = valor.strip()
    return env


def _executar_download():
    print("▶ Iniciando baixar_faturas_lexdash.py ...")
    resultado = subprocess.run(
        [sys.executable, SCRIPT_BAIXAR],
        cwd=SCRIPT_DIR,
        env=_carregar_env(),
    )
    if resultado.returncode == 0:
        print("✓ Download concluído com sucesso.")
    else:
        print(f"❌ Script encerrou com código {resultado.returncode}.")


def principal():
    print(f"Agente local iniciado. Monitorando {TARIFAS_API_URL} a cada {INTERVALO}s.")
    print("Pressione Ctrl+C para parar.\n")

    # Inicializa _ultimo_trigger com o valor atual (ignora triggers antigos)
    global _ultimo_trigger
    try:
        resp = requests.get(
            f"{TARIFAS_API_URL}/api/trigger-download/status",
            headers=_headers(),
            timeout=10,
        )
        _ultimo_trigger = resp.json().get("trigger")
        print(f"  Trigger atual ignorado: {_ultimo_trigger}")
    except Exception:
        pass

    while True:
        trigger = _checar_trigger()
        if trigger:
            print(f"\n🔔 Trigger recebido ({trigger})")
            _executar_download()
            print()
        else:
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] Aguardando... (próxima verificação em {INTERVALO}s)", end="\r")
        time.sleep(INTERVALO)


if __name__ == "__main__":
    try:
        principal()
    except KeyboardInterrupt:
        print("\nAgente encerrado.")
