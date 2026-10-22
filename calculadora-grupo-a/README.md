# Calculadora GD — Grupo A e B

Calcula a operação de **compra de crédito de GD travado em saldo e venda para clientes Grupo A
(e Grupo B)**: quanto o cliente paga hoje, quanto passa a pagar com os créditos, quanto fica com a
Kora e quanto vai para o dono do crédito. Porte da aba "Simulação" de
`Calculos_GD_GrupoA.xlsx`, generalizado para o Grupo B (tarifa monômia, posto único).

## Como rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine validado contra a planilha
npm run build && PORT=3000 npm start   # build de produção local
```

## Tarifas ANEEL

`src/data/tarifas.json` é o seed embutido (tarifas TE/TUSD Grupo A Verde/Azul por posto e Grupo B
convencional, vigências desde 2020, + componente TUSD_FioB). O botão **"Atualizar tarifas (ANEEL)"**
baixa os CSVs públicos da ANEEL (tarifas homologadas + componentes tarifários do ano atual e
anterior — ~1,2 GB no total, um por vez, apagados depois), filtra e grava `tarifas.json` em
`server/data/` (ou no volume `RAILWAY_VOLUME_MOUNT_PATH` em produção), que passa a ter
prioridade sobre o seed. `npm run seed` regenera o seed do repositório da mesma forma.

## Cálculo (engine em `src/lib/engine.ts`)

Para cada posto (Ponta / Fora Ponta no Grupo A; único no Grupo B), com a tarifa vigente mais recente
até 31/12 do ano de referência:

- **Tarifa cheia** = TE/TUSD ÷ (1 − ICMS) ÷ (1 − PIS − COFINS)
- **Tarifa injetada** = mesma conta, mas só grossa o imposto que a isenção GD do estado devolve
  (tabela de isenções por estado/modalidade/fonte, faixa ≤1 MW); em GD2 a TUSD perde o Fio B × rampa
  da Lei 14.300
- **Residual (CSS)** = fatura atual − valor injetado
- **Fatura de geração** = fatura atual − desconto − CSS
- **Kora** = fatura de geração × deságio; **dono do crédito** = o resto

## Operação de crédito (`src/lib/operacao.ts`)

A Kora compra um lote grande de crédito (kWh) de uma vez, e ele é abatido mês a mês na conta do
cliente. Entradas: total de crédito, prazo de consumo (meses), mês de início e reajuste tarifário
anual projetado.

- Abatimento mensal = total ÷ prazo (o último mês fecha o saldo). Não pode passar do consumo do
  cliente — o app avisa e mostra o prazo mínimo (botão "usar prazo pelo consumo").
- Cada mês aplica os valores por kWh do cálculo acima (desconto, fatura de geração, gerador, Kora)
  ao kWh abatido, com a tarifa e a rampa do Fio B do ano daquele mês.
- O reajuste projetado é composto a partir do 2º ano. Se o valor do dono do crédito foi fixado em
  R$/kWh, ele não é reajustado — a Kora absorve a diferença.
- Saída: valores do 1º mês, tabela anual (por ano civil), mês a mês e totais da operação.

## Conversão de crédito entre postos (`src/lib/compensacao.ts`)

Segue o memorial "Conversão de créditos GD entre postos tarifários" (REN 1.000/2021). O crédito
comprado entra no saldo **fora ponta**; cada mês compensa primeiro o fora ponta (1:1) e o que
sobra cobre a ponta debitando **TE_P ÷ TE_FP** kWh de crédito por kWh (TE de aplicação ANEEL, sem
impostos, da tarifa do ano). Ex.: Energisa MT A3a Verde 2025 = 479,66 ÷ 284,62 = 1,68526.

- Opção "Converter crédito Fora Ponta → Ponta" (seção 3, ligada por padrão). Desligada, o fator
  é 1 — igual à planilha.
- O fator aparece na seção 3 e nas Premissas; as tabelas mostram crédito debitado e consumo
  compensado.
- Valor do dono do crédito e comissão em R$/kWh são **por kWh de crédito debitado**.
- Testes reproduzem o caso Out/25 do memorial (saldo FP 902.712 → 806.962, Δ 0,65 kWh).

## Proposta comercial

Botão **"Proposta ao cliente"** no topo: abre a versão para o cliente final (nome, UC e validade
editáveis), pronta para imprimir/PDF. Mostra consumo e tarifa por posto, fatura sem Kora × com Kora
(distribuidora + Kora) no 1º mês, economia, crédito contratado, tempo de contrato, valor estimado
do contrato, projeção por ano e premissas. **Não** mostra margem da Kora, gerador nem vendedor.

## Diferenças conhecidas em relação à planilha

- **Rampa do Fio B (GD2)**: usa a Lei 14.300 (2025 45%, 2026 60%, 2027 75%, 2028 90%, 2029+ 100%),
  igual à calculadora-parceria. A planilha usava 2024 20% / 2025 40% / 2026 60% / 2027 80% / 2028+ 100%
  — só coincidem em 2026.
- **GD3** é tratado como GD1 (sem desconto de Fio B), como na planilha. A Lei 14.300 prevê Fio B
  integral + 40% do Fio A + TFSEE + P&D para GD3 — conferir antes de usar.
- **Impostos** vêm com os valores da planilha (ICMS 24%, PIS 0,53%, COFINS 2,42%) e são editáveis;
  conferir na fatura do cliente.
- **Demanda contratada** não entra no cálculo (só energia), igual à planilha.

## Deploy (Railway)

Projeto Railway `calculadora-grupo-a`, ambiente `production`:
https://calculadora-grupo-a-production.up.railway.app

- Deploy é manual, a partir desta pasta: `railway up` (push no GitHub **não** publica).
- Acesso por senha única (HTTP Basic): variável `APP_SENHA` no Railway — usuário pode ser
  qualquer um. Para trocar: `railway variables --set "APP_SENHA=nova-senha"` (o serviço reinicia).
- Volume em `/data` (`RAILWAY_VOLUME_MOUNT_PATH`): guarda as tarifas da última atualização ANEEL e
  os CSVs temporários durante o download (~1,2 GB, apagados no fim).
