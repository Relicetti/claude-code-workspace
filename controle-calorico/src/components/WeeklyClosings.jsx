import { useEffect, useState } from 'react'
import { api, dateKeysBack, mondayKey, todayKey } from '../api.js'
import { DAY_TYPE_BY_KEY, DEFAULT_DAY_TYPE } from '../dayTypes.js'

const DAYS = 14
const DEFAULT_PRESET = DAY_TYPE_BY_KEY[DEFAULT_DAY_TYPE]

function formatDeficit(value) {
  const rounded = Math.round(value)
  return rounded >= 0 ? `${rounded} kcal` : `-${Math.abs(rounded)} kcal`
}

function shortDate(dateStr) {
  const [, mm, dd] = dateStr.split('-')
  return `${dd}/${mm}`
}

function groupByWeek(keys) {
  const order = []
  const byWeek = new Map()
  for (const key of keys) {
    const wk = mondayKey(new Date(key + 'T00:00:00'))
    if (!byWeek.has(wk)) {
      byWeek.set(wk, [])
      order.push(wk)
    }
    byWeek.get(wk).push(key)
  }
  return order.map((wk) => ({ monday: wk, days: byWeek.get(wk) }))
}

export default function WeeklyClosings() {
  const [weeks, setWeeks] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const keys = dateKeysBack(DAYS)
    const from = keys[0]
    const to = keys[keys.length - 1]
    const currentWeekMonday = mondayKey(new Date(todayKey() + 'T00:00:00'))

    Promise.all([api.getLogSummary(from, to), api.getDayTypeSummary(from, to)])
      .then(([logSummary, dayTypeSummary]) => {
        if (cancelled) return
        const kcalByDate = new Map(logSummary.map((r) => [r.date, r.kcal]))
        const dayTypeByDate = new Map(dayTypeSummary.map((r) => [r.date, r]))

        const grouped = groupByWeek(keys).map(({ monday, days }) => {
          let expenditure = 0
          let plannedDeficit = 0
          let actualDeficit = 0
          for (const date of days) {
            const dt = dayTypeByDate.get(date) || DEFAULT_PRESET
            const kcal = kcalByDate.get(date) || 0
            const total = dt.expenditure + (dt.extraExpenditure || 0)
            const realTotal = (dt.realExpenditure ?? dt.expenditure) + (dt.extraExpenditure || 0)
            expenditure += total
            plannedDeficit += dt.expenditure - dt.calorieGoal
            actualDeficit += realTotal - kcal
          }
          return {
            monday,
            days,
            expenditure,
            plannedDeficit,
            actualDeficit,
            isCurrent: monday === currentWeekMonday,
          }
        })

        setWeeks(grouped.reverse())
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <div className="history-chart-error">{error}</div>
  if (!weeks) return null

  return (
    <div className="weekly-closings">
      <h4 className="history-chart-title">Fechamento semanal</h4>
      {weeks.map((w) => (
        <div className="weekly-closing-card" key={w.monday}>
          <div className="weekly-closing-header">
            <span className="weekly-closing-range">
              {shortDate(w.days[0])} - {shortDate(w.days[w.days.length - 1])}
            </span>
            <span className={`weekly-closing-tag ${w.isCurrent ? 'weekly-closing-tag-open' : 'weekly-closing-tag-closed'}`}>
              {w.isCurrent ? 'em andamento' : 'fechada'}
            </span>
          </div>
          <div className="deficit-summary-row">
            <span>Gasto total ({w.days.length} dia{w.days.length > 1 ? 's' : ''})</span>
            <strong>{Math.round(w.expenditure)} kcal</strong>
          </div>
          <div className="deficit-summary-row">
            <span>Deficit previsto</span>
            <strong>{formatDeficit(w.plannedDeficit)}</strong>
          </div>
          <div className="deficit-summary-row">
            <span>Deficit real</span>
            <strong className={w.actualDeficit < 0 ? 'deficit-negative' : 'deficit-positive'}>
              {formatDeficit(w.actualDeficit)}
            </strong>
          </div>
        </div>
      ))}
    </div>
  )
}
