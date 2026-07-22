export default function DailyLog({ entries, onRemove }) {
  if (entries.length === 0) {
    return <div className="daily-log-empty">Nenhum item registrado hoje.</div>
  }

  return (
    <div className="daily-log">
      {entries
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((entry) => (
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
            <button className="btn-icon" onClick={() => onRemove(entry.id)} aria-label="Remover">
              ✕
            </button>
          </div>
        ))}
    </div>
  )
}
