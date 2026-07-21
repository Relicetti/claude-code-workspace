"""
Motor genérico de backtest para os setups do método Stormer (docs/stormer_33_taticas.md).

Em vez de 33 implementações isoladas, cada tática vira uma "PendingOrder" (ordem
pendente com nível de rompimento + stop + regra de saída), gerada por um detector
específico do setup (stormer_setups.py). Este módulo só sabe simular o ciclo de vida
de uma ordem pendente até virar trade e depois até ser fechada — é o mesmo mecanismo
descrito na seção "Observações para portar ao backtester" do documento-fonte:

    filtro de tendência + gatilho de rompimento de uma barra de referência
    + stop na barra de referência + saída parcial em alvo fixo (%)
    + trailing na segunda metade

Sem look-ahead: uma ordem só pode disparar em barras >= valid_from (sempre
ref_idx + 1 ou mais), e o preço de entrada/saída usado é sempre o da própria
barra em que a condição foi observada (fechamento ou toque intrabar, conforme
fill_mode).
"""
from dataclasses import dataclass, field
from typing import Callable, Optional
import pandas as pd


@dataclass
class ExitSpec:
    """Regra de saída de um trade, no espírito do #4 das Observações do documento."""
    target_pct: Optional[float] = None       # alvo (%) sobre o preço de entrada
    target_r_multiple: Optional[float] = None  # alvo em múltiplos do risco inicial (ex.: 1.0 = 1R)
    partial_fraction: float = 1.0            # fração da posição realizada no alvo (1.0 = sai tudo)
    use_par: bool = False                    # ao realizar parcial, move o stop do restante pro PAR
    second_target_pct: Optional[float] = None    # alvo (%) para a fração remanescente após a parcial
    second_target_col: Optional[str] = None      # alvo dinâmico (nome de coluna) para a remanescente
    trailing: str = "none"                   # "none" | "prev_extreme" | "ma_turn_exit" | "ma_cross_exit" | "ifr_trail"
    trailing_ma_col: Optional[str] = None
    trailing_ma_col2: Optional[str] = None    # usado em "ma_cross_exit"
    trailing_lookback: int = 1                # usado em "prev_extreme"
    ifr_col: Optional[str] = None             # usado em "ifr_trail"
    ifr_exit_threshold: Optional[float] = None


@dataclass
class PendingOrder:
    setup_id: str
    ref_idx: int
    direction: str                # "long" | "short"
    trigger_price: float
    stop_price: Optional[float]
    exit_spec: ExitSpec
    valid_from: int
    expires_after: Optional[int] = None      # ordem cancelada se não disparar em N barras
    invalidate_fn: Optional[Callable[[pd.DataFrame, int], bool]] = None
    fill_mode: str = "close_break"           # "close_break" | "limit_touch" | "at_close"
    dynamic_stop: Optional[str] = None       # "prev_bar_low" | "prev_bar_high" (recalcula stop no fill)
    target_price_override: Optional[float] = None
    meta: dict = field(default_factory=dict)


@dataclass
class Trade:
    setup_id: str
    direction: str
    ref_idx: int
    entry_idx: int
    entry_time: object
    entry_price: float
    initial_stop: float
    exits: list = field(default_factory=list)   # [(idx, time, price, fraction, reason)]
    closed: bool = False

    @property
    def exit_time(self):
        return self.exits[-1][1] if self.exits else None

    @property
    def risk_per_unit(self) -> float:
        return abs(self.entry_price - self.initial_stop)

    @property
    def pnl_pct(self) -> float:
        sign = 1 if self.direction == "long" else -1
        total = 0.0
        for _, _, price, frac, _ in self.exits:
            total += frac * sign * (price - self.entry_price) / self.entry_price
        return total

    @property
    def r_multiple(self) -> float:
        risk = self.risk_per_unit
        if risk == 0:
            return 0.0
        sign = 1 if self.direction == "long" else -1
        total = 0.0
        for _, _, price, frac, _ in self.exits:
            total += frac * sign * (price - self.entry_price) / risk
        return total

    def to_dict(self) -> dict:
        return {
            "setup_id": self.setup_id,
            "direction": self.direction,
            "entry_time": self.entry_time,
            "entry_price": self.entry_price,
            "initial_stop": self.initial_stop,
            "exit_time": self.exit_time,
            "n_exits": len(self.exits),
            "exit_reasons": ",".join(e[4] for e in self.exits),
            "pnl_pct": self.pnl_pct,
            "r_multiple": self.r_multiple,
            "closed": self.closed,
        }


def _breached(price: float, level: float, direction: str) -> bool:
    return price > level if direction == "long" else price < level


