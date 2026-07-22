import { useState } from 'react'

function ReviewCard({ item, onAdd, onDiscard }) {
  const [form, setForm] = useState(item)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
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
      </div>
      <div className="review-card-actions">
        <button className="btn btn-secondary" onClick={onDiscard}>
          Descartar
        </button>
        <button className="btn btn-primary" onClick={() => onAdd(form)}>
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
