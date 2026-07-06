import numpy as np
import pandas as pd

from features import add_vsa_features
from vsa_signal import SignalParams
from backtest import apply_costs, run_single_backtest, sharpe_ratio, grid_search, walk_forward


def test_apply_costs_only_charges_on_signal_change():
    idx = pd.date_range("2023-01-01", periods=5, freq="1h")
    returns = pd.Series([0.01, 0.01, 0.01, 0.01, 0.01], index=idx)
    signal = pd.Series([0, 1, 1, -1, -1], index=idx)  # muda em t=1 e t=3

    result = apply_costs(returns, signal, fee=0.001)

    assert np.isclose(result.iloc[0], 0.01)          # sem mudança de posição
    assert np.isclose(result.iloc[1], 0.01 - 0.001)   # 0 -> 1, cobra taxa
    assert np.isclose(result.iloc[2], 0.01)           # mantém 1
    assert np.isclose(result.iloc[3], 0.01 - 0.001)   # 1 -> -1, cobra taxa
    assert np.isclose(result.iloc[4], 0.01)           # mantém -1


def test_run_single_backtest_no_lookahead_first_position_is_zero(random_ohlcv):
    df = add_vsa_features(random_ohlcv)
    result = run_single_backtest(df, SignalParams())
    # não existe sinal anterior ao primeiro candle -> posição inicial deve ser neutra
    assert result["position"].iloc[0] == 0
    # posição no candle t é o sinal do candle t-1 (shift), nunca o do próprio candle
    assert (result["position"].iloc[1:].values == result["signal"].shift(1).iloc[1:].values).all()


def test_sharpe_ratio_zero_std_returns_negative_inf():
    returns = pd.Series([0.01, 0.01, 0.01])
    assert sharpe_ratio(returns) == -np.inf


def test_sharpe_ratio_empty_returns_negative_inf():
    assert sharpe_ratio(pd.Series(dtype=float)) == -np.inf


def test_grid_search_single_combo_returns_that_combo(random_ohlcv):
    df = add_vsa_features(random_ohlcv)
    grid = {
        "w_esforco": [0.7], "w_climax": [0.7], "w_harmonia": [0.7],
        "w_no_demand": [0.7], "w_no_supply": [0.7],
        "threshold_long": [2.0], "threshold_short": [-2.0],
    }
    best_params, best_sharpe = grid_search(df, grid)
    assert best_params == SignalParams(
        w_esforco=0.7, w_climax=0.7, w_harmonia=0.7,
        w_no_demand=0.7, w_no_supply=0.7,
        threshold_long=2.0, threshold_short=-2.0,
    )


def test_walk_forward_fold_count_and_no_gaps(random_ohlcv):
    df = add_vsa_features(random_ohlcv).iloc[:220]
    train_size, test_size = 100, 50
    grid = {
        "w_esforco": [1.0], "w_climax": [1.0], "w_harmonia": [1.0],
        "w_no_demand": [1.0], "w_no_supply": [1.0],
        "threshold_long": [2.0], "threshold_short": [-2.0],
    }

    oos, fold_log = walk_forward(df, train_size, test_size, grid)

    # com n=220, train=100, test=50: janelas em start=0 e start=50 cabem (0+150<=220, 50+150<=220);
    # start=100 não cabe (100+150=250>220)
    assert len(fold_log) == 2
    assert len(oos) == 2 * test_size

    # janelas de teste não se sobrepõem nem deixam buracos
    assert fold_log["test_start"].iloc[1] == df.index[train_size + test_size]
