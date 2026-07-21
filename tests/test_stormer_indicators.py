import numpy as np
import pandas as pd
import pytest

from stormer_indicators import (
    ema, displaced_ma, ifr, bollinger_bands, fura_teto, fura_chao,
    retracement_level, par_level, obv, ac_dd,
)


def test_ema_converges_to_constant_series():
    s = pd.Series(np.full(50, 10.0))
    result = ema(s, 9)
    assert np.isclose(result.iloc[-1], 10.0)
    assert result.iloc[:8].isna().all()


def test_displaced_ma_shifts_forward():
    s = pd.Series(np.arange(30, dtype=float))
    base = ema(s, 5)
    disp = displaced_ma(s, 5, 3)
    # deslocada 3 períodos à frente: valor em t deve casar com a base em t+3
    assert np.isclose(disp.iloc[10], base.iloc[13])
    assert disp.iloc[-3:].isna().all()  # sem dados futuros suficientes


def test_ifr_all_gains_is_100():
    s = pd.Series(np.arange(1, 30, dtype=float))  # sempre subindo
    result = ifr(s, 14)
    assert np.isclose(result.iloc[-1], 100.0)


def test_ifr_all_losses_is_0():
    s = pd.Series(np.arange(30, 1, -1, dtype=float))  # sempre caindo
    result = ifr(s, 14)
    assert np.isclose(result.iloc[-1], 0.0)


def test_ifr_flat_series_is_50():
    s = pd.Series(np.full(30, 10.0))
    result = ifr(s, 14)
    assert np.isclose(result.iloc[-1], 50.0)


def test_bollinger_bands_ordering():
    rng = np.random.default_rng(1)
    s = pd.Series(100 + rng.normal(0, 2, 100).cumsum())
    bb = bollinger_bands(s, 20, 2.0)
    valid = bb.dropna()
    assert (valid["bb_upper"] >= valid["bb_mid"]).all()
    assert (valid["bb_mid"] >= valid["bb_lower"]).all()


def test_fura_teto_and_fura_chao_symmetry():
    high, low = 110.0, 100.0
    teto = fura_teto(high, low, k=0.14)
    chao = fura_chao(high, low, k=0.14)
    assert teto == pytest.approx(110 + 10 * 0.14)
    assert chao == pytest.approx(100 - 10 * 0.14)
    # simétricos em torno da barra
    assert (teto - high) == pytest.approx(low - chao)


def test_retracement_level_long_and_short():
    high, low = 110.0, 100.0
    long_50 = retracement_level(high, low, 0.5, "long")
    short_50 = retracement_level(high, low, 0.5, "short")
    assert long_50 == pytest.approx(105.0)
    assert short_50 == pytest.approx(105.0)
    long_618 = retracement_level(high, low, 0.618, "long")
    assert long_618 < long_50  # retração mais profunda fica mais perto da mínima


def test_par_level_zeroes_remaining_risk():
    # comprado a 10, stop a 9, realiza 30% -> PAR ~= 10.42 (exemplo do documento)
    par = par_level(entry=10.0, stop=9.0, fraction_realized=0.30, direction="long")
    assert par == pytest.approx(10.4286, abs=1e-3)


def test_par_level_short_direction():
    par = par_level(entry=10.0, stop=11.0, fraction_realized=0.5, direction="short")
    assert par < 10.0


def test_par_level_rejects_invalid_fraction():
    with pytest.raises(ValueError):
        par_level(10.0, 9.0, fraction_realized=1.0, direction="long")
    with pytest.raises(ValueError):
        par_level(10.0, 9.0, fraction_realized=0.0, direction="long")


def test_obv_direction():
    close = pd.Series([10, 11, 10.5, 12])
    volume = pd.Series([100, 100, 100, 100])
    result = obv(close, volume)
    assert result.iloc[1] == 100    # subiu -> soma volume
    assert result.iloc[2] == 0      # caiu -> subtrai volume
    assert result.iloc[3] == 100    # subiu -> soma de novo


def test_ac_dd_positive_when_closes_near_high_with_volume():
    df = pd.DataFrame({
        "high": [10, 10, 10],
        "low": [8, 8, 8],
        "close": [9.8, 9.8, 9.8],   # fecha perto da máxima
        "volume": [100, 100, 100],
    })
    result = ac_dd(df)
    assert (result.diff().dropna() > 0).all()
