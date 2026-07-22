import { useEffect, useMemo, useState } from 'react'
import { api, todayKey } from './api.js'
import CalorieGauge from './components/CalorieGauge.jsx'
import MacroBars from './components/MacroBars.jsx'
import PhotoCapture from './components/PhotoCapture.jsx'
import ReviewCards from './components/ReviewCards.jsx'
import ManualForm from './components/ManualForm.jsx'
import DailyLog from './components/DailyLog.jsx'
import SettingsModal from './components/SettingsModal.jsx'

export default function App() {
  const [dateKey, setDateKey] = useState(todayKey())
  const [settings, setSettings] = useState(null)
  const [entries, setEntries] = useState([])
  const [candidates, setCandidates] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getSettings(), api.getLog(dateKey)])
      .then(([s, log]) => {
        setSettings(s)
        setEntries(log)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [dateKey])

  // Reset automatically at midnight: check the date key periodically.
  useEffect(() => {
    const interval = setInterval(() => {
      const current = todayKey()
      if (current !== dateKey) setDateKey(current)
    }, 60000)
    return () => clearInterval(interval)
  }, [dateKey])

  const consumed = useMemo(
    () =>
      entries.reduce(
        (acc, e) => ({
          kcal: acc.kcal + e.kcal,
          protein: acc.protein + e.protein,
          carbs: acc.carbs + e.carbs,
          fat: acc.fat + e.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [entries]
  )

  async function handleAddEntry(entry) {
    try {
      const updated = await api.addLogEntry(dateKey, entry)
      setEntries(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddCandidate(idx, form) {
    await handleAddEntry(form)
    setCandidates((cs) => cs.filter((_, i) => i !== idx))
  }

  function handleDiscardCandidate(idx) {
    setCandidates((cs) => cs.filter((_, i) => i !== idx))
  }

  async function handleRemoveEntry(id) {
    try {
      const updated = await api.deleteLogEntry(dateKey, id)
      setEntries(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveSettings(newSettings) {
    try {
      const saved = await api.saveSettings(newSettings)
      setSettings(saved)
      setShowSettings(false)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleClearDay() {
    try {
      const updated = await api.clearLog(dateKey)
      setEntries(updated)
      setShowSettings(false)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading || !settings) {
    return <div className="app-loading">Carregando...</div>
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Controle Calorico</h1>
        <button className="btn-icon" onClick={() => setShowSettings(true)} aria-label="Configuracoes">
          ⚙️
        </button>
      </header>

      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <section className="summary">
        <CalorieGauge consumed={consumed.kcal} goal={settings.calorieGoal} />
        <MacroBars consumed={consumed} goals={settings} />
      </section>

      <section className="capture-section">
        <PhotoCapture
          onCandidates={setCandidates}
          onError={setError}
          analyzing={analyzing}
          setAnalyzing={setAnalyzing}
        />
        <ManualForm onAdd={handleAddEntry} />
      </section>

      <ReviewCards candidates={candidates} onAdd={handleAddCandidate} onDiscard={handleDiscardCandidate} />

      <section className="log-section">
        <h3>Hoje</h3>
        <DailyLog entries={entries} onRemove={handleRemoveEntry} />
      </section>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClearDay={handleClearDay}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
