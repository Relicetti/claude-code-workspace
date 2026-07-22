function MacroBar({ label, consumed, goal, color, unit }) {
  const pct = goal > 0 ? Math.min((consumed / goal) * 100, 100) : 0
  return (
    <div className="macro-bar">
      <div className="macro-bar-label">
        <span>{label}</span>
        <span>
          {Math.round(consumed)}{unit} / {Math.round(goal)}{unit}
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
      <MacroBar label="Proteina" consumed={consumed.protein} goal={goals.proteinGoal} color="#1565c0" unit="g" />
      <MacroBar label="Carboidrato" consumed={consumed.carbs} goal={goals.carbGoal} color="#ef6c00" unit="g" />
      <MacroBar label="Gordura" consumed={consumed.fat} goal={goals.fatGoal} color="#6a1b9a" unit="g" />
      <MacroBar
        label="Cafeina"
        consumed={consumed.caffeine}
        goal={goals.caffeineGoal}
        color="#5d4037"
        unit="mg"
      />
      <MacroBar label="Agua" consumed={consumed.water} goal={goals.waterGoal} color="#0288d1" unit="ml" />
      <MacroBar
        label="Creatina"
        consumed={consumed.creatine}
        goal={goals.creatineGoal}
        color="#616161"
        unit="g"
      />
    </div>
  )
}
