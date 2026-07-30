#!/usr/bin/env python3
"""
sync.py — baixa o histórico do relógio (passos/batimentos/sono) e salva em
data/health.json, que o painel lê.

Estado: o "esqueleto" está pronto (conexão, handshake, escrita do JSON). O
parsing dos pacotes proprietários é preenchido em decoders.parse_activity_blocks
DEPOIS do recon.py revelar o formato. Até lá, este script conecta e mostra o que
recebe, pra ajudar a mapear.

Uso:
    python sync.py --address <ENDEREÇO>
"""
import argparse
import asyncio
import datetime as dt
import json
import pathlib

from bleak import BleakClient

from decoders import DailySummary, parse_activity_blocks

DATA = pathlib.Path(__file__).resolve().parent.parent / "data"

# TODO(recon): característica proprietária que entrega o histórico de atividade.
# Sai do log do recon.py (a que despeja dados quando você sincroniza). Referência
# de formato: código Casio do Gadgetbridge (GBD-H1000).
ACTIVITY_CHAR_UUID: str | None = None


def write_health(days: list[DailySummary]) -> pathlib.Path:
    DATA.mkdir(exist_ok=True)
    out = DATA / "health.json"
    payload = {
        "updated": dt.datetime.now().isoformat(timespec="seconds"),
        "days": [d.to_dict() for d in days],
    }
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return out


async def main(address: str) -> None:
    async with BleakClient(address) as client:
        print(f"Conectado: {client.is_connected}")

        if ACTIVITY_CHAR_UUID is None:
            print(
                "\nAinda não sei qual característica pede o histórico.\n"
                "Rode primeiro:  python recon.py --address " + address + "\n"
                "e preencha ACTIVITY_CHAR_UUID aqui + parse_activity_blocks em decoders.py."
            )
            return

        # Fluxo alvo (a completar com o achado do recon):
        #   1. handshake/init (se necessário)
        #   2. escrever comando pedindo o histórico na característica de controle
        #   3. juntar os pacotes de notificação e passar pra parse_activity_blocks
        raw = await client.read_gatt_char(ACTIVITY_CHAR_UUID)
        days = parse_activity_blocks(bytes(raw))

        if not days:
            print("Nenhum resumo diário decodificado ainda (parser proprietário pendente).")
            return

        path = write_health(days)
        print(f"Salvo: {path}  ({len(days)} dias)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Sincroniza o histórico do relógio para data/health.json.")
    ap.add_argument("--address", required=True, help="Endereço do relógio (do scan.py).")
    args = ap.parse_args()
    asyncio.run(main(args.address))
