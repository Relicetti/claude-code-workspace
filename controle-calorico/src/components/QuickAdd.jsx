import { useState } from 'react'

const WATER_PRESETS = [200, 300, 500]

function emptyNutrients(name) {
  return { name, kcal: 0, protein: 0, carbs: 0, fat: 0, caffeine: 0, water: 0, creatine: 0 }
}

export default function QuickAdd({ onAdd, defaultCreatineDose }) {
  const [creatineDose, setCreatineDose] = useState(defaultCreatineDose || 5)
  const [customWater, setCustomWater] = useState('')

  function addWater(ml) {
    onAdd({ ...emptyNutrients('Agua'), water: ml })
  }

  function addCustomWater() {
    const ml = Number(customWater) || 0
    if (ml <= 0) return
    addWater(ml)
    setCustomWater('')
  }

  function addCreatine() {
    const dose = Number(creatineDose) || 0
    if (dose <= 0) return
    onAdd({ ...emptyNutrients('Creatina'), creatine: dose, mealGroup: 'Suplementos' })
  }

  return (
    <div className="quick-add">
      <div className="quick-add-row">
        <span className="quick-add-label">💧 Agua</span>
        <div className="quick-add-buttons">
          {WATER_PRESETS.map((ml) => (
            <button key={ml} className="btn btn-secondary btn-small" onClick={() => addWater(ml)}>
              +{ml}ml
            </button>
          ))}
          <input
            type="number"
            className="quick-add-dose quick-add-dose-wide"
            placeholder="ml"
            value={customWater}
            onChange={(e) => setCustomWater(e.target.value)}
          />
          <button className="btn btn-secondary btn-small" onClick={addCustomWater}>
            Registrar
          </button>
        </div>
      </div>
      <div className="quick-add-row">
        <span className="quick-add-label">💊 Creatina</span>
        <div className="quick-add-buttons">
          <input
            type="number"
            className="quick-add-dose"
            value={creatineDose}
            onChange={(e) => setCreatineDose(e.target.value)}
          />
          <button className="btn btn-secondary btn-small" onClick={addCreatine}>
            Registrar {creatineDose}g
          </button>
        </div>
      </div>
    </div>
  )
}
