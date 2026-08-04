function formatDeficit(value) {
  const rounded = Math.round(value)
  if (rounded < 0) return `-${Math.abs(rounded)} kcal (superavit)`
  return `${rounded} kcal`
}

export default function DeficitSummary({ expenditure, realExpenditure, extra, calorieGoal, consumedKcal }) {
  if (!expenditure) return null

  const plannedTotal = expenditure + (extra || 0)
  const realTotal = realExpenditure != null ? realExpenditure + (extra || 0) : null
  const plannedDeficit = expenditure - calorieGoal
  // "Deficit real" reflects what actually happened today: prefer the synced
  // Fitbit expenditure when we have it, fall back to the estimate otherwise.
  const actualDeficit = (realTotal ?? plannedTotal) - consumedKcal

  return (
    <div className="deficit-summary">
      <div className="deficit-summary-row">
        <span>Gasto previsto{extra ? ' (com extra)' : ''}</span>
        <strong>{Math.round(plannedTotal)} kcal</strong>
      </div>
      {realTotal != null && (
        <div className="deficit-summary-row">
          <span>
            Gasto realizado (Fitbit)
            <span className="synced-badge">●</span>
          </span>
          <strong>{Math.round(realTotal)} kcal</strong>
        </div>
      )}
      {extra ? (
        <div className="deficit-summary-row deficit-summary-extra">
          <span>+ Atividade extra</span>
          <span>{Math.round(extra)} kcal</span>
        </div>
      ) : null}
      <div className="deficit-summary-row">
        <span>Deficit previsto</span>
        <strong>{formatDeficit(plannedDeficit)}</strong>
      </div>
      <div className="deficit-summary-row">
        <span>Deficit real</span>
        <strong className={actualDeficit < 0 ? 'deficit-negative' : 'deficit-positive'}>
          {formatDeficit(actualDeficit)}
        </strong>
      </div>
    </div>
  )
}
