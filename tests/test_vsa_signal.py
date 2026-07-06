import numpy as np
import pandas as pd

from vsa_signal import SignalParams, compute_score, _zscore


def _make_components_df(n=20):
    idx = pd.date_range("2023-01-01", periods=n, freq="1h")
    return pd.DataFrame(
        {
            "esforco_resultado": np.zeros(n),
            "climax_signal": np.zeros(n),
            "harmonia_divergencia": np.zeros(n),
            "no_demand": np.zeros(n),
            "no_supply": np.zeros(n),
        },
        index=idx,
    )


def test_signal_params_defaults():
    params = SignalParams()
    assert params.w_esforco == 1.0
    assert params.threshold_long == 2.0
    assert params.threshold_short == -2.0


def test_zscore_constant_series_is_nan():
    series = pd.Series(np.full(20, 5.0))
    z = _zscore(series, window=5)
    assert z.iloc[10:].isna().all()  # std=0 -> divisão por NaN


def test_compute_score_all_neutral_gives_zero_signal():
    df = _make_components_df()
    params = SignalParams()
    result = compute_score(df, params, zscore_window=5)
    # sem variação nas métricas, score fica 0 e sinal neutro
    assert (result["score"].iloc[10:] == 0).all()
    assert (result["signal"].iloc[10:] == 0).all()


def test_compute_score_strong_bullish_components_trigger_long():
    df = _make_components_df()
    df.loc[df.index[10], "climax_signal"] = 1
    df.loc[df.index[10], "harmonia_divergencia"] = 1.0
    df.loc[df.index[10], "no_supply"] = 1  # fraqueza em baixa -> puxa score p/ cima

    params = SignalParams(threshold_long=2.0, threshold_short=-2.0)
    result = compute_score(df, params, zscore_window=5)

    assert result["score"].iloc[10] > params.threshold_long
    assert result["signal"].iloc[10] == 1


def test_compute_score_strong_bearish_components_trigger_short():
    df = _make_components_df()
    df.loc[df.index[10], "climax_signal"] = -1
    df.loc[df.index[10], "harmonia_divergencia"] = -1.0
    df.loc[df.index[10], "no_demand"] = 1  # fraqueza em alta -> puxa score p/ baixo

    params = SignalParams(threshold_long=2.0, threshold_short=-2.0)
    result = compute_score(df, params, zscore_window=5)

    assert result["score"].iloc[10] < params.threshold_short
    assert result["signal"].iloc[10] == -1
