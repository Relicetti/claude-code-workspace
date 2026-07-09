# VSA Backtest — BTC/USDT 1h

Backtest de uma estratégia baseada em conceitos de Volume Spread Analysis (VSA/Wyckoff):
esforço x resultado, clímax de volume, harmonia/divergência entre preço e volume, e
padrões de No Demand / No Supply — todos transformados em métricas numéricas e combinados
em um score composto.

## Estrutura

- `data_loader.py` — busca OHLCV do BTC/USDT via Binance (ccxt)
- `features.py` — calcula as 5 métricas VSA
- `vsa_signal.py` — score composto + geração de sinal (long/short/neutro)
- `backtest.py` — engine de walk-forward (treino calibra parâmetros, teste é sempre dado não visto)
- `metrics.py` — CAGR, Sharpe, Sortino, drawdown, comparação com buy-and-hold e Selic/CDI
- `main.py` — pipeline completo

## Como rodar

```bash
pip install ccxt pandas numpy

# primeira vez: busca dados da Binance e salva em CSV
python main.py

# rodadas seguintes: usa o CSV salvo (mais rápido para iterar)
python main.py --csv btc_usdt_1h.csv --train_days 180 --test_days 30

# com stop-loss/take-profit no grid (múltiplos de ATR; "none" = sem stop)
python main.py --csv btc_usdt_1h.csv --stop_atr none,2,3 --take_atr none,3,5
```

## Stop-loss / Take-profit

Stops e alvos são expressos em **múltiplos de ATR** (adaptam ao regime de volatilidade)
e entram no grid search do walk-forward como qualquer outro parâmetro — incluir `none`
na lista deixa o otimizador decidir se vale a pena usar stop naquela janela.

Premissas da simulação (deliberadamente conservadoras):

- Entrada/troca de posição executa ao fechamento do candle anterior (mesma convenção
  do backtest sem stops); o stop/alvo usa o ATR do candle de entrada (sem look-ahead).
- Se stop e alvo caberiam no mesmo candle, assume-se que o **stop bateu primeiro**.
- Gap além do stop sai no pior preço (abertura do candle), não no stop teórico;
  gap além do alvo sai no próprio alvo (não credita o gap favorável).
- Depois de sair por stop/alvo, só reentra quando o sinal **mudar de valor** — evita
  reentrada imediata no mesmo sinal que acabou de estopar.
- Taxa é cobrada em cada mudança de posição e em cada saída por stop/alvo.

Atenção: cada valor extra de `--stop_atr`/`--take_atr` multiplica o grid (e o caminho
com stops é um loop candle a candle, mais lento que o vetorizado). Comece com poucas
opções, ex.: `--stop_atr none,2 --take_atr none,3`.

## Pontos importantes

1. **Isso é só a fase 1 (validação).** Não execute ordens reais até o resultado
   out-of-sample ser consistentemente melhor que buy-and-hold E que o CDI/Selic,
   ajustado a risco (Sharpe/Sortino), em múltiplos períodos e não só num pedaço
   favorável do histórico.

2. **`train_days`/`test_days`** controlam o tamanho das janelas de walk-forward.
   Comece com 180/30 (6 meses treino, 1 mês teste) e teste sensibilidade —
   se o resultado mudar muito com pequenas variações desses valores, é sinal
   de overfitting.

3. **Custos de transação** estão embutidos (`TAKER_FEE` em `backtest.py`,
   0.04% por padrão, taxa de futures Binance). Ajuste conforme a exchange/conta
   que você pretende usar de verdade — isso muda o resultado bastante em
   estratégias com muitos trades.

4. **`selic_annual` em `metrics.py`** é um valor fixo aproximado — troque pela
   Selic/CDI real do período específico que você está testando para uma
   comparação justa.

5. **O grid search do walk-forward pode ficar lento** com o grid completo
   (5 pesos x 2 valores + 3x3 thresholds = 288 combinações por janela). Para
   iterar rápido, reduza o grid em `main.py` primeiro; expanda só quando fizer
   sentido escalar.

## Testes

Testes unitários (pytest) cobrindo `features.py`, `vsa_signal.py`, `backtest.py` e
`metrics.py` com dados sintéticos — não dependem de rede nem da Binance.

```bash
pip install -r requirements.txt pytest
pytest tests/ -v
```

## Próximo passo depois da validação

Se (e só se) os números out-of-sample forem sólidos: adicionar position sizing
(risco fixo por trade / volatility targeting) e testar em outros pares/timeframes
antes de sequer pensar em automação de execução. Stop-loss/take-profit já estão
implementados (seção acima).
