"""
Detectores das táticas do método Stormer (docs/stormer_33_taticas.md), portados
para o motor genérico em stormer_engine.py.

Cada `detect_*` varre o DataFrame (com indicadores já calculados por
`prepare_indicators`) e devolve uma lista de `PendingOrder` — o motor cuida do
resto (disparo, stop, alvo(s), trailing).

Fora do escopo (mesma classificação do documento-fonte, seção "Fundamentos" e
Observações finais):
  - #1–5: fundamentos do método, não são setups isolados.
  - #16 (Ponto de Cataclismo): o próprio autor descreve como subjetivo demais
    para automatizar 1:1.
  - #27 (Stops e Stops Móveis): ferramentas de saída, não um setup de entrada
    (Parabolic SAR/HiLo Activator ficam de fora; PAR e trailing por MA/pivot
    já estão cobertos no motor genérico).
  - #29 (Acumulação/Distribuição): indicador qualitativo, sem regra de
    entrada/stop definida no documento — OBV e AC/DD ficam disponíveis como
    indicadores em stormer_indicators.py para quem quiser usar como filtro.
  - #30: tática geral de Bollinger — a variante concreta e operável (#19,
    "fechou fora, fechou dentro") já está implementada.

Todas as demais (#6–#15, #17–#26, #28, #31–#33) — 24 setups — estão
implementadas abaixo. Onde o texto original não define uma regra 100%
mecânica (ex.: "estrutura de topos/fundos ascendentes", "topo histórico",
"suporte relevante"), foi adotada uma aproximação razoável e documentada no
docstring do detector — precisa de validação/ajuste no walk-forward, igual a
qualquer outro parâmetro do método (ver Observações #5 do documento-fonte).
"""
import numpy as np
import pandas as pd

from stormer_engine import ExitSpec, PendingOrder
from stormer_indicators import (
    ema, sma, displaced_ma, ifr, bollinger_bands, fura_teto, fura_chao,
    retracement_level, atr as atr_ind,
)


