import pandas as pd
import pytest

from stormer_engine import ExitSpec, PendingOrder, simulate_orders


def _bars(rows: list) -> pd.DataFrame:
    """rows: lista de dicts com open/high/low/close (volume opcional)."""
    idx = pd.date_range("2024-01-01", periods=len(rows), freq="1h")
    df = pd.DataFrame(rows, index=idx)
    if "volume" not in df.columns:
        df["volume"] = 100.0
    return df


def test_order_fills_on_close_break_and_stops_out():
    df = _bars([
        {"open": 100, "high": 101, "low": 99, "close": 100},   # 0: ref bar
        {"open": 100, "high": 104, "low": 99, "close": 104},   # 1: não rompe ainda
        {"open": 104, "high": 107, "low": 103, "close": 106},  # 2: rompe -> entra a 106
        {"open": 100, "high": 107, "low": 94, "close": 96},    # 3: stop a 95 é atingido
    ])
    order = PendingOrder(
        setup_id="t", ref_idx=0, direction="long", trigger_price=105, stop_price=95,
        exit_spec=ExitSpec(), valid_from=1,
    )
    trades = simulate_orders(df, [order])
    assert len(trades) == 1
    t = trades[0]
    assert t.entry_idx == 2 and t.entry_price == 106
    assert t.exits[-1][4] == "stop"
    assert t.exits[-1][2] == pytest.approx(95)
    assert t.r_multiple == pytest.approx(-1.0)
    assert t.closed


def test_partial_target_with_par_then_second_target():
    df = _bars([
        {"open": 100, "high": 101, "low": 99, "close": 100},    # 0: entra a 100 (at_close)
        {"open": 101, "high": 112, "low": 100, "close": 111},   # 1: bate alvo1 (110), PAR realizado
        {"open": 116, "high": 121, "low": 115, "close": 120},   # 2: bate alvo2 (120), sem tocar novo stop (110)
    ])
    spec = ExitSpec(target_pct=0.10, partial_fraction=0.5, use_par=True, second_target_pct=0.20)
    order = PendingOrder(
        setup_id="t", ref_idx=0, direction="long", trigger_price=100, stop_price=90,
        exit_spec=spec, valid_from=0, fill_mode="at_close",
    )
    trades = simulate_orders(df, [order])
    assert len(trades) == 1
    t = trades[0]
    assert t.entry_price == 100
    reasons = [e[4] for e in t.exits]
    assert reasons == ["alvo1", "alvo2"]
    assert t.exits[0][2] == pytest.approx(110)
    assert t.exits[1][2] == pytest.approx(120)
    assert t.r_multiple == pytest.approx(1.5)
    assert t.pnl_pct == pytest.approx(0.15)


def test_order_expires_without_triggering():
    df = _bars([
        {"open": 100, "high": 101, "low": 99, "close": 100},
        {"open": 100, "high": 101, "low": 99, "close": 100},
        {"open": 100, "high": 101, "low": 99, "close": 100},
        {"open": 100, "high": 101, "low": 99, "close": 100},
    ])
    order = PendingOrder(
        setup_id="t", ref_idx=0, direction="long", trigger_price=200, stop_price=90,
        exit_spec=ExitSpec(), valid_from=1, expires_after=2,
    )
    trades = simulate_orders(df, [order])
    assert trades == []


def test_invalidate_fn_cancels_order():
    df = _bars([
        {"open": 100, "high": 101, "low": 99, "close": 100},
        {"open": 100, "high": 110, "low": 99, "close": 108},  # romperia o trigger, mas invalidado
    ])
    order = PendingOrder(
        setup_id="t", ref_idx=0, direction="long", trigger_price=105, stop_price=90,
        exit_spec=ExitSpec(), valid_from=1,
        invalidate_fn=lambda df_, j: True,
    )
    trades = simulate_orders(df, [order])
    assert trades == []


