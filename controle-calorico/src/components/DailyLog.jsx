import { useState } from 'react'
import { MEAL_GROUPS, OTHER_GROUP } from '../mealGroups.js'
import EditEntryForm from './EditEntryForm.jsx'

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

function groupTotals(list) {
  return list.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

export default function DailyLog({ entries, onRemove, onEdit }) {
  const [editingId, setEditingId] = useState(null)

  if (entries.length === 0) {
    return <div className="daily-log-empty">Nenhum item registrado hoje.</div>
  }

  const groups = groupEntries(entries)

  return (
    <div className="daily-log">
      {GROUP_ORDER.filter((g) => groups.get(g).length > 0).map((group) => {
        const totals = groupTotals(groups.get(group))
        return (
          <div className="daily-log-group" key={group}>
            <div className="daily-log-group-header">
              <h4 className="daily-log-group-title">{group}</h4>
              <span className="daily-log-group-totals">
                {Math.round(totals.kcal)} kcal · P {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g · G{' '}
                {Math.round(totals.fat)}g
              </span>
            </div>
            {groups.get(group).map((entry) =>
              editingId === entry.id ? (
                <EditEntryForm
                  key={entry.id}
                  entry={entry}
                  onCancel={() => setEditingId(null)}
                  onSave={(updates) => {
                    onEdit(entry.id, updates)
                    setEditingId(null)
                  }}
                />
              ) : (
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
                  <div className="daily-log-item-actions">
                    <button className="btn-icon" onClick={() => setEditingId(entry.id)} aria-label="Editar">
                      ✏️
                    </button>
                    <button className="btn-icon" onClick={() => onRemove(entry.id)} aria-label="Remover">
                      ✕
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