def prepare_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Calcula todos os indicadores usados pelos detectores abaixo, de uma vez."""
    df = df.copy()
    df["ema9"] = ema(df["close"], 9)
    df["ema10"] = ema(df["close"], 10)
    df["ema10_disp1"] = displaced_ma(df["close"], 10, 1)
    df["ema21"] = ema(df["close"], 21)
    df["ema49"] = ema(df["close"], 49)
    df["ema50"] = ema(df["close"], 50)
    df["ema55"] = ema(df["close"], 55)
    df["ema3_disp3"] = displaced_ma(df["close"], 3, 3)
    df["ema5"] = ema(df["close"], 5)
    df["ifr14"] = ifr(df["close"], 14)
    df["ifr14_ma13"] = sma(df["ifr14"], 13)
    df["ifr2"] = ifr(df["close"], 2)
    df["atr14"] = atr_ind(df, 14)
    df["vol_ma20"] = df["volume"].rolling(20).mean()
    bb = bollinger_bands(df["close"], 20, 2.0)
    df = df.join(bb)
    range_hl = (df["high"] - df["low"]).replace(0, np.nan)
    df["close_pos"] = (df["close"] - df["low"]) / range_hl
    return df


def _uptrend(df: pd.DataFrame) -> pd.Series:
    return (df["close"] > df["ema21"]) & (df["close"] > df["ema55"])


def _downtrend(df: pd.DataFrame) -> pd.Series:
    return (df["close"] < df["ema21"]) & (df["close"] < df["ema55"])


def _mk(setup_id, ref_idx, direction, trigger_price, stop_price, exit_spec, **kw):
    valid_from = kw.pop("valid_from", ref_idx + 1)
    return PendingOrder(
        setup_id=setup_id, ref_idx=ref_idx, direction=direction,
        trigger_price=trigger_price, stop_price=stop_price, exit_spec=exit_spec,
        valid_from=valid_from, **kw,
    )


# ---------------------------------------------------------------------------
# #6 / #7 — Rompimento da Máxima da Semana Anterior (com/sem filtro IFR<50)
# ---------------------------------------------------------------------------
def detect_rompimento_maxima_anterior(df: pd.DataFrame, ifr_filter: bool = False,
                                       stop_mode: str = "low", ifr_threshold: float = 50.0,
                                       target_pct: float = 0.08) -> list:
    orders = []
    for i in range(1, len(df) - 1):
        if ifr_filter and not (df["ifr14"].iloc[i] < ifr_threshold):
            continue
        high_i, low_i = df["high"].iloc[i], df["low"].iloc[i]
        stop = low_i if stop_mode == "low" else retracement_level(high_i, low_i, 0.61, "long")
        if ifr_filter:
            spec = ExitSpec(target_pct=target_pct, partial_fraction=1.0)
        else:
            spec = ExitSpec(partial_fraction=0.7, use_par=True, second_target_pct=target_pct)
        setup_id = "setup07_rompimento_ifr" if ifr_filter else "setup06_rompimento_maxima_anterior"
        orders.append(_mk(setup_id, i, "long", high_i, stop, spec, expires_after=1))
    return orders


# ---------------------------------------------------------------------------
# #8 — Duas Semanas de Queda
# ---------------------------------------------------------------------------
def detect_duas_semanas_de_queda(df: pd.DataFrame, k: float = 0.14, target_pct: float = 0.08) -> list:
    """Simplificação: mantém a ordem pendente até disparar ou até o filtro de MM50 invalidar
    (em vez de recalcular o nível a cada semana, como o texto sugere)."""
    orders = []
    up = _uptrend(df)
    for i in range(2, len(df) - 1):
        if not up.iloc[i]:
            continue
        two_down = df["close"].iloc[i] < df["close"].iloc[i - 1] < df["close"].iloc[i - 2]
        if not two_down:
            continue
        high_i, low_i = df["high"].iloc[i], df["low"].iloc[i]
        trigger, stop = fura_teto(high_i, low_i, k), fura_chao(high_i, low_i, k)
        spec = ExitSpec(partial_fraction=0.7, target_pct=target_pct,
                         trailing="prev_extreme", trailing_lookback=1)

        def invalidate(df_, j):
            return df_["close"].iloc[j] < df_["ema50"].iloc[j]

        orders.append(_mk("setup08_duas_semanas_queda", i, "long", trigger, stop, spec,
                           invalidate_fn=invalidate))
    return orders


# ---------------------------------------------------------------------------
# #9 — Barra de Exaustão (mirrored)
# ---------------------------------------------------------------------------
def detect_barra_de_exaustao(df: pd.DataFrame, direction: str = "long",
                              target_pct: float = 0.08) -> list:
    orders = []
    for i in range(5, len(df) - 1):
        vol_strong = df["volume"].iloc[i] > 1.5 * df["vol_ma20"].iloc[i]
        if direction == "long":
            gap = df["open"].iloc[i] < df["low"].iloc[i - 1]
            close_near_extreme = df["close_pos"].iloc[i] > 0.7
            prior_move = df["close"].iloc[i] < df["close"].iloc[i - 5]
        else:
            gap = df["open"].iloc[i] > df["high"].iloc[i - 1]
            close_near_extreme = df["close_pos"].iloc[i] < 0.3
            prior_move = df["close"].iloc[i] > df["close"].iloc[i - 5]
        if not (gap and close_near_extreme and vol_strong and prior_move):
            continue
        trigger = df["high"].iloc[i] if direction == "long" else df["low"].iloc[i]
        stop = df["low"].iloc[i] if direction == "long" else df["high"].iloc[i]
        spec = ExitSpec(partial_fraction=0.5, use_par=True, second_target_pct=target_pct)
        orders.append(_mk("setup09_barra_exaustao", i, direction, trigger, stop, spec))
    return orders


# ---------------------------------------------------------------------------
# #10 — Ponto Contínuo
# ---------------------------------------------------------------------------
def detect_ponto_continuo(df: pd.DataFrame, direction: str = "long", k: float = 0.14) -> list:
    orders = []
    for i in range(1, len(df) - 1):
        ma = df["ema21"].iloc[i]
        if direction == "long":
            touched = df["low"].iloc[i] <= ma <= df["high"].iloc[i] and df["close"].iloc[i] > ma
        else:
            touched = df["low"].iloc[i] <= ma <= df["high"].iloc[i] and df["close"].iloc[i] < ma
        if not touched:
            continue
        high_i, low_i = df["high"].iloc[i], df["low"].iloc[i]
        trigger = fura_teto(high_i, low_i, k) if direction == "long" else fura_chao(high_i, low_i, k)
        stop = fura_chao(high_i, low_i, k) if direction == "long" else fura_teto(high_i, low_i, k)
        spec = ExitSpec(trailing="ma_turn_exit", trailing_ma_col="ema21")
        orders.append(_mk("setup10_ponto_continuo", i, direction, trigger, stop, spec))
    return orders


# ---------------------------------------------------------------------------
# #11 — IFR Ajustado
# ---------------------------------------------------------------------------
def detect_ifr_ajustado(df: pd.DataFrame, direction: str = "long",
                         oversold: float = 30.0, overbought: float = 70.0) -> list:
    orders = []
    for i in range(1, len(df) - 1):
        if direction == "long":
            hit = df["ifr14"].iloc[i] <= oversold
        else:
            hit = df["ifr14"].iloc[i] >= overbought
        if not hit:
            continue
        trigger = df["high"].iloc[i] if direction == "long" else df["low"].iloc[i]
        stop = df["low"].iloc[i] if direction == "long" else df["high"].iloc[i]
        spec = ExitSpec(trailing="ifr_trail", ifr_col="ifr14",
                         ifr_exit_threshold=overbought if direction == "long" else oversold)
        orders.append(_mk("setup11_ifr_ajustado", i, direction, trigger, stop, spec))
    return orders


# ---------------------------------------------------------------------------
# #12 — Virada do IFR
# ---------------------------------------------------------------------------
def detect_virada_do_ifr(df: pd.DataFrame, direction: str = "long") -> list:
    orders = []
    for i in range(2, len(df) - 1):
        a, b, c = df["ifr14"].iloc[i - 2], df["ifr14"].iloc[i - 1], df["ifr14"].iloc[i]
        turned_up = b < a and c > b
        turned_down = b > a and c < b
        if direction == "long" and not turned_up:
            continue
        if direction == "short" and not turned_down:
            continue
        trigger = df["high"].iloc[i] if direction == "long" else df["low"].iloc[i]
        stop = df["low"].iloc[i] if direction == "long" else df["high"].iloc[i]
        spec = ExitSpec(target_r_multiple=1.0, partial_fraction=1.0)
        orders.append(_mk("setup12_virada_ifr", i, direction, trigger, stop, spec))
    return orders


# ---------------------------------------------------------------------------
# #13 — Retângulo em Topo
# ---------------------------------------------------------------------------
def detect_retangulo_em_topo(df: pd.DataFrame, window: int = 8, top_lookback: int = 100) -> list:
    orders = []
    rolling_high = df["high"].rolling(window).max()
    rolling_low = df["low"].rolling(window).min()
    amplitude = (rolling_high - rolling_low) / rolling_low
    near_top = df["close"] >= df["high"].rolling(top_lookback).max() * 0.95
    leg_low = df["low"].rolling(top_lookback).min()

    for i in range(max(window, top_lookback), len(df) - 1):
        if not (amplitude.iloc[i] < 0.10 and near_top.iloc[i]):
            continue
        resistance = rolling_high.iloc[i]
        leg_start = leg_low.iloc[i]
        target_price = resistance + (resistance - leg_start)
        spec = ExitSpec(partial_fraction=1.0)
        orders.append(_mk(
            "setup13_retangulo_topo", i, "long", resistance, None, spec,
            dynamic_stop="prev_bar_low", target_price_override=target_price,
            expires_after=window,
        ))
    return orders


# ---------------------------------------------------------------------------
# #14 — Latinha Chacoalhada (ambas as direções a partir da mesma barra)
# ---------------------------------------------------------------------------
def detect_latinha_chacoalhada(df: pd.DataFrame, congestion_window: int = 20,
                                congestion_amplitude: float = 0.15) -> list:
    orders = []
    rng = df["high"] - df["low"]
    rolling_amp = (df["high"].rolling(congestion_window).max()
                   - df["low"].rolling(congestion_window).min()) / df["close"]
    rolling_min_range4 = rng.rolling(4).min()

    for i in range(congestion_window, len(df) - 1):
        if not (rolling_amp.iloc[i] < congestion_amplitude):
            continue
        if rng.iloc[i] != rolling_min_range4.iloc[i]:
            continue
        high_i, low_i = df["high"].iloc[i], df["low"].iloc[i]
        spec_long = ExitSpec(partial_fraction=1.0)
        spec_short = ExitSpec(partial_fraction=1.0)
        orders.append(_mk("setup14_latinha_chacoalhada", i, "long", high_i, low_i,
                           spec_long, expires_after=4))
        orders.append(_mk("setup14_latinha_chacoalhada", i, "short", low_i, high_i,
                           spec_short, expires_after=4))
    return orders


# ---------------------------------------------------------------------------
# #15 — Como Entrar Depois de Atrasado (retração de Fibonacci 50%)
# ---------------------------------------------------------------------------
def detect_entrar_atrasado(df: pd.DataFrame, direction: str = "long",
                            breakout_lookback: int = 20, atr_multiple: float = 2.0) -> list:
    orders = []
    rolling_high = df["high"].rolling(breakout_lookback).max().shift(1)
    rolling_low = df["low"].rolling(breakout_lookback).min().shift(1)

    for i in range(breakout_lookback, len(df) - 1):
        big_bar = (df["high"].iloc[i] - df["low"].iloc[i]) > atr_multiple * df["atr14"].iloc[i]
        if not big_bar:
            continue
        if direction == "long":
            broke_out = df["close"].iloc[i] > rolling_high.iloc[i]
        else:
            broke_out = df["close"].iloc[i] < rolling_low.iloc[i]
        if not broke_out:
            continue
        high_i, low_i = df["high"].iloc[i], df["low"].iloc[i]
        entry = retracement_level(high_i, low_i, 0.50, direction)
        stop = retracement_level(high_i, low_i, 0.618, direction)
        spec = ExitSpec(trailing="prev_extreme", trailing_lookback=1)
        orders.append(_mk("setup15_entrar_atrasado", i, direction, entry, stop, spec,
                           fill_mode="limit_touch"))
    return orders


# ---------------------------------------------------------------------------
# #17 — Sombra Inferior / Sombra Superior
# ---------------------------------------------------------------------------
def detect_sombra(df: pd.DataFrame, direction: str = "long", level_window: int = 50,
                   target_pct: float = 0.08) -> list:
    orders = []
    support = df["low"].rolling(level_window).min().shift(1)
    resistance = df["high"].rolling(level_window).max().shift(1)

    for i in range(level_window, len(df) - 1):
        high_i, low_i, open_i, close_i = df["high"].iloc[i], df["low"].iloc[i], df["open"].iloc[i], df["close"].iloc[i]
        body_low, body_high = min(open_i, close_i), max(open_i, close_i)
        rng = high_i - low_i
        if rng <= 0:
            continue
        if direction == "long":
            pierced = low_i < support.iloc[i] and close_i > support.iloc[i]
            long_shadow = (body_low - low_i) > 0.6 * rng
            if not (pierced and long_shadow):
                continue
            trigger, stop = high_i, low_i
        else:
            pierced = high_i > resistance.iloc[i] and close_i < resistance.iloc[i]
            long_shadow = (high_i - body_high) > 0.6 * rng
            if not (pierced and long_shadow):
                continue
            trigger, stop = low_i, high_i
        spec = ExitSpec(target_pct=target_pct, partial_fraction=1.0)
        orders.append(_mk("setup17_sombra", i, direction, trigger, stop, spec))
    return orders


# ---------------------------------------------------------------------------
# #18 — Média Móvel Deslocada (dupla penetração)
# ---------------------------------------------------------------------------
def detect_media_deslocada_dupla_penetracao(df: pd.DataFrame, direction: str = "short",
                                             pivot_lookback: int = 20, tolerance: float = 0.02,
                                             target_pct: float = 0.08) -> list:
    orders = []
    is_pivot_high = (df["high"] > df["high"].shift(1)) & (df["high"] > df["high"].shift(-1))
    is_pivot_low = (df["low"] < df["low"].shift(1)) & (df["low"] < df["low"].shift(-1))

    for i in range(pivot_lookback, len(df) - 2):
        disp = df["ema3_disp3"].iloc[i - 2:i + 1]
        if direction == "short":
            if not is_pivot_high.iloc[i]:
                continue
            window_highs = df["high"].iloc[i - pivot_lookback:i]
            prior_top = window_highs.max()
            similar_top = abs(df["high"].iloc[i] - prior_top) / prior_top < tolerance
            penetrations = (df["low"].iloc[i - 2:i + 1].values < disp.values).sum()
            if not (similar_top and penetrations >= 2):
                continue
            trigger, stop = df["low"].iloc[i], df["high"].iloc[i]
        else:
            if not is_pivot_low.iloc[i]:
                continue
            window_lows = df["low"].iloc[i - pivot_lookback:i]
            prior_bottom = window_lows.min()
            similar_bottom = abs(df["low"].iloc[i] - prior_bottom) / prior_bottom < tolerance
            penetrations = (df["high"].iloc[i - 2:i + 1].values > disp.values).sum()
            if not (similar_bottom and penetrations >= 2):
                continue
            trigger, stop = df["high"].iloc[i], df["low"].iloc[i]
        spec = ExitSpec(target_pct=target_pct, partial_fraction=1.0)
        orders.append(_mk("setup18_media_deslocada", i, direction, trigger, stop, spec))
    return orders


# ---------------------------------------------------------------------------
# #19 — Fechou Fora, Fechou Dentro (Bandas de Bollinger)
# ---------------------------------------------------------------------------
def detect_fechou_fora_fechou_dentro(df: pd.DataFrame, direction: str = "long") -> list:
    orders = []
    for i in range(1, len(df) - 1):
        if direction == "long":
            closed_outside = df["close"].iloc[i - 1] < df["bb_lower"].iloc[i - 1]
            closed_back_inside = df["close"].iloc[i] > df["bb_lower"].iloc[i]
        else:
            closed_outside = df["close"].iloc[i - 1] > df["bb_upper"].iloc[i - 1]
            closed_back_inside = df["close"].iloc[i] < df["bb_upper"].iloc[i]
        if not (closed_outside and closed_back_inside):
            continue
        trigger = df["high"].iloc[i] if direction == "long" else df["low"].iloc[i]
        stop = (min(df["low"].iloc[i - 1], df["low"].iloc[i]) if direction == "long"
                else max(df["high"].iloc[i - 1], df["high"].iloc[i]))
        target_mid = df["bb_mid"].iloc[i]
        spec = ExitSpec(partial_fraction=0.7, target_pct=None, second_target_col="bb_upper",
                         trailing="prev_extreme", trailing_lookback=1)
        orders.append(_mk("setup19_fechou_fora_dentro", i, direction, trigger, stop, spec,
                           target_price_override=target_mid))
    return orders


# ---------------------------------------------------------------------------
# #20 — Harami
# ---------------------------------------------------------------------------
def detect_harami(df: pd.DataFrame, body_multiple: float = 1.5, target_pct: float = 0.08) -> list:
    orders = []
    body = (df["close"] - df["open"]).abs()
    avg_body = body.rolling(20).mean()

    for i in range(20, len(df) - 1):
        mother_body = body.iloc[i - 1]
        if not (mother_body > body_multiple * avg_body.iloc[i - 1]):
            continue
        mother_top = max(df["open"].iloc[i - 1], df["close"].iloc[i - 1])
        mother_bottom = min(df["open"].iloc[i - 1], df["close"].iloc[i - 1])
        child_top = max(df["open"].iloc[i], df["close"].iloc[i])
        child_bottom = min(df["open"].iloc[i], df["close"].iloc[i])
        contained = child_top <= mother_top and child_bottom >= mother_bottom
        if not contained:
            continue
        mother_down = df["close"].iloc[i - 1] < df["open"].iloc[i - 1]
        direction = "long" if mother_down else "short"
        trigger = df["high"].iloc[i] if direction == "long" else df["low"].iloc[i]
        stop = df["low"].iloc[i - 1] if direction == "long" else df["high"].iloc[i - 1]
        spec = ExitSpec(target_pct=target_pct, partial_fraction=1.0)
        orders.append(_mk("setup20_harami", i, direction, trigger, stop, spec))
    return orders


# ---------------------------------------------------------------------------
# #21 — Média de 9 períodos (9.1, Larry Williams) — sistema principal do autor
# ---------------------------------------------------------------------------
def detect_media_9(df: pd.DataFrame, direction: str = "long", short_target_pct: float = 0.06) -> list:
    orders = []
    for i in range(2, len(df) - 1):
        a, b, c = df["ema9"].iloc[i - 2], df["ema9"].iloc[i - 1], df["ema9"].iloc[i]
        turned_up = b <= a and c > b
        turned_down = b >= a and c < b
        if direction == "long" and not turned_up:
            continue
        if direction == "short" and not turned_down:
            continue
        trigger = df["high"].iloc[i] if direction == "long" else df["low"].iloc[i]
        stop = df["low"].iloc[i] if direction == "long" else df["high"].iloc[i]
        if direction == "long":
            spec = ExitSpec(trailing="ma_turn_exit", trailing_ma_col="ema9")
        else:
            spec = ExitSpec(target_pct=short_target_pct, partial_fraction=1.0)
        orders.append(_mk("setup21_media_9", i, direction, trigger, stop, spec))
    return orders


# ---------------------------------------------------------------------------
# #22 — Média de 9 já virada para cima (9.2)
# ---------------------------------------------------------------------------
def detect_media_9_ja_virada(df: pd.DataFrame, direction: str = "long") -> list:
    orders = []
    for i in range(1, len(df) - 1):
        rising = df["ema9"].iloc[i] > df["ema9"].iloc[i - 1]
        falling = df["ema9"].iloc[i] < df["ema9"].iloc[i - 1]
        if direction == "long":
            if not (rising and df["close"].iloc[i] < df["close"].iloc[i - 1]):
                continue
            trigger, stop = df["high"].iloc[i], df["low"].iloc[i]
        else:
            if not (falling and df["close"].iloc[i] > df["close"].iloc[i - 1]):
                continue
            trigger, stop = df["low"].iloc[i], df["high"].iloc[i]
        spec = ExitSpec(trailing="ma_turn_exit", trailing_ma_col="ema9")

        def invalidate(df_, j, dirn=direction):
            if dirn == "long":
                return df_["ema9"].iloc[j] < df_["ema9"].iloc[j - 1]
            return df_["ema9"].iloc[j] > df_["ema9"].iloc[j - 1]

        orders.append(_mk("setup22_media_9_virada", i, direction, trigger, stop, spec,
                           expires_after=1, invalidate_fn=invalidate))
    return orders


# ---------------------------------------------------------------------------
# #23 — Média de 9 subindo com dois fechamentos mais baixos (9.3)
# ---------------------------------------------------------------------------
def detect_media_9_dois_fechamentos(df: pd.DataFrame, direction: str = "long") -> list:
    orders = []
    for i in range(2, len(df) - 1):
        rising = df["ema9"].iloc[i] > df["ema9"].iloc[i - 1]
        falling = df["ema9"].iloc[i] < df["ema9"].iloc[i - 1]
        c0, c1, c2 = df["close"].iloc[i - 2], df["close"].iloc[i - 1], df["close"].iloc[i]
        if direction == "long":
            if not (rising and c1 < c0 and c2 < c1):
                continue
            trigger, stop = df["high"].iloc[i], df["low"].iloc[i]
        else:
            if not (falling and c1 > c0 and c2 > c1):
                continue
            trigger, stop = df["low"].iloc[i], df["high"].iloc[i]
        spec = ExitSpec(trailing="ma_turn_exit", trailing_ma_col="ema9")

        def invalidate(df_, j, dirn=direction):
            if dirn == "long":
                return df_["ema9"].iloc[j] < df_["ema9"].iloc[j - 1]
            return df_["ema9"].iloc[j] > df_["ema9"].iloc[j - 1]

        orders.append(_mk("setup23_media_9_dois_fech", i, direction, trigger, stop, spec,
                           expires_after=1, invalidate_fn=invalidate))
    return orders


# ---------------------------------------------------------------------------
# #24 — Gap Escondido
# ---------------------------------------------------------------------------
def detect_gap_escondido(df: pd.DataFrame, direction: str = "long", target_pct: float = 0.08) -> list:
    orders = []
    for i in range(1, len(df) - 1):
        if direction == "long":
            c1_down = df["close"].iloc[i - 1] < df["open"].iloc[i - 1]
            c1_near_low = df["close_pos"].iloc[i - 1] < 0.3
            gap_up = df["open"].iloc[i] > df["close"].iloc[i - 1]
            closed_above = df["close"].iloc[i] > df["high"].iloc[i - 1]
            no_pierce = df["low"].iloc[i] >= df["low"].iloc[i - 1]
            if not (c1_down and c1_near_low and gap_up and closed_above and no_pierce):
                continue
            trigger = df["high"].iloc[i]
            stop = retracement_level(df["high"].iloc[i], df["low"].iloc[i], 0.61, "long")
        else:
            c1_up = df["close"].iloc[i - 1] > df["open"].iloc[i - 1]
            c1_near_high = df["close_pos"].iloc[i - 1] > 0.7
            gap_down = df["open"].iloc[i] < df["close"].iloc[i - 1]
            closed_below = df["close"].iloc[i] < df["low"].iloc[i - 1]
            no_pierce = df["high"].iloc[i] <= df["high"].iloc[i - 1]
            if not (c1_up and c1_near_high and gap_down and closed_below and no_pierce):
                continue
            trigger = df["low"].iloc[i]
            stop = retracement_level(df["high"].iloc[i], df["low"].iloc[i], 0.61, "short")
        spec = ExitSpec(target_pct=target_pct, partial_fraction=1.0)
        orders.append(_mk("setup24_gap_escondido", i, direction, trigger, stop, spec))
    return orders


# ---------------------------------------------------------------------------
# #25 — Iguana (Jeff Cooper)
# ---------------------------------------------------------------------------
def detect_iguana(df: pd.DataFrame, direction: str = "long") -> list:
    orders = []
    roll_low4 = df["low"].rolling(4).min()
    roll_high4 = df["high"].rolling(4).max()

    for i in range(4, len(df) - 2):
        high_i, low_i, open_i, close_i = df["high"].iloc[i], df["low"].iloc[i], df["open"].iloc[i], df["close"].iloc[i]
        rng = high_i - low_i
        if rng <= 0:
            continue
        if direction == "long":
            is_min4 = low_i == roll_low4.iloc[i]
            p75 = low_i + 0.75 * rng
            if not (is_min4 and open_i > p75 and close_i > p75):
                continue
            entry_limit = retracement_level(high_i, low_i, 0.50, "long")
            stop = retracement_level(high_i, low_i, 0.61, "long")
            fallback_trigger = high_i
        else:
            is_max4 = high_i == roll_high4.iloc[i]
            p25 = low_i + 0.25 * rng
            if not (is_max4 and open_i < p25 and close_i < p25):
                continue
            entry_limit = retracement_level(high_i, low_i, 0.50, "short")
            stop = retracement_level(high_i, low_i, 0.61, "short")
            fallback_trigger = low_i

        spec = ExitSpec(trailing="prev_extreme", trailing_lookback=1)
        # ordem primária: retração de 50% logo na abertura seguinte (só vale 1 barra)
        orders.append(_mk("setup25_iguana", i, direction, entry_limit, stop, spec,
                           fill_mode="limit_touch", expires_after=1))
        # fallback: se não pegou a retração, entra no rompimento da máxima/mínima do candle iguana
        fb = PendingOrder(
            setup_id="setup25_iguana", ref_idx=i, direction=direction,
            trigger_price=fallback_trigger, stop_price=stop, exit_spec=spec,
            valid_from=i + 2, fill_mode="close_break",
        )
        orders.append(fb)
    return orders


# ---------------------------------------------------------------------------
# #26 — Realização Frustrada
# ---------------------------------------------------------------------------
def detect_realizacao_frustrada(df: pd.DataFrame, direction: str = "long") -> list:
    orders = []
    up = _uptrend(df)
    down = _downtrend(df)
    for i in range(2, len(df) - 1):
        c2_down = df["close"].iloc[i - 2] < df["open"].iloc[i - 2]
        c1_up = df["close"].iloc[i - 1] > df["open"].iloc[i - 1]
        c0_down = df["close"].iloc[i] < df["open"].iloc[i]
        c2_up = df["close"].iloc[i - 2] > df["open"].iloc[i - 2]
        c1_down = df["close"].iloc[i - 1] < df["open"].iloc[i - 1]
        c0_up = df["close"].iloc[i] > df["open"].iloc[i]

        if direction == "long":
            if not (up.iloc[i] and c2_down and c1_up and c0_down):
                continue
            hi = max(df["high"].iloc[i - 2:i + 1])
            lo = min(df["low"].iloc[i - 2:i + 1])
            trigger, stop = hi, lo
            target = hi + (hi - lo)
        else:
            if not (down.iloc[i] and c2_up and c1_down and c0_up):
                continue
            hi = max(df["high"].iloc[i - 2:i + 1])
            lo = min(df["low"].iloc[i - 2:i + 1])
            trigger, stop = lo, hi
            target = lo - (hi - lo)
        spec = ExitSpec(partial_fraction=1.0)
        orders.append(_mk("setup26_realizacao_frustrada", i, direction, trigger, stop, spec,
                           target_price_override=target))
    return orders


# ---------------------------------------------------------------------------
# #28 — Three Line Bar (Joseph Stowell)
# ---------------------------------------------------------------------------
def detect_three_line_bar(df: pd.DataFrame, direction: str = "long", target_pct: float = 0.08) -> list:
    """
    Simplificação: pivôs locais de 3 barras (high[i]>high[i-1] e high[i]>high[i+1],
    espelhado para lows) para achar barra1 (extremo do movimento), barra2 (pivô mais
    recente antes dela) e barra3 (pivô anterior a barra2, mais além no mesmo sentido).
    """
    orders = []
    is_pivot_high = (df["high"] > df["high"].shift(1)) & (df["high"] > df["high"].shift(-1))
    is_pivot_low = (df["low"] < df["low"].shift(1)) & (df["low"] < df["low"].shift(-1))

    if direction == "long":
        pivot_mask = is_pivot_high
        extreme_mask = is_pivot_low
    else:
        pivot_mask = is_pivot_low
        extreme_mask = is_pivot_high

    pivot_idxs = list(np.where(pivot_mask.fillna(False).values)[0])
    extreme_idxs = list(np.where(extreme_mask.fillna(False).values)[0])

    for barra1 in extreme_idxs:
        earlier_pivots = [p for p in pivot_idxs if p < barra1]
        if len(earlier_pivots) < 2:
            continue
        barra2 = earlier_pivots[-1]
        candidates_before_2 = [p for p in earlier_pivots if p < barra2]
        barra3 = None
        for p in reversed(candidates_before_2):
            if direction == "long" and df["high"].iloc[p] > df["high"].iloc[barra2]:
                barra3 = p
                break
            if direction == "short" and df["low"].iloc[p] < df["low"].iloc[barra2]:
                barra3 = p
                break
        if barra3 is None or barra1 >= len(df) - 1:
            continue
        if direction == "long":
            trigger, stop = df["high"].iloc[barra3], df["low"].iloc[barra1]
        else:
            trigger, stop = df["low"].iloc[barra3], df["high"].iloc[barra1]
        spec = ExitSpec(target_pct=target_pct, partial_fraction=1.0)
        orders.append(_mk("setup28_three_line_bar", barra1, direction, trigger, stop, spec,
                           valid_from=barra1 + 1))
    return orders


# ---------------------------------------------------------------------------
# #31 — IFR2 sem filtro
# ---------------------------------------------------------------------------
def detect_ifr2_sem_filtro(df: pd.DataFrame, threshold: float = 5.0,
                            stop_multiple: float = 1.30, target_pct: float = 0.03) -> list:
    orders = []
    for i in range(2, len(df) - 1):
        if not (df["ifr2"].iloc[i] < threshold):
            continue
        entry = df["close"].iloc[i]
        rng = df["high"].iloc[i] - df["low"].iloc[i]
        stop = entry - stop_multiple * rng
        spec = ExitSpec(partial_fraction=0.5, target_pct=target_pct,
                         trailing="ma_turn_exit", trailing_ma_col="ema5")
        orders.append(_mk("setup31_ifr2_sem_filtro", i, "long", entry, stop, spec,
                           valid_from=i, fill_mode="at_close"))
    return orders


# ---------------------------------------------------------------------------
# #32 — IFR2 com Filtro (média de 13 sobre o IFR) — ★ sistema principal do autor
# ---------------------------------------------------------------------------
def detect_ifr2_com_filtro(df: pd.DataFrame, direction: str = "long", target_pct: float = 0.04) -> list:
    orders = []
    for i in range(14, len(df) - 1):
        crossed_up = df["ifr14"].iloc[i - 1] <= df["ifr14_ma13"].iloc[i - 1] and \
                     df["ifr14"].iloc[i] > df["ifr14_ma13"].iloc[i]
        crossed_down = df["ifr14"].iloc[i - 1] >= df["ifr14_ma13"].iloc[i - 1] and \
                       df["ifr14"].iloc[i] < df["ifr14_ma13"].iloc[i]
        above_ma49 = df["close"].iloc[i] >= df["ema49"].iloc[i]

        if direction == "long":
            if not (crossed_up and above_ma49):
                continue
            trigger, stop = df["high"].iloc[i], df["low"].iloc[i]
        else:
            if not (crossed_down and not above_ma49):
                continue
            trigger, stop = df["low"].iloc[i], df["high"].iloc[i]

        spec = ExitSpec(partial_fraction=0.5, target_pct=target_pct,
                         trailing="ma_turn_exit", trailing_ma_col="ema5")
        orders.append(_mk("setup32_ifr2_com_filtro", i, direction, trigger, stop, spec))
    return orders


# ---------------------------------------------------------------------------
# #33 — Média de 10 e sua Sombra (Larry Williams)
# ---------------------------------------------------------------------------
def detect_media_10_sombra(df: pd.DataFrame, direction: str = "long") -> list:
    orders = []
    for i in range(2, len(df) - 1):
        m0, m1 = df["ema10"].iloc[i - 1], df["ema10"].iloc[i]
        d0, d1 = df["ema10_disp1"].iloc[i - 1], df["ema10_disp1"].iloc[i]
        if pd.isna(d0) or pd.isna(d1):
            continue
        crossed_up = m0 <= d0 and m1 > d1
        crossed_down = m0 >= d0 and m1 < d1
        if direction == "long" and not crossed_up:
            continue
        if direction == "short" and not crossed_down:
            continue
        trigger = df["high"].iloc[i] if direction == "long" else df["low"].iloc[i]
        stop = df["low"].iloc[i] if direction == "long" else df["high"].iloc[i]
        spec = ExitSpec(trailing="ma_cross_exit", trailing_ma_col="ema10",
                         trailing_ma_col2="ema10_disp1")
        orders.append(_mk("setup33_media_10_sombra", i, direction, trigger, stop, spec))
    return orders


# ---------------------------------------------------------------------------
# Registro: setup_id -> (nome, tática nº, gerador de ordens espelhado ou não)
# ---------------------------------------------------------------------------
SETUP_REGISTRY = {
    "setup06_rompimento_maxima_anterior": {
        "name": "Rompimento da Máxima da Semana Anterior", "tactic": 6,
        "generate": lambda df, **p: detect_rompimento_maxima_anterior(df, ifr_filter=False, **p),
    },
    "setup07_rompimento_ifr": {
        "name": "Rompimento da Máxima + IFR(14) < 50", "tactic": 7,
        "generate": lambda df, **p: detect_rompimento_maxima_anterior(df, ifr_filter=True, **p),
    },
    "setup08_duas_semanas_queda": {
        "name": "Duas Semanas de Queda", "tactic": 8,
        "generate": detect_duas_semanas_de_queda,
    },
    "setup09_barra_exaustao": {
        "name": "Barra de Exaustão", "tactic": 9,
        "generate": lambda df, **p: detect_barra_de_exaustao(df, "long", **p)
        + detect_barra_de_exaustao(df, "short", **p),
    },
    "setup10_ponto_continuo": {
        "name": "Ponto Contínuo", "tactic": 10,
        "generate": lambda df, **p: detect_ponto_continuo(df, "long", **p)
        + detect_ponto_continuo(df, "short", **p),
    },
    "setup11_ifr_ajustado": {
        "name": "IFR Ajustado", "tactic": 11,
        "generate": lambda df, **p: detect_ifr_ajustado(df, "long", **p)
        + detect_ifr_ajustado(df, "short", **p),
    },
    "setup12_virada_ifr": {
        "name": "Virada do IFR", "tactic": 12,
        "generate": lambda df, **p: detect_virada_do_ifr(df, "long", **p)
        + detect_virada_do_ifr(df, "short", **p),
    },
    "setup13_retangulo_topo": {
        "name": "Retângulo em Topo", "tactic": 13,
        "generate": detect_retangulo_em_topo,
    },
    "setup14_latinha_chacoalhada": {
        "name": "Latinha Chacoalhada", "tactic": 14,
        "generate": detect_latinha_chacoalhada,
    },
    "setup15_entrar_atrasado": {
        "name": "Como Entrar Depois de Atrasado", "tactic": 15,
        "generate": lambda df, **p: detect_entrar_atrasado(df, "long", **p)
        + detect_entrar_atrasado(df, "short", **p),
    },
    "setup17_sombra": {
        "name": "Sombra Inferior / Superior", "tactic": 17,
        "generate": lambda df, **p: detect_sombra(df, "long", **p) + detect_sombra(df, "short", **p),
    },
    "setup18_media_deslocada": {
        "name": "Média Móvel Deslocada (dupla penetração)", "tactic": 18,
        "generate": lambda df, **p: detect_media_deslocada_dupla_penetracao(df, "short", **p)
        + detect_media_deslocada_dupla_penetracao(df, "long", **p),
    },
    "setup19_fechou_fora_dentro": {
        "name": "Fechou Fora, Fechou Dentro (Bollinger)", "tactic": 19,
        "generate": lambda df, **p: detect_fechou_fora_fechou_dentro(df, "long", **p)
        + detect_fechou_fora_fechou_dentro(df, "short", **p),
    },
    "setup20_harami": {
        "name": "Harami", "tactic": 20,
        "generate": detect_harami,
    },
    "setup21_media_9": {
        "name": "Média de 9 períodos (Larry Williams)", "tactic": 21,
        "generate": lambda df, **p: detect_media_9(df, "long", **p) + detect_media_9(df, "short", **p),
    },
    "setup22_media_9_virada": {
        "name": "Média de 9 já virada (9.2)", "tactic": 22,
        "generate": lambda df, **p: detect_media_9_ja_virada(df, "long", **p)
        + detect_media_9_ja_virada(df, "short", **p),
    },
    "setup23_media_9_dois_fech": {
        "name": "Média de 9 com dois fechamentos mais baixos (9.3)", "tactic": 23,
        "generate": lambda df, **p: detect_media_9_dois_fechamentos(df, "long", **p)
        + detect_media_9_dois_fechamentos(df, "short", **p),
    },
    "setup24_gap_escondido": {
        "name": "Gap Escondido", "tactic": 24,
        "generate": lambda df, **p: detect_gap_escondido(df, "long", **p)
        + detect_gap_escondido(df, "short", **p),
    },
    "setup25_iguana": {
        "name": "Iguana (Jeff Cooper)", "tactic": 25,
        "generate": lambda df, **p: detect_iguana(df, "long", **p) + detect_iguana(df, "short", **p),
    },
    "setup26_realizacao_frustrada": {
        "name": "Realização Frustrada", "tactic": 26,
        "generate": lambda df, **p: detect_realizacao_frustrada(df, "long", **p)
        + detect_realizacao_frustrada(df, "short", **p),
    },
    "setup28_three_line_bar": {
        "name": "Three Line Bar (Joseph Stowell)", "tactic": 28,
        "generate": lambda df, **p: detect_three_line_bar(df, "long", **p)
        + detect_three_line_bar(df, "short", **p),
    },
    "setup31_ifr2_sem_filtro": {
        "name": "IFR2 sem filtro", "tactic": 31,
        "generate": detect_ifr2_sem_filtro,
    },
    "setup32_ifr2_com_filtro": {
        "name": "IFR2 com Filtro (sistema principal do autor)", "tactic": 32,
        "generate": lambda df, **p: detect_ifr2_com_filtro(df, "long", **p)
        + detect_ifr2_com_filtro(df, "short", **p),
    },
    "setup33_media_10_sombra": {
        "name": "Média de 10 e sua Sombra (Larry Williams)", "tactic": 33,
        "generate": lambda df, **p: detect_media_10_sombra(df, "long", **p)
        + detect_media_10_sombra(df, "short", **p),
    },
}
