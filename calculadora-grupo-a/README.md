# Calculadora GD — Grupo A e B

Calcula a operação de **compra de crédito de GD travado em saldo e venda para clientes Grupo A
(e Grupo B)**: quanto o cliente paga hoje, quanto passa a pagar com os créditos, quanto fica com a
Alexandria e quanto vai para o dono do crédito. Porte da aba "Simulação" de
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
- **Alexandria** = fatura de geração × deságio; **dono do crédito** = o resto

## Diferenças conhecidas em relação à planilha

- **Rampa do Fio B (GD2)**: usa a Lei 14.300 (2025 45%, 2026 60%, 2027 75%, 2028 90%, 2029+ 100%),
  igual à calculadora-parceria. A planilha usava 2024 20% / 2025 40% / 2026 60% / 2027 80% / 2028+ 100%
  — só coincidem em 2026.
- **GD3** é tratado como GD1 (sem desconto de Fio B), como na planilha. A Lei 14.300 prevê Fio B
  integral + 40% do Fio A + TFSEE + P&D para GD3 — conferir antes de usar.
- **Impostos** vêm com os valores da planilha (ICMS 24%, PIS 0,53%, COFINS 2,42%) e são editáveis;
  conferir na fatura do cliente.
- **Demanda contratada** não entra no cálculo (só energia), igual à planilha.
