#!/usr/bin/env python3
"""
status.py — le o status do Casio GBD-H2000 e ACERTA A HORA (o que funciona 100%).

Faz o handshake de features (que testamos e funciona), captura modelo/firmware/
condicao, sincroniza a hora do relogio e grava data/status.json (o painel le isso).

Só precisa de `bleak`. Roda pelo GShock.bat (ou: python status.py).
"""
import asyncio
import datetime as dt
import json
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
NOTIFY_CHARS = [cu("0023"), cu("0024"), ALL_FEATURES]

ADV_PARAMS  = bytes([0x3b,0x50,0x00,0x0a,0x40,0x01,0x05,0x05,0x40,0x06,
                     0x0a,0x02,0xa0,0x00,0x05,0x40,0x01,0x05,0x1c,0x00])
CONN_PARAMS = bytes([0x3a,0x00,0x34,0x01,0x40,0x01,0x04,0x00,0xdc,0x05])
APP_INFO    = bytes([0x22,0,1,2,3,4,5,6,7,8,9,0x02])
NAME_HINTS = ("CASIO", "GBD", "G-SHOCK", "GSHOCK", "G-SQUAD")
DATA = pathlib.Path(__file__).resolve().parent / "data"


def looks_like_watch(n): return bool(n) and any(h in n.upper() for h in NAME_HINTS)

def current_time_payload():
    t = dt.datetime.now(); y = t.year
    ten = bytes([y & 0xFF, (y >> 8) & 0xFF, t.month, t.day,
                 t.hour, t.minute, t.second, t.isoweekday(), 0x00, 0x01])
    return bytes([0x09]) + ten

def ble_settings_from(data: bytes):
    d = bytearray(data)
    if len(d) >= 14: d[12] = 0x80; d[13] = 0x1e
    return bytes(d)


async def find_watch(seconds=8.0):
    print(f"Escaneando por {seconds:.0f}s...")
    devices = await BleakScanner.discover(timeout=seconds, return_adv=True)
    for address, (dev, adv) in devices.items():
        name = dev.name or adv.local_name or ""
        if looks_like_watch(name):
            print(f"-> {address}  {name}")
            return address, name
    return None


def write_status(d: dict):
    DATA.mkdir(exist_ok=True)
    (DATA / "status.json").write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")


async def main():
    watch = await find_watch()
    if not watch:
        print("Nao achei o relogio. Coloque em modo CONNECT e feche o app da Casio no celular.")
        input("\nENTER pra fechar..."); return
    address, name = watch

    feats = {}   # feature id -> bytes
    loop = asyncio.get_running_loop()
    events = asyncio.Queue()
    def on_notify(char: BleakGATTCharacteristic, data: bytearray):
        loop.call_soon_threadsafe(events.put_nowait, (char.uuid.lower(), bytes(data)))

    try:
        async with BleakClient(address) as client:
            print(f"Conectado: {client.is_connected}")
            for u in NOTIFY_CHARS:
                try: await client.start_notify(u, on_notify)
                except Exception: pass
            await asyncio.sleep(1.0)

            async def W(uuid, payload, resp=True):
                try: await client.write_gatt_char(uuid, payload, response=resp)
                except Exception as e: print(f"  (write {uuid[4:8]} falhou: {e})")
            async def REQ(feat): await W(READ_REQUEST, bytes([feat]), resp=False)

            # roda a cadeia de features (mesma do init) capturando as respostas
            await REQ(0x23)
            time_synced = False
            deadline = loop.time() + 20
            while loop.time() < deadline:
                try:
                    uuid, data = await asyncio.wait_for(events.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    if 0x1e in feats and not time_synced:
                        await W(ALL_FEATURES, current_time_payload()); time_synced = True
                        break
                    continue
                if uuid != ALL_FEATURES or not data:
                    continue
                fid = data[0]; feats[fid] = data
                if fid == 0x23:   await W(ALL_FEATURES, APP_INFO); await REQ(0x10)
                elif fid == 0x10: await REQ(0x11)
                elif fid == 0x11: await W(ALL_FEATURES, ble_settings_from(data)); await REQ(0x3b)
                elif fid == 0x3b: await W(ALL_FEATURES, ADV_PARAMS); await REQ(0x3a)
                elif fid == 0x3a: await W(ALL_FEATURES, CONN_PARAMS); await REQ(0x26)
                elif fid == 0x26: await REQ(0x28)
                elif fid == 0x28: await REQ(0x20)
                elif fid == 0x20: await REQ(0x1d)
                elif fid == 0x1d: await REQ(0x1e)
                elif fid == 0x1e:
                    await W(ALL_FEATURES, current_time_payload()); time_synced = True
                    break

            # monta o status a partir das features capturadas
            model = ""
            if 0x23 in feats:
                model = feats[0x23][1:].split(b"\x00")[0].decode("ascii", "ignore")
            cond = feats.get(0x28, b"")
            ver  = feats.get(0x20, b"")
            battery_level = cond[1] if len(cond) > 1 else None   # 0-4 aprox
            status = {
                "updated": dt.datetime.now().isoformat(timespec="seconds"),
                "connected": True,
                "model": model or name,
                "battery_level": battery_level,          # nivel aproximado (0-4)
                "condition_raw": cond.hex(" "),
                "firmware_raw": ver.hex(" "),
                "time_synced": time_synced,
            }
            write_status(status)

            print("\n=========== STATUS DO RELOGIO ===========")
            print(f"  Modelo:   {status['model']}")
            print(f"  Bateria:  nivel ~{battery_level} (0-4)" if battery_level is not None else "  Bateria:  ?")
            print(f"  Firmware: {status['firmware_raw'] or '?'}")
            print(f"  Hora:     {'sincronizada ✓' if time_synced else 'nao sincronizada'}")
            print("=========================================")
            print(f"\nSalvo em: {DATA / 'status.json'}")

    except Exception as e:
        print(f"\nErro: {e}")
        print("Dica: feche o app da Casio no celular; ele pode estar segurando a conexao.")

    try: input("\nENTER pra fechar...")
    except EOFError: pass


if __name__ == "__main__":
    asyncio.run(main())
