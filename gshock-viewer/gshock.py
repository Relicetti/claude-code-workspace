#!/usr/bin/env python3
"""
gshock.py (v3) — init completo (envia a hora) e puxa os PASSOS do Casio GBD-H2000.

Só precisa de `bleak`. O GShock.bat instala e chama este arquivo.
Log salvo ao lado (recon-....log).

UUIDs confirmados (base ...-b012-49a8-b1f8-394fb2032b0f), ref. Gadgetbridge:
  002d ALL_FEATURES        -> escrever app-info + hora (o "aperto de mao")
  002c READ_REQUEST        -> pedir nome do relogio
  0023 DATA_REQUEST_SP     -> escrever o pedido de passos (00 11 00 00 00)
  0024 CONVOY              -> por onde os dados voltam (invertidos bit a bit)
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

BASE = "-b012-49a8-b1f8-394fb2032b0f"
def cu(s): return f"26eb{s}{BASE}"

ALL_FEATURES   = cu("002d")   # escrever hora/app-info; tambem notifica
READ_REQUEST   = cu("002c")   # pedir nome (write sem resposta)
DATA_REQUEST   = cu("0023")   # pedir passos; notifica
CONVOY         = cu("0024")   # dados voltam aqui; notifica
NOTIFY_CHARS   = [DATA_REQUEST, CONVOY, ALL_FEATURES]

FEATURE_CURRENT_TIME    = 0x09
FEATURE_APP_INFORMATION = 0x22
FEATURE_WATCH_NAME      = 0x23

STEP_REQUEST = bytes([0x00, 0x11, 0x00, 0x00, 0x00])
STEP_ACK     = bytes([0x04, 0x11, 0x00, 0x00, 0x00])

NAME_HINTS = ("CASIO", "GBD", "G-SHOCK", "GSHOCK", "G-SQUAD")


def now(): return dt.datetime.now().strftime("%H:%M:%S.%f")[:-3]
def looks_like_watch(n): return bool(n) and any(h in n.upper() for h in NAME_HINTS)
def invert(b): return bytes((~x) & 0xFF for x in b)


def current_time_payload():
    """[0x09] + 10 bytes no formato Current Time padrao do BLE (adjustReason=1)."""
    t = dt.datetime.now()
    y = t.year
    ten = bytes([y & 0xFF, (y >> 8) & 0xFF, t.month, t.day,
                 t.hour, t.minute, t.second, t.isoweekday(), 0x00, 0x01])
    return bytes([FEATURE_CURRENT_TIME]) + ten


def app_info_payload():
    return bytes([FEATURE_APP_INFORMATION, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0x02])


async def find_watch(seconds=8.0):
    print(f"Escaneando por {seconds:.0f}s...\n")
    devices = await BleakScanner.discover(timeout=seconds, return_adv=True)
    for address, (dev, adv) in devices.items():
        name = dev.name or adv.local_name or ""
        if looks_like_watch(name):
            print(f"-> {address}  {name}")
            return address, name
    return None


def try_parse_steps(raw, log):
    if len(raw) < 18:
        return False
    d = invert(raw)
    try:
        year, month, day = d[2] + 2000, d[3] + 1, d[4]
        hour, minute = d[5], d[6]
        steps = int.from_bytes(d[7:11], "little")
        steps = 0 if steps == 0xFFFFFFFE else steps
        cal = int.from_bytes(d[11:13], "little")
        cal = 0 if cal == 0xFFFE else cal
        status = d[17]
        log("\n*** DECODIFICADO ***")
        log(f"    Data:     {day:02d}/{month:02d}/{year} {hour:02d}:{minute:02d}")
        log(f"    PASSOS:   {steps}")
        log(f"    Calorias: {cal}")
        log(f"    status:   {status} (0=tem mais / 1=fim)")
        return 0 < steps < 200000  # sanidade
    except Exception as e:
        log(f"(nao decodificou: {e})")
        return False


async def wchar(client, uuid, data, log, response=True):
    try:
        await client.write_gatt_char(uuid, data, response=response)
        log(f"{now()}  WRITE  {uuid[4:8]}  {data.hex(' ')}")
        return True
    except Exception as e:
        log(f"{now()}  WRITE  {uuid[4:8]}  FALHOU: {e}")
        return False


async def main():
    here = pathlib.Path(__file__).resolve().parent
    logpath = here / f"recon-{dt.datetime.now():%Y%m%d-%H%M%S}.log"
    fh = open(logpath, "w", encoding="utf-8")
    def log(t): print(t); fh.write(t + "\n"); fh.flush()

    bufs = {u: bytearray() for u in NOTIFY_CHARS}
    def on_notify(char: BleakGATTCharacteristic, data: bytearray):
        u = char.uuid.lower()
        bufs.setdefault(u, bytearray()).extend(data)
        log(f"{now()}  NOTIFY {u[4:8]}  ({len(data)}b)  {data.hex(' ')}")

    log(f"# G-Shock init+passos v3 — {dt.datetime.now():%Y-%m-%d %H:%M:%S}\n")
    watch = await find_watch()
    if not watch:
        log("Nao achei o relogio. Modo CONNECT + feche o app da Casio no celular.")
        fh.close(); input("\nENTER pra fechar..."); return
    address, name = watch
    log(f"Relogio: {name}  ({address})\n")

    try:
        async with BleakClient(address) as client:
            log(f"Conectado: {client.is_connected}\n")
            for u in NOTIFY_CHARS:
                try:
                    await client.start_notify(u, on_notify)
                except Exception as e:
                    log(f"(assinar {u[4:8]} falhou: {e})")
            await asyncio.sleep(1.0)

            # ---- INIT (aperto de mao) ----
            log(">>> INIT: pedindo nome, enviando app-info e HORA")
            await wchar(client, READ_REQUEST, bytes([FEATURE_WATCH_NAME]), log, response=False)
            await asyncio.sleep(0.4)
            await wchar(client, ALL_FEATURES, app_info_payload(), log, response=True)
            await asyncio.sleep(0.4)
            await wchar(client, ALL_FEATURES, current_time_payload(), log, response=True)
            await asyncio.sleep(2.0)   # deixa o relogio processar / mandar 0x4701

            # ---- PEDIR PASSOS ----
            for u in bufs: bufs[u].clear()
            log("\n>>> Pedindo PASSOS em 0023")
            await wchar(client, DATA_REQUEST, STEP_REQUEST, log, response=True)
            await asyncio.sleep(6.0)   # espera o convoy chegar

            got = False
            for u, buf in bufs.items():
                if len(buf) >= 18:
                    log(f"\n-- tentando decodificar buffer {u[4:8]} ({len(buf)}b) --")
                    if try_parse_steps(bytes(buf), log):
                        got = True
            await wchar(client, DATA_REQUEST, STEP_ACK, log, response=True)

            if got:
                log("\n=== PASSOS OBTIDOS! ===")
            else:
                log("\nAinda sem passos decodificaveis. O log cru acima ja mostra o que o")
                log("relogio respondeu — manda pro chat que eu ajusto o parsing/sequencia.")

            log("\nEscutando +20s (mexa no relogio: batimentos/atividade)...")
            await asyncio.sleep(20.0)

    except Exception as e:
        log(f"\nErro: {e}")
        log("Dica: feche o app da Casio no celular; ele pode estar segurando a conexao.")

    log(f"\nLog salvo em:\n{logpath}")
    fh.close()
    try: input("\nENTER pra fechar...")
    except EOFError: pass


if __name__ == "__main__":
    asyncio.run(main())