def test_limit_touch_fill_mode():
    df = _bars([
        {"open": 100, "high": 101, "low": 99, "close": 100},   # 0: ref
        {"open": 108, "high": 109, "low": 104, "close": 108},  # 1: toca o nível 105 intrabar
    ])
    order = PendingOrder(
        setup_id="t", ref_idx=0, direction="long", trigger_price=105, stop_price=95,
        exit_spec=ExitSpec(), valid_from=1, fill_mode="limit_touch",
    )
    trades = simulate_orders(df, [order])
    assert len(trades) == 1
    assert trades[0].entry_price == 105
    assert trades[0].entry_idx == 1


def test_dynamic_stop_prev_bar_low():
    df = _bars([
        {"open": 100, "high": 101, "low": 99, "close": 100},    # 0
        {"open": 100, "high": 102, "low": 97, "close": 101},    # 1: low = 97, vira o stop no fill
        {"open": 101, "high": 107, "low": 100, "close": 106},   # 2: rompe 105 -> entra
    ])
    order = PendingOrder(
        setup_id="t", ref_idx=0, direction="long", trigger_price=105, stop_price=None,
        exit_spec=ExitSpec(), valid_from=1, dynamic_stop="prev_bar_low",
    )
    trades = simulate_orders(df, [order])
    assert len(trades) == 1
    assert trades[0].initial_stop == pytest.approx(97)


def test_prev_extreme_trailing_locks_in_gain():
    df = _bars([
        {"open": 100, "high": 101, "low": 98, "close": 100},    # 0: entra a 100 (at_close)
        {"open": 101, "high": 106, "low": 102, "close": 105},   # 1
        {"open": 105, "high": 105, "low": 99, "close": 100},    # 2
        {"open": 103, "high": 104, "low": 101, "close": 102},   # 3: stop (ratcheado pra 102) é atingido
    ])
    spec = ExitSpec(trailing="prev_extreme", trailing_lookback=1)
    order = PendingOrder(
        setup_id="t", ref_idx=0, direction="long", trigger_price=100, stop_price=90,
        exit_spec=spec, valid_from=0, fill_mode="at_close",
    )
    trades = simulate_orders(df, [order])
    assert len(trades) == 1
    t = trades[0]
    assert t.exits[-1][4] == "stop"
    # stop final ficou bem acima do stop inicial (90) -> trailing girou o risco a favor
    assert t.exits[-1][2] > 90
    assert t.r_multiple > -1.0


def test_force_closes_open_trade_at_end_of_data():
    df = _bars([
        {"open": 100, "high": 101, "low": 99, "close": 100},   # 0
        {"open": 100, "high": 107, "low": 99, "close": 106},   # 1: entra a 106
        {"open": 106, "high": 108, "low": 105, "close": 107},  # 2: nunca bate stop/alvo
    ])
    order = PendingOrder(
        setup_id="t", ref_idx=0, direction="long", trigger_price=105, stop_price=90,
        exit_spec=ExitSpec(), valid_from=1,
    )
    trades = simulate_orders(df, [order])
    assert len(trades) == 1
    t = trades[0]
    assert t.closed
    assert t.exits[-1][4] == "fim_dos_dados"
    assert t.exits[-1][2] == pytest.approx(107)


def test_at_most_one_open_trade_per_setup():
    df = _bars([
        {"open": 100, "high": 101, "low": 99, "close": 100},    # 0
        {"open": 100, "high": 107, "low": 99, "close": 106},    # 1: entra ordem A a 106
        {"open": 106, "high": 108, "low": 105, "close": 107},   # 2: ordem B nunca chega a ser avaliada
        {"open": 107, "high": 108, "low": 106, "close": 107},   # 3
    ])
    order_a = PendingOrder(
        setup_id="same", ref_idx=0, direction="long", trigger_price=105, stop_price=90,
        exit_spec=ExitSpec(), valid_from=1,
    )
    order_b = PendingOrder(
        setup_id="same", ref_idx=1, direction="long", trigger_price=90, stop_price=80,
        exit_spec=ExitSpec(), valid_from=2, fill_mode="at_close",
    )
    trades = simulate_orders(df, [order_a, order_b])
    assert len(trades) == 1  # B só seria considerada depois que A fechar
