# Dimensionador BESS

Dimensionamento técnico + análise financeira de sistemas de armazenamento de energia
(BESS) para os modos TIME-SHIFT, BACKUP, PEAK-SHAVING, QUALIDADE_ENERGIA e o combinado
BACKUP_E_QUALIDADE_ENERGIA. Porta a lógica de `Planilha_Dimensionamento_BESS.xlsx` (caso de
referência: Caterpillar Campo Largo / WEG, proposta RP0826000), validada célula a célula em
`src/lib/engine.test.ts`.

O foco atual de desenvolvimento é o caso de **produtor rural com problemas de atendimento
da Copel**, usado como base técnica para aprovação de financiamento (linha de crédito
subsidiada em negociação com um órgão estadual do Paraná). O modo relevante pra esse caso é
**BACKUP_E_QUALIDADE_ENERGIA**: o mesmo BESS físico atendendo as duas funções ao mesmo
tempo —

- **BACKUP**: autonomia de horas numa falta de energia prolongada
- **QUALIDADE_ENERGIA**: ride-through de afundamento de tensão/microinterrupção breve
  (segundos/minutos), protegendo equipamento sensível de desarme/dano — um problema
  diferente do backup, não uma variação dele

No combinado, a **energia** armazenada é dimensionada pelo backup (a energia extra que o
evento de qualidade pediria é desprezível perto de horas de autonomia); a **potência** do
PCS é o maior valor entre a carga de backup e a carga crítica de qualidade de energia,
porque os dois conjuntos de carga podem não ser os mesmos (backup cobre a propriedade toda,
qualidade de energia normalmente só as cargas mais sensíveis). BACKUP e QUALIDADE_ENERGIA
isolados continuam disponíveis pra quando só uma das duas funções é necessária.
TIME-SHIFT e PEAK-SHAVING continuam funcionais mas não são o foco de evolução agora.

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

## Grupo tarifário (A ou B)

Seletor em "Cliente e modalidade" — muda quais campos a UI pede na seção "Consumo e
demanda", porque o que existe na fatura é diferente:

- **Grupo A** (alta tensão): consumo ponta, demanda máxima medida, demanda contratada,
  tarifa ponta e tarifa fora-ponta separadas — os campos originais da planilha.
- **Grupo B** (baixa tensão — o caso típico do produtor rural): só consumo médio mensal
  (kWh) e uma tarifa única. Não existe demanda medida pela distribuidora, então o campo
  correspondente vira "potência total estimada da propriedade" — um número que o cliente
  chuta, não que vem da fatura. Por isso, pra BACKUP/QUALIDADE_ENERGIA, detalhar a lista de
  cargas críticas (que já existe independente do grupo) é preferível a confiar nesse valor.

Não muda a lógica de cálculo — `demandaMaximaPontaKw`/`consumoMedioPontaKwh`/
`tarifaPontaComML` continuam os mesmos campos internamente, só reaproveitados com outro
sentido/rótulo no Grupo B (ver comentários em `src/types/index.ts`).

## Relatório técnico exportável

A aba "Relatório Técnico" gera um documento pronto pra anexar a um pedido de
financiamento: objetivo do sistema, cargas críticas consideradas, premissas de
dimensionamento e o resultado (energia/potência necessárias, racks, capacidade e potência
instaladas, autonomia e SoH ano 1 e fim de vida útil). Deliberadamente **sem CAPEX nem
indicadores financeiros** — é só a base técnica de engenharia, não a proposta comercial.

Exporta como PDF via impressão do navegador ("Imprimir / salvar como PDF" → destino
"Salvar como PDF"), sem dependência de biblioteca de geração de PDF: o CSS de impressão em
`index.css` (`@media print`) esconde toda a navegação e mostra só o conteúdo de
`#relatorio-tecnico`.

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
