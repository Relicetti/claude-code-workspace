#!/usr/bin/env python3
"""
scan.py — acha o seu G-Shock por Bluetooth (Fase 0).

Uso:
    python scan.py                 # lista tudo, destacando o que parece ser o relógio
    python scan.py --seconds 15    # escaneia por mais tempo (padrão: 8s)

Objetivo: confirmar que o PC enxerga o relógio e descobrir o ENDEREÇO dele
(no Windows/Linux é um MAC tipo AA:BB:CC:...; no macOS é um UUID). Anote esse
endereço — os outros scripts usam ele.

Dica importante: pra o relógio aparecer/anunciar, muitas vezes é preciso deixá-lo
em modo de conexão (no menu do relógio: CONNECT / procurar smartphone). Se ele já
estiver pareado com o app oficial, pode ser necessário fechar o app oficial (ou
desparear) pra o relógio aceitar uma nova conexão.
"""
import argparse
import asyncio

from bleak import BleakScanner

# O relógio costuma anunciar com um nome contendo "CASIO" e/ou o modelo.
NAME_HINTS = ("CASIO", "GBD", "G-SHOCK", "GSHOCK", "G-SQUAD")


def looks_like_watch(name: str | None) -> bool:
    if not name:
        return False
    up = name.upper()
    return any(h in up for h in NAME_HINTS)


async def main(seconds: float) -> None:
    print(f"Escaneando por {seconds:.0f}s... (deixe o relógio em modo CONNECT)\n")
    devices = await BleakScanner.discover(timeout=seconds, return_adv=True)

    if not devices:
        print("Nenhum dispositivo BLE encontrado. O Bluetooth do PC está ligado?")
        return

    rows = []
    for address, (dev, adv) in devices.items():
        name = dev.name or adv.local_name or ""
        rows.append((looks_like_watch(name), adv.rssi or -999, address, name))

    # Candidatos a relógio primeiro; depois por sinal (mais forte = mais perto).
    rows.sort(key=lambda r: (not r[0], -r[1]))

    print(f"{'':2} {'RSSI':>5}  {'ENDEREÇO':<38} NOME")
    print("-" * 70)
    for is_watch, rssi, address, name in rows:
        mark = "→" if is_watch else " "
        rssi_txt = f"{rssi}" if rssi != -999 else "?"
        print(f"{mark:2} {rssi_txt:>5}  {address:<38} {name or '(sem nome)'}")

    watches = [r for r in rows if r[0]]
    print()
    if watches:
        addr = watches[0][2]
        print(f"Provável relógio → ENDEREÇO = {addr}")
        print(f"Próximo passo:  python recon.py --address {addr}")
    else:
        print("Não identifiquei o relógio pelo nome. Coloque-o em modo CONNECT e")
        print("rode de novo; ou use o endereço do item com sinal (RSSI) mais forte.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Escaneia dispositivos BLE e destaca o G-Shock.")
    ap.add_argument("--seconds", type=float, default=8.0, help="Duração do scan (padrão 8s).")
    args = ap.parse_args()
    asyncio.run(main(args.seconds))
