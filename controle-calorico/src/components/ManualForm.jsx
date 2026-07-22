import { useState } from 'react'

const EMPTY = { name: '', kcal: '', protein: '', carbs: '', fat: '' }

export default function ManualForm({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)

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
    })
    setForm(EMPTY)
    setOpen(false)
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
      <input
        placeholder="Nome do alimento"
        value={form.name}
        onChange={(e) => update('name', e.target.value)}
        autoFocus
      />
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
      </div>
      <div className="manual-form-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          Adicionar
        </button>
      </div>
    </form>
  )
}
