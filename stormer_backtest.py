"""
Camada de execução/relatório para os setups Stormer (stormer_setups.py + stormer_engine.py).

Os thresholds percentuais do documento-fonte (8%, 0,61, 0,14, ...) foram
calibrados em ações brasileiras nos anos 2000-2010 (ver Observações #5 do
documento). `crypto_calibration` escala os alvos percentuais (`target_pct`,
`second_target_pct`) de cada setup por um único fator multiplicativo — ponto
de partida pra recalibração via walk-forward, não um valor definitivo.
"""
import pandas as pd

from stormer_setups import SETUP_REGISTRY, prepare_indicators
from stormer_engine import simulate_orders, trades_to_frame

_PCT_PARAM_NAMES = {"target_pct", "second_target_pct", "short_target_pct"}


def _scale_pct_params(params: dict, factor: float) -> dict:
    if factor == 1.0:
        return params
    return {k: (v * factor if k in _PCT_PARAM_NAMES else v) for k, v in params.items()}


def run_setup(df: pd.DataFrame, setup_id: str, params: dict = None,
              crypto_calibration: float = 1.0, prepared: bool = False) -> pd.DataFrame:
    """Roda um único setup sobre o df e devolve o DataFrame de trades."""
    if setup_id not in SETUP_REGISTRY:
        raise KeyError(f"setup desconhecido: {setup_id}. Disponíveis: {list(SETUP_REGISTRY)}")
    if not prepared:
        df = prepare_indicators(df)
    params = _scale_pct_params(params or {}, crypto_calibration)
    orders = SETUP_REGISTRY[setup_id]["generate"](df, **params)
    trades = simulate_orders(df, orders)
    return trades_to_frame(trades)


def run_all_setups(df: pd.DataFrame, crypto_calibration: float = 1.0,
                    setup_params: dict = None) -> dict:
    """Roda todos os setups registrados. Devolve {setup_id: trades_df}."""
    df = prepare_indicators(df)
    setup_params = setup_params or {}
    results = {}
    for setup_id in SETUP_REGISTRY:
        results[setup_id] = run_setup(
            df, setup_id, params=setup_params.get(setup_id, {}),
            crypto_calibration=crypto_calibration, prepared=True,
        )
    return results


def summarize_trades(trades_df: pd.DataFrame) -> dict:
    if trades_df.empty:
        return {
            "n_trades": 0, "win_rate": float("nan"), "avg_r": float("nan"),
            "expectancy_r": float("nan"), "total_r": 0.0,
        }
    wins = trades_df["r_multiple"] > 0
    return {
        "n_trades": len(trades_df),
        "win_rate": wins.mean(),
        "avg_r": trades_df["r_multiple"].mean(),
        "expectancy_r": trades_df["r_multiple"].mean(),
        "total_r": trades_df["r_multiple"].sum(),
    }


def summarize_all(results: dict) -> pd.DataFrame:
    rows = []
    for setup_id, trades_df in results.items():
        stats = summarize_trades(trades_df)
        rows.append({
            "setup_id": setup_id,
            "name": SETUP_REGISTRY[setup_id]["name"],
            "tactic": SETUP_REGISTRY[setup_id]["tactic"],
            **stats,
        })
    return pd.DataFrame(rows).sort_values("tactic").reset_index(drop=True)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Roda os setups Stormer sobre um CSV de OHLCV.")
    parser.add_argument("--csv", type=str, required=True, help="CSV com colunas timestamp,open,high,low,close,volume")
    parser.add_argument("--setup", type=str, default=None, help="rodar só um setup_id (default: todos)")
    parser.add_argument("--crypto_calibration", type=float, default=1.0)
    args = parser.parse_args()

    df = pd.read_csv(args.csv, index_col="timestamp", parse_dates=True)

    if args.setup:
        trades = run_setup(df, args.setup, crypto_calibration=args.crypto_calibration)
        print(trades)
        print(summarize_trades(trades))
    else:
        results = run_all_setups(df, crypto_calibration=args.crypto_calibration)
        summary = summarize_all(results)
        print(summary.to_string(index=False))
