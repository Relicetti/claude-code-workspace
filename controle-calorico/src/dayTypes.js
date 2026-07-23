export const DAY_TYPES = [
  {
    key: 'descanso',
    label: 'Descanso (sem treino)',
    calorieGoal: 2200,
    proteinGoal: 220,
    carbGoal: 160,
    fatGoal: 60,
    expenditure: 2550,
  },
  {
    key: 'musculacao',
    label: 'So Musculacao',
    calorieGoal: 2450,
    proteinGoal: 220,
    carbGoal: 195,
    fatGoal: 65,
    expenditure: 2900,
  },
  {
    key: 'musculacao_sauna',
    label: 'Musculacao + Sauna',
    calorieGoal: 2500,
    proteinGoal: 220,
    carbGoal: 200,
    fatGoal: 68,
    expenditure: 2950,
  },
  {
    key: 'natacao',
    label: 'So Natacao',
    calorieGoal: 2500,
    proteinGoal: 220,
    carbGoal: 205,
    fatGoal: 65,
    expenditure: 2975,
  },
  {
    key: 'natacao_sauna',
    label: 'Natacao + Sauna',
    calorieGoal: 2550,
    proteinGoal: 220,
    carbGoal: 210,
    fatGoal: 68,
    expenditure: 3025,
  },
  {
    key: 'duplo',
    label: 'Musculacao + Natacao + Sauna',
    calorieGoal: 2800,
    proteinGoal: 220,
    carbGoal: 245,
    fatGoal: 72,
    expenditure: 3325,
  },
]

export const DEFAULT_DAY_TYPE = 'descanso'

export const DAY_TYPE_BY_KEY = Object.fromEntries(DAY_TYPES.map((d) => [d.key, d]))
