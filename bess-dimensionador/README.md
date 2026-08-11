# Dimensionador BESS

Dimensionamento técnico + análise financeira de sistemas de armazenamento de energia
(BESS) para os modos TIME-SHIFT, BACKUP e PEAK-SHAVING. Porta a lógica de
`Planilha_Dimensionamento_BESS.xlsx` (caso de referência: Caterpillar Campo Largo / WEG,
proposta RP0826000), validada célula a célula em `src/lib/engine.test.ts`.

## Como rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # roda a suíte de validação contra a planilha (vitest)
npm run build    # build de produção
```

## Estrutura

```
src/
  types/index.ts   — tipos (DadosCliente, EspecificacoesBess, CapexInputs, resultados)
  lib/soh-curve.ts — curva de degradação (SoH x ciclos) da WEG, com interpolação linear
  lib/engine.ts    — dimensionamento, CAPEX, economia anual, indicadores financeiros
  lib/defaults.ts  — valores padrão (caso Caterpillar, usado nos testes)
  App.tsx          — interface com abas (Dados do Cliente, Especificação BESS, CAPEX, Resultados)
```

## Correções em relação à planilha original

A planilha de referência tinha três inconsistências que foram corrigidas aqui
(decisão registrada em conversa com o dono do repo, 2026-08-10):

1. **Delta tarifário instável.** `ECONOMIA_ANUAL` usava `tarifaPonta - tarifaForaPonta`
   nos anos 2–3, mas a partir do ano 4 trocava para uma tarifa auxiliar sempre zerada —
   fazendo a economia anual virar negativa dali em diante. Corrigido: usa sempre
   `tarifaPonta - tarifaForaPonta`, ambas reajustadas pela inflação anual.
2. **Referência quebrada no modo PEAK-SHAVING.** A fórmula original apontava para uma
   célula deletada (`#REF!`). Substituída por um input explícito de tarifa de demanda
   evitada (`tarifaDemandaUltrapassagem`).
3. **Curva de SoH inconsistente entre abas.** `DIMENSIONAMENTO` calculava o SoH por
   aproximação "degrau" (o ponto anterior mais próximo), enquanto os valores colados em
   `ECONOMIA_ANUAL` batem com interpolação linear entre os mesmos pontos — dois métodos
   diferentes para a mesma curva dentro da mesma planilha. Padronizado em interpolação
   linear em todo o engine.

Também foi omitida a tabela de "opções de financiamento" (`DIMENSIONAMENTO!E32:H39`):
referenciava um arquivo Excel externo que não existe mais (`[1]ECONOMIA_ANUAL!O2`) e uma
célula vazia — resíduo de outra planilha, não uma regra de negócio válida.

## Nº de racks: automático vs. manual

O nº de racks é calculado por padrão como `MAX(racksPorEnergia, racksPorPotencia)`. A
planilha original, no entanto, tinha esse valor **digitado à mão** (1 rack, mesmo o
mínimo calculado exigindo 2) — provavelmente uma decisão de engenharia aceitando uma
pequena folga negativa por conta do container ser uma unidade indivisível. O campo
`racksAdotadoOverride` em `EspecificacoesBess` permite reproduzir esse tipo de decisão
manual; sem ele, o dimensionamento é 100% automático.

## Próximo passo

Este é o dimensionador + financeiro. O validador de proposta de fornecedor (compara o
que foi ofertado em PDF contra o que este engine calcula como necessário) está
especificado em `../ufv-bess-calculator/docs/spec-validador-dimensionamento.md` e ainda
não foi implementado.
