import numpy as np
import pandas as pd
import pytest

from stormer_setups import (
    prepare_indicators, SETUP_REGISTRY,
    detect_rompimento_maxima_anterior, detect_media_9, detect_ifr2_com_filtro,
)
from stormer_backtest import run_all_setups, summarize_all


def test_prepare_indicators_adds_expected_columns(random_ohlcv):
    df = prepare_indicators(random_ohlcv)
    expected = {
        "ema9", "ema10", "ema10_disp1", "ema21", "ema49", "ema50", "ema55",
        "ema3_disp3", "ema5", "ifr14", "ifr14_ma13", "ifr2", "atr14", "vol_ma20",
        "bb_mid", "bb_upper", "bb_lower", "close_pos",
    }
    assert expected.issubset(df.columns)


def test_rompimento_maxima_generates_order_on_breakout():
    n = 10
    idx = pd.date_range("2024-01-01", periods=n, freq="1h")
    high = np.array([101, 102, 103, 104, 110, 106, 107, 108, 109, 110], dtype=float)
    low = high - 2
    close = high - 0.5
    open_ = low + 0.5
    df = pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": np.full(n, 100.0)},
        index=idx,
    )
    df = prepare_indicators(df)
    orders = detect_rompimento_maxima_anterior(df, ifr_filter=False)
    # deve haver uma ordem de referência na barra 3 (máxima=104), disparada pela barra 4 (close=109.5>104)
    ref3 = [o for o in orders if o.ref_idx == 3]
    assert len(ref3) == 1
    assert ref3[0].trigger_price == pytest.approx(104)
    assert ref3[0].stop_price == pytest.approx(low[3])


def test_media_9_turn_up_creates_long_order():
    n = 20
    idx = pd.date_range("2024-01-01", periods=n, freq="1h")
    # queda seguida de virada abrupta pra cima, pra forçar ema9 virar de queda pra alta
    close = np.concatenate([
        np.linspace(120, 100, 10),
        np.linspace(100, 130, 10),
    ])
    high = close + 1
    low = close - 1
    open_ = close
    df = pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": np.full(n, 100.0)},
        index=idx,
    )
    df = prepare_indicators(df)
    orders = detect_media_9(df, direction="long")
    assert len(orders) >= 1
    for o in orders:
        assert o.direction == "long"
        assert o.trigger_price == pytest.approx(df["high"].iloc[o.ref_idx])


def test_ifr2_com_filtro_respects_ma49_regime_filter():
    n = 60
    idx = pd.date_range("2024-01-01", periods=n, freq="1h")
    rng = np.random.default_rng(7)
    # forte tendência de baixa: preço bem abaixo da própria EMA49 o tempo todo
    close = 200 - np.linspace(0, 150, n) + rng.normal(0, 0.5, n)
    high = close + 1
    low = close - 1
    open_ = close
    df = pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": np.full(n, 100.0)},
        index=idx,
    )
    df = prepare_indicators(df)
    orders = detect_ifr2_com_filtro(df, direction="long")
    # regra: nunca compra abaixo da MM49
    for o in orders:
        assert df["close"].iloc[o.ref_idx] >= df["ema49"].iloc[o.ref_idx]


def test_all_registered_setups_run_without_error(random_ohlcv):
    """Smoke test: cada um dos 24 setups deve rodar de ponta a ponta sem lançar exceção
    e produzir um DataFrame de trades com colunas consistentes."""
    results = run_all_setups(random_ohlcv)
    assert set(results.keys()) == set(SETUP_REGISTRY.keys())
    for setup_id, trades_df in results.items():
        assert list(trades_df.columns) == [
            "setup_id", "direction", "entry_time", "entry_price", "initial_stop",
            "exit_time", "n_exits", "exit_reasons", "pnl_pct", "r_multiple", "closed",
        ] or trades_df.empty
        if not trades_df.empty:
            assert (trades_df["setup_id"] == setup_id).all()
            assert trades_df["closed"].all()
            assert trades_df["direction"].isin(["long", "short"]).all()


def test_summarize_all_win_rate_bounds(random_ohlcv):
    results = run_all_setups(random_ohlcv)
    summary = summarize_all(results)
    valid_wr = summary["win_rate"].dropna()
    assert ((valid_wr >= 0) & (valid_wr <= 1)).all()
    assert (summary["n_trades"] >= 0).all()


def test_no_lookahead_in_registry_detectors(random_ohlcv):
    """Ordens geradas a partir de um prefixo dos dados não podem depender de barras futuras:
    toda ordem cujo ref_idx caiba no prefixo tem que aparecer igual nos dois cálculos."""
    df_full = prepare_indicators(random_ohlcv)
    cutoff = 300
    df_trunc = prepare_indicators(random_ohlcv.iloc[:cutoff])

    for setup_id, spec in SETUP_REGISTRY.items():
        orders_full = spec["generate"](df_full)
        orders_trunc = spec["generate"](df_trunc)

        def key(o):
            return (o.ref_idx, o.direction, round(o.trigger_price, 6))

        full_in_range = {key(o) for o in orders_full if o.ref_idx < cutoff - 5}
        trunc_in_range = {key(o) for o in orders_trunc if o.ref_idx < cutoff - 5}
        assert full_in_range == trunc_in_range, f"{setup_id} parece usar dados futuros"
