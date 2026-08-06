import { useState } from 'react'
import { api } from '../api.js'
import { DAY_PLAN_TABS } from '../mealPlan.js'

function TrainingDivider({ meal }) {
  return (
    <div className="meal-plan-training">
      🏋️ {meal.label} · {meal.time}
    </div>
  )
}

function MealCard({ meal }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleAsk() {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      const { answer } = await api.suggestSubstitution({
        mealLabel: meal.label,
        targetKcal: meal.kcal,
        targetProtein: meal.protein,
        targetCarbs: meal.carbs,
        targetFat: meal.fat,
        currentSuggestion: meal.suggestion,
        request: text.trim(),
      })
      setAnswer(answer)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="meal-plan-card">
      <div className="meal-plan-card-header">
        <div>
          <span className="meal-plan-card-time">{meal.time}</span>
          <h4 className="meal-plan-card-title">{meal.label}</h4>
        </div>
        <span className="meal-plan-card-macros">
          {meal.kcal} kcal · P {meal.protein}g · C {meal.carbs}g · G {meal.fat}g
        </span>
      </div>
      {meal.note && <div className="meal-plan-card-note">{meal.note}</div>}
      <p className="meal-plan-card-suggestion">{meal.suggestion}</p>

      {!open ? (
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(true)}>
          🔄 Pedir substituicao equivalente
        </button>
      ) : (
        <div className="meal-plan-substitute">
          <textarea
            placeholder="ex: nao tenho frango, o que posso trocar mantendo os macros?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            autoFocus
          />
          <div className="manual-form-actions">
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => {
                setOpen(false)
                setText('')
                setAnswer(null)
                setError(null)
              }}
            >
              Fechar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={handleAsk}
              disabled={loading || !text.trim()}
            >
              {loading ? 'Perguntando...' : 'Perguntar'}
            </button>
          </div>
          {error && <div className="estimate-error">{error}</div>}
          {answer && <div className="meal-plan-answer">{answer}</div>}
        </div>
      )}
    </div>
  )
}

export default function MealPlanScreen({ onClose }) {
  const [tabKey, setTabKey] = useState(DAY_PLAN_TABS[0].key)
  const tab = DAY_PLAN_TABS.find((t) => t.key === tabKey)

  return (
    <div className="history-screen">
      <header className="history-screen-header">
        <button className="btn-icon" onClick={onClose} aria-label="Voltar">
          ←
        </button>
        <h2>Plano Alimentar</h2>
      </header>
      <div className="history-screen-body">
        <div className="meal-plan-tabs">
          {DAY_PLAN_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`meal-plan-tab${t.key === tabKey ? ' meal-plan-tab-active' : ''}`}
              onClick={() => setTabKey(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="meal-plan-totals">
          {tab.label} — {tab.totals.kcal} kcal · P {tab.totals.protein}g · C {tab.totals.carbs}g · G {tab.totals.fat}g
        </div>

        {tab.meals &&
          tab.meals.map((meal) =>
            meal.isTrainingBlock ? <TrainingDivider meal={meal} key={meal.key} /> : <MealCard meal={meal} key={meal.key} />
          )}

        {tab.notes && (
          <div className="meal-plan-saturday">
            <h4 className="history-chart-title">Ajustes</h4>
            <ul>
              {tab.notes.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
