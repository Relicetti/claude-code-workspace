export const MEAL_GROUPS = [
  'Cafe da manha',
  'Lanche da manha',
  'Almoco',
  'Cafe da tarde',
  'Janta',
  'Ceia',
  'Beliscos',
  'Suplementos',
]

export const OTHER_GROUP = 'Outros'

const TIME_RANGES = [
  { group: 'Cafe da manha', from: 5, to: 10 },
  { group: 'Lanche da manha', from: 10, to: 11.5 },
  { group: 'Almoco', from: 11.5, to: 14 },
  { group: 'Cafe da tarde', from: 14, to: 17 },
  { group: 'Janta', from: 17, to: 20 },
  { group: 'Ceia', from: 20, to: 23 },
]

export function suggestMealGroup(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60
  const match = TIME_RANGES.find((r) => hour >= r.from && hour < r.to)
  return match ? match.group : 'Beliscos'
}
