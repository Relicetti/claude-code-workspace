import { useState } from 'react'

export default function SettingsModal({ settings, onSave, onClearDay, onClose }) {
  const [form, setForm] = useState(settings)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: Number(value) || 0 }))
  }

  function submit(e) {
    e.preventDefault()
    onSave(form)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Configuracoes</h2>
        <p className="modal-hint">
          As metas de calorias, proteina, carboidrato e gordura agora vem do tipo de dia (treino), escolhido na tela
          principal.
        </p>
        <form onSubmit={submit}>
          <label>
            Meta de cafeina (mg)
            <input type="number" value={form.caffeineGoal} onChange={(e) => update('caffeineGoal', e.target.value)} />
          </label>
          <label>
            Meta de agua (ml)
            <input type="number" value={form.waterGoal} onChange={(e) => update('waterGoal', e.target.value)} />
          </label>
          <label>
            Meta de creatina (g)
            <input type="number" value={form.creatineGoal} onChange={(e) => update('creatineGoal', e.target.value)} />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (confirm('Limpar todos os registros de hoje?')) onClearDay()
              }}
            >
              Limpar registro de hoje
            </button>
            <div className="modal-actions-right">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Salvar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