def _fill_price_for_trigger(row, order: PendingOrder) -> Optional[float]:
    """Retorna o preço de execução se a ordem dispara nesta barra, senão None."""
    if order.fill_mode == "at_close":
        return row["close"]
    if order.fill_mode == "close_break":
        if _breached(row["close"], order.trigger_price, order.direction):
            return row["close"]
        return None
    if order.fill_mode == "limit_touch":
        lo, hi = row["low"], row["high"]
        if lo <= order.trigger_price <= hi:
            return order.trigger_price
        return None
    raise ValueError(f"fill_mode desconhecido: {order.fill_mode}")


def _resolve_stop(df: pd.DataFrame, order: PendingOrder, entry_idx: int) -> float:
    if order.dynamic_stop == "prev_bar_low":
        return df["low"].iloc[entry_idx - 1]
    if order.dynamic_stop == "prev_bar_high":
        return df["high"].iloc[entry_idx - 1]
    return order.stop_price


def _target_from_spec(entry_price: float, stop_price: float, direction: str, spec: ExitSpec) -> Optional[float]:
    sign = 1 if direction == "long" else -1
    if spec.target_r_multiple is not None:
        risk = abs(entry_price - stop_price)
        return entry_price + sign * spec.target_r_multiple * risk
    if spec.target_pct is not None:
        return entry_price * (1 + sign * spec.target_pct)
    return None


def simulate_orders(df: pd.DataFrame, orders: list) -> list:
    """
    Simula o ciclo de vida de uma lista de PendingOrder sobre o df OHLCV.
    Uma ordem só pode disparar em `valid_from` ou depois; ao virar trade,
    é gerenciada até o fechamento total (stop, alvo(s), trailing) ou até o
    fim dos dados. No máximo 1 trade aberto por vez por setup_id — enquanto
    houver posição aberta, novas ordens do mesmo setup ficam de fora do scan.
    """
    orders = sorted(orders, key=lambda o: o.valid_from)
    n = len(df)
    trades: list = []

    pending_by_setup: dict = {}
    for o in orders:
        pending_by_setup.setdefault(o.setup_id, []).append(o)

    for setup_id, setup_orders in pending_by_setup.items():
        i_order = 0
        active_order = None
        trade = None
        j = 0

        while j < n:
            row = df.iloc[j]

            # gerencia trade aberto
            if trade is not None:
                trade = _step_trade(df, j, row, trade)
                if trade.closed:
                    trades.append(trade)
                    trade = None
                j += 1
                continue

            # avança para a próxima ordem candidata cujo valid_from <= j
            while (
                active_order is None
                and i_order < len(setup_orders)
                and setup_orders[i_order].valid_from <= j
            ):
                active_order = setup_orders[i_order]
                i_order += 1

            if active_order is None:
                j += 1
                continue

            if active_order.valid_from > j:
                j += 1
                continue

            # invalidação / expiração
            if active_order.invalidate_fn is not None and active_order.invalidate_fn(df, j):
                active_order = None
                continue
            if active_order.expires_after is not None and j - active_order.valid_from >= active_order.expires_after:
                active_order = None
                continue

            fill_price = _fill_price_for_trigger(row, active_order)
            if fill_price is None:
                j += 1
                continue

            # disparou -> vira trade
            stop_price = _resolve_stop(df, active_order, j)
            trade = Trade(
                setup_id=setup_id,
                direction=active_order.direction,
                ref_idx=active_order.ref_idx,
                entry_idx=j,
                entry_time=df.index[j],
                entry_price=fill_price,
                initial_stop=stop_price,
            )
            trade.meta_exit_spec = active_order.exit_spec
            trade.meta_target_override = active_order.target_price_override
            active_order = None
            j += 1

        if trade is not None and not trade.closed:
            _force_close(df, n - 1, trade)
            trades.append(trade)

    return trades


def _force_close(df: pd.DataFrame, idx: int, trade: Trade):
    remaining = 1.0 - sum(f for _, _, _, f, _ in trade.exits)
    if remaining > 1e-9:
        trade.exits.append((idx, df.index[idx], df["close"].iloc[idx], remaining, "fim_dos_dados"))
    trade.closed = True


