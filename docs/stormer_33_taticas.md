# Método Stormer — 33 Táticas (Análise Técnica Avançada)
### Base de regras para formalização em backtester

> Fonte: apostila "Stormer - Análise Técnica Avançada" (Alexandre Wolwacz / L&S Educação).
> Cada tática abaixo está descrita como: **Filtro/Contexto → Gatilho de entrada → Stop → Alvo/Saída**, pronta para virar função de sinal.

---

## Ferramentas de base (usadas em várias táticas)

- **Fura-teto** = `máxima_semana + (máxima_semana − mínima_semana) × 0,14` → nível que precisa ser rompido (fechamento acima) para confirmar rompimento de resistência semanal.
- **Fura-chão** = `mínima_semana − (máxima_semana − mínima_semana) × 0,14` → stop técnico simétrico.
- **PAR (Ponto de Anular Risco)**: realização parcial que zera o risco do restante da posição.
  `PAR = entrada + [(capital em risco na fração realizada) / (fração remanescente)]`
  Ex.: comprado a 10, stop a 9, realiza 30% da posição → PAR ≈ 10,42 (zera risco dos 70% restantes).
- Regra geral de stop: evitar números redondos (ajustar sempre alguns centavos abaixo/acima).
- Regra geral de rompimento: entrada é sempre no **fechamento** acima/abaixo do nível de referência (não intrabar), salvo quando indicado "ordem start".

---

## 1–5. Fundamentos (não são setups isolados, são a estrutura do método)
- Plano de negócio: capital, prazo operacional, seleção de 2–3 ativos, setup, manejo de risco, metas.
- 4 fases do mercado: tendência de alta, topo/distribuição, tendência de baixa, fundo/acumulação — a maioria dos setups funciona bem só em 2 das 4 fases.
- Realização parcial padrão (duas variantes): PAR (zera risco) ou alvo de 1× o risco vendendo 50%.
- Ciclo 3-5-7: após 3 velas na mesma direção, já se espera correção; em 5, atenção redobrada; em 7, sinal forte de exaustão do movimento.

---

## 6. Rompimento da Máxima da Semana Anterior
- **Contexto:** qualquer regime (funciona em alta e em baixa).
- **Entrada:** compra ao romper (fechamento acima) a máxima da semana anterior.
- **Stop:** mínima da semana rompida (ativos menos líquidos) OU retração de 0,61 dessa semana (ativos mais líquidos — reduz perda média).
- **Saída:** PAR de 70% da posição; restante com alvo de 8%.
- **Estatística citada:** ~59–66% de acerto dependendo do stop; melhora muito com 2% de risco/trade.

## 7. Rompimento da Máxima + IFR(14) < 50
- Igual ao #6, mas só entra se IFR14 < 50 no momento do rompimento.
- **Efeito:** acerto sobe para ~73–92%, mas frequência cai (de ~24–36 sinais/ano para ~8/ano).
- Sem PAR — leva metade do trade até o alvo de 8%.

## 8. Duas Semanas de Queda
- **Contexto:** tendência de alta no semanal (topos/fundos ascendentes, preço > MM21 e MM55).
- **Gatilho:** após 2ª semana de queda consecutiva, calcula fura-teto dessa semana.
- **Entrada:** fechamento acima do fura-teto na semana seguinte (senão, recalcula toda semana).
- **Stop:** fura-chão / mínima da semana. **Alvo:** 8% (70% da posição), resto até pivot de baixa.
- **Filtro extra citado:** anula o trade se fechar abaixo da MM50.
- **Estatística:** ~87% de acerto, 4–7 sinais/ano nos principais ativos do IBOV.

## 9. Barra de Exaustão
- **Contexto (venda→reversão de alta):** queda aguda, gap de baixa forte na semana, fechamento perto da máxima da semana, volume forte, gap não totalmente fechado.
- **Entrada:** rompimento da máxima dessa semana, na semana seguinte.
- **Stop:** mínima da semana de exaustão. **Saída:** PAR 50%, resto alvo 8%.
- Padrão espelhado serve para topos (reversão de baixa). Funciona também no diário.

