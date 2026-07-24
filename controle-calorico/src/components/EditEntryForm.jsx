import { useState } from 'react'
import { MEAL_GROUPS, OTHER_GROUP } from '../mealGroups.js'

export default function EditEntryForm({ entry, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: entry.name,
    mealGroup: entry.mealGroup || OTHER_GROUP,
    kcal: entry.kcal,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    caffeine: entry.caffeine,
    water: entry.water,
    creatine: entry.creatine,
  })

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave({
      name: form.name.trim(),
      mealGroup: form.mealGroup === OTHER_GROUP ? null : form.mealGroup,
      kcal: Number(form.kcal) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
      caffeine: Number(form.caffeine) || 0,
      water: Number(form.water) || 0,
      creatine: Number(form.creatine) || 0,
    })
  }

  return (
    <form className="manual-form edit-entry-form" onSubmit={submit}>
      <input placeholder="Nome do alimento" value={form.name} onChange={(e) => update('name', e.target.value)} />
      <select className="meal-group-select" value={form.mealGroup} onChange={(e) => update('mealGroup', e.target.value)}>
        <option value={OTHER_GROUP}>{OTHER_GROUP}</option>
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
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          Salvar
        </button>
      </div>
    </form>
  )
}
