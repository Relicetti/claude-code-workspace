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
    if params.stop_atr is not None or params.take_atr is not None:
        return simulate_with_stops(df, params.stop_atr, params.take_atr)
    # posição = sinal do candle anterior (evita look-ahead: decide no fechamento, executa no próximo)
    df["position"] = df["signal"].shift(1).fillna(0)
    price_return = df["close"].pct_change().fillna(0)
    strat_return = df["position"] * price_return
    df["strat_return_net"] = apply_costs(strat_return, df["position"])
    df["equity"] = (1 + df["strat_return_net"]).cumprod()
    return df


def simulate_with_stops(
    df: pd.DataFrame,
    stop_atr: float | None,
    take_atr: float | None,
    fee: float = TAKER_FEE,
) -> pd.DataFrame:
    """
    Simulação candle a candle com stop-loss/take-profit em múltiplos de ATR.
    Espera colunas: open, high, low, close, atr, signal.

    Convenções (deliberadamente conservadoras):
      - entrada/troca de posição executa ao fechamento do candle anterior
        (mesma convenção do caminho vetorizado sem stops)
      - stop e alvo usam o ATR do candle de entrada (sem look-ahead)
      - se stop E alvo caberiam no mesmo candle, assume que o stop bateu primeiro
      - gap além do stop sai no pior preço (abertura); gap além do alvo sai no
        próprio alvo (não credita o gap favorável)
      - após sair por stop/alvo, só reentra quando o sinal mudar de valor —
        evita reentrada imediata no mesmo sinal que acabou de estopar
      - taxa cobrada a cada mudança de posição e a cada saída por stop/alvo
    """
    df = df.copy()
    open_ = df["open"].to_numpy(dtype=float)
    high = df["high"].to_numpy(dtype=float)
    low = df["low"].to_numpy(dtype=float)
    close = df["close"].to_numpy(dtype=float)
    atr_arr = df["atr"].to_numpy(dtype=float)
    signal = df["signal"].to_numpy()

    n = len(df)
    position = np.zeros(n)
    net_ret = np.zeros(n)
    exit_reason = np.full(n, "", dtype=object)

    pos = 0
    stop_price = np.nan
    take_price = np.nan
    blocked = 0  # sinal que acabou de estopar; enquanto persistir, fica de fora

    for t in range(1, n):
        desired = signal[t - 1]
        if blocked != 0 and desired != blocked:
            blocked = 0
        if blocked != 0:
            desired = 0

        prev_close = close[t - 1]
        ret = 0.0

        if desired != pos:
            ret -= fee
            pos = desired
            if pos != 0:
                entry = prev_close
                a = atr_arr[t - 1]  # ATR conhecido no momento da decisão
                stop_price = entry - pos * stop_atr * a if stop_atr is not None else np.nan
                take_price = entry + pos * take_atr * a if take_atr is not None else np.nan

        position[t] = pos

        if pos != 0:
            # NaN em stop/take (desligado ou ATR ainda sem valor) nunca dispara
            hit_stop = low[t] <= stop_price if pos > 0 else high[t] >= stop_price
            hit_take = high[t] >= take_price if pos > 0 else low[t] <= take_price

            if hit_stop:
                # gap além do stop: sai na abertura (pior preço), não no stop teórico
                exit_price = min(stop_price, open_[t]) if pos > 0 else max(stop_price, open_[t])
                ret += pos * (exit_price / prev_close - 1) - fee
                exit_reason[t] = "stop"
                blocked = pos
                pos = 0
                stop_price = take_price = np.nan
            elif hit_take:
                ret += pos * (take_price / prev_close - 1) - fee
                exit_reason[t] = "take"
                blocked = pos
                pos = 0
                stop_price = take_price = np.nan
            else:
                ret += pos * (close[t] / prev_close - 1)

        net_ret[t] = ret

    df["position"] = position
    df["strat_return_net"] = net_ret
    df["exit_reason"] = exit_reason
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
