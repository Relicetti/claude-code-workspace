#!/usr/bin/env python3
"""
serve.py — sobe o painel web e (opcionalmente) o BPM AO VIVO do relógio.

Um comando só. Serve:
  • /                -> o painel (web/index.html)
  • /api/health      -> data/health.json (passos/sono/histórico já sincronizados)
  • /api/live        -> stream SSE com o BPM ao vivo (se conectado ao relógio)

Uso:
    python serve.py                         # só painel + dados já salvos
    python serve.py --address <ENDEREÇO>    # + conecta e transmite BPM ao vivo
    python serve.py --demo                  # BPM falso, pra testar o painel sem relógio

Depois abra no navegador:  http://localhost:8000
No iPhone (mesma rede Wi-Fi): http://<IP-DO-PC>:8000
Descubra o IP do PC: Windows `ipconfig` | Mac/Linux `ifconfig`/`ip addr`.
"""
import argparse
import asyncio
import json
import math
import pathlib
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DATA = ROOT / "data"

HR_MEASUREMENT_UUID = "00002a37-0000-1000-8000-00805f9b34fb"


class LiveState:
    """BPM ao vivo mais recente, compartilhado entre a thread BLE e o HTTP."""
    def __init__(self):
        self._lock = threading.Lock()
        self.bpm = 0
        self.updated = 0.0
        self.connected = False

    def set_bpm(self, bpm: int):
        with self._lock:
            self.bpm = bpm
            self.updated = time.time()

    def set_connected(self, ok: bool):
        with self._lock:
            self.connected = ok

    def snapshot(self) -> dict:
        with self._lock:
            fresh = (time.time() - self.updated) < 10 if self.updated else False
            return {"bpm": self.bpm if fresh else 0, "connected": self.connected, "fresh": fresh}


STATE = LiveState()


def load_health() -> dict:
    for name in ("health.json", "health.sample.json"):
        p = DATA / name
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    return {"days": [], "note": "Ainda sem dados. Rode sync.py depois de mapear o protocolo."}


def load_status() -> dict:
    for name in ("status.json", "status.sample.json"):
        p = DATA / name
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    return {"connected": False, "note": "Rode o status.py (GShock.bat) com o relógio por perto."}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # silencia o log ruidoso padrão
        pass

    def _send(self, code, ctype, body: bytes):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            f = WEB / "index.html"
            self._send(200, "text/html; charset=utf-8", f.read_bytes())
        elif self.path == "/api/health":
            self._send(200, "application/json; charset=utf-8",
                       json.dumps(load_health()).encode("utf-8"))
        elif self.path == "/api/status":
            self._send(200, "application/json; charset=utf-8",
                       json.dumps(load_status()).encode("utf-8"))
        elif self.path == "/api/live":
            self._stream_live()
        else:
            self._send(404, "text/plain", b"not found")

    def _stream_live(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            while True:
                snap = STATE.snapshot()
                payload = json.dumps(snap)
                self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
                self.wfile.flush()
                time.sleep(1)
        except (BrokenPipeError, ConnectionResetError):
            pass  # cliente fechou a aba — normal


# ---------------- BLE ao vivo (thread separada) ----------------
async def _ble_live(address: str):
    from bleak import BleakClient  # import tardio: só precisa se for usar o relógio
    from decoders import parse_heart_rate_measurement

    def on_hr(_char, data: bytearray):
        hr = parse_heart_rate_measurement(bytes(data))
        if hr.bpm > 0:
            STATE.set_bpm(hr.bpm)

    while True:
        try:
            print(f"[ble] conectando em {address}...")
            async with BleakClient(address) as client:
                STATE.set_connected(True)
                print("[ble] conectado. Coloque o relógio no modo de batimentos.")
                await client.start_notify(HR_MEASUREMENT_UUID, on_hr)
                while client.is_connected:
                    await asyncio.sleep(1)
        except Exception as e:
            print(f"[ble] desconectado ({e}). Tentando de novo em 5s...")
        STATE.set_connected(False)
        await asyncio.sleep(5)


def _ble_thread(address: str):
    asyncio.run(_ble_live(address))


def _demo_thread():
    """BPM sintético (repouso ~68, sobe e desce) pra testar o painel sem relógio."""
    STATE.set_connected(True)
    t = 0.0
    while True:
        bpm = int(72 + 18 * math.sin(t / 6) + 4 * math.sin(t / 1.3))
        STATE.set_bpm(bpm)
        t += 1
        time.sleep(1)


def main():
    ap = argparse.ArgumentParser(description="Serve o painel + BPM ao vivo.")
    ap.add_argument("--address", help="Endereço do relógio pra BPM ao vivo.")
    ap.add_argument("--demo", action="store_true", help="BPM falso pra testar o painel.")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    if args.demo:
        threading.Thread(target=_demo_thread, daemon=True).start()
        print("[demo] gerando BPM falso.")
    elif args.address:
        threading.Thread(target=_ble_thread, args=(args.address,), daemon=True).start()

    srv = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    print(f"\nPainel no ar:  http://localhost:{args.port}")
    print(f"No iPhone (mesma rede):  http://<IP-DO-PC>:{args.port}\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrado.")


if __name__ == "__main__":
    main()
