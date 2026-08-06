export const MEAL_PLAN_TOTALS = { kcal: 2850, protein: 200, carbs: 300, fat: 87 }

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
  {
    key: 'treino',
    isTrainingBlock: true,
    label: 'Treino',
    time: '12:00 - 13:00',
  },
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

export const SATURDAY_ADJUSTMENTS = [
  'Treino as 10h.',
  'Cafe da Manha (08:30 - Pre-Treino): puxe mais carboidratos pra ca (pao, banana, mel/doce de leite, leite Bio Ciclos).',
  'Pos-Treino (11:30 - Almoco): mantenha o almoco volumoso em carboidratos e proteinas (arroz/macarrao + frango/carne).',
]
