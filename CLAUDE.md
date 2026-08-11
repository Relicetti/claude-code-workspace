# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este repositório

Não é um projeto único — é um **monorepo pessoal** com várias ferramentas independentes,
principalmente para dois contextos: consultoria/negócio de energia solar e GD (geração
distribuída), e experimentos de trading quantitativo. Cada pasta de primeiro nível é um
projeto isolado, com seu próprio `package.json`/`requirements.txt`, sem dependências
cruzadas entre si. Ao trabalhar em um projeto, trate a subpasta como raiz lógica do trabalho
— não assuma que configuração/convenções de um projeto valem para outro.

Dois padrões de stack se repetem:

- **Python + Flask**: app web local, banco SQLite via `db.py`, iniciado no Windows por um
  `iniciar.vbs` (ou `.bat`) que sobe o Flask sem abrir janela de console, com deploy em
  produção via Railway (`Procfile`/`railway.json`). Exemplos: `usinas/`, `fup-operacoes/`,
  `tarifas/`, `estimativa-geracao-solar/`.
- **Node + Vite + React + TypeScript**: calculadora/simulador client-side, às vezes com um
  backend Express minimalista embutido (`server/`) para build de produção. Exemplos:
  `ufv-bess-calculator/`, `calculadora-parceria/`, `simulador-grupo-a/`, `controle-calorico/`.

## Comandos comuns

### Projetos Python/Flask (`usinas/`, `fup-operacoes/`, `tarifas/`, `estimativa-geracao-solar/`, `optionstrat/`)

```bash
cd <pasta-do-projeto>
pip install -r requirements.txt
python app.py            # sobe o Flask localmente (ou dashboard.py em optionstrat/)
```
Em produção usam Railway (`Procfile`). No Windows, `iniciar.vbs`/`iniciar_agente.vbs` sobem
o servidor sem terminal visível — é o fluxo normal de uso do dono do repo, não algo a
"corrigir".

### Projetos Node/Vite (`ufv-bess-calculator/`, `calculadora-parceria/`, `simulador-grupo-a/`, `controle-calorico/`, `reta-log/`)

```bash
cd <pasta-do-projeto>
npm install
npm run dev       # servidor de dev (Vite, HMR)
npm run build     # build de produção (tsc + vite build; alguns geram dist-server/ via esbuild)
npm test          # quando existir (vitest) — ex: simulador-grupo-a, calculadora-parceria
```

### VSA Backtest (arquivos soltos na raiz: `main.py`, `backtest.py`, `features.py`, `vsa_signal.py`, `metrics.py`, `data_loader.py`)

```bash
pip install -r requirements.txt pytest
python main.py --csv btc_usdt_1h.csv --train_days 180 --test_days 30
pytest tests/ -v          # roda um teste específico: pytest tests/test_backtest.py -v
```
É a **fase 1 (validação)** de uma estratégia BTC/USDT baseada em Volume Spread Analysis —
walk-forward (treino calibra parâmetros, teste é sempre out-of-sample), com custos de
transação embutidos (`TAKER_FEE` em `backtest.py`). Não é para execução real de ordens; ver
`README.md` da raiz para as ressalvas completas antes de mexer na lógica de sinal/backtest.

## Mapa dos subprojetos

- **`usinas/`** — dashboard de acompanhamento de usinas solares (tarifas pendentes, GD2,
  faturas). Tem um agente local (`agente_local.py`) que baixa faturas do LexDash e um módulo
  de IA (`ia.py`) para extração/insights.
- **`fup-operacoes/`** — sistema de follow-up de operações, integrado com Autentique
  (assinatura eletrônica) e sincronização periódica (`sincronizar_autentique.py`,
  `sincronizar_semana.py`). **Nunca sobrescrever o banco de produção** — sempre baixar o
  banco atual antes de importar; o import já trava se o arquivo for mais antigo que produção.
- **`tarifas/`** — extração e cálculo de tarifas de energia a partir de faturas (PDF),
  com concessionárias mapeadas em `concessionarias.py` e extração assistida por IA
  (`extrator.py`, `melhorar_prompt.py`).
- **`estimativa-geracao-solar/`** — cálculo de estimativa de geração de usina solar.
- **`optionstrat/`** — motor de scoring/ranking de estratégias de opções (B3 e cripto).
  Cálculo é **determinístico** com dados reais de mercado (OpLab/Deribit) — nunca inventa
  número se a fonte cair. IA é só para explicar contexto, não para decidir o ranking. Toda
  recomendação é logada em `predictions.jsonl` e validada depois pelo vencimento real via
  `backtest/validator.py`.
- **`ufv-bess-calculator/`** — calculadora de dimensionamento de UFV (usina fotovoltaica) +
  BESS (armazenamento), com engine de cálculo em `src/lib/engine.ts` e 7 abas de interface.
  Há uma spec de uma ferramenta complementar ainda não implementada — validador que compara
  o dimensionamento ofertado por um fornecedor contra os requisitos reais do cliente — em
  `ufv-bess-calculator/docs/spec-validador-dimensionamento.md`.
- **`calculadora-parceria/`** — calculadora de parcerias comerciais de GD solar (substitui
  a planilha `Cálculo_Parceria`), com backend Express de produção gerado em `dist-server/`
  via `scripts/build-server.mjs`, deploy no Railway (`railway.toml`).
- **`simulador-grupo-a/`** — duas ferramentas para clientes de alta tensão (Grupo A), com
  tarifas vindas da base aberta da ANEEL: comparação Azul x Verde, e simulação de parceria
  GD (porte de `Calculos_GD_GrupoA.xlsx`). As duas abas compartilham a distribuidora
  selecionada via estado elevado em `App.tsx`, usando o **nome comercial** da distribuidora
  (não o `SigAgente` bruto da ANEEL) como valor compartilhado — cada tela resolve o código
  internamente via `resolverAgenteAneel` só na hora de consultar tarifa/Fio B. `npm run seed`
  regenera os seeds em `src/data/` a partir da ANEEL ao vivo.
- **`controle-calorico/`** — app de controle calórico com backend Express + Postgres (`pg`)
  e uso da API da Anthropic (`@anthropic-ai/sdk`) no server.
- **`kora-whatsapp/`** — bot/bridge de WhatsApp com fluxos n8n, mais de um jeito de subir
  (API, bot Node, bot Python, dashboard) via `.bat` separados.
- **`reta-log/`** — projeto Vite+React ainda no template padrão (não customizado).
- **`_local-wip/`** — variante local de `backtest.py` em progresso, fora do fluxo principal.

## Cuidados que atravessam vários projetos

- Bancos SQLite/Postgres de produção (`fup-operacoes/fup.db`, etc.) não devem ser
  sobrescritos por importações locais sem antes baixar o estado atual de produção.
- Projetos com extração via IA (`tarifas/`, `usinas/ia.py`, `optionstrat/`) tratam a IA como
  camada de fallback/explicação, não como fonte de verdade para números — a lógica de
  cálculo em si é sempre determinística.
- Vários `.vbs`/`.bat` na raiz dos projetos existem para iniciar servidores no Windows sem
  janela de console — fazem parte do fluxo normal de uso, não são scripts órfãos.
