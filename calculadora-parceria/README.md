# Calculadora de Parceria Solar

Software que recria a planilha `Cálculo_Parceria_REV02.xlsm`: calcula a economia
comercial de parcerias de geração distribuída solar (geração compartilhada /
autoconsumo remoto) — tarifa compensada, faturamento do gerador, fatura do
cliente com e sem parceria e take rate.

## Como rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # roda a suíte de testes do engine
npm run build    # build de produção
```

## Estrutura

```
scripts/convert_xlsx_data.py   — gera os JSONs em src/data a partir do .xlsm original (impostos/desconto/isencoes/equivalencia)
src/data/*.json                — seed inicial: tarifas ANEEL, impostos, descontos, isenções, equivalências
src/types/index.ts             — tipos de entrada/saída
src/lib/engine.ts              — engine de cálculo (porta as fórmulas de PARCERIA/BASE)
src/lib/tarifasStore.ts        — cache em memória das tarifas (seed local + sincronização com o servidor)
src/lib/batchSimulation.ts     — simulação em lote (substitui a macro VBA), import/export CSV
src/lib/engine.test.ts         — testes contra cenários reais extraídos da planilha
src/App.tsx                    — interface com 3 abas
server/                        — API embutida no Vite (banco SQLite + sincronização com a ANEEL)
```

## Tarifas ANEEL (banco de dados + atualização automática)

`Tarifas_B1` e `Componentes_Tarifarias` (TE/TUSD e Fio B/Fio A por distribuidora) ficam num
banco SQLite (`server/data/tarifas.db`, via `node:sqlite` — nenhuma dependência nativa extra).
No primeiro `npm run dev`, o banco é populado a partir dos JSONs em `src/data/` (para o app já
funcionar de cara). Para trazer os dados mais recentes direto da ANEEL, clique em **"Atualizar
tarifas (ANEEL)"** no topo do app — o processo baixa e filtra os CSVs públicos do Portal de
Dados Abertos da ANEEL, sobrescreve o banco e recarrega o cálculo. Leva de 1 a 4 minutos (os
CSVs somam ~150-230 MB). Fontes usadas (replicando a consulta Power Query original):

- Tarifas homologadas: `dataset/tarifas-distribuidoras-energia-eletrica`
- Componentes tarifários (Fio B/Fio A): `dataset/componentes-tarifarias` (ano atual + anterior)

Os outros dados (`impostos`, `desconto`, `isencoes`, `equivalencia`) não têm fonte ANEEL ao vivo
identificada — continuam vindo da planilha, via:

```bash
py scripts/convert_xlsx_data.py "C:/caminho/para/Cálculo_Parceria_REV02.xlsm"
```

## Abas do software

1. **Calculadora** — todos os campos de entrada (distribuidora, ano, enquadramento, potências,
   geração, regras comerciais) e o resultado (tarifa compensada, faturamento do gerador, fatura
   do cliente, take rate, detalhes técnicos) na mesma tela, recalculando ao vivo.
2. **Simulação em Lote** — cole ou importe um CSV com vários cenários, roda tudo de uma vez e exporta o resultado.
3. **Relatório** — resumo para impressão / salvar como PDF (usa o diálogo de impressão do navegador).

## Cobertura de testes

`src/lib/engine.test.ts` valida o engine contra:
- 22 cenários reais pré-calculados na aba `RESUL. PARC.` da planilha original (GD1/GD2, Geração Compartilhada, Solar).
- 1 cenário detalhado (Roraima Energia, GD2, Autoconsumo, Solar) validando cada etapa intermediária (impostos, isenções, tarifas, componentes de TUSD).
- 10 cenários são pulados (`it.skip`) com justificativa: a tarifa ANEEL mais recente para essas 5 distribuidoras foi publicada depois da última vez que a simulação em lote foi rodada na planilha — o engine usa a tarifa mais atual (correto), então diverge do valor congelado no lote antigo.

**Não coberto por dados reais do Excel** (validado só por consistência de fórmula): enquadramento GD3, faixa de potência >1 MW, fonte "Outras". Vale conferir manualmente esses casos na planilha antes de usar em produção.

## Dados ausentes conhecidos

3 das 103 distribuidoras do dropdown não têm tarifa ANEEL cadastrada nas tabelas de apoio (mesmo problema seria visto na planilha original): **Amazonas Energia**, **Creral**, **Nova Palma**. O app mostra um erro claro nesses casos em vez de travar.
