import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, ArrowLeftRight, AlertTriangle, Youtube, Pencil, Check } from 'lucide-react'
import { NumberStepper } from './NumberStepper'
import type { ExerciseRecord } from '@/types'
import type { Exercise } from '@/types'

interface Props {
  exercise: Exercise
  record: ExerciseRecord
  onSetComplete: (setIndex: number, weight: number, reps: number) => void
  onSetEdit: (setIndex: number, weight: number, reps: number) => void
  onExerciseComplete: () => void
  onRequestSubstitute: () => void
  isActive: boolean
  suggestedWeight?: number | null
}

export function ExerciseCard({
  exercise,
  record,
  onSetComplete,
  onSetEdit,
  onExerciseComplete,
  onRequestSubstitute,
  isActive,
  suggestedWeight,
}: Props) {
  const [expanded, setExpanded] = useState(isActive)
  const [currentSetIndex, setCurrentSetIndex] = useState(
    record.sets.findIndex(s => s.completedAt === null),
  )
  const [weight, setWeight] = useState<number | null>(suggestedWeight ?? null)
  const [reps, setReps] = useState<number | null>(exercise.repsMax)
  const [editingSetNumber, setEditingSetNumber] = useState<number | null>(null)
  const [editWeight, setEditWeight] = useState<number | null>(null)
  const [editReps, setEditReps] = useState<number | null>(null)

  const completedSets = record.sets.filter(s => s.completedAt !== null).length
  const totalSets = record.sets.length
  const allDone = completedSets === totalSets

  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${exercise.name} execução exercício academia`,
  )}`

  const startEditingSet = (setNumber: number, currentWeight: number | null, currentReps: number | null) => {
    setEditingSetNumber(setNumber)
    setEditWeight(currentWeight)
    setEditReps(currentReps)
  }

  const confirmSetEdit = (setNumber: number) => {
    onSetEdit(setNumber - 1, editWeight ?? 0, editReps ?? 0)
    setEditingSetNumber(null)
  }

  const handleConfirmSet = () => {
    if (currentSetIndex < 0 || currentSetIndex >= totalSets) return
    const w = weight ?? 0
    const r = reps ?? exercise.repsMax
    onSetComplete(currentSetIndex, w, r)
    const next = currentSetIndex + 1
    if (next >= totalSets) {
      onExerciseComplete()
    } else {
      setCurrentSetIndex(next)
    }
  }

  return (
    <div
      className={`rounded-2xl border transition-all ${
        record.skipped
          ? 'border-gray-800 bg-gray-900/50 opacity-50'
          : record.completed || allDone
          ? 'border-brand-700 bg-brand-950/30'
          : isActive
          ? 'border-brand-500 bg-gray-900'
          : 'border-gray-800 bg-gray-900'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {(record.completed || allDone) ? (
            <CheckCircle2 size={22} className="text-brand-400 shrink-0" />
          ) : (
            <div
              className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center ${
                isActive ? 'border-brand-400' : 'border-gray-600'
              }`}
            >
              <span className="text-xs font-bold text-gray-400">
                {completedSets}/{totalSets}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm leading-tight truncate">
              {exercise.name}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {exercise.sets}×{exercise.repsMin === exercise.repsMax ? exercise.repsMax : `${exercise.repsMin}-${exercise.repsMax}`} reps · {exercise.restSeconds}s descanso
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {exercise.touchesShoulderAnterior && (
            <AlertTriangle size={16} className="text-yellow-500" />
          )}
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && !record.skipped && (
        <div className="px-4 pb-4 space-y-4">
          {/* Notes / intensity technique */}
          {(exercise.notes || exercise.intensityTechnique) && (
            <div className="bg-gray-800/60 rounded-xl px-3 py-2 space-y-1">
              {exercise.intensityTechnique && (
                <p className="text-xs text-brand-400 font-medium">⚡ {exercise.intensityTechnique}</p>
              )}
              {exercise.notes && (
                <p className="text-xs text-yellow-400/80">{exercise.notes}</p>
              )}
            </div>
          )}

          {/* Set history — tap a set to fix it if you filled it wrong */}
          {completedSets > 0 && (
            <div className="space-y-1">
              {record.sets.filter(s => s.completedAt !== null).map(s => {
                if (editingSetNumber === s.setNumber) {
                  return (
                    <div key={s.setNumber} className="flex items-center gap-2 bg-gray-800/60 rounded-lg p-2">
                      <span className="text-xs text-gray-400 shrink-0 w-14">Série {s.setNumber}</span>
                      <NumberStepper value={editWeight} onChange={setEditWeight} step={2.5} min={0} max={500} suffix="kg" size="sm" />
                      <NumberStepper value={editReps} onChange={setEditReps} step={1} min={1} max={100} size="sm" />
                      <button
                        onClick={() => confirmSetEdit(s.setNumber)}
                        className="shrink-0 bg-brand-600 hover:bg-brand-500 text-white p-1.5 rounded-lg transition-colors"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  )
                }
                return (
                  <button
                    key={s.setNumber}
                    onClick={() => startEditingSet(s.setNumber, s.weight, s.actualReps)}
                    className="w-full flex items-center gap-2 text-sm hover:bg-gray-800/40 rounded-lg px-1 -mx-1 py-0.5 transition-colors"
                  >
                    <CheckCircle2 size={14} className="text-brand-400 shrink-0" />
                    <span className="text-gray-400">Série {s.setNumber}:</span>
                    <span className="font-mono font-bold text-white">
                      {s.weight ?? 0}kg × {s.actualReps ?? 0}
                    </span>
                    <Pencil size={11} className="text-gray-600 ml-auto shrink-0" />
                  </button>
                )
              })}
            </div>
          )}

          {/* Current set input */}
          {!allDone && currentSetIndex >= 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-300">
                Série {currentSetIndex + 1} de {totalSets}
                <span className="text-gray-500 ml-2">— alvo: {exercise.repsMin === exercise.repsMax ? exercise.repsMax : `${exercise.repsMin}-${exercise.repsMax}`} reps</span>
              </p>

              <div className="flex gap-4 justify-center">
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
                    Carga
                    {currentSetIndex === 0 && suggestedWeight != null && weight === suggestedWeight && (
                      <span className="text-brand-400 normal-case tracking-normal"> · sugestão</span>
                    )}
                  </p>
                  <NumberStepper
                    value={weight}
                    onChange={setWeight}
                    step={2.5}
                    min={0}
                    max={500}
                    suffix="kg"
                    placeholder="0kg"
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Reps</p>
                  <NumberStepper
                    value={reps}
                    onChange={setReps}
                    step={1}
                    min={1}
                    max={100}
                  />
                </div>
              </div>

              <button
                onClick={handleConfirmSet}
                className="w-full bg-brand-600 hover:bg-brand-500 active:scale-95 text-white font-semibold py-3 rounded-xl transition-all"
              >
                Confirmar série {currentSetIndex + 1}
              </button>
            </div>
          )}

          {/* Video / substitute actions */}
          <div className="flex gap-2">
            <a
              href={youtubeSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 text-gray-500 hover:text-gray-300 text-sm py-2 transition-colors"
            >
              <Youtube size={14} />
              Ver execução
            </a>
            {!record.skipped && !allDone && (
              <button
                onClick={onRequestSubstitute}
                className="flex-1 flex items-center justify-center gap-2 text-gray-500 hover:text-gray-300 text-sm py-2 transition-colors"
              >
                <ArrowLeftRight size={14} />
                Trocar exercício
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
