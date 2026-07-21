"""
Indicadores/ferramentas de base do método Stormer (docs/stormer_33_taticas.md).
Blocos reutilizados por vários dos 33 setups em stormer_setups.py.
Todas as funções são causais (sem look-ahead): usam só dados até o índice atual.
"""
import numpy as np
import pandas as pd


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False, min_periods=period).mean()


def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(period).mean()


def displaced_ma(series: pd.Series, period: int, displacement: int, kind: str = "ema") -> pd.Series:
    """Média móvel deslocada `displacement` períodos à frente (#18, #33)."""
    base = ema(series, period) if kind == "ema" else sma(series, period)
    return base.shift(-displacement)


def ifr(series: pd.Series, period: int = 14) -> pd.Series:
    """IFR / RSI clássico (suavização de Wilder)."""
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    result = 100 - (100 / (1 + rs))
    result[(avg_loss == 0) & (avg_gain > 0)] = 100.0
    result[(avg_loss == 0) & (avg_gain == 0)] = 50.0
    return result


def bollinger_bands(series: pd.Series, period: int = 20, num_std: float = 2.0) -> pd.DataFrame:
    mid = sma(series, period)
    std = series.rolling(period).std()
    return pd.DataFrame({
        "bb_mid": mid,
        "bb_upper": mid + num_std * std,
        "bb_lower": mid - num_std * std,
    })


def fura_teto(high: float, low: float, k: float = 0.14) -> float:
    """Nível que precisa ser rompido (fechamento acima) para confirmar rompimento."""
    return high + (high - low) * k


def fura_chao(high: float, low: float, k: float = 0.14) -> float:
    """Stop técnico simétrico ao fura-teto."""
    return low - (high - low) * k


def retracement_level(high: float, low: float, pct: float, direction: str = "long") -> float:
    """
    Nível de retração de Fibonacci de uma barra/perna.
    direction='long': retrai a partir da máxima em direção à mínima (compra em recuo de alta).
    direction='short': retrai a partir da mínima em direção à máxima.
    """
    rng = high - low
    if direction == "long":
        return high - rng * pct
    return low + rng * pct


def par_level(entry: float, stop: float, fraction_realized: float, direction: str = "long") -> float:
    """
    PAR (Ponto de Anular Risco): preço que, se usado como novo stop do restante
    da posição, zera o risco total do trade após realizar `fraction_realized` dela.

    PAR = entrada + [(capital em risco na fração realizada) / (fração remanescente)]
    (sinal invertido para vendas: PAR = entrada - [...])
    """
    if not (0 < fraction_realized < 1):
        raise ValueError("fraction_realized deve estar em (0, 1)")
    risk_per_unit = abs(entry - stop)
    fraction_remaining = 1 - fraction_realized
    offset = (risk_per_unit * fraction_realized) / fraction_remaining
    return entry + offset if direction == "long" else entry - offset


def obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    """On Balance Volume (Granville) — #29."""
    direction = np.sign(close.diff()).fillna(0)
    return (direction * volume).cumsum()


def ac_dd(df: pd.DataFrame) -> pd.Series:
    """
    Acumulação/Distribuição (Chaikin) — #29.
    [(fech-mín) - (máx-fech)] / (máx-mín) * volume do período, acumulado.
    """
    high, low, close, volume = df["high"], df["low"], df["close"], df["volume"]
    rng = (high - low).replace(0, np.nan)
    money_flow_mult = ((close - low) - (high - close)) / rng
    money_flow_vol = money_flow_mult.fillna(0) * volume
    return money_flow_vol.cumsum()


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    return tr.rolling(period).mean()
