# Validador de Dimensionamento BESS

## Objetivo

Ferramenta que valida se o dimensionamento de um sistema de armazenamento de energia (BESS)
ofertado por um fornecedor atende aos requisitos operacionais reais do cliente. Recebe a
proposta técnica-comercial do fornecedor + os dados de consumo/demanda do cliente, e devolve
um comparativo claro: **o que o cliente precisa vs. o que foi ofertado**, com veredito de
adequação (atende / não atende) e relatório pronto para envio.

Baseado no fluxo de validação já usado manualmente para o caso Caterpillar Campo Largo / WEG
(proposta RP0826000).

## Entradas

1. **Proposta técnica-comercial do fornecedor (PDF)**
   Ex: WEG, BYD, Huawei, Sungrow etc. — cada fabricante formata diferente, então a extração
   deve ser robusta a variações de layout (usar leitura de texto + fallback para
   interpretação por LLM quando a extração estruturada falhar).
   Campos a extrair:
   - Capacidade nominal (kWh) — atenção: verificar se é BOL (begin of life) ou já
     considerando degradação
   - Potência nominal do PCS (kW)
   - Quantidade de containers/racks incluídos na proposta
   - Preço total (R$)
   - Garantia (anos, ciclos, SOH de referência)
   - Exclusões de escopo relevantes (ex: "fornecedor não assume responsabilidade pelo
     dimensionamento")

2. **Dados de consumo do cliente**
   - Fatura de energia (PDF) — modalidade tarifária, consumo ponta/fora-ponta (kWh),
     demanda medida ponta/fora-ponta (kW), demanda contratada (kW), tarifas (R$/kWh e R$/kW)
   - Extração de dados em intervalos de 15 min (xlsx/csv) — quando disponível, permite
     validar a fatura e calcular médias/máximos por período do dia

3. **Requisitos operacionais do BESS** (definidos pelo usuário, um ou mais modos combinados)
   - Time-shift / arbitragem: quantas horas de ponta o BESS deve cobrir
   - Backup: quantas horas adicionais de autonomia, e com base em qual critério de carga
     (ver "Base de cálculo do backup" abaixo)
   - Peak-shaving: se aplicável, limite de demanda a não ultrapassar

4. **Horário de ponta da distribuidora** — não é padrão nacional, varia por concessionária
   (ex: COCEL/Campo Largo = 18h–21h). Deve ser configurável ou buscado a partir do nome da
   distribuidora.

## Lógica de cálculo (núcleo)

Para cada modo de operação, calcular a energia útil necessária e depois converter para
capacidade nominal:

```
capacidade_nominal_minima (kWh) = energia_util_necessaria / (DoD × RTE)
```

- `DoD` = profundidade de descarga (ex: 0,98)
- `RTE` = eficiência round-trip (ex: 0,92)

### Time-shift (N horas de ponta)

```
energia_util = consumo_medio_diario_na_ponta (kWh, dias úteis)
```
Fonte preferencial: consumo mensal faturado no posto "Ponta" ÷ número de dias úteis do
período de faturamento. Validar contra dados de 15 min quando disponíveis.

### Backup (M horas adicionais, disponíveis mesmo após o time-shift já ter sido usado)

**Duas bases de cálculo possíveis — deixar configurável, documentar qual foi usada:**

1. **Demanda máxima medida** (mais conservador): `energia_util = demanda_maxima (kW) × M (h)`
   — usa o pior caso instantâneo, adequado quando o objetivo é garantir que a carga
   plena nunca falte.
2. **Consumo médio normal de operação** (mais realista): `energia_util = demanda_media_normal (kW) × M (h)`
   — média de demanda em dias úteis, **fora do horário de ponta** (para não sobrepor com o
   time-shift). Representa o comportamento real da carga, não o pico.

No caso de referência (Caterpillar), optou-se pela base 2 (consumo médio normal), resultando
em ~988 kW em vez dos ~1.279 kW de demanda máxima — redução de ~23% na energia de backup.

### Potência necessária

```
potencia_necessaria (kW) = demanda_maxima_medida (kW)
```
(ou o limite de peak-shaving, se esse for o modo em uso)

### Racks/containers necessários

```
racks_por_energia = ROUNDUP(capacidade_nominal_minima / capacidade_por_rack, 0)
racks_por_potencia = ROUNDUP(potencia_necessaria / potencia_por_rack, 0)
racks_necessarios = MAX(racks_por_energia, racks_por_potencia)
```

## Saída

Relatório (Word ou Markdown) com:

1. Requisito do cliente (modos de operação e premissas de cada um)
2. Tabela: energia útil e capacidade nominal necessárias, por modo e total
3. Especificação do que foi ofertado (capacidade, potência, preço, containers)
4. Comparativo lado a lado (necessário vs. ofertado) com indicação visual de atende/não atende
5. Veredito com o déficit ou margem, em kWh e em % 
6. Nota citando qualquer cláusula do fornecedor sobre responsabilidade de dimensionamento

## Coisas a ter cuidado

- **Nameplate vs. energia útil**: capacidade ofertada por fabricantes costuma ser nominal
  (BOL, antes de DoD/RTE) — nunca comparar direto com energia útil sem converter para a
  mesma base.
- **Demanda ponta vs. fora-ponta**: faturas trazem os dois valores separados — checar sempre
  qual está sendo usado, é fácil pegar o campo errado.
- **Horário de ponta não é universal** — sempre confirmar com a distribuidora específica do
  cliente, não assumir um padrão nacional.
- **Dias úteis vs. corridos**: horário de ponta normalmente só se aplica de segunda a sexta
  (verificar exceção de feriados por distribuidora).
- O fornecedor tipicamente isenta-se de responsabilidade pelo dimensionamento na proposta —
  isso reforça a necessidade dessa validação independente.

## Referência

Planilha de dimensionamento BESS (modelo TIME-SHIFT + backup) usada como base de validação
da lógica de cálculo — anexar ao repositório como fixture de teste.
