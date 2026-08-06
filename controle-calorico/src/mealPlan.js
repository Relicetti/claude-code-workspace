export const MEAL_PLAN_TOTALS = { kcal: 2850, protein: 200, carbs: 300, fat: 87 }
export const REST_DAY_TOTALS = { kcal: 2200, protein: 200, carbs: 220, fat: 58 }

// Monday, Tuesday, Wednesday, Friday: training 12:00-13:00.
export const WEEKDAY_MEALS = [
  {
    key: 'cafe_manha',
    label: 'Cafe da Manha',
    time: '07:30 - 08:00',
    note: 'Anabolismo & Energia Inicial',
    kcal: 450,
    protein: 30,
    carbs: 50,
    fat: 15,
    suggestion:
      'Pao de forma (2 fatias) + 2 ovos cozidos/mexidos + 1 fatia de queijo mussarela + 250ml Leite Bio Ciclos + 1 banana.',
  },
  {
    key: 'lanche_manha',
    label: 'Lanche da Manha',
    time: '10:30',
    note: 'Pre-Treino Direto',
    kcal: 300,
    protein: 20,
    carbs: 40,
    fat: 7,
    suggestion:
      '1 Barra de Proteina (Mukebar ou similar) + 1 banana ou doce de leite (15g a 20g) pra garantir pico de glicose rapido antes do treino.',
  },
  { key: 'treino', isTrainingBlock: true, label: 'Treino', time: '12:00 - 13:00' },
  {
    key: 'almoco',
    label: 'Almoco',
    time: '13:15',
    note: 'Pos-Treino Principal',
    kcal: 650,
    protein: 50,
    carbs: 80,
    fat: 12,
    suggestion:
      'Arroz branco cozido: 200g a 220g (~60g C)\nPeito de frango grelhado ou carne magra: 150g a 170g (~45g-50g P)\nFeijao cozido: 1 concha media (~15g C)\nVegetais e salada a vontade.',
  },
  {
    key: 'cafe_tarde',
    label: 'Cafe da Tarde',
    time: '16:30',
    note: 'Sustentacao de Glicogenio',
    kcal: 450,
    protein: 30,
    carbs: 50,
    fat: 15,
    suggestion: 'Pao com frango desfiado/ovo e queijo, ou mingau de aveia com whey/leite Bio Ciclos + banana.',
  },
  {
    key: 'janta',
    label: 'Janta',
    time: '20:00',
    note: 'Recuperacao & Volume',
    kcal: 650,
    protein: 45,
    carbs: 65,
    fat: 22,
    suggestion:
      'Macarrao cozido ou Arroz: 200g (~50g C)\nCarne moida (patinho/primeira): 180g (~40g-45g P)\nSalada / legumes + azeite ou pequena porcao de queijo.',
  },
  {
    key: 'ceia',
    label: 'Ceia / Lanche Noturno',
    time: '22:30',
    note: 'Sintese Proteica Noturna',
    kcal: 350,
    protein: 25,
    carbs: 15,
    fat: 15,
    suggestion:
      'Leite Bio Ciclos (250-300ml) + queijo mussarela ou ovos/pasta de amendoim pra manter aminoacidos circulantes durante o sono.',
  },
]

// Quinta: mesmo total do dia (2850/200/300/87), mas o treino (natacao + sauna)
// e a noite (18:00-19:30) em vez de meio-dia — reaproveita as mesmas
// refeicoes/macros da semana padrao, so muda o enquadramento de pre/pos-treino.
export const THURSDAY_MEALS = [
  {
    key: 'cafe_manha',
    label: 'Cafe da Manha',
    time: '07:30 - 08:00',
    note: 'Refeicao padrao',
    kcal: 450,
    protein: 30,
    carbs: 50,
    fat: 15,
    suggestion:
      'Pao de forma (2 fatias) + 2 ovos cozidos/mexidos + 1 fatia de queijo mussarela + 250ml Leite Bio Ciclos + 1 banana.',
  },
  {
    key: 'lanche_manha',
    label: 'Lanche da Manha',
    time: '10:30',
    note: 'Lanche padrao',
    kcal: 300,
    protein: 20,
    carbs: 40,
    fat: 7,
    suggestion: '1 Barra de Proteina (Mukebar ou similar) + 1 banana ou doce de leite (15g a 20g).',
  },
  {
    key: 'almoco',
    label: 'Almoco',
    time: '13:15',
    note: 'Almoco padrao (treino so a noite)',
    kcal: 650,
    protein: 50,
    carbs: 80,
    fat: 12,
    suggestion:
      'Arroz branco cozido: 200g a 220g (~60g C)\nPeito de frango grelhado ou carne magra: 150g a 170g (~45g-50g P)\nFeijao cozido: 1 concha media (~15g C)\nVegetais e salada a vontade.',
  },
  {
    key: 'cafe_tarde',
    label: 'Cafe da Tarde',
    time: '16:30',
    note: 'Pre-Treino (natacao + sauna)',
    kcal: 450,
    protein: 30,
    carbs: 50,
    fat: 15,
    suggestion:
      'Pao com frango desfiado/ovo e queijo, ou mingau de aveia com whey/leite Bio Ciclos + banana — carboidrato de facil digestao antes de entrar na piscina.',
  },
  { key: 'treino', isTrainingBlock: true, label: 'Natacao + Sauna', time: '18:00 - 19:30' },
  {
    key: 'janta',
    label: 'Janta',
    time: '20:00',
    note: 'Pos-Treino Principal',
    kcal: 650,
    protein: 45,
    carbs: 65,
    fat: 22,
    suggestion:
      'Macarrao cozido ou Arroz: 200g (~50g C)\nCarne moida (patinho/primeira): 180g (~40g-45g P)\nSalada / legumes + azeite ou pequena porcao de queijo — logo depois do treino, dentro da janela pos-treino.',
  },
  {
    key: 'ceia',
    label: 'Ceia / Lanche Noturno',
    time: '22:30',
    note: 'Sintese Proteica Noturna',
    kcal: 350,
    protein: 25,
    carbs: 15,
    fat: 15,
    suggestion:
      'Leite Bio Ciclos (250-300ml) + queijo mussarela ou ovos/pasta de amendoim pra manter aminoacidos circulantes durante o sono.',
  },
]

