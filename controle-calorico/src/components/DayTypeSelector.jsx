import { DAY_TYPES } from '../dayTypes.js'

export default function DayTypeSelector({ dayType, onChange }) {
  return (
    <div className="day-type-selector">
      <label htmlFor="day-type-select">Dia de hoje</label>
      <select id="day-type-select" value={dayType} onChange={(e) => onChange(e.target.value)}>
        {DAY_TYPES.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  )
}
