function formatDeficit(value) {
  const rounded = Math.round(value)
  if (rounded < 0) return `-${Math.abs(rounded)} kcal (superavit)`
  return `${rounded} kcal`
}

export default function DeficitSummary({ expenditure, calorieGoal, consumedKcal }) {
  if (!expenditure) return null

  const plannedDeficit = expenditure - calorieGoal
  const actualDeficit = expenditure - consumedKcal

  return (
    <div className="deficit-summary">
      <div className="deficit-summary-row">
        <span>Gasto estimado hoje</span>
        <strong>{Math.round(expenditure)} kcal</strong>
      </div>
      <div className="deficit-summary-row">
        <span>Deficit previsto</span>
        <strong>{formatDeficit(plannedDeficit)}</strong>
      </div>
      <div className="deficit-summary-row">
        <span>Deficit real (ate agora)</span>
        <strong className={actualDeficit < 0 ? 'deficit-negative' : 'deficit-positive'}>
          {formatDeficit(actualDeficit)}
        </strong>
      </div>
    </div>
  )
}
