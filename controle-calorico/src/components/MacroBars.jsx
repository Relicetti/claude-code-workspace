function MacroBar({ label, consumed, goal, color }) {
  const pct = goal > 0 ? Math.min((consumed / goal) * 100, 100) : 0
  return (
    <div className="macro-bar">
      <div className="macro-bar-label">
        <span>{label}</span>
        <span>
          {Math.round(consumed)}g / {Math.round(goal)}g
        </span>
      </div>
      <div className="macro-bar-track">
        <div className="macro-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default function MacroBars({ consumed, goals }) {
  return (
    <div className="macro-bars">
      <MacroBar label="Proteina" consumed={consumed.protein} goal={goals.proteinGoal} color="#1565c0" />
      <MacroBar label="Carboidrato" consumed={consumed.carbs} goal={goals.carbGoal} color="#ef6c00" />
      <MacroBar label="Gordura" consumed={consumed.fat} goal={goals.fatGoal} color="#6a1b9a" />
    </div>
  )
}
