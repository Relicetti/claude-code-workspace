import { useEffect, useMemo, useState } from 'react'
import { api, todayKey } from './api.js'
import CalorieGauge from './components/CalorieGauge.jsx'
import MacroBars from './components/MacroBars.jsx'
import PhotoCapture from './components/PhotoCapture.jsx'
import ReviewCards from './components/ReviewCards.jsx'
import ManualForm from './components/ManualForm.jsx'
import QuickAdd from './components/QuickAdd.jsx'
import DailyLog from './components/DailyLog.jsx'
import HistoryScreen from './components/HistoryScreen.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import DayTypeSelector from './components/DayTypeSelector.jsx'
import DeficitSummary from './components/DeficitSummary.jsx'

export default function App() {
  const [dateKey, setDateKey] = useState(todayKey())
  const [settings, setSettings] = useState(null)
  const [dayType, setDayTypeState] = useState(null)
  const [entries, setEntries] = useState([])
  const [candidates, setCandidates] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getSettings(), api.getLog(dateKey), api.getDayType(dateKey)])
      .then(([s, log, dt]) => {
        setSettings(s)
        setEntries(log)
        setDayTypeState(dt)
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
          caffeine: acc.caffeine + (e.caffeine || 0),
          water: acc.water + (e.water || 0),
          creatine: acc.creatine + (e.creatine || 0),
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0, caffeine: 0, water: 0, creatine: 0 }
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

  async function handleChangeDayType(newDayType) {
    try {
      const updated = await api.setDayType(dateKey, newDayType)
      setDayTypeState(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading || !settings || !dayType) {
    return <div className="app-loading">Carregando...</div>
  }

  const goals = {
    ...settings,
    calorieGoal: dayType.calorieGoal,
    proteinGoal: dayType.proteinGoal,
    carbGoal: dayType.carbGoal,
    fatGoal: dayType.fatGoal,
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

      <button className="btn btn-secondary history-open-btn" onClick={() => setShowHistory(true)}>
        📈 Ver historico de calorias e macros
      </button>

      <DayTypeSelector dayType={dayType.dayType} onChange={handleChangeDayType} />

      <section className="summary">
        <CalorieGauge consumed={consumed.kcal} goal={goals.calorieGoal} />
        <MacroBars consumed={consumed} goals={goals} />
        <DeficitSummary expenditure={dayType.expenditure} calorieGoal={goals.calorieGoal} consumedKcal={consumed.kcal} />
      </section>

      <section className="capture-section">
        <PhotoCapture
          onCandidates={setCandidates}
          onError={setError}
          analyzing={analyzing}
          setAnalyzing={setAnalyzing}
        />
        <ManualForm onAdd={handleAddEntry} onCandidates={setCandidates} />
        <QuickAdd onAdd={handleAddEntry} defaultCreatineDose={settings.creatineGoal} />
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

      {showHistory && <HistoryScreen onClose={() => setShowHistory(false)} />}
    </div>
  )
}
