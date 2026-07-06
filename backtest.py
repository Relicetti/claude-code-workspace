"""
Backtest com walk-forward: evita usar dados futuros para calibrar parâmetros
que depois são testados no passado (look-ahead) ou treinar e testar no mesmo
período (in-sample overfitting).

Lógica:
  - Divide os dados em janelas [treino | teste] que rolam no tempo.
  - Em cada janela de treino, faz grid search dos parâmetros (thresholds).
  - Aplica os parâmetros vencedores SOMENTE na janela de teste seguinte
    (dado nunca visto pelo otimizador).
  - Concatena todos os períodos de teste -> essa é a curva "out-of-sample" real.
"""
import pandas as pd
import numpy as np
import itertools
from dataclasses import replace

from features import add_vsa_features
from vsa_signal import SignalParams, compute_score

TAKER_FEE = 0.0004  # taxa de mercado (futures Binance ~0.04%); ajuste se necessário


def apply_costs(returns: pd.Series, signal: pd.Series, fee: float = TAKER_FEE) -> pd.Series:
    """Aplica custo de transação toda vez que o sinal muda (entra/sai/inverte posição)."""
    trade_occurred = signal.diff().abs().fillna(0) > 0
    costs = trade_occurred * fee
    return returns - costs


def run_single_backtest(df: pd.DataFrame, params: SignalParams) -> pd.DataFrame:
    df = compute_score(df, params)
    # posição = sinal do candle anterior (evita look-ahead: decide no fechamento, executa no próximo)
    df["position"] = df["signal"].shift(1).fillna(0)
    price_return = df["close"].pct_change().fillna(0)
    strat_return = df["position"] * price_return
    df["strat_return_net"] = apply_costs(strat_return, df["position"])
    df["equity"] = (1 + df["strat_return_net"]).cumprod()
    return df


def sharpe_ratio(returns: pd.Series, periods_per_year: int = 24 * 365) -> float:
    if returns.std() == 0 or returns.empty:
        return -np.inf
    return (returns.mean() / returns.std()) * np.sqrt(periods_per_year)


def grid_search(df_train: pd.DataFrame, param_grid: dict) -> SignalParams:
    """Busca simples em grade — otimiza Sharpe no período de TREINO apenas."""
    best_sharpe = -np.inf
    best_params = None
    keys = list(param_grid.keys())
    for combo in itertools.product(*param_grid.values()):
        params = SignalParams(**dict(zip(keys, combo)))
        result = run_single_backtest(df_train, params)
        s = sharpe_ratio(result["strat_return_net"])
        if s >= best_sharpe:
            best_sharpe = s
            best_params = params
    return best_params, best_sharpe


def walk_forward(
    df: pd.DataFrame,
    train_size: int,
    test_size: int,
    param_grid: dict,
) -> pd.DataFrame:
    """
    train_size / test_size em número de candles (ex: 1h candles:
    train_size=24*180 (~6 meses), test_size=24*30 (~1 mês)).
    """
    oos_frames = []
    fold_log = []
    start = 0
    n = len(df)

    while start + train_size + test_size <= n:
        train = df.iloc[start: start + train_size]
        test = df.iloc[start + train_size: start + train_size + test_size]

        best_params, train_sharpe = grid_search(train, param_grid)
        test_result = run_single_backtest(test, best_params)

        oos_frames.append(test_result)
        fold_log.append({
            "train_start": train.index[0], "train_end": train.index[-1],
            "test_start": test.index[0], "test_end": test.index[-1],
            "best_params": best_params, "train_sharpe": train_sharpe,
            "test_sharpe": sharpe_ratio(test_result["strat_return_net"]),
        })

        start += test_size  # rola a janela

    oos = pd.concat(oos_frames)
    # recalcula equity contínua sobre toda a curva out-of-sample concatenada
    oos["equity"] = (1 + oos["strat_return_net"]).cumprod()
    return oos, pd.DataFrame(fold_log)
