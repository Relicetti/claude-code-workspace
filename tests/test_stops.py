"""Testes de stop-loss/take-profit (simulate_with_stops) com candles construídos à mão."""
import numpy as np
import pandas as pd
import pytest

from features import add_vsa_features
from vsa_signal import SignalParams
from backtest import run_single_backtest, simulate_with_stops


def make_df(rows):
    """rows: lista de dicts com open/high/low/close/atr/signal."""
    idx = pd.date_range("2023-01-01", periods=len(rows), freq="1h")
    df = pd.DataFrame(rows, index=idx)
    df.index.name = "timestamp"
    return df


def test_stop_loss_exits_long_at_stop_price():
    # entra long ao fechamento de t0 (100); stop = 100 - 2*5 = 90; t1 cai até 85
    df = make_df([
        {"open": 100, "high": 101, "low": 99, "close": 100, "atr": 5.0, "signal": 1},
        {"open": 98, "high": 99, "low": 85, "close": 88, "atr": 5.0, "signal": 1},
        {"open": 88, "high": 89, "low": 87, "close": 88, "atr": 5.0, "signal": 1},
    ])
    result = simulate_with_stops(df, stop_atr=2.0, take_atr=None, fee=0.0)

    assert result["exit_reason"].iloc[1] == "stop"
    assert np.isclose(result["strat_return_net"].iloc[1], 90 / 100 - 1)  # sai no stop, não no close
    # sinal continua 1, mas acabou de estopar -> não reentra
    assert result["position"].iloc[2] == 0
    assert np.isclose(result["strat_return_net"].iloc[2], 0.0)


def test_take_profit_exits_long_at_target():
    # alvo = 100 + 3*5 = 115; t1 sobe até 120 mas fecha em 110
    df = make_df([
        {"open": 100, "high": 101, "low": 99, "close": 100, "atr": 5.0, "signal": 1},
        {"open": 102, "high": 120, "low": 101, "close": 110, "atr": 5.0, "signal": 1},
    ])
    result = simulate_with_stops(df, stop_atr=None, take_atr=3.0, fee=0.0)

    assert result["exit_reason"].iloc[1] == "take"
    assert np.isclose(result["strat_return_net"].iloc[1], 115 / 100 - 1)


def test_stop_wins_when_stop_and_take_hit_same_candle():
    # candle t1 varre 85..120: stop (90) e alvo (115) cabem nele -> assume stop primeiro
    df = make_df([
        {"open": 100, "high": 101, "low": 99, "close": 100, "atr": 5.0, "signal": 1},
        {"open": 100, "high": 120, "low": 85, "close": 100, "atr": 5.0, "signal": 1},
    ])
    result = simulate_with_stops(df, stop_atr=2.0, take_atr=3.0, fee=0.0)

    assert result["exit_reason"].iloc[1] == "stop"
    assert np.isclose(result["strat_return_net"].iloc[1], 90 / 100 - 1)


def test_gap_beyond_stop_exits_at_open_not_stop():
    # abre em 80, abaixo do stop (90): sai na abertura (pior preço), não no stop teórico
    df = make_df([
        {"open": 100, "high": 101, "low": 99, "close": 100, "atr": 5.0, "signal": 1},
        {"open": 80, "high": 82, "low": 78, "close": 81, "atr": 5.0, "signal": 1},
    ])
    result = simulate_with_stops(df, stop_atr=2.0, take_atr=None, fee=0.0)

    assert result["exit_reason"].iloc[1] == "stop"
    assert np.isclose(result["strat_return_net"].iloc[1], 80 / 100 - 1)


def test_short_stop_loss_exits_at_stop_price():
    # short em 100; stop = 100 + 2*5 = 110; t1 sobe até 115
    df = make_df([
        {"open": 100, "high": 101, "low": 99, "close": 100, "atr": 5.0, "signal": -1},
        {"open": 103, "high": 115, "low": 102, "close": 112, "atr": 5.0, "signal": -1},
    ])
    result = simulate_with_stops(df, stop_atr=2.0, take_atr=None, fee=0.0)

    assert result["exit_reason"].iloc[1] == "stop"
    assert np.isclose(result["strat_return_net"].iloc[1], -(110 / 100 - 1))


