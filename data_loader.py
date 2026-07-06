"""
Data loader — puxa OHLCV do BTC/USDT via ccxt (Binance).
Roda localmente (precisa de internet liberada para api.binance.com).
"""
import ccxt
import pandas as pd
import time


def fetch_ohlcv(
    symbol: str = "BTC/USDT",
    timeframe: str = "1h",
    since_days: int = 730,
    exchange_name: str = "binance",
) -> pd.DataFrame:
    """
    Busca OHLCV histórico paginando (Binance limita ~1000 candles por call).
    since_days: quantos dias de histórico buscar (730 = ~2 anos de 1h candles).
    """
    exchange = getattr(ccxt, exchange_name)()
    ms_per_candle = exchange.parse_timeframe(timeframe) * 1000
    since = exchange.milliseconds() - since_days * 24 * 60 * 60 * 1000

    all_candles = []
    while True:
        candles = exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=1000)
        if not candles:
            break
        all_candles += candles
        since = candles[-1][0] + ms_per_candle
        if len(candles) < 1000:
            break
        time.sleep(exchange.rateLimit / 1000)  # respeita rate limit

    df = pd.DataFrame(
        all_candles, columns=["timestamp", "open", "high", "low", "close", "volume"]
    )
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    df = df.drop_duplicates(subset="timestamp").set_index("timestamp").sort_index()
    return df


def save_to_csv(df: pd.DataFrame, path: str = "btc_usdt_1h.csv"):
    df.to_csv(path)
    print(f"Salvo: {path} ({len(df)} candles, {df.index.min()} até {df.index.max()})")


if __name__ == "__main__":
    df = fetch_ohlcv(symbol="BTC/USDT", timeframe="1h", since_days=730)
    save_to_csv(df)
