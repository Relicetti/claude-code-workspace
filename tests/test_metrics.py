import numpy as np
import pandas as pd

from metrics import cagr, max_drawdown, sharpe, sortino, win_rate, summarize


def test_cagr_known_growth():
    # equity dobra em exatamente 1 ano de candles de 1h
    periods_per_year = 24 * 365
    equity = pd.Series(np.linspace(1.0, 2.0, periods_per_year))
    result = cagr(equity, periods_per_year=periods_per_year)
    assert np.isclose(result, 1.0, atol=1e-6)  # +100% no ano


def test_cagr_empty_is_nan():
    assert np.isnan(cagr(pd.Series(dtype=float)))


def test_max_drawdown_known_series():
    equity = pd.Series([1.0, 1.2, 0.9, 1.1, 0.6, 1.5])
    # pico 1.2 -> vale 0.9 (queda de 25%), depois pico 1.1 -> vale 0.6 (queda de ~45.45%)
    result = max_drawdown(equity)
    assert np.isclose(result, (0.6 - 1.2) / 1.2, atol=1e-6)


def test_sharpe_zero_std_is_nan():
    returns = pd.Series([0.02, 0.02, 0.02])
    assert np.isnan(sharpe(returns))


def test_sortino_no_downside_is_nan():
    returns = pd.Series([0.01, 0.02, 0.03])
    assert np.isnan(sortino(returns))


def test_sortino_penalizes_only_downside():
    returns = pd.Series([0.01, -0.02, 0.03, -0.01, 0.02])
    result = sortino(returns)
    downside_std = returns[returns < 0].std()
    expected = (returns.mean() / downside_std) * np.sqrt(24 * 365)
    assert np.isclose(result, expected)


def test_win_rate_ignores_zero_return_periods():
    returns = pd.Series([0.0, 0.01, -0.01, 0.02, 0.0, -0.02])
    # trades: 0.01 (win), -0.01 (loss), 0.02 (win), -0.02 (loss) -> 2/4 = 50%
    assert np.isclose(win_rate(returns), 0.5)


def test_win_rate_no_trades_is_nan():
    assert np.isnan(win_rate(pd.Series([0.0, 0.0, 0.0])))


def test_summarize_returns_expected_keys_and_values():
    idx = pd.date_range("2023-01-01", periods=5, freq="1h")
    df = pd.DataFrame(
        {
            "strat_return_net": [0.0, 0.01, -0.005, 0.02, 0.0],
            "close": [100, 101, 100.5, 102.5, 102.5],
            "position": [0, 1, 1, 1, 0],
        },
        index=idx,
    )
    df["equity"] = (1 + df["strat_return_net"]).cumprod()

    result = summarize(df, selic_annual=0.10)

    expected_keys = {
        "período (anos, aprox.)", "CAGR estratégia", "CAGR buy-and-hold BTC",
        "Selic/CDI equivalente no período (retorno acumulado)", "Sharpe estratégia",
        "Sortino estratégia", "Max drawdown estratégia", "Max drawdown buy-and-hold",
        "Win rate (por candle com posição)", "Número de trades (mudanças de posição)",
    }
    assert expected_keys == set(result.keys())
    # duas mudanças de posição: 0->1 no início e 1->0 no fim
    assert result["Número de trades (mudanças de posição)"] == 2
