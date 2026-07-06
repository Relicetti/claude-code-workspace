"""
Score composto: combina as 5 métricas VSA com pesos configuráveis.
Pesos e thresholds são parâmetros — devem ser calibrados via walk-forward,
nunca fixados "no olho" (isso é a fonte nº1 de overfitting aqui).
"""
import pandas as pd
import numpy as np
from dataclasses import dataclass


@dataclass
class SignalParams:
    w_esforco: float = 1.0
    w_climax: float = 1.0
    w_harmonia: float = 1.0
    w_no_demand: float = 1.0
    w_no_supply: float = 1.0
    threshold_long: float = 2.0
    threshold_short: float = -2.0


def _zscore(series: pd.Series, window: int = 100) -> pd.Series:
    mean = series.rolling(window).mean()
    std = series.rolling(window).std()
    return (series - mean) / std.replace(0, np.nan)


def compute_score(df: pd.DataFrame, params: SignalParams, zscore_window: int = 100) -> pd.DataFrame:
    df = df.copy()

    # normaliza esforço_resultado via zscore (para ficar na mesma escala dos outros componentes,
    # que já são limitados: climax_signal em {-1,0,1}, harmonia em [-1,1], no_demand/no_supply em {0,1})
    esforco_z = _zscore(df["esforco_resultado"], zscore_window).clip(-3, 3) / 3  # normaliza p/ [-1,1]

    df["score"] = (
        params.w_esforco * esforco_z.fillna(0)
        + params.w_climax * df["climax_signal"].fillna(0)
        + params.w_harmonia * df["harmonia_divergencia"].fillna(0)
        + params.w_no_demand * (-df["no_demand"].fillna(0))  # no_demand = fraqueza em alta -> puxa score p/ baixo
        + params.w_no_supply * (df["no_supply"].fillna(0))   # no_supply = fraqueza em baixa -> puxa score p/ cima
    )

    df["signal"] = 0
    df.loc[df["score"] > params.threshold_long, "signal"] = 1
    df.loc[df["score"] < params.threshold_short, "signal"] = -1

    return df
