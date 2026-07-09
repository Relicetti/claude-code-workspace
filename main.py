"""
Pipeline completo: dados -> features VSA -> walk-forward -> métricas.

Uso:
    python main.py                     # busca dados novos da Binance
    python main.py --csv btc_usdt_1h.csv   # usa CSV já salvo (mais rápido p/ iterar)
"""
import argparse
import pandas as pd

from data_loader import fetch_ohlcv, save_to_csv
from features import add_vsa_features
from backtest import walk_forward
from metrics import summarize


def parse_atr_list(arg: str) -> list:
    """'none,2,3' -> [None, 2.0, 3.0]"""
    return [None if tok.strip().lower() in ("none", "off") else float(tok)
            for tok in arg.split(",")]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=str, default=None, help="usar CSV local em vez de buscar da API")
    parser.add_argument("--since_days", type=int, default=730)
    parser.add_argument("--train_days", type=int, default=180)
    parser.add_argument("--test_days", type=int, default=30)
    parser.add_argument("--stop_atr", type=str, default="none",
                        help="stops em múltiplos de ATR p/ o grid, ex: '2,3' ou 'none,2' (none = sem stop)")
    parser.add_argument("--take_atr", type=str, default="none",
                        help="alvos em múltiplos de ATR p/ o grid, ex: '3,5' ou 'none,3' (none = sem alvo)")
    args = parser.parse_args()

    if args.csv:
        df = pd.read_csv(args.csv, index_col="timestamp", parse_dates=True)
    else:
        df = fetch_ohlcv(symbol="BTC/USDT", timeframe="1h", since_days=args.since_days)
        save_to_csv(df, "btc_usdt_1h.csv")

    df = add_vsa_features(df)

    # grid pequeno pra começar — expandir depois que o pipeline estiver validado
    param_grid = {
        "w_esforco": [0.5, 1.0],
        "w_climax": [0.5, 1.0],
        "w_harmonia": [0.5, 1.0],
        "w_no_demand": [0.5, 1.0],
        "w_no_supply": [0.5, 1.0],
        "threshold_long": [1.5, 2.0, 2.5],
        "threshold_short": [-2.5, -2.0, -1.5],
        "stop_atr": parse_atr_list(args.stop_atr),
        "take_atr": parse_atr_list(args.take_atr),
    }

    train_size = args.train_days * 24
    test_size = args.test_days * 24

    oos, fold_log = walk_forward(df, train_size, test_size, param_grid)

    print("\n=== Resultado por janela (walk-forward) ===")
    print(fold_log[["train_start", "train_end", "test_start", "test_end",
                     "train_sharpe", "test_sharpe"]].to_string(index=False))

    print("\n=== Resumo out-of-sample (todas as janelas de teste concatenadas) ===")
    for k, v in summarize(oos).items():
        print(f"{k}: {v}")

    oos.to_csv("oos_results.csv")
    fold_log.to_csv("fold_log.csv", index=False)
    print("\nSalvo: oos_results.csv, fold_log.csv")


if __name__ == "__main__":
    main()