def test_short_take_profit_exits_at_target():
    # short em 100; alvo = 100 - 3*5 = 85; t1 cai até 80
    df = make_df([
        {"open": 100, "high": 101, "low": 99, "close": 100, "atr": 5.0, "signal": -1},
        {"open": 98, "high": 99, "low": 80, "close": 84, "atr": 5.0, "signal": -1},
    ])
    result = simulate_with_stops(df, stop_atr=None, take_atr=3.0, fee=0.0)

    assert result["exit_reason"].iloc[1] == "take"
    assert np.isclose(result["strat_return_net"].iloc[1], -(85 / 100 - 1))


def test_reenters_after_signal_changes_value():
    # estopa no t1 com sinal 1; sinal vai a 0 no t2 e volta a 1 no t3 -> reentra no t4
    df = make_df([
        {"open": 100, "high": 101, "low": 99, "close": 100, "atr": 5.0, "signal": 1},
        {"open": 98, "high": 99, "low": 85, "close": 90, "atr": 5.0, "signal": 1},
        {"open": 90, "high": 91, "low": 89, "close": 90, "atr": 5.0, "signal": 0},
        {"open": 90, "high": 91, "low": 89, "close": 90, "atr": 5.0, "signal": 1},
        {"open": 90, "high": 91, "low": 89, "close": 91, "atr": 5.0, "signal": 1},
    ])
    result = simulate_with_stops(df, stop_atr=2.0, take_atr=None, fee=0.0)

    assert result["position"].iloc[2] == 0  # bloqueado: sinal ainda é 1
    assert result["position"].iloc[3] == 0  # sinal do candle anterior era 0
    assert result["position"].iloc[4] == 1  # sinal voltou a 1 -> reentra


def test_fee_charged_on_entry_and_stop_exit():
    df = make_df([
        {"open": 100, "high": 101, "low": 99, "close": 100, "atr": 5.0, "signal": 1},
        {"open": 98, "high": 99, "low": 85, "close": 88, "atr": 5.0, "signal": 1},
    ])
    fee = 0.001
    result = simulate_with_stops(df, stop_atr=2.0, take_atr=None, fee=fee)
    # entrada e saída no mesmo candle t1: taxa cobrada 2x
    assert np.isclose(result["strat_return_net"].iloc[1], (90 / 100 - 1) - 2 * fee)


def test_nan_atr_at_entry_disables_stop_for_that_trade():
    df = make_df([
        {"open": 100, "high": 101, "low": 99, "close": 100, "atr": np.nan, "signal": 1},
        {"open": 98, "high": 99, "low": 85, "close": 88, "atr": 5.0, "signal": 1},
    ])
    result = simulate_with_stops(df, stop_atr=2.0, take_atr=None, fee=0.0)

    assert result["exit_reason"].iloc[1] == ""  # sem ATR na entrada -> sem stop
    assert np.isclose(result["strat_return_net"].iloc[1], 88 / 100 - 1)


def test_huge_stops_match_vectorized_backtest(random_ohlcv):
    """Com stops largos demais pra disparar, o loop deve reproduzir o caminho vetorizado."""
    df = add_vsa_features(random_ohlcv)
    no_stops = run_single_backtest(df, SignalParams())
    with_stops = run_single_backtest(df, SignalParams(stop_atr=1e9, take_atr=1e9))

    assert np.allclose(
        no_stops["strat_return_net"].to_numpy(),
        with_stops["strat_return_net"].to_numpy(),
    )


def test_run_single_backtest_routes_to_stop_simulation(random_ohlcv):
    df = add_vsa_features(random_ohlcv)
    result = run_single_backtest(df, SignalParams(stop_atr=2.0, take_atr=3.0))
    assert "exit_reason" in result.columns
    assert result["position"].iloc[0] == 0
