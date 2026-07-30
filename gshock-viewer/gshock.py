#!/usr/bin/env python3
"""
gshock.py (v2) — acha o Casio G-Shock, mapeia o protocolo E JÁ TENTA PUXAR OS PASSOS.

Só precisa da biblioteca `bleak`. O launcher GShock.bat instala e chama este arquivo.
O log fica na MESMA pasta deste arquivo (recon-....log).

Baseado no protocolo Casio do Gadgetbridge (linha GBX-100 / GBD-H1000):
  - pedir passos:  escrever 00 11 00 00 00 na característica de dados
  - confirmar:     escrever 04 11 00 00 00
  - resposta grande vem INVERTIDA bit a bit (~byte) com data + passos (32b) + calorias.
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
def cu(short):  # monta o UUID completo a partir do "26eb00xx"
    return f"26eb{short}{BASE}"

# Características vistas no seu relógio:
CH_0023 = cu("0023")  # notify, write
CH_0024 = cu("0024")  # notify, write-sem-resposta   (ALL_FEATURES no Gadgetbridge)
CH_002C = cu("002c")  # write-sem-resposta
CH_002D = cu("002d")  # notify, write                (candidato a DATA_REQUEST/CONVOY)
CH_0030 = cu("0030")  # write-sem-resposta

NOTIFY_CHARS = [CH_0023, CH_0024, CH_002D]
# candidatos onde escrever o pedido de passos (precisam de "write"):
REQUEST_CHARS = [CH_0023, CH_002D]

STEP_REQUEST = bytes([0x00, 0x11, 0x00, 0x00, 0x00])
STEP_ACK     = bytes([0x04, 0x11, 0x00, 0x00, 0x00])

NAME_HINTS = ("CASIO", "GBD", "G-SHOCK", "GSHOCK", "G-SQUAD")


def now():
    return dt.datetime.now().strftime("%H:%M:%S.%f")[:-3]


def looks_like_watch(name):
    return bool(name) and any(h in name.upper() for h in NAME_HINTS)


async def find_watch(seconds=8.0):
    print(f"Escaneando por {seconds:.0f}s... (relogio em modo CONNECT)\n")
    devices = await BleakScanner.discover(timeout=seconds, return_adv=True)
    for address, (dev, adv) in devices.items():
        name = dev.name or adv.local_name or ""
        if looks_like_watch(name):
            print(f"-> {address}  {name}")
            return address, name
        print(f"   {address}  {name or '(sem nome)'}")
    return None


def invert(data: bytes) -> bytes:
    return bytes((~b) & 0xFF for b in data)


def try_parse_steps(raw: bytes, log):
    """Tenta decodificar o pacote de passos (invertido bit a bit)."""
    if len(raw) < 18:
        return False
    d = invert(raw)
    try:
        year = d[2] + 2000
        month = d[3] + 1
        day = d[4]
        hour, minute = d[5], d[6]
        steps = int.from_bytes(d[7:11], "little")
        if steps == 0xFFFFFFFE:
            steps = 0
        cal = int.from_bytes(d[11:13], "little")
        if cal == 0xFFFE:
            cal = 0
        status = d[17]
        log(f"\n*** DECODIFICADO ***")
        log(f"    Data: {day:02d}/{month:02d}/{year} {hour:02d}:{minute:02d}")
        log(f"    PASSOS: {steps}")
        log(f"    Calorias: {cal}")
        log(f"    status: {status} (0=tem mais, 1=fim)")
        return True
    except Exception as e:
        log(f"(nao consegui decodificar: {e})")
        return False


async def main():
    here = pathlib.Path(__file__).resolve().parent
    logpath = here / f"recon-{dt.datetime.now():%Y%m%d-%H%M%S}.log"
    fh = open(logpath, "w", encoding="utf-8")
    def log(t):
        print(t); fh.write(t + "\n"); fh.flush()

    # buffers de bytes recebidos por característica (pra montar pacotes grandes)
    buffers = {c: bytearray() for c in NOTIFY_CHARS}

    def on_notify(char: BleakGATTCharacteristic, data: bytearray):
        u = char.uuid.lower()
        buffers.setdefault(u, bytearray()).extend(data)
        log(f"{now()}  NOTIFY {u[4:8]}  ({len(data)}b)  {data.hex(' ')}")

    log(f"# G-Shock recon+passos — {dt.datetime.now():%Y-%m-%d %H:%M:%S}\n")
    watch = await find_watch()
    if not watch:
        log("\nNao achei o relogio. Coloque em modo CONNECT e feche o app da Casio no celular.")
        fh.close(); input("\nENTER pra fechar..."); return
    address, name = watch
    log(f"\nRelogio: {name}  ({address})")

    try:
        async with BleakClient(address) as client:
            log(f"Conectado: {client.is_connected}\n")

            # mapa rápido
            log("Caracteristicas:")
            for s in client.services:
                for c in s.characteristics:
                    if c.uuid.lower().startswith("26eb"):
                        log(f"  {c.uuid[4:8]}  [{','.join(c.properties)}]")

            # assina todas as notify
            log("\nAssinando notificacoes...")
            for u in NOTIFY_CHARS:
                try:
                    await client.start_notify(u, on_notify)
                except Exception as e:
                    log(f"  (falhou assinar {u[4:8]}: {e})")

            await asyncio.sleep(1.0)

            # tenta pedir passos em cada característica candidata
            got = False
            for reqc in REQUEST_CHARS:
                for u in buffers:
                    buffers[u].clear()
                log(f"\n>>> Pedindo passos em {reqc[4:8]}:  {STEP_REQUEST.hex(' ')}")
                try:
                    await client.write_gatt_char(reqc, STEP_REQUEST, response=True)
                except Exception as e:
                    log(f"    (write falhou: {e}); tentando sem resposta...")
                    try:
                        await client.write_gatt_char(reqc, STEP_REQUEST, response=False)
                    except Exception as e2:
                        log(f"    (write-sem-resposta tambem falhou: {e2})")
                        continue

                await asyncio.sleep(5.0)  # espera a resposta chegar

                # tenta decodificar o que chegou em qualquer buffer
                for u, buf in buffers.items():
                    if len(buf) >= 18 and try_parse_steps(bytes(buf), log):
                        got = True
                # confirma
                try:
                    await client.write_gatt_char(reqc, STEP_ACK, response=True)
                except Exception:
                    pass
                if got:
                    log(f"\n=== PASSOS OBTIDOS via {reqc[4:8]} ===")
                    break
                else:
                    log(f"    (sem dados decodificaveis em {reqc[4:8]})")

            if not got:
                log("\nNao consegui puxar os passos ainda. Provavelmente falta o 'aperto de")
                log("mao' inicial (enviar a hora). Manda este log pro chat que a gente ajusta.")

            # escuta mais um pouco pra capturar qualquer coisa extra
            log("\nEscutando +20s (mexa no relogio: batimentos, passos, atividade)...")
            await asyncio.sleep(20.0)

    except Exception as e:
        log(f"\nErro: {e}")
        log("Dica: feche o app da Casio no celular (ele pode estar segurando a conexao).")

    log(f"\nPronto! Log salvo em:\n{logpath}")
    fh.close()
    try:
        input("\nENTER pra fechar...")
    except EOFError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
