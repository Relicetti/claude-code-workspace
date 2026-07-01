import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { Exercise, ExerciseAlternative } from '@/types'
import { getExerciseAlternatives } from '@/lib/claudeApi'

const REASONS = [
  'Máquina ocupada',
  'Senti dor',
  'Quero variar',
  'Equipamento indisponível',
  'Outro',
]

interface Props {
  exercise: Exercise
  onConfirm: (alt: ExerciseAlternative, reason: string) => void
  onCancel: () => void
}

export function SubstituteModal({ exercise, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [alternatives, setAlternatives] = useState<ExerciseAlternative[]>([])
  const [error, setError] = useState('')

  const effectiveReason = reason === 'Outro' ? customReason : reason

  const handleSearch = async () => {
    if (!effectiveReason.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await getExerciseAlternatives(exercise, effectiveReason)
      setAlternatives(result.alternatives)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar alternativas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950/90 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Trocar exercício</p>
            <p className="font-semibold text-white text-sm mt-0.5 leading-tight">{exercise.name}</p>
          </div>
          <button onClick={onCancel} className="text-gray-500 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Reason select */}
          <div>
            <p className="text-sm text-gray-400 mb-2">Motivo da troca</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map(r => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    reason === r
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Outro' && (
              <input
                type="text"
                placeholder="Descreva o motivo..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                className="mt-2 w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 text-sm border border-gray-700 focus:border-brand-500 outline-none"
              />
            )}
          </div>

          {/* Search button */}
          {!alternatives.length && (
            <button
              onClick={handleSearch}
              disabled={loading || !effectiveReason.trim()}
              className="w-full bg-brand-600 disabled:opacity-40 hover:bg-brand-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Buscando alternativas...
                </>
              ) : (
                'Buscar alternativas com IA'
              )}
            </button>
          )}

          {error && (
            <p className="text-red-400 text-sm bg-red-950/40 rounded-xl px-3 py-2">{error}</p>
          )}

          {/* Alternatives */}
          {alternatives.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-300">Escolha uma alternativa:</p>
              {alternatives.map((alt, i) => (
                <button
                  key={i}
                  onClick={() => onConfirm(alt, effectiveReason)}
                  className="w-full text-left bg-gray-800 hover:bg-gray-750 hover:border-brand-600 border border-gray-700 rounded-xl p-3 transition-all"
                >
                  <p className="font-semibold text-white text-sm">{alt.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {alt.sets}×{alt.repsMin === alt.repsMax ? alt.repsMax : `${alt.repsMin}-${alt.repsMax}`} reps
                  </p>
                  <p className="text-xs text-brand-400 mt-1">{alt.reason}</p>
                </button>
              ))}
              <button
                onClick={() => setAlternatives([])}
                className="w-full text-gray-500 text-sm py-1 hover:text-gray-300 transition-colors"
              >
                Buscar outras opções
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
