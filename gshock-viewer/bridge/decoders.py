#!/usr/bin/env python3
"""
decoders.py — traduz os bytes crus do relógio em números úteis.

Duas categorias:
  • PADRÃO Bluetooth (batimentos ao vivo): totalmente especificado, já implementado
    e correto — não depende do recon.
  • PROPRIETÁRIO Casio (passos/sono/histórico): o formato exato sai do recon.py.
    Aqui deixo a estrutura e o ponto onde encaixar o parsing (referência:
    código Casio do Gadgetbridge — classes Casio2C2A* / CasioGBX100*).
"""
from __future__ import annotations

from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# PADRÃO BLE — Heart Rate Measurement (característica 0x2A37)
# Spec: Bluetooth SIG. byte0 = flags; se bit0=0 o BPM é 1 byte, se bit0=1 são 2
# bytes (little-endian). bit3 = energia gasta presente; bit4 = intervalos RR.
# ---------------------------------------------------------------------------
@dataclass
class HeartRate:
    bpm: int
    rr_intervals_ms: list[float] = field(default_factory=list)
    energy_kj: int | None = None


def parse_heart_rate_measurement(data: bytes) -> HeartRate:
    if not data:
        return HeartRate(bpm=0)
    flags = data[0]
    hr_16bit = flags & 0x01
    has_energy = (flags >> 3) & 0x01
    has_rr = (flags >> 4) & 0x01

    idx = 1
    if hr_16bit:
        bpm = int.from_bytes(data[idx:idx + 2], "little")
        idx += 2
    else:
        bpm = data[idx]
        idx += 1

    energy = None
    if has_energy:
        energy = int.from_bytes(data[idx:idx + 2], "little")
        idx += 2

    rr = []
    if has_rr:
        while idx + 1 < len(data) + 1 and idx + 2 <= len(data):
            raw = int.from_bytes(data[idx:idx + 2], "little")
            rr.append(raw * 1000.0 / 1024.0)  # unidade 1/1024s -> ms
            idx += 2

    return HeartRate(bpm=bpm, rr_intervals_ms=rr, energy_kj=energy)


# ---------------------------------------------------------------------------
# PROPRIETÁRIO Casio — passos / sono / histórico do dia.
#
# COMO COMPLETAR (depois do recon.py):
#   1. No log do recon, ache a característica proprietária que despeja os dados
#      de atividade (procure pacotes que mudam quando você dá passos).
#   2. Compare com o formato do Gadgetbridge (GBD-H1000): normalmente vem em
#      blocos por data/hora, com contadores de passos e amostras de batimento.
#   3. Preencha as funções abaixo com o slicing/decodificação corretos.
#
# Deixo assinaturas estáveis pra o resto do app (sync.py / painel) já funcionar
# assim que o parsing estiver pronto.
# ---------------------------------------------------------------------------
@dataclass
class DailySummary:
    date: str                 # "YYYY-MM-DD"
    steps: int = 0
    hr_resting: int | None = None
    hr_min: int | None = None
    hr_max: int | None = None
    hr_series: list[int] = field(default_factory=list)   # amostras ao longo do dia
    sleep_minutes: int | None = None
    sleep_deep_minutes: int | None = None
    sleep_light_minutes: int | None = None
    sleep_awake_minutes: int | None = None

    def to_dict(self) -> dict:
        return {
            "date": self.date,
            "steps": self.steps,
            "hr": {
                "resting": self.hr_resting,
                "min": self.hr_min,
                "max": self.hr_max,
                "series": self.hr_series,
            },
            "sleep": {
                "total": self.sleep_minutes,
                "deep": self.sleep_deep_minutes,
                "light": self.sleep_light_minutes,
                "awake": self.sleep_awake_minutes,
            },
        }


def parse_activity_blocks(raw: bytes) -> list[DailySummary]:
    """
    TODO(recon): decodificar o histórico proprietário em resumos diários.
    Retorna [] enquanto não estiver implementado, pra não quebrar o fluxo.
    """
    return []
