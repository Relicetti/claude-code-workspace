import { MEAL_GROUPS, OTHER_GROUP } from './mealGroups.js'
import { DAY_TYPE_BY_KEY } from './dayTypes.js'

const GROUP_ORDER = [...MEAL_GROUPS, OTHER_GROUP]

function groupEntries(entries) {
  const groups = new Map(GROUP_ORDER.map((g) => [g, []]))
  for (const entry of entries) {
    const key = groups.has(entry.mealGroup) ? entry.mealGroup : OTHER_GROUP
    groups.get(key).push(entry)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp)
  }
  return groups
}

function sumBy(entries, key) {
  return entries.reduce((acc, e) => acc + (e[key] || 0), 0)
}

// Plain-text export of a day's log, grouped by meal — same shape the app
// shows on screen, so it's easy to read and easy to paste/upload elsewhere.
export function formatLogExport(dateKey, dayType, entries) {
  const lines = []
  const preset = dayType ? DAY_TYPE_BY_KEY[dayType.dayType] : null

  lines.push(`Registro de ${dateKey}`)
  if (preset) lines.push(`Tipo de dia: ${preset.label}`)
  lines.push('')

  if (entries.length === 0) {
    lines.push('Nenhum item registrado.')
  } else {
    const groups = groupEntries(entries)
    for (const group of GROUP_ORDER) {
      const list = groups.get(group)
      if (list.length === 0) continue
      const totalKcal = Math.round(sumBy(list, 'kcal'))
      const totalProtein = Math.round(sumBy(list, 'protein'))
      const totalCarbs = Math.round(sumBy(list, 'carbs'))
      const totalFat = Math.round(sumBy(list, 'fat'))
      lines.push(`${group} — ${totalKcal} kcal · P ${totalProtein}g · C ${totalCarbs}g · G ${totalFat}g`)
      for (const e of list) {
        let line = `  - ${e.name}: ${Math.round(e.kcal)} kcal · P ${Math.round(e.protein)}g · C ${Math.round(e.carbs)}g · G ${Math.round(e.fat)}g`
        if (e.caffeine) line += ` · Cafeina ${Math.round(e.caffeine)}mg`
        if (e.water) line += ` · Agua ${Math.round(e.water)}ml`
        if (e.creatine) line += ` · Creatina ${Math.round(e.creatine)}g`
        lines.push(line)
      }
      lines.push('')
    }

    lines.push(
      `Total do dia: ${Math.round(sumBy(entries, 'kcal'))} kcal · P ${Math.round(sumBy(entries, 'protein'))}g · C ${Math.round(sumBy(entries, 'carbs'))}g · G ${Math.round(sumBy(entries, 'fat'))}g`
    )
  }

  return lines.join('\n')
}

export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
