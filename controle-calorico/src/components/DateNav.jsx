import { formatDateLabel, shiftDateKey, todayKey } from '../api.js'

export default function DateNav({ dateKey, onChange }) {
  const isToday = dateKey === todayKey()

  return (
    <div className="date-nav">
      <button className="btn-icon" onClick={() => onChange(shiftDateKey(dateKey, -1))} aria-label="Dia anterior">
        ‹
      </button>
      <div className="date-nav-current">
        <span className="date-nav-label">{formatDateLabel(dateKey)}</span>
        {!isToday && (
          <button className="date-nav-today" onClick={() => onChange(todayKey())}>
            voltar pra hoje
          </button>
        )}
      </div>
      <button
        className="btn-icon"
        onClick={() => onChange(shiftDateKey(dateKey, 1))}
        aria-label="Proximo dia"
        disabled={isToday}
      >
        ›
      </button>
    </div>
  )
}
