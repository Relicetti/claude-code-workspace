"""
Métricas de performance + comparação com benchmarks (buy-and-hold, CDI/Selic).
"""
import pandas as pd
import numpy as np


def cagr(equity: pd.Series, periods_per_year: int = 24 * 365) -> float:
    n_periods = len(equity)
    if n_periods == 0 or equity.iloc[0] <= 0:
        return np.nan
    total_return = equity.iloc[-1] / equity.iloc[0]
    years = n_periods / periods_per_year
    return total_return ** (1 / years) - 1 if years > 0 else np.nan


def max_drawdown(equity: pd.Series) -> float:
    running_max = equity.cummax()
    drawdown = (equity - running_max) / running_max
    return drawdown.min()


def sharpe(returns: pd.Series, periods_per_year: int = 24 * 365) -> float:
    if returns.std() == 0:
        return np.nan
    return (returns.mean() / returns.std()) * np.sqrt(periods_per_year)


def sortino(returns: pd.Series, periods_per_year: int = 24 * 365) -> float:
    downside = returns[returns < 0]
    if downside.std() == 0 or downside.empty:
        return np.nan
    return (returns.mean() / downside.std()) * np.sqrt(periods_per_year)


def win_rate(returns: pd.Series) -> float:
    trades = returns[returns != 0]
    if trades.empty:
        return np.nan
    return (trades > 0).mean()


def summarize(oos_df: pd.DataFrame, selic_annual: float = 0.15) -> dict:
    """
    selic_annual: taxa anual aproximada da Selic/CDI no período testado,
    pra comparação de custo de oportunidade (ajuste conforme o período real).
    """
    strat_returns = oos_df["strat_return_net"]
    strat_equity = oos_df["equity"]

    buy_hold_returns = oos_df["close"].pct_change().fillna(0)
    buy_hold_equity = (1 + buy_hold_returns).cumprod()

    n_periods = len(oos_df)
    years = n_periods / (24 * 365)
    selic_equity_final = (1 + selic_annual) ** years

    return {
        "período (anos, aprox.)": round(years, 2),
        "CAGR estratégia": f"{cagr(strat_equity):.2%}",
        "CAGR buy-and-hold BTC": f"{cagr(buy_hold_equity):.2%}",
        "Selic/CDI equivalente no período (retorno acumulado)": f"{selic_equity_final - 1:.2%}",
        "Sharpe estratégia": round(sharpe(strat_returns), 2),
        "Sortino estratégia": round(sortino(strat_returns), 2),
        "Max drawdown estratégia": f"{max_drawdown(strat_equity):.2%}",
        "Max drawdown buy-and-hold": f"{max_drawdown(buy_hold_equity):.2%}",
        "Win rate (por candle com posição)": f"{win_rate(strat_returns):.2%}",
        "Número de trades (mudanças de posição)": int(oos_df["position"].diff().abs().gt(0).sum()),
    }
