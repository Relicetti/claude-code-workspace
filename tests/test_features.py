import numpy as np
import pandas as pd

from features import atr, add_vsa_features


def test_atr_constant_range():
    # high-low sempre 2, atr(period) deve convergir pra 2 depois que a janela enche
    n = 30
    idx = pd.date_range("2023-01-01", periods=n, freq="1h")
    df = pd.DataFrame(
        {"high": np.full(n, 101.0), "low": np.full(n, 99.0), "close": np.full(n, 100.0)},
        index=idx,
    )
    result = atr(df, period=14)
    assert result.iloc[:13].isna().all()
    assert np.isclose(result.iloc[13:], 2.0).all()


def test_add_vsa_features_flat_data(flat_ohlcv):
    df = add_vsa_features(flat_ohlcv)

    expected_cols = {
        "vol_ma", "vol_rel", "atr", "range_norm", "esforco_resultado", "close_pos",
        "climax", "climax_signal", "harmonia_divergencia", "no_demand", "no_supply",
    }
    assert expected_cols.issubset(df.columns)

    # dados constantes: volume relativo estabiliza em 1 depois da janela
    assert np.isclose(df["vol_rel"].iloc[25], 1.0)
    # sem clímax de volume em dados sem variação de volume
    assert (df["climax"].iloc[20:] == 0).all()
    # candles são doji (open == close) -> nunca conta como up nem down candle
    assert (df["no_demand"].iloc[20:] == 0).all()
    assert (df["no_supply"].iloc[20:] == 0).all()


def test_climax_detection_synthetic():
    # constrói candle isolado com volume 5x a média e corpo pequeno (indecisão)
    n = 30
    idx = pd.date_range("2023-01-01", periods=n, freq="1h")
    close = np.full(n, 100.0)
    volume = np.full(n, 100.0)
    volume[25] = 500.0  # pico de volume no candle 25

    df = pd.DataFrame(
        {
            "open": close.copy(),
            "high": close + 1.0,
            "low": close - 1.0,
            "close": close + 0.05,  # corpo pequeno -> body_ratio baixo
            "volume": volume,
        },
        index=idx,
    )
    result = add_vsa_features(df)
    assert result["climax"].iloc[25] == 1
    assert result["climax"].iloc[24] == 0


def test_no_demand_and_no_supply_synthetic():
    n = 30
    idx = pd.date_range("2023-01-01", periods=n, freq="1h")
    base_close = 100.0
    open_ = np.full(n, base_close)
    close = np.full(n, base_close)  # doji nos demais candles -> range normal (high-low=2)
    high = np.full(n, base_close + 1.0)
    low = np.full(n, base_close - 1.0)
    volume = np.full(n, 100.0)

    # candle 25: candle de alta com range MUITO mais estreito que o normal + volume baixo -> no_demand
    close[25] = base_close + 0.05
    high[25] = base_close + 0.1
    low[25] = base_close - 0.05
    volume[25] = 30.0

    df = pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=idx,
    )
    result = add_vsa_features(df)
    assert result["no_demand"].iloc[25] == 1
    assert result["no_supply"].iloc[25] == 0


def test_add_vsa_features_no_lookahead(random_ohlcv):
    """Cada linha só deve depender de dados até o próprio candle (rolling, sem shift negativo)."""
    df_full = add_vsa_features(random_ohlcv)
    truncated = random_ohlcv.iloc[:300]
    df_truncated = add_vsa_features(truncated)

    # as métricas calculadas até o candle 299 não podem mudar se dados futuros forem removidos
    pd.testing.assert_series_equal(
        df_full["esforco_resultado"].iloc[:300],
        df_truncated["esforco_resultado"],
        check_names=False,
    )