def _step_trade(df: pd.DataFrame, j: int, row, trade: Trade) -> Trade:
    spec: ExitSpec = trade.meta_exit_spec
    sign = 1 if trade.direction == "long" else -1
    realized = sum(f for _, _, _, f, _ in trade.exits)
    remaining = 1.0 - realized

    current_stop = trade.meta_current_stop if hasattr(trade, "meta_current_stop") else trade.initial_stop

    # 1) stop atingido?
    stop_hit = row["low"] <= current_stop if trade.direction == "long" else row["high"] >= current_stop
    if stop_hit:
        exit_price = current_stop
        # gap through: preenche no pior preço entre abertura e o stop
        if trade.direction == "long" and row["open"] < current_stop:
            exit_price = row["open"]
        elif trade.direction == "short" and row["open"] > current_stop:
            exit_price = row["open"]
        trade.exits.append((j, df.index[j], exit_price, remaining, "stop"))
        trade.closed = True
        return trade

    # 2) primeiro alvo (parcial ou total)
    if not getattr(trade, "meta_first_target_done", False):
        target = trade.meta_target_override if trade.meta_target_override is not None else \
            _target_from_spec(trade.entry_price, trade.initial_stop, trade.direction, spec)
        if target is not None:
            hit = row["high"] >= target if trade.direction == "long" else row["low"] <= target
            if hit:
                frac = spec.partial_fraction
                trade.exits.append((j, df.index[j], target, frac, "alvo1"))
                trade.meta_first_target_done = True
                if spec.use_par and frac < 1.0:
                    from stormer_indicators import par_level
                    current_stop = par_level(trade.entry_price, trade.initial_stop, frac, trade.direction)
                if frac >= 1.0 - 1e-9:
                    trade.closed = True
                    return trade

    # 3) segundo alvo pra fração remanescente
    if getattr(trade, "meta_first_target_done", False) and remaining > 1e-9 + sum(
        f for _, _, _, f, r in trade.exits if r == "alvo2"
    ):
        remaining_now = 1.0 - sum(f for _, _, _, f, _ in trade.exits)
        if remaining_now > 1e-9:
            second_target = None
            if spec.second_target_pct is not None:
                second_target = trade.entry_price * (1 + sign * spec.second_target_pct)
            elif spec.second_target_col is not None:
                second_target = row[spec.second_target_col]
            if second_target is not None:
                hit = row["high"] >= second_target if trade.direction == "long" else row["low"] <= second_target
                if hit:
                    trade.exits.append((j, df.index[j], second_target, remaining_now, "alvo2"))
                    trade.closed = True
                    trade.meta_current_stop = current_stop
                    return trade

    # 4) trailing
    if spec.trailing == "prev_extreme" and remaining > 1e-9:
        lb = spec.trailing_lookback
        if j - lb >= 0:
            new_stop = df["low"].iloc[j - lb] if trade.direction == "long" else df["high"].iloc[j - lb]
            if trade.direction == "long":
                current_stop = max(current_stop, new_stop)
            else:
                current_stop = min(current_stop, new_stop)

    elif spec.trailing in ("ma_turn_exit", "ma_cross_exit") and remaining > 1e-9:
        col = spec.trailing_ma_col
        ma_now, ma_prev = row[col], df[col].iloc[j - 1] if j > 0 else None
        if spec.trailing == "ma_turn_exit":
            turned = (ma_prev is not None and ma_now < ma_prev) if trade.direction == "long" else \
                     (ma_prev is not None and ma_now > ma_prev)
            if turned:
                # marca a barra da virada; sai quando o preço perde a mínima/máxima dela
                if not hasattr(trade, "meta_turn_extreme"):
                    trade.meta_turn_extreme = row["low"] if trade.direction == "long" else row["high"]
                lost = row["close"] < trade.meta_turn_extreme if trade.direction == "long" else \
                       row["close"] > trade.meta_turn_extreme
                if lost:
                    trade.exits.append((j, df.index[j], row["close"], remaining, "trailing_ma"))
                    trade.closed = True
                    return trade
        else:  # ma_cross_exit
            col2 = spec.trailing_ma_col2
            now2, prev2 = row[col2], df[col2].iloc[j - 1] if j > 0 else None
            if prev2 is not None:
                crossed = (ma_prev >= prev2 and ma_now < now2) if trade.direction == "long" else \
                          (ma_prev <= prev2 and ma_now > now2)
                if crossed:
                    trade.exits.append((j, df.index[j], row["close"], remaining, "trailing_cross"))
                    trade.closed = True
                    return trade

    elif spec.trailing == "ifr_trail" and remaining > 1e-9:
        ifr_val = row[spec.ifr_col]
        near_extreme = ifr_val >= spec.ifr_exit_threshold if trade.direction == "long" else \
                       ifr_val <= spec.ifr_exit_threshold
        if near_extreme:
            trade.meta_ifr_trailing = True
        if getattr(trade, "meta_ifr_trailing", False):
            new_stop = df["low"].iloc[j - 1] if trade.direction == "long" else df["high"].iloc[j - 1]
            if trade.direction == "long":
                current_stop = max(current_stop, new_stop)
            else:
                current_stop = min(current_stop, new_stop)

    trade.meta_current_stop = current_stop
    return trade


def trades_to_frame(trades: list) -> pd.DataFrame:
    if not trades:
        return pd.DataFrame(columns=[
            "setup_id", "direction", "entry_time", "entry_price", "initial_stop",
            "exit_time", "n_exits", "exit_reasons", "pnl_pct", "r_multiple", "closed",
        ])
    return pd.DataFrame([t.to_dict() for t in trades])