## 10. Ponto Contínuo
- **Contexto:** MM21 semanal (exponencial) como referência de tendência.
- **Gatilho:** recuo até a MM21 + candle de reversão sobre a média.
- **Entrada:** rompimento do fura-teto (ou máxima da semana) formado sobre a média.
- **Stop:** fura-chão dessa semana. Sem PAR.
- **Nota:** é o "sistema carro-chefe" auxiliar — funciona em qualquer prazo, inclusive vendido.

## 11. IFR Ajustado (sobrevenda/sobrecompra ajustadas)
- **Entrada:** IFR14 atinge zona de sobrevenda ajustada → marca máxima do candle → rompimento na semana seguinte aciona compra.
- **Stop:** mínima da semana / fura-chão.
- **Saída:** venda quando IFR se aproxima da zona de sobrecompra ajustada e perde a mínima (trailing por mínimas semanais).
- Variante intraday (60min): stop na retração 0,61 do candle; alvo 161% da amplitude.

## 12. Virada do IFR
- **Entrada:** IFR14 vira de queda para alta → compra no rompimento da máxima do candle que fez a virada.
- **Stop:** mínima do candle (ou retração 0,61 no modo mais usado pelo autor).
- **Alvo:** 100% do risco do trade (1:1) projetado para cima.

## 13. Retângulo em Topo
- **Contexto:** consolidação estreita (amplitude < 10%), ≥ 8 semanas, próxima de topo histórico.
- **Entrada:** rompimento da resistência do retângulo.
- **Stop:** fura-chão / mínima da barra anterior ao rompimento.
- **Alvo:** projeção da perna de alta anterior à congestão (medida móvel).

## 14. Latinha Chacoalhada
- **Contexto:** ativo em congestão/lateral.
- **Gatilho:** candle com a menor amplitude (máx-mín) das últimas 4 barras dentro da congestão.
- **Entrada:** rompimento (qualquer direção) da máxima/mínima dessa barra na semana seguinte.
- **Stop:** extremidade oposta da mesma barra.

## 15. Como Entrar Depois de Atrasado
- **Contexto:** rompimento de congestão já ocorreu com uma barra muito grande (perdeu a entrada).
- **Entrada:** ordem de compra na retração de Fibonacci 50% dessa barra grande.
- **Stop:** retração de 0,618 da mesma barra.

## 16. Ponto de Cataclismo
- **Contexto:** subjetivo — zona onde convergem ≥3 destes: fundo anterior respeitado, topo anterior rompido, retrações 0,382/0,50/0,618, LTA, MM21/MM55, suporte 1/2 do PPE, número redondo.
- **Entrada:** rompimento da máxima do candle que tocou essa confluência.
- **Stop:** mínima do candle.
- ⚠️ Autor descreve como o menos sistemático/mais subjetivo — difícil de automatizar 1:1.

## 17. Sombra Inferior (e espelho: Sombra Superior)
- **Contexto:** suporte relevante (cataclismo) sendo testado.
- **Gatilho:** candle com sombra inferior longa perfurando o suporte, volume forte reforça.
- **Entrada:** rompimento da máxima do candle da sombra, no candle seguinte.
- **Stop:** mínima da sombra. **Alvo:** 8%.

## 18. Média Móvel Deslocada (Joe Di Napoli)
- **Ferramenta:** EMA(3) deslocada 3 períodos à frente — serve de trailing stop e filtro de tendência (preço acima = viés de compra).
- **Setup "dupla penetração":** topo no mesmo nível (ou levemente abaixo) do topo anterior, com dois toques/penetrações na média deslocada — sinaliza reversão.

## 19. Fechou Fora, Fechou Dentro (ligado às Bandas de Bollinger — ver #30)
- **Compra:** candle fecha fora da banda inferior → candle seguinte fecha de volta dentro da banda → compra no rompimento da máxima do 2º candle.
- **Stop:** mínima do menor dos dois candles.
- **Saída:** banda central = alvo de 70% da posição; resto conduzido (stop móvel) até banda superior.
- Espelhado para venda (banda superior).
- Estatística citada: ~80% acerto histórico, mas payoff baixo (poucos sinais).

