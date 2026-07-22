import { MEAL_GROUPS, OTHER_GROUP } from '../mealGroups.js'

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

export default function DailyLog({ entries, onRemove }) {
  if (entries.length === 0) {
    return <div className="daily-log-empty">Nenhum item registrado hoje.</div>
  }

  const groups = groupEntries(entries)

  return (
    <div className="daily-log">
      {GROUP_ORDER.filter((g) => groups.get(g).length > 0).map((group) => (
        <div className="daily-log-group" key={group}>
          <h4 className="daily-log-group-title">{group}</h4>
          {groups.get(group).map((entry) => (
            <div className="daily-log-item" key={entry.id}>
              <div className="daily-log-item-info">
                <span className="daily-log-item-name">{entry.name}</span>
                <span className="daily-log-item-macros">
                  {Math.round(entry.kcal)} kcal · P {Math.round(entry.protein)}g · C {Math.round(entry.carbs)}g · G{' '}
                  {Math.round(entry.fat)}g{entry.caffeine ? ` · Cafeina ${Math.round(entry.caffeine)}mg` : ''}
                  {entry.water ? ` · Agua ${Math.round(entry.water)}ml` : ''}
                  {entry.creatine ? ` · Creatina ${Math.round(entry.creatine)}g` : ''}
                </span>
              </div>
              <button className="btn-icon" onClick={() => onRemove(entry.id)} aria-label="Remover">
                ✕
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
