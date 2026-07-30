#!/usr/bin/env python3
"""
recon.py — mapeia o protocolo BLE do relógio (Fase 1, o PORTÃO).

O que faz:
  1. Conecta no relógio.
  2. Lista TODOS os serviços e características (com suas propriedades).
  3. Marca serviços/características conhecidos (padrão BLE e Casio).
  4. Assina todas as características "notify/indicate" e registra CADA byte que
     chegar, com hora — em tela e num arquivo de log.
  5. Tenta ler as características "read" uma vez.

Enquanto ele roda, MEXA no relógio pra provocar dados: entre no modo de
batimentos, dê alguns passos, inicie/pare uma atividade. Tudo que o relógio
enviar aparece no log — é assim que descobrimos o formato dos pacotes.

Uso:
    python recon.py --address <ENDEREÇO_DO_SCAN>
    python recon.py --address <ENDEREÇO> --seconds 120   # escuta por 2 min

Saída: bridge/logs/recon-YYYYmmdd-HHMMSS.log
"""
import argparse
import asyncio
import datetime as dt
import pathlib

from bleak import BleakClient
from bleak.backends.characteristic import BleakGATTCharacteristic

# --- Dicionário de UUIDs conhecidos, só pra facilitar a leitura do dump ---
# Padrão Bluetooth SIG (os que importam pro nosso objetivo de "ver dados"):
KNOWN = {
    "00001800-0000-1000-8000-00805f9b34fb": "Generic Access",
    "00001801-0000-1000-8000-00805f9b34fb": "Generic Attribute",
    "0000180a-0000-1000-8000-00805f9b34fb": "Device Information",
    "0000180d-0000-1000-8000-00805f9b34fb": "Heart Rate Service (PADRÃO!)",
    "00002a37-0000-1000-8000-00805f9b34fb": "Heart Rate Measurement (BPM ao vivo!)",
    "00002a38-0000-1000-8000-00805f9b34fb": "Body Sensor Location",
    "0000180f-0000-1000-8000-00805f9b34fb": "Battery Service",
    "00002a19-0000-1000-8000-00805f9b34fb": "Battery Level",
    "00001816-0000-1000-8000-00805f9b34fb": "Cycling Speed and Cadence",
    # Família Casio (base 2xxx / 26eb...). Referência: Gadgetbridge (Casio2C2A / GBX100).
    "26eb0000-b012-49a8-b1f8-394fb2032b0f": "Casio - serviço proprietário (família)",
}


def label(uuid: str) -> str:
    return KNOWN.get(uuid.lower(), "")


def now() -> str:
    return dt.datetime.now().strftime("%H:%M:%S.%f")[:-3]


class Logger:
    def __init__(self, path: pathlib.Path):
        self.path = path
        self.fh = open(path, "w", encoding="utf-8")

    def line(self, text: str) -> None:
        print(text)
        self.fh.write(text + "\n")
        self.fh.flush()

    def close(self) -> None:
        self.fh.close()


async def main(address: str, seconds: float) -> None:
    logdir = pathlib.Path(__file__).parent / "logs"
    logdir.mkdir(exist_ok=True)
    logpath = logdir / f"recon-{dt.datetime.now():%Y%m%d-%H%M%S}.log"
    log = Logger(logpath)
    log.line(f"# recon do relógio {address} — {dt.datetime.now():%Y-%m-%d %H:%M:%S}")

    def on_notify(char: BleakGATTCharacteristic, data: bytearray):
        hexs = data.hex(" ")
        extra = label(char.uuid)
        tag = f" [{extra}]" if extra else ""
        log.line(f"{now()}  NOTIFY  {char.uuid}{tag}  ({len(data)}b)  {hexs}")

    log.line("Conectando...")
    async with BleakClient(address) as client:
        log.line(f"Conectado: {client.is_connected}\n")

        # 1) Mapa completo de serviços e características
        log.line("===== SERVIÇOS E CARACTERÍSTICAS =====")
        notifiables = []
        readables = []
        for service in client.services:
            slabel = label(service.uuid)
            log.line(f"\nServiço {service.uuid} {('- ' + slabel) if slabel else ''}")
            for char in service.characteristics:
                props = ",".join(char.properties)
                clabel = label(char.uuid)
                log.line(f"  Char {char.uuid}  [{props}] {('- ' + clabel) if clabel else ''}")
                if "notify" in char.properties or "indicate" in char.properties:
                    notifiables.append(char)
                if "read" in char.properties:
                    readables.append(char)

        # 2) Lê uma vez tudo que for legível (Device Info, bateria, etc.)
        log.line("\n===== LEITURAS ÚNICAS (read) =====")
        for char in readables:
            try:
                val = await client.read_gatt_char(char)
                pretty = val.hex(" ")
                try:
                    ascii_ = val.decode("utf-8").strip()
                    if ascii_.isprintable():
                        pretty += f'   ("{ascii_}")'
                except Exception:
                    pass
                log.line(f"READ  {char.uuid} {('- ' + label(char.uuid)) if label(char.uuid) else ''}: {pretty}")
            except Exception as e:
                log.line(f"READ  {char.uuid}: falhou ({e})")

        # 3) Assina notificações e escuta
        log.line(f"\n===== ESCUTANDO NOTIFICAÇÕES por {seconds:.0f}s =====")
        log.line(">>> MEXA NO RELÓGIO AGORA: modo batimentos, dê passos, inicie/pare atividade <<<\n")
        subscribed = []
        for char in notifiables:
            try:
                await client.start_notify(char, on_notify)
                subscribed.append(char)
            except Exception as e:
                log.line(f"(não consegui assinar {char.uuid}: {e})")

        try:
            await asyncio.sleep(seconds)
        finally:
            for char in subscribed:
                try:
                    await client.stop_notify(char)
                except Exception:
                    pass

    log.line(f"\nPronto. Log salvo em: {logpath}")
    log.line("Procure no log: aparece 'Heart Rate Service (PADRÃO!)'? Então BPM ao vivo é fácil.")
    log.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Mapeia serviços/características BLE e registra os pacotes do relógio.")
    ap.add_argument("--address", required=True, help="Endereço do relógio (do scan.py).")
    ap.add_argument("--seconds", type=float, default=90.0, help="Tempo escutando notificações (padrão 90s).")
    args = ap.parse_args()
    asyncio.run(main(args.address, args.seconds))
