#!/usr/bin/env python3
"""
gshock.py — TUDO EM UM: acha o Casio G-Shock, mapeia o protocolo e salva um log.

Feito pra rodar sozinho (só precisa da biblioteca `bleak`). O launcher GShock.bat
instala o bleak e chama este arquivo. O log fica na MESMA pasta deste arquivo.
"""
import asyncio
import datetime as dt
import pathlib
import sys

try:
    from bleak import BleakScanner, BleakClient
    from bleak.backends.characteristic import BleakGATTCharacteristic
except ImportError:
    print("A biblioteca 'bleak' não está instalada. Rode:  pip install bleak")
    sys.exit(1)

NAME_HINTS = ("CASIO", "GBD", "G-SHOCK", "GSHOCK", "G-SQUAD")

KNOWN = {
    "00001800-0000-1000-8000-00805f9b34fb": "Generic Access",
    "0000180a-0000-1000-8000-00805f9b34fb": "Device Information",
    "0000180d-0000-1000-8000-00805f9b34fb": "Heart Rate Service (PADRAO!)",
    "00002a37-0000-1000-8000-00805f9b34fb": "Heart Rate Measurement (BPM ao vivo!)",
    "0000180f-0000-1000-8000-00805f9b34fb": "Battery Service",
    "00002a19-0000-1000-8000-00805f9b34fb": "Battery Level",
    "26eb0000-b012-49a8-b1f8-394fb2032b0f": "Casio - servico proprietario (familia)",
}


def label(uuid: str) -> str:
    return KNOWN.get(uuid.lower(), "")


def now() -> str:
    return dt.datetime.now().strftime("%H:%M:%S.%f")[:-3]


def looks_like_watch(name) -> bool:
    if not name:
        return False
    up = name.upper()
    return any(h in up for h in NAME_HINTS)


async def find_watch(seconds=8.0):
    print(f"Escaneando por {seconds:.0f}s... (deixe o relogio em modo CONNECT)\n")
    devices = await BleakScanner.discover(timeout=seconds, return_adv=True)
    best = None
    for address, (dev, adv) in devices.items():
        name = dev.name or adv.local_name or ""
        mark = "->" if looks_like_watch(name) else "  "
        print(f"{mark} {address:<38} {name or '(sem nome)'}")
        if looks_like_watch(name) and best is None:
            best = (address, name)
    print()
    return best


async def recon(address, log, seconds=90.0):
    def on_notify(char: BleakGATTCharacteristic, data: bytearray):
        extra = label(char.uuid)
        tag = f" [{extra}]" if extra else ""
        log(f"{now()}  NOTIFY  {char.uuid}{tag}  ({len(data)}b)  {data.hex(' ')}")

    log("Conectando...")
    async with BleakClient(address) as client:
        log(f"Conectado: {client.is_connected}\n")
        log("===== SERVICOS E CARACTERISTICAS =====")
        notifiables, readables, found_hr = [], [], False
        for service in client.services:
            sl = label(service.uuid)
            log(f"\nServico {service.uuid} {('- ' + sl) if sl else ''}")
            for char in service.characteristics:
                cl = label(char.uuid)
                if "Heart Rate" in cl:
                    found_hr = True
                log(f"  Char {char.uuid}  [{','.join(char.properties)}] {('- ' + cl) if cl else ''}")
                if "notify" in char.properties or "indicate" in char.properties:
                    notifiables.append(char)
                if "read" in char.properties:
                    readables.append(char)

        log("\n===== LEITURAS UNICAS (read) =====")
        for char in readables:
            try:
                val = await client.read_gatt_char(char)
                pretty = val.hex(" ")
                try:
                    txt = val.decode("utf-8").strip()
                    if txt.isprintable():
                        pretty += f'   ("{txt}")'
                except Exception:
                    pass
                log(f"READ  {char.uuid} {('- ' + label(char.uuid)) if label(char.uuid) else ''}: {pretty}")
            except Exception as e:
                log(f"READ  {char.uuid}: falhou ({e})")

        log(f"\n===== ESCUTANDO por {seconds:.0f}s =====")
        log(">>> MEXA NO RELOGIO AGORA: modo batimentos, de passos, inicie/pare atividade <<<\n")
        subscribed = []
        for char in notifiables:
            try:
                await client.start_notify(char, on_notify)
                subscribed.append(char)
            except Exception as e:
                log(f"(nao consegui assinar {char.uuid}: {e})")
        try:
            await asyncio.sleep(seconds)
        finally:
            for char in subscribed:
                try:
                    await client.stop_notify(char)
                except Exception:
                    pass

    log("\n----------")
    if found_hr:
        log("OTIMO: o relogio expoe o Heart Rate padrao -> BPM ao vivo vai funcionar.")
    else:
        log("Nao vi o Heart Rate padrao. Ainda da pra ler pelo protocolo proprietario.")


async def main():
    here = pathlib.Path(__file__).resolve().parent
    logpath = here / f"recon-{dt.datetime.now():%Y%m%d-%H%M%S}.log"
    fh = open(logpath, "w", encoding="utf-8")

    def log(text):
        print(text)
        fh.write(text + "\n")
        fh.flush()

    log(f"# G-Shock recon — {dt.datetime.now():%Y-%m-%d %H:%M:%S}\n")
    watch = await find_watch()
    if not watch:
        log("Nao achei o relogio. Coloque em modo CONNECT, feche o app da Casio no")
        log("celular e rode de novo.")
        fh.close()
        return

    address, name = watch
    log(f"Relogio: {name}  ({address})\n")
    try:
        await recon(address, log)
    except Exception as e:
        log(f"\nErro ao conectar/mapear: {e}")
        log("Dica: feche o app da Casio no celular (ele pode estar segurando a conexao).")

    log(f"\nPronto! Log salvo em:\n{logpath}")
    fh.close()


if __name__ == "__main__":
    asyncio.run(main())
    try:
        input("\nAperte ENTER pra fechar...")
    except EOFError:
        pass
