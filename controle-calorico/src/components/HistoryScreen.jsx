import HistoryChart from './HistoryChart.jsx'

export default function HistoryScreen({ goals, onClose }) {
  return (
    <div className="history-screen">
      <header className="history-screen-header">
        <button className="btn-icon" onClick={onClose} aria-label="Voltar">
          ←
        </button>
        <h2>Historico</h2>
      </header>
      <div className="history-screen-body">
        <p className="history-screen-hint">Arraste o grafico pros lados pra ver todos os dias.</p>
        <HistoryChart goals={goals} large />
      </div>
    </div>
  )
}
