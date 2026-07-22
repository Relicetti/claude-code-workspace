export default function CalorieGauge({ consumed, goal }) {
  const pct = goal > 0 ? consumed / goal : 0
  let color = '#2e7d32'
  if (pct > 1) color = '#c62828'
  else if (pct >= 0.85) color = '#f9a825'

  const radius = 80
  const circumference = 2 * Math.PI * radius
  const clampedPct = Math.min(pct, 1)
  const offset = circumference * (1 - clampedPct)

  return (
    <div className="gauge">
      <svg viewBox="0 0 200 200" width="200" height="200">
        <circle cx="100" cy="100" r={radius} stroke="#e0e0e0" strokeWidth="16" fill="none" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke={color}
          strokeWidth="16"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 100 100)"
        />
        <text x="100" y="95" textAnchor="middle" fontSize="28" fontWeight="700" fill="#222">
          {Math.round(consumed)}
        </text>
        <text x="100" y="120" textAnchor="middle" fontSize="14" fill="#666">
          de {Math.round(goal)} kcal
        </text>
      </svg>
    </div>
  )
}
