import { useState } from 'react'
import { X, Waves, Footprints, Bike, Zap, MoreHorizontal } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'
import type { CardioType } from '@/types'

const TYPES: { value: CardioType; label: string; icon: typeof Waves }[] = [
  { value: 'natacao', label: 'Natação', icon: Waves },
  { value: 'corrida', label: 'Corrida', icon: Footprints },
  { value: 'esteira', label: 'Esteira', icon: Zap },
  { value: 'bike', label: 'Bike', icon: Bike },
  { value: 'outro', label: 'Outro', icon: MoreHorizontal },
]

interface Props {
  onClose: () => void
}

export function CardioModal({ onClose }: Props) {
  const { addCardioSession } = useWorkoutStore()
  const [type, setType] = useState<CardioType>('natacao')
  const [customTypeLabel, setCustomTypeLabel] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [minutes, setMinutes] = useState('')
  const [distance, setDistance] = useState('')
  const [calories, setCalories] = useState('')
  const [notes, setNotes] = useState('')

  const canSave = minutes.trim() !== '' && Number(minutes) > 0

  const handleSave = () => {
    if (!canSave) return
    addCardioSession({
      date,
      type,
      customTypeLabel: type === 'outro' ? customTypeLabel.trim() || undefined : undefined,
      durationSeconds: Math.round(Number(minutes) * 60),
      distanceMeters: distance.trim() !== '' ? Number(distance) : null,
      caloriesBurned: calories.trim() !== '' ? Number(calories) : null,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-gray-950/90 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <p className="font-semibold text-white text-sm">Registrar cardio</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Type selector */}
          <div>
            <p className="text-sm text-gray-400 mb-2">Atividade</p>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(t => {
                const Icon = t.icon
                return (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-medium transition-colors ${
                      type === t.value
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <Icon size={18} />
                    {t.label}
                  </button>
                )
              })}
            </div>
            {type === 'outro' && (
              <input
                type="text"
                placeholder="Qual atividade?"
                value={customTypeLabel}
                onChange={e => setCustomTypeLabel(e.target.value)}
                className="mt-2 w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 text-sm border border-gray-700 focus:border-brand-500 outline-none"
              />
            )}
          </div>

          {/* Date */}
          <div>
            <p className="text-sm text-gray-400 mb-2">Data</p>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 text-sm border border-gray-700 focus:border-brand-500 outline-none"
            />
          </div>

          {/* Duration */}
          <div>
            <p className="text-sm text-gray-400 mb-2">Tempo (minutos)</p>
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={minutes}
              onChange={e => setMinutes(e.target.value)}
              className="w-full bg-gray-800 text-white text-2xl font-mono font-bold rounded-xl px-4 py-2.5 border border-gray-700 focus:border-brand-500 outline-none"
            />
          </div>

          {/* Distance */}
          <div>
            <p className="text-sm text-gray-400 mb-2">Distância / metragem (metros, opcional)</p>
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={distance}
              onChange={e => setDistance(e.target.value)}
              className="w-full bg-gray-800 text-white text-2xl font-mono font-bold rounded-xl px-4 py-2.5 border border-gray-700 focus:border-brand-500 outline-none"
            />
          </div>

          {/* Calories */}
          <div>
            <p className="text-sm text-gray-400 mb-2">Calorias gastas (opcional)</p>
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={calories}
              onChange={e => setCalories(e.target.value)}
              className="w-full bg-gray-800 text-white text-2xl font-mono font-bold rounded-xl px-4 py-2.5 border border-gray-700 focus:border-brand-500 outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <p className="text-sm text-gray-400 mb-2">Notas (opcional)</p>
            <input
              type="text"
              placeholder="Ex: senti dor no joelho"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 text-sm border border-gray-700 focus:border-brand-500 outline-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full bg-brand-600 disabled:opacity-40 hover:bg-brand-500 text-white font-semibold py-3 rounded-xl transition-all"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
