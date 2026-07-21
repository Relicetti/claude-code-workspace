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
```

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

## Setups Stormer (33 táticas — docs/stormer_33_taticas.md)

Além do backtest VSA acima, o repo tem um segundo módulo independente: um motor
genérico de backtest para as táticas discricionárias do método Stormer (Alexandre
Wolwacz / L&S Educação), formalizadas em `docs/stormer_33_taticas.md`.

Diferença de arquitetura: o VSA acima gera um **score contínuo** (posição muda a
cada candle conforme o sinal). O Stormer é baseado em **trades discretos** —
rompimento de uma barra de referência, stop fixo, alvo(s) parcial(is) e trailing —
então precisou de um motor de simulação próprio em vez de reusar `backtest.py`.

- `stormer_indicators.py` — EMA/SMA, média deslocada, IFR (RSI de Wilder),
  Bandas de Bollinger, fura-teto/fura-chão, retração de Fibonacci, PAR (Ponto de
  Anular Risco), OBV, AC/DD (Chaikin).
- `stormer_engine.py` — motor genérico: `PendingOrder` (ordem pendente com
  gatilho de rompimento, stop e regra de saída) → `Trade` (ciclo de vida completo:
  disparo, stop, alvo(s) parcial(is), trailing, ou fechamento no fim dos dados).
  Único mecanismo compartilhado por todos os setups, em vez de 33 implementações
  isoladas — é a generalização sugerida na seção "Observações" do documento-fonte.
- `stormer_setups.py` — um detector por tática (`detect_*`), todos registrados em
  `SETUP_REGISTRY`. Implementadas 24 das 33: #6–#15, #17–#26, #28, #31–#33.
  Deixadas de fora (mesma classificação do documento-fonte): #1–5 (fundamentos,
  não são setups isolados), #16 (Ponto de Cataclismo — o próprio autor descreve
  como subjetivo demais pra automatizar), #27 (ferramentas de stop, não um
  gatilho de entrada), #29 (Acumulação/Distribuição — indicador qualitativo, sem
  regra de entrada/stop definida; OBV e AC/DD ficam disponíveis como indicadores)
  e #30 (tática geral de Bollinger — a variante concreta, #19, já está
  implementada). Onde o texto original não define uma regra 100% mecânica (ex.:
  "estrutura de topos/fundos ascendentes", "suporte relevante", "topo
  histórico"), o detector correspondente documenta no docstring a aproximação
  adotada.
- `stormer_backtest.py` — roda um setup (`run_setup`) ou todos (`run_all_setups`)
  sobre um DataFrame OHLCV e resume performance por R-múltiplo
  (`summarize_trades` / `summarize_all`).

```bash
python stormer_backtest.py --csv btc_usdt_1h.csv                       # todos os setups
python stormer_backtest.py --csv btc_usdt_1h.csv --setup setup32_ifr2_com_filtro
```

**Prioridade de validação:** o próprio autor aponta #21 (Média de 9) e #32 (IFR2
com Filtro) como seu "sistema principal", com estatísticas mais robustas no livro.

**Atenção antes de confiar em qualquer resultado:** todos os %/multiplicadores do
documento (8%, 0,61, 0,14, 130%, 161%, 300%, thresholds de IFR) foram calibrados
pelo autor em ações brasileiras (Bovespa, anos 2000–2010) — **precisam de
recalibração para cripto** (volatilidade e regime de mercado bem diferentes).
`run_setup`/`run_all_setups` aceitam `crypto_calibration` como fator multiplicativo
único sobre os alvos percentuais, só como ponto de partida — a recalibração de
verdade é walk-forward, igual ao pipeline VSA. Nenhum dos 24 setups foi validado
out-of-sample ainda; isso é código do método, não uma estratégia validada.

## Testes

Testes unitários (pytest) cobrindo `features.py`, `vsa_signal.py`, `backtest.py`,
`metrics.py` e os módulos Stormer (`stormer_indicators.py`, `stormer_engine.py`,
`stormer_setups.py`) com dados sintéticos — não dependem de rede nem da Binance.

```bash
pip install -r requirements.txt pytest
pytest tests/ -v
```

## Próximo passo depois da validação

Se (e só se) os números out-of-sample forem sólidos: adicionar stop-loss/take-profit
explícitos (esse backtest atual assume que a posição vira só quando o sinal muda —
não tem stop), position sizing, e testar em outros pares/timeframes antes de
sequer pensar em automação de execução.
