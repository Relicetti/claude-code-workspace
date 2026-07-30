import { useEffect, useState } from 'react'

export default function ExtraExpenditure({ value, onSave }) {
  const [input, setInput] = useState(value || '')

  useEffect(() => {
    setInput(value || '')
  }, [value])

  function submit(e) {
    e.preventDefault()
    onSave(Number(input) || 0)
  }

  return (
    <form className="extra-expenditure" onSubmit={submit}>
      <label htmlFor="extra-expenditure-input">Atividade extra fora da rotina (kcal gastas)</label>
      <div className="extra-expenditure-row">
        <input
          id="extra-expenditure-input"
          type="number"
          placeholder="ex: 200"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary btn-small">
          Salvar
        </button>
      </div>
    </form>
  )
}
