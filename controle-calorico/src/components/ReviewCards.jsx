import { useState } from 'react'
import { MEAL_GROUPS, suggestMealGroup } from '../mealGroups.js'
import { applyQuantityChange } from '../scaleNutrients.js'

function ReviewCard({ item, onAdd, onDiscard }) {
  const [form, setForm] = useState(item)
  const [mealGroup, setMealGroup] = useState(suggestMealGroup())

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function updateQuantity(value) {
    const newQuantity = Number(value) || 0
    setForm((f) => applyQuantityChange(f, newQuantity))
  }

  return (
    <div className="review-card">
      <input
        className="review-card-name"
        value={form.name}
        onChange={(e) => update('name', e.target.value)}
      />
      {typeof item.confidence === 'number' && (
        <div className="confidence">confianca: {Math.round(item.confidence * 100)}%</div>
      )}
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
      <div className="quantity-row">
        <label>
          Quantidade
          <input type="number" value={form.quantity ?? ''} onChange={(e) => updateQuantity(e.target.value)} />
        </label>
        <label>
          Unidade
          <input
            className="quantity-unit"
            value={form.unit ?? ''}
            onChange={(e) => update('unit', e.target.value)}
          />
        </label>
      </div>
      <div className="quantity-hint">Ajustar a quantidade recalcula os valores abaixo proporcionalmente.</div>
      <div className="review-card-fields">
        <label>
          Kcal
          <input type="number" value={form.kcal} onChange={(e) => update('kcal', Number(e.target.value))} />
        </label>
        <label>
          Proteina (g)
          <input type="number" value={form.protein} onChange={(e) => update('protein', Number(e.target.value))} />
        </label>
        <label>
          Carbo (g)
          <input type="number" value={form.carbs} onChange={(e) => update('carbs', Number(e.target.value))} />
        </label>
        <label>
          Gordura (g)
          <input type="number" value={form.fat} onChange={(e) => update('fat', Number(e.target.value))} />
        </label>
        <label>
          Cafeina (mg)
          <input type="number" value={form.caffeine} onChange={(e) => update('caffeine', Number(e.target.value))} />
        </label>
        <label>
          Agua (ml)
          <input type="number" value={form.water} onChange={(e) => update('water', Number(e.target.value))} />
        </label>
        <label>
          Creatina (g)
          <input type="number" value={form.creatine} onChange={(e) => update('creatine', Number(e.target.value))} />
        </label>
      </div>
      <div className="review-card-actions">
        <button className="btn btn-secondary" onClick={onDiscard}>
          Descartar
        </button>
        <button className="btn btn-primary" onClick={() => onAdd({ ...form, mealGroup })}>
          Adicionar
        </button>
      </div>
    </div>
  )
}

export default function ReviewCards({ candidates, onAdd, onDiscard }) {
  if (candidates.length === 0) return null
  return (
    <div className="review-cards">
      <h3>Revise os itens identificados</h3>
      {candidates.map((item, idx) => (
        <ReviewCard key={idx} item={item} onAdd={(form) => onAdd(idx, form)} onDiscard={() => onDiscard(idx)} />
      ))}
    </div>
  )
}
