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
  const handleDec = () => {
    const current = value ?? 0
    onChange(Math.max(min, current - step))
  }
  const handleInc = () => {
    const current = value ?? 0
    onChange(Math.min(max, current + step))
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
        <span className={`${textSize} font-mono font-bold text-white tabular-nums`}>
          {value !== null ? `${value}${suffix}` : placeholder}
        </span>
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
