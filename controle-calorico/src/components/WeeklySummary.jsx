import { useEffect, useState } from 'react'
import { api, weekKeysThrough } from '../api.js'
import { DAY_TYPE_BY_KEY, DEFAULT_DAY_TYPE } from '../dayTypes.js'

const DEFAULT_PRESET = DAY_TYPE_BY_KEY[DEFAULT_DAY_TYPE]

function formatDeficit(value) {
  const rounded = Math.round(value)
  return rounded >= 0 ? `${rounded} kcal` : `-${Math.abs(rounded)} kcal`
}

export default function WeeklySummary({ dateKey, entries, dayType }) {
  const [totals, setTotals] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const keys = weekKeysThrough(new Date(dateKey + 'T00:00:00'))
    const from = keys[0]
    const to = keys[keys.length - 1]

    Promise.all([api.getLogSummary(from, to), api.getDayTypeSummary(from, to)])
      .then(([logSummary, dayTypeSummary]) => {
        if (cancelled) return
        const kcalByDate = new Map(logSummary.map((r) => [r.date, r.kcal]))
        // Today's numbers come from live props instead of the fetch above,
        // so the card updates instantly as food is logged, without a refetch.
        kcalByDate.set(dateKey, entries.reduce((sum, e) => sum + e.kcal, 0))
        const dayTypeByDate = new Map(dayTypeSummary.map((r) => [r.date, r]))
        dayTypeByDate.set(dateKey, dayType)

        let expenditure = 0
        let plannedDeficit = 0
        let actualDeficit = 0
        for (const date of keys) {
          const dt = dayTypeByDate.get(date) || DEFAULT_PRESET
          const kcal = kcalByDate.get(date) || 0
          expenditure += dt.expenditure
          plannedDeficit += dt.expenditure - dt.calorieGoal
          actualDeficit += dt.expenditure - kcal
        }
        setTotals({ days: keys.length, expenditure, plannedDeficit, actualDeficit })
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [dateKey, entries, dayType])

  if (error || !totals) return null

  return (
    <div className="weekly-summary">
      <h4 className="weekly-summary-title">Semana (seg a dom) - {totals.days} dia(s)</h4>
      <div className="deficit-summary-row">
        <span>Gasto total da semana</span>
        <strong>{Math.round(totals.expenditure)} kcal</strong>
      </div>
      <div className="deficit-summary-row">
        <span>Deficit previsto da semana</span>
        <strong>{formatDeficit(totals.plannedDeficit)}</strong>
      </div>
      <div className="deficit-summary-row">
        <span>Deficit real da semana</span>
        <strong className={totals.actualDeficit < 0 ? 'deficit-negative' : 'deficit-positive'}>
          {formatDeficit(totals.actualDeficit)}
        </strong>
      </div>
    </div>
  )
}
