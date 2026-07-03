import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'

interface Props {
  value: number | null
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  placeholder?: string
  size?: 'sm' | 'lg'
}

export function NumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  suffix = '',
  placeholder = '--',
  size = 'lg',
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const handleDec = () => {
    const current = value ?? 0
    onChange(Math.max(min, current - step))
  }
  const handleInc = () => {
    const current = value ?? 0
    onChange(Math.min(max, current + step))
  }

  const startEditing = () => {
    setDraft(value !== null ? String(value) : '')
    setEditing(true)
  }

  const commit = () => {
    const parsed = parseFloat(draft.replace(',', '.'))
    if (!Number.isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)))
    }
    setEditing(false)
  }

  const textSize = size === 'lg' ? 'text-3xl' : 'text-xl'
  const btnSize = size === 'lg' ? 'w-11 h-11' : 'w-9 h-9'

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleDec}
        className={`${btnSize} rounded-xl bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-300 active:scale-95 transition-all`}
      >
        <Minus size={size === 'lg' ? 20 : 16} />
      </button>
      <div className="min-w-[80px] text-center">
        {editing ? (
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditing(false)
            }}
            onFocus={e => e.currentTarget.select()}
            className={`${textSize} w-full bg-transparent font-mono font-bold text-white tabular-nums text-center outline-none border-b border-brand-500`}
          />
        ) : (
          <button
            onClick={startEditing}
            className={`${textSize} font-mono font-bold text-white tabular-nums`}
          >
            {value !== null ? `${value}${suffix}` : placeholder}
          </button>
        )}
      </div>
      <button
        onClick={handleInc}
        className={`${btnSize} rounded-xl bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-300 active:scale-95 transition-all`}
      >
        <Plus size={size === 'lg' ? 20 : 16} />
      </button>
    </div>
  )
}
