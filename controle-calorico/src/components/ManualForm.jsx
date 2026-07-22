import { useState } from 'react'
import { api } from '../api.js'
import { MEAL_GROUPS, suggestMealGroup } from '../mealGroups.js'

const EMPTY = { name: '', kcal: '', protein: '', carbs: '', fat: '', caffeine: '', water: '', creatine: '' }

export default function ManualForm({ onAdd, onCandidates }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [mealGroup, setMealGroup] = useState(suggestMealGroup())
  const [description, setDescription] = useState('')
  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState(null)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    onAdd({
      name: form.name.trim(),
      kcal: Number(form.kcal) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
      caffeine: Number(form.caffeine) || 0,
      water: Number(form.water) || 0,
      creatine: Number(form.creatine) || 0,
      mealGroup,
    })
    setForm(EMPTY)
    setDescription('')
    setMealGroup(suggestMealGroup())
    setOpen(false)
  }

  async function handleEstimate() {
    if (!description.trim()) return
    setEstimating(true)
    setEstimateError(null)
    try {
      const { items } = await api.analyzeText(description.trim())
      if (items.length === 0) {
        setEstimateError('Nao consegui identificar nenhum alimento nessa descricao.')
      } else if (items.length === 1) {
        const item = items[0]
        setForm({
          name: item.name,
          kcal: item.kcal,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          caffeine: item.caffeine,
          water: item.water,
          creatine: item.creatine,
        })
      } else {
        onCandidates?.(items)
        setForm(EMPTY)
        setDescription('')
        setOpen(false)
      }
    } catch (err) {
      setEstimateError(err.message || 'Falha ao estimar com IA')
    } finally {
      setEstimating(false)
    }
  }

  if (!open) {
    return (
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        + Adicionar manualmente
      </button>
    )
  }

  return (
    <form className="manual-form" onSubmit={submit}>
      <div className="estimate-block">
        <textarea
          className="estimate-textarea"
          placeholder="Descreva o que comeu (ex: 2 ovos mexidos com uma fatia de pao integral)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          autoFocus
        />
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={handleEstimate}
          disabled={estimating || !description.trim()}
        >
          {estimating ? 'Estimando...' : '✨ Estimar com IA'}
        </button>
        {estimateError && <div className="estimate-error">{estimateError}</div>}
      </div>

      <input
        placeholder="Nome do alimento"
        value={form.name}
        onChange={(e) => update('name', e.target.value)}
      />
      <select
        className="meal-group-select"
        value={mealGroup}
        onChange={(e) => setMealGroup(e.target.value)}
      >
        {MEAL_GROUPS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <div className="manual-form-fields">
        <input type="number" placeholder="Kcal" value={form.kcal} onChange={(e) => update('kcal', e.target.value)} />
        <input
          type="number"
          placeholder="Proteina (g)"
          value={form.protein}
          onChange={(e) => update('protein', e.target.value)}
        />
        <input
          type="number"
          placeholder="Carbo (g)"
          value={form.carbs}
          onChange={(e) => update('carbs', e.target.value)}
        />
        <input type="number" placeholder="Gordura (g)" value={form.fat} onChange={(e) => update('fat', e.target.value)} />
        <input
          type="number"
          placeholder="Cafeina (mg)"
          value={form.caffeine}
          onChange={(e) => update('caffeine', e.target.value)}
        />
        <input
          type="number"
          placeholder="Agua (ml)"
          value={form.water}
          onChange={(e) => update('water', e.target.value)}
        />
        <input
          type="number"
          placeholder="Creatina (g)"
          value={form.creatine}
          onChange={(e) => update('creatine', e.target.value)}
        />
      </div>
      <div className="manual-form-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setOpen(false)
            setForm(EMPTY)
            setDescription('')
            setMealGroup(suggestMealGroup())
          }}
        >
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          Adicionar
        </button>
      </div>
    </form>
  )
}