// Domingo: descanso, sem treino — meta reduzida (~2200 kcal), proteina mantida
// em 200g e carboidrato/gordura cortados por nao ter treino pra repor.
export const SUNDAY_MEALS = [
  {
    key: 'cafe_manha',
    label: 'Cafe da Manha',
    time: '08:00 - 08:30',
    note: 'Sem treino hoje',
    kcal: 350,
    protein: 30,
    carbs: 35,
    fat: 10,
    suggestion: 'Pao de forma (2 fatias) + 2 ovos + 1 fatia de queijo mussarela + 1 banana.',
  },
  {
    key: 'lanche_manha',
    label: 'Lanche da Manha',
    time: '10:30',
    kcal: 235,
    protein: 20,
    carbs: 25,
    fat: 6,
    suggestion: '1 Barra de Proteina ou iogurte com fruta.',
  },
  {
    key: 'almoco',
    label: 'Almoco',
    time: '13:00',
    kcal: 490,
    protein: 45,
    carbs: 50,
    fat: 12,
    suggestion:
      'Arroz branco cozido: ~150g (~45g C)\nPeito de frango grelhado ou carne magra: ~150g (~40-45g P)\nFeijao cozido: 1 concha pequena\nVegetais e salada a vontade.',
  },
  {
    key: 'cafe_tarde',
    label: 'Cafe da Tarde',
    time: '16:30',
    kcal: 350,
    protein: 30,
    carbs: 35,
    fat: 10,
    suggestion: 'Pao com frango desfiado/ovo e queijo, ou iogurte com whey + fruta.',
  },
  {
    key: 'janta',
    label: 'Janta',
    time: '20:00',
    kcal: 490,
    protein: 45,
    carbs: 50,
    fat: 12,
    suggestion: 'Carne magra ou frango grelhado (~150-170g) + salada/legumes + pequena porcao de carboidrato.',
  },
  {
    key: 'ceia',
    label: 'Ceia / Lanche Noturno',
    time: '22:00',
    kcal: 295,
    protein: 30,
    carbs: 25,
    fat: 8,
    suggestion: 'Leite Bio Ciclos ou whey + queijo mussarela/ovos.',
  },
]

export const SATURDAY_ADJUSTMENTS = [
  'Treino as 10h.',
  'Cafe da Manha (08:30 - Pre-Treino): puxe mais carboidratos pra ca (pao, banana, mel/doce de leite, leite Bio Ciclos).',
  'Pos-Treino (11:30 - Almoco): mantenha o almoco volumoso em carboidratos e proteinas (arroz/macarrao + frango/carne).',
  'Totais e demais refeicoes seguem o mesmo padrao dos dias de treino (2850 kcal / 200g P / 300g C / 87g G).',
]

export const DAY_PLAN_TABS = [
  { key: 'weekday', label: 'Seg / Ter / Qua / Sex', meals: WEEKDAY_MEALS, totals: MEAL_PLAN_TOTALS },
  { key: 'thursday', label: 'Quinta', meals: THURSDAY_MEALS, totals: MEAL_PLAN_TOTALS },
  { key: 'saturday', label: 'Sabado', notes: SATURDAY_ADJUSTMENTS, totals: MEAL_PLAN_TOTALS },
  { key: 'sunday', label: 'Domingo', meals: SUNDAY_MEALS, totals: REST_DAY_TOTALS },
]
