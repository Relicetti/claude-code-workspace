"""
Features VSA — transforma os 5 conceitos discricionários em métricas numéricas.
Todas as métricas usam apenas dados até o candle atual (sem look-ahead).
"""
import pandas as pd
import numpy as np


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    return tr.rolling(period).mean()


def add_vsa_features(df: pd.DataFrame, vol_window: int = 20, atr_window: int = 14,
                      corr_window: int = 10) -> pd.DataFrame:
    df = df.copy()

    # 1. Volume relativo
    df["vol_ma"] = df["volume"].rolling(vol_window).mean()
    df["vol_rel"] = df["volume"] / df["vol_ma"]

    # 2. Esforço x Resultado
    df["atr"] = atr(df, atr_window)
    df["range_norm"] = (df["high"] - df["low"]) / df["atr"]
    df["range_norm"] = df["range_norm"].replace([np.inf, -np.inf], np.nan)
    df["esforco_resultado"] = df["vol_rel"] / df["range_norm"]

    # posição do fechamento dentro do range (0 = fechou na mínima, 1 = na máxima)
    range_hl = (df["high"] - df["low"]).replace(0, np.nan)
    df["close_pos"] = (df["close"] - df["low"]) / range_hl

    # 3. Clímax de volume (volume extremo + indecisão no fechamento)
    body_ratio = (df["close"] - df["open"]).abs() / range_hl
    df["climax"] = ((df["vol_rel"] > 3.0) & (body_ratio < 0.3)).astype(int)
    # sinal direcional do clímax: se ocorreu após alta -> possível topo (-1); após baixa -> possível fundo (+1)
    trend_dir = np.sign(df["close"].diff(5))
    df["climax_signal"] = df["climax"] * (-trend_dir)

    # 4. Harmonia / Divergência: correlação rolling entre delta_preço e vol_rel
    delta_close = df["close"].diff()
    df["harmonia_divergencia"] = delta_close.rolling(corr_window).corr(df["vol_rel"])

    # 5. No Demand / No Supply
    is_up_candle = df["close"] > df["open"]
    is_down_candle = df["close"] < df["open"]
    narrow_range = df["range_norm"] < 0.7  # range estreito relativo ao ATR
    low_vol = df["vol_rel"] < 0.7

    df["no_demand"] = (is_up_candle & narrow_range & low_vol).astype(int)   # fraqueza em alta
    df["no_supply"] = (is_down_candle & narrow_range & low_vol).astype(int)  # fraqueza em baixa

    return df