## 20. Harami
- **Padrão:** candle "mãe" grande seguido de candle "filhote" menor, contido dentro do corpo da mãe.
- **3 pontos de entrada possíveis:** rompimento do fechamento do filhote / rompimento da máxima do filhote / rompimento da abertura da mãe.
- **Stop:** mínima da mãe (em todos os casos).
- Reforça muito quando alinhado com MM, LTA, topo/fundo anterior, Fibo, número redondo ou PPE.
- Estatística citada (alvo 8% semanal, 1997–2007): PETR4 93%, VALE5 67%, ALLL11 100%, BBDC4 100%, CSNA3 72%.

## 21. Média de 9 períodos — 9.1 (Larry Williams)
- **Ferramenta:** EMA(9).
- **Compra:** média vira para cima → marca máxima do candle da virada → rompimento aciona entrada.
- **Stop:** mínima do candle da virada.
- **Saída:** quando a média virar para baixo E perder a mínima do candle da virada de baixa.
- Venda espelhada, mas com **alvo fixo de recompra** (4–6% conforme prazo) em vez de esperar virada — autor descreve como seu **sistema principal**, junto com #32 (IFR2 com filtro).
- Ajustes por prazo: semanal (alvo recompra 6%), diário (3,5%), 60min (entrada na virada da média, stop na mínima da hora, realiza metade no risco 1:1).

## 22. Média de 9 já virada para cima — 9.2
- **Contexto:** média já em alta.
- **Gatilho:** candle que fecha abaixo da mínima do anterior.
- **Entrada:** rompimento da máxima desse candle (desce a entrada a cada novo candle se não romper, enquanto a média seguir subindo).
- **Stop:** mínima do candle de entrada.

## 23. Média de 9 subindo com dois fechamentos mais baixos — 9.3
- **Contexto:** média subindo.
- **Gatilho:** dois fechamentos consecutivos abaixo de um fechamento mais alto anterior.
- **Entrada:** rompimento da máxima do último candle (desce a entrada se não confirmar; invalida se a média virar para baixo).
- **Stop:** mínima do candle de entrada.

## 24. Gap Escondido
- **Padrão:** candle 1 de baixa fechando perto da mínima → candle 2 abre acima do fechamento do candle 1, fecha acima da máxima do candle 1, sem furar a mínima do candle 1.
- **Entrada:** rompimento da máxima do candle 2.
- **Stop:** retração de 0,61 dessa barra. **Alvo:** 8%. Espelhável para topos.

## 25. Iguana (Jeff Cooper)
- **Alta:** semana com a mínima das últimas 4 semanas + abertura e fechamento acima do percentil 75% da barra.
- **Entrada:** retração de 50% do candle iguana logo na abertura seguinte (ordem antecipada); se não pegar, entra no rompimento da máxima.
- **Stop:** retração de 0,61 da semana do iguana.
- Espelhado para baixa (percentil 25%, mínima das 4 semanas anteriores é a máxima).

## 26. Realização Frustrada
- **Alta:** em tendência de alta, sequência baixa-alta-baixa (3 candles) → rompimento da máxima do conjunto = compra.
- **Stop:** mínima do conjunto. **Alvo:** amplitude do conjunto de 3 candles.
- Espelhado para baixa (alta-baixa-alta em tendência de baixa).

## 27. Stops e Stops Móveis (ferramentas, não setup de entrada)
- Parabolic SAR: bom em tendência direcional, ruim em lateralização; fecha posição quando preço cruza o SAR.
- HiLo Activator: mais rápido/sensível que o SAR.
- Outras citadas: média de 3 deslocada, VSS, "stop safe zone", fura-chão (semanal).

## 28. Three Line Bar (Joseph Stowell)
- **Baixa→Alta:** barra 1 = menor mínima do movimento de queda (marca sua máxima) → barra 2 = máxima mais recente anterior a ela → barra 3 = próxima máxima imediatamente maior que a da barra 2. Fechamento acima da máxima da barra 3 = reversão para alta. (Inside bars são ignoradas; nova mínima redefine a linha.)
- **Alta→Baixa:** espelhado usando mínimas.

