function formatDeficit(value) {
  const rounded = Math.round(value)
  if (rounded < 0) return `-${Math.abs(rounded)} kcal (superavit)`
  return `${rounded} kcal`
}

export default function DeficitSummary({ expenditure, extra, calorieGoal, consumedKcal }) {
  if (!expenditure) return null

  const totalExpenditure = expenditure + (extra || 0)
  const plannedDeficit = expenditure - calorieGoal
  const actualDeficit = totalExpenditure - consumedKcal

  return (
    <div className="deficit-summary">
      <div className="deficit-summary-row">
        <span>Gasto estimado{extra ? ' (com extra)' : ''}</span>
        <strong>{Math.round(totalExpenditure)} kcal</strong>
      </div>
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
