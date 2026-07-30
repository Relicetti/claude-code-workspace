#!/usr/bin/env python3
"""
gshock.py (v5) — máquina de estados reativa do init Casio + puxa PASSOS.

Novidade vs v4: durante a cadeia de init, o app precisa ESCREVER de volta 3
configs (BLE settings, advertising params, connection params). Só depois disso o
relógio dispara 0x4701 pedindo a hora e libera os dados. Ref.: Gadgetbridge
gbx100/InitOperation (bytes exatos das escritas).

Só precisa de `bleak`. Log salvo ao lado (recon-....log).
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

# escritas fixas de config (bytes exatos do Gadgetbridge)
ADV_PARAMS  = bytes([0x3b,0x50,0x00,0x0a,0x40,0x01,0x05,0x05,0x40,0x06,
                     0x0a,0x02,0xa0,0x00,0x05,0x40,0x01,0x05,0x1c,0x00])
CONN_PARAMS = bytes([0x3a,0x00,0x34,0x01,0x40,0x01,0x04,0x00,0xdc,0x05])
APP_INFO    = bytes([0x22,0,1,2,3,4,5,6,7,8,9,0x02])
ALL_FEAT_INIT = bytes([0x00, 0x01])

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
    return bytes([0x09]) + ten

def ble_settings_from(data: bytes):
    d = bytearray(data)
    if len(d) >= 14:
        d[12] = 0x80; d[13] = 0x1e
    return bytes(d)


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


async def main():
    here = pathlib.Path(__file__).resolve().parent
    logpath = here / f"recon-{dt.datetime.now():%Y%m%d-%H%M%S}.log"
    fh = open(logpath, "w", encoding="utf-8")
    def log(t): print(t); fh.write(t + "\n"); fh.flush()

    log(f"# G-Shock init reativo v5 — {dt.datetime.now():%Y-%m-%d %H:%M:%S}\n")
    watch = await find_watch()
    if not watch:
        log("Nao achei o relogio. Modo CONNECT + feche o app da Casio no celular.")
        fh.close(); input("\nENTER pra fechar..."); return
    address, name = watch
    log(f"Relogio: {name}  ({address})\n")

    loop = asyncio.get_running_loop()
    events = asyncio.Queue()
    convoy = bytearray()
    sp_buf = bytearray()

    def on_notify(char: BleakGATTCharacteristic, data: bytearray):
        loop.call_soon_threadsafe(events.put_nowait, (char.uuid.lower(), bytes(data)))

    try:
        async with BleakClient(address) as client:
            log(f"Conectado: {client.is_connected}\n")
            for u in NOTIFY_CHARS:
                try: await client.start_notify(u, on_notify)
                except Exception as e: log(f"(assinar {u[4:8]} falhou: {e})")
            await asyncio.sleep(1.0)

            async def W(uuid, payload, resp=True):
                try:
                    await client.write_gatt_char(uuid, payload, response=resp)
                    log(f"{now()}  WRITE  {uuid[4:8]}  {payload.hex(' ')}")
                except Exception as e:
                    log(f"{now()}  WRITE  {uuid[4:8]}  FALHOU: {e}")
            async def REQ(feat):  # pede uma feature
                await W(READ_REQUEST, bytes([feat]), resp=False)

            # dispara o init pedindo o nome
            log(">>> INIT: pedindo nome")
            await REQ(0x23)

            init_done = False
            time_sent = False
            step_phase = False
            dst_seen_at = None

            deadline = loop.time() + 55
            while loop.time() < deadline:
                try:
                    uuid, data = await asyncio.wait_for(events.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    # sem evento por 1s: trata travadas
                    if dst_seen_at and not init_done and not time_sent:
                        idle = loop.time() - dst_seen_at
                        if idle > 4:
                            log(">>> relogio nao pediu a hora; enviando init+hora manualmente")
                            await W(ALL_FEATURES, ALL_FEAT_INIT)
                            await W(ALL_FEATURES, current_time_payload())
                            time_sent = True
                            init_done = True   # segue pro fetch
                    continue

                short = uuid[4:8]
                if uuid == ALL_FEATURES and data:
                    fid = data[0]
                    log(f"{now()}  NOTIFY {short} ({len(data)}b) {data.hex(' ')}  feature=0x{fid:02x}")
                    if fid == 0x23:
                        await W(ALL_FEATURES, APP_INFO); await REQ(0x10)
                    elif fid == 0x10:
                        await REQ(0x11)
                    elif fid == 0x11:
                        await W(ALL_FEATURES, ble_settings_from(data)); await REQ(0x3b)
                    elif fid == 0x3b:
                        await W(ALL_FEATURES, ADV_PARAMS); await REQ(0x3a)
                    elif fid == 0x3a:
                        await W(ALL_FEATURES, CONN_PARAMS); await REQ(0x26)
                    elif fid == 0x26:
                        await REQ(0x28)
                    elif fid == 0x28:
                        await REQ(0x20)
                    elif fid == 0x20:
                        await REQ(0x1d)
                    elif fid == 0x1d:
                        await REQ(0x1e)
                    elif fid == 0x1e:
                        dst_seen_at = loop.time()
                        log(">>> cadeia de config concluida; aguardando 0x47 (pedido de hora)")
                    elif fid == 0x47:
                        if len(data) >= 2 and data[1] == 0x02:
                            log(">>> relogio PEDIU A HORA -> enviando hora + init")
                            await W(ALL_FEATURES, current_time_payload())
                            await W(ALL_FEATURES, ALL_FEAT_INIT)
                            time_sent = True
                        elif len(data) >= 2 and data[1] == 0x01:
                            init_done = True
                    elif fid == 0x3d:
                        init_done = True
                elif uuid == CONVOY:
                    convoy.extend(data)
                    log(f"{now()}  NOTIFY {short} ({len(data)}b) {data.hex(' ')}  [CONVOY]")
                elif uuid == DATA_REQUEST:
                    sp_buf.extend(data)
                    log(f"{now()}  NOTIFY {short} ({len(data)}b) {data.hex(' ')}  [DATA_REQ]")

                # quando init concluir, pede os passos (uma vez)
                if init_done and not step_phase:
                    step_phase = True
                    convoy.clear(); sp_buf.clear()
                    log("\n>>> INIT ok — pedindo PASSOS em 0023")
                    await W(DATA_REQUEST, STEP_REQUEST)
                    # coleta convoy por ~6s
                    async def collect():
                        await asyncio.sleep(6.0)
                    end = loop.time() + 6
                    while loop.time() < end:
                        try:
                            uuid2, data2 = await asyncio.wait_for(events.get(), timeout=0.5)
                            s2 = uuid2[4:8]
                            if uuid2 == CONVOY:
                                convoy.extend(data2); log(f"{now()}  NOTIFY {s2} ({len(data2)}b) {data2.hex(' ')}  [CONVOY]")
                            elif uuid2 == DATA_REQUEST:
                                sp_buf.extend(data2); log(f"{now()}  NOTIFY {s2} ({len(data2)}b) {data2.hex(' ')}  [DATA_REQ]")
                            else:
                                log(f"{now()}  NOTIFY {s2} ({len(data2)}b) {data2.hex(' ')}")
                        except asyncio.TimeoutError:
                            pass
                    await W(DATA_REQUEST, STEP_ACK)
                    break

            # tenta decodificar
            got = False
            for label_, buf in (("CONVOY", convoy), ("DATA_REQ", sp_buf)):
                if len(buf) >= 18:
                    log(f"\n-- decodificando {label_} ({len(buf)}b) --")
                    if try_parse_steps(bytes(buf), log): got = True
            log("\n=== PASSOS OBTIDOS! ===" if got else
                "\nAinda sem passos decodificaveis. Manda o log que eu ajusto o ultimo detalhe.")

            log("\nEscutando +15s (mexa no relogio)...")
            t_end = loop.time() + 15
            while loop.time() < t_end:
                try:
                    uuid3, data3 = await asyncio.wait_for(events.get(), timeout=1.0)
                    log(f"{now()}  NOTIFY {uuid3[4:8]} ({len(data3)}b) {data3.hex(' ')}")
                except asyncio.TimeoutError:
                    pass

    except Exception as e:
        log(f"\nErro: {e}")
        log("Dica: feche o app da Casio no celular; ele pode estar segurando a conexao.")

    log(f"\nLog salvo em:\n{logpath}")
    fh.close()
    try: input("\nENTER pra fechar...")
    except EOFError: pass


if __name__ == "__main__":
    asyncio.run(main())