## 29. Acumulação e Distribuição (indicadores de volume)
- OBV (Granville): soma/subtrai volume conforme fechamento sobe/desce em relação ao dia anterior.
- AC/DD (Chaikin): `[(fech−mín) − (máx−fech)] / (máx−mín)` × volume do período. Usado para achar divergências de médio/longo prazo entre preço e fluxo (ex.: preço lateral com AC/DD subindo = acumulação silenciosa).

## 30. Bandas de Bollinger — táticas gerais
- Banda central = MM (20–21 típico); superior/inferior = desvio padrão.
- Usos: (1) precificar caro/barato, (2) localizar topo/fundo, (3) setup "fechou fora, fechou dentro" (→ #19), (4) estreitamento das bandas antecipa rompimento explosivo (direção provável = lado oposto de onde o preço está em relação à banda central no momento do estreitamento).

## 31. IFR2 (sem filtro)
- **Ferramenta:** IFR(2).
- **Entrada:** IFR2 fecha abaixo de 5 → compra no fechamento desse candle.
- **Stop:** 130% da amplitude do candle de entrada, projetado para baixo (stop longo, deliberado).
- **Saída:** metade da posição no primeiro fechamento com lucro > 3%; resto com EMA(5) como trailing (sai quando a EMA5 vira para baixo e perde a mínima do candle da virada).
- MM49 como filtro auxiliar de contexto.

## 32. IFR2 com Filtro — ★ sistema principal do autor
- **Filtro:** MA aritmética de 13 períodos aplicada sobre o IFR (não sobre o preço).
- **Entrada:** só compra quando o IFR cruza de baixo para cima essa média de 13 (não quando o IFR2 cai abaixo de 5 puro) → rompimento da máxima do candle do cruzamento.
- **Stop:** mínima do candle de entrada.
- **Saída:** metade na 1ª sexta/dia com lucro > limiar (4% semanal, 2% diário); resto via EMA(5) trailing.
- **60min:** alvo1 = amplitude inteira do candle de entrada; alvo2 = 300% dessa amplitude; nunca compra abaixo da MM49 (só sinais de venda nesse regime).
- **Nota do autor:** testado como o mais rentável e com menor drawdown entre todos os 33 (melhor que a Média de 9 no mesmo período/ativo testado).

## 33. Média de 10 e sua Sombra (Larry Williams)
- **Ferramenta:** EMA(10) vs. EMA(10) deslocada 1 período.
- **Entrada:** EMA(10) cruza para cima da EMA(10) deslocada → compra no rompimento da máxima do candle do cruzamento.
- **Stop:** mínima da semana do cruzamento.
- **Saída:** PAR opcional ou conduz até a EMA(10) cruzar para baixo da deslocada.

---

## Observações para portar ao backtester (crypto-trading-research)

1. **Maior prioridade para validação:** #21 (Média de 9) e #32 (IFR2 com filtro) — o próprio autor os aponta como "sistema carro-chefe", com estatísticas mais robustas (múltiplos anos, vários ativos).
2. **Setups de alta frequência/baixa seletividade** (#6, #19, #26): bons candidatos para gerar amostra estatística grande rápido no walk-forward.
3. **Setups descartáveis para automação pura:** #16 (Ponto de Cataclismo) é subjetivo por definição — o próprio autor evita. #29 (Acumulação/Distribuição) é mais discricionário/qualitativo.
4. Praticamente todos os setups compartilham a mesma anatomia: **filtro de tendência (MM ou estrutura de topos/fundos) + gatilho de rompimento de uma barra de referência + stop na barra de referência + saída parcial em alvo fixo (%) + trailing na segunda metade**. Isso dá pra generalizar num framework único de backtest com parâmetros por setup, em vez de 33 implementações isoladas.
5. Todos os %/multiplicadores (8%, 0,61, 0,14, 130%, 161%, 300%) foram calibrados pelo autor em ações brasileiras (Bovespa) nos anos 2000–2010 — **precisam de recalibração** para cripto (volatilidade e regime de mercado bem diferentes) antes de qualquer validação walk-forward.
