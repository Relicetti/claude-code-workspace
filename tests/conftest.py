"""Fixtures compartilhadas: dados OHLCV sintéticos, sem dependência de rede."""
import numpy as np
import pandas as pd
import pytest


@pytest.fixture
def random_ohlcv():
    """OHLCV sintético com tendência + ruído, determinístico (seed fixa)."""
    rng = np.random.default_rng(42)
    n = 500
    idx = pd.date_range("2023-01-01", periods=n, freq="1h")

    drift = np.linspace(0, 50, n)
    noise = rng.normal(0, 5, n).cumsum() * 0.1
    close = 100 + drift + noise

    open_ = close + rng.normal(0, 0.5, n)
    high = np.maximum(open_, close) + np.abs(rng.normal(0, 1, n))
    low = np.minimum(open_, close) - np.abs(rng.normal(0, 1, n))
    volume = rng.uniform(50, 150, n)

    df = pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=idx,
    )
    df.index.name = "timestamp"
    return df


@pytest.fixture
def flat_ohlcv():
    """OHLCV determinístico simples (sem ruído) pra checar valores exatos."""
    n = 40
    idx = pd.date_range("2023-01-01", periods=n, freq="1h")
    close = np.full(n, 100.0)
    df = pd.DataFrame(
        {
            "open": close.copy(),
            "high": close + 1.0,
            "low": close - 1.0,
            "close": close,
            "volume": np.full(n, 100.0),
        },
        index=idx,
    )
    df.index.name = "timestamp"
    return df
