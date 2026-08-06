import { useState } from 'react'
import { api } from '../api.js'
import { WEEKDAY_MEALS, MEAL_PLAN_TOTALS, SATURDAY_ADJUSTMENTS } from '../mealPlan.js'

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
  return (
    <div className="history-screen">
      <header className="history-screen-header">
        <button className="btn-icon" onClick={onClose} aria-label="Voltar">
          ←
        </button>
        <h2>Plano Alimentar</h2>
      </header>
      <div className="history-screen-body">
        <div className="meal-plan-totals">
          Segunda a Sexta — {MEAL_PLAN_TOTALS.kcal} kcal · P {MEAL_PLAN_TOTALS.protein}g · C {MEAL_PLAN_TOTALS.carbs}g
          · G {MEAL_PLAN_TOTALS.fat}g
        </div>

        {WEEKDAY_MEALS.map((meal) =>
          meal.isTrainingBlock ? <TrainingDivider meal={meal} key={meal.key} /> : <MealCard meal={meal} key={meal.key} />
        )}

        <div className="meal-plan-saturday">
          <h4 className="history-chart-title">Ajuste pro sabado</h4>
          <ul>
            {SATURDAY_ADJUSTMENTS.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
