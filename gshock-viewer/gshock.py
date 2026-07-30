#!/usr/bin/env python3
"""
gshock.py (v4) — init REATIVO (responde a hora quando o relogio pede) e puxa PASSOS.

O protocolo Casio e reativo: a gente pede o nome, o relogio conduz uma sequencia de
"features" e, quando manda 0x47 0x02, esta pedindo a HORA. Ai respondemos com a hora
e ele libera os dados. Ref.: Gadgetbridge gbx100/InitOperation.

Só precisa de `bleak`. Log salvo ao lado (recon-....log).

UUIDs (base ...-b012-49a8-b1f8-394fb2032b0f):
  002d ALL_FEATURES   (escrever app-info + hora; e por onde as features respondem)
  002c READ_REQUEST   (pedir features: nome, versao, etc.)
  0023 DATA_REQUEST_SP (pedir passos)
  0024 CONVOY          (dados dos passos voltam aqui, invertidos bit a bit)
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
ALL_FEATURES = cu("002d")
READ_REQUEST = cu("002c")
DATA_REQUEST = cu("0023")
CONVOY       = cu("0024")
NOTIFY_CHARS = [DATA_REQUEST, CONVOY, ALL_FEATURES]

FEATURE_CURRENT_TIME    = 0x09
FEATURE_APP_INFORMATION = 0x22
FEATURE_WATCH_NAME      = 0x23
FEATURE_SERVICE_DISCOVERY = 0x47
# cadeia de features que o app pede durante o init (so leitura, sem escrever config):
INIT_CHAIN = [0x10, 0x11, 0x3b, 0x3a, 0x26, 0x28, 0x20, 0x1d, 0x1e]

STEP_REQUEST = bytes([0x00, 0x11, 0x00, 0x00, 0x00])
STEP_ACK     = bytes([0x04, 0x11, 0x00, 0x00, 0x00])
NAME_HINTS = ("CASIO", "GBD", "G-SHOCK", "GSHOCK", "G-SQUAD")


def now(): return dt.datetime.now().strftime("%H:%M:%S.%f")[:-3]
def looks_like_watch(n): return bool(n) and any(h in n.upper() for h in NAME_HINTS)
def invert(b): return bytes((~x) & 0xFF for x in b)


def current_time_payload():
    t = dt.datetime.now(); y = t.year
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
    if len(raw) < 18: return False
    d = invert(raw)
    try:
        year, month, day = d[2] + 2000, d[3] + 1, d[4]
        hour, minute = d[5], d[6]
        steps = int.from_bytes(d[7:11], "little"); steps = 0 if steps == 0xFFFFFFFE else steps
        cal = int.from_bytes(d[11:13], "little"); cal = 0 if cal == 0xFFFE else cal
        log("\n*** DECODIFICADO ***")
        log(f"    Data:     {day:02d}/{month:02d}/{year} {hour:02d}:{minute:02d}")
        log(f"    PASSOS:   {steps}")
        log(f"    Calorias: {cal}")
        log(f"    status:   {d[17]} (0=tem mais / 1=fim)")
        return 0 < steps < 300000
    except Exception as e:
        log(f"(nao decodificou: {e})"); return False


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
    state = {"want_time": False, "init_done": False, "time_sent": False}

    def on_notify(char: BleakGATTCharacteristic, data: bytearray):
        u = char.uuid.lower()
        bufs.setdefault(u, bytearray()).extend(data)
        tag = ""
        if u == ALL_FEATURES and len(data) >= 1:
            fid = data[0]
            tag = f"  feature=0x{fid:02x}"
            if fid == FEATURE_SERVICE_DISCOVERY and len(data) >= 2:
                if data[1] == 0x02:
                    state["want_time"] = True   # relogio PEDIU a hora
                    tag += " (PEDIU A HORA!)"
                elif data[1] == 0x01:
                    state["init_done"] = True
                    tag += " (init ok)"
            if fid == 0x3d:
                state["init_done"] = True
        log(f"{now()}  NOTIFY {u[4:8]}  ({len(data)}b)  {data.hex(' ')}{tag}")

    log(f"# G-Shock init reativo v4 — {dt.datetime.now():%Y-%m-%d %H:%M:%S}\n")
    watch = await find_watch()
    if not watch:
        log("Nao achei o relogio. Modo CONNECT + feche o app da Casio no celular.")
        fh.close(); input("\nENTER pra fechar..."); return
    address, name = watch
    log(f"Relogio: {name}  ({address})\n")

    async def maybe_send_time(client):
        if state["want_time"] and not state["time_sent"]:
            state["time_sent"] = True
            log(">>> relogio pediu a HORA -> enviando")
            await wchar(client, ALL_FEATURES, current_time_payload(), log, response=True)

    try:
        async with BleakClient(address) as client:
            log(f"Conectado: {client.is_connected}\n")
            for u in NOTIFY_CHARS:
                try: await client.start_notify(u, on_notify)
                except Exception as e: log(f"(assinar {u[4:8]} falhou: {e})")
            await asyncio.sleep(1.0)

            # ---- INIT reativo ----
            log(">>> INIT: pedindo nome do relogio")
            await wchar(client, READ_REQUEST, bytes([FEATURE_WATCH_NAME]), log, response=False)
            await asyncio.sleep(0.6)
            log(">>> enviando app-info")
            await wchar(client, ALL_FEATURES, app_info_payload(), log, response=True)
            await asyncio.sleep(0.6)

            # percorre a cadeia de features (so leitura), respondendo a hora quando pedida
            log(">>> percorrendo a cadeia de features do init")
            for feat in INIT_CHAIN:
                await wchar(client, READ_REQUEST, bytes([feat]), log, response=False)
                await asyncio.sleep(0.7)
                await maybe_send_time(client)

            # espera ate ~10s o relogio pedir a hora / concluir init
            log(">>> aguardando o relogio pedir a hora / concluir init")
            for _ in range(50):
                await maybe_send_time(client)
                if state["init_done"]:
                    log(">>> INIT concluido"); break
                await asyncio.sleep(0.2)

            # se ele nunca pediu, manda a hora mesmo assim
            if not state["time_sent"]:
                log(">>> relogio nao pediu a hora; enviando mesmo assim")
                await wchar(client, ALL_FEATURES, current_time_payload(), log, response=True)
                await asyncio.sleep(1.5)

            # ---- PEDIR PASSOS ----
            for u in bufs: bufs[u].clear()
            log("\n>>> Pedindo PASSOS em 0023")
            await wchar(client, DATA_REQUEST, STEP_REQUEST, log, response=True)
            await asyncio.sleep(6.0)

            got = False
            for u, buf in bufs.items():
                if len(buf) >= 18:
                    log(f"\n-- decodificando buffer {u[4:8]} ({len(buf)}b) --")
                    if try_parse_steps(bytes(buf), log): got = True
            await wchar(client, DATA_REQUEST, STEP_ACK, log, response=True)

            log("\n=== PASSOS OBTIDOS! ===" if got else
                "\nAinda sem passos. O log cru acima mostra a conversa — manda pro chat.")

            log("\nEscutando +20s (mexa no relogio)...")
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
