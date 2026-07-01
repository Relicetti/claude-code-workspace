import { useState, useEffect } from 'react'
import { Play, Pause, CheckCircle2, Loader2, ChevronDown, ChevronUp, ListChecks } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'
import { ExerciseCard } from '@/components/ExerciseCard'
import { RestTimer } from '@/components/RestTimer'
import { SubstituteModal } from '@/components/SubstituteModal'
import { useRestTimer } from '@/hooks/useRestTimer'
import { useSessionTimer } from '@/hooks/useSessionTimer'
import { getSessionFeedback } from '@/lib/claudeApi'
import type { Exercise, ExerciseAlternative } from '@/types'

export function TodayWorkout() {
  const {
    plan,
    activeSession,
    startSession,
    pauseResumeSession,
    finishSession,
    cancelSession,
    updateSetRecord,
    markExerciseComplete,
    addSubstituteExercise,
    updateAIFeedback,
    sessionStartTime,
    sessionPaused,
    getLastSessionByType,
    getCurrentWorkout,
    setActiveView,
  } = useWorkoutStore()

  const currentWorkout = getCurrentWorkout()

  const sessionDisplay = useSessionTimer()
  const restTimer = useRestTimer()

  const [showRestTimer, setShowRestTimer] = useState(false)
  const [pendingRestSeconds, setPendingRestSeconds] = useState(0)
  const [substituteFor, setSubstituteFor] = useState<Exercise | null>(null)
  const [finishLoading, setFinishLoading] = useState(false)
  const [aiFeedback, setAIFeedback] = useState('')
  const [showFinishedCard, setShowFinishedCard] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  const isSessionActive = !!activeSession
  const isRunning = isSessionActive && sessionStartTime !== null && !sessionPaused

  useEffect(() => {
    if (showRestTimer && pendingRestSeconds > 0) {
      restTimer.start(pendingRestSeconds)
    }
  }, [showRestTimer])

  const handleSetComplete = (exerciseId: string, setIndex: number, weight: number, reps: number) => {
    updateSetRecord(exerciseId, setIndex, {
      actualReps: reps,
      weight,
      completedAt: new Date().toISOString(),
    })

    const exercise = currentWorkout?.exercises.find(e => e.id === exerciseId)
    if (exercise) {
      setPendingRestSeconds(exercise.restSeconds)
      setShowRestTimer(true)
    }
  }

  const handleExerciseComplete = (exerciseId: string) => {
    markExerciseComplete(exerciseId)
  }

  const handleRequestSubstitute = (exercise: Exercise) => {
    setSubstituteFor(exercise)
  }

  const handleConfirmSubstitute = (alt: ExerciseAlternative, reason: string) => {
    if (!substituteFor) return
    addSubstituteExercise(
      substituteFor.id,
      {
        exerciseId: '',
        exerciseName: alt.name,
        completed: false,
        skipped: false,
        targetSets: alt.sets,
        repsMin: alt.repsMin,
        repsMax: alt.repsMax,
      },
      reason,
    )
    setSubstituteFor(null)
  }

  const handleFinish = async () => {
    if (!activeSession) return
    setFinishLoading(true)

    const prevSession = getLastSessionByType(activeSession.workoutType)
    try {
      const feedback = await getSessionFeedback(activeSession, prevSession)
      setAIFeedback(feedback)
      updateAIFeedback(feedback)
    } catch {
      setAIFeedback('')
    }

    finishSession()
    setFinishLoading(false)
    setShowFinishedCard(true)
  }

  const completedCount = activeSession
    ? activeSession.exercises.filter(e => e.completed || e.skipped).length
    : 0
  const totalCount = activeSession?.exercises.length ?? 0
  const allDone = completedCount >= totalCount && totalCount > 0

  const workoutIndex = currentWorkout ? plan.workouts.findIndex(w => w.id === currentWorkout.id) : -1

  if (!currentWorkout) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <ListChecks size={56} className="text-gray-600 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Nenhum treino configurado</h2>
        <p className="text-gray-400 text-sm max-w-xs mb-6">
          Adicione pelo menos um treino no seu plano para começar.
        </p>
        <button
          onClick={() => setActiveView('plan')}
          className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-3 rounded-xl transition-all"
        >
          Ir para Meu Plano
        </button>
      </div>
    )
  }

  if (showFinishedCard) {
    return (
      <div className="px-4 py-6 space-y-4">
        <div className="text-center">
          <CheckCircle2 size={56} className="text-brand-400 mx-auto mb-3" />
          <h2 className="text-2xl font-bold text-white">Treino concluído!</h2>
          <p className="text-gray-400 text-sm mt-1">{currentWorkout.label}</p>
        </div>

        {aiFeedback && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <p className="text-xs text-brand-400 uppercase tracking-wide font-medium mb-2">Feedback do Trainer IA</p>
            <p className="text-sm text-gray-200 leading-relaxed">{aiFeedback}</p>
          </div>
        )}

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Próximo treino</p>
          <p className="text-sm font-semibold text-white">{getCurrentWorkout()?.label ?? '—'}</p>
        </div>

        <button
          onClick={() => setShowFinishedCard(false)}
          className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3.5 rounded-xl transition-all"
        >
          Ver resumo
        </button>
      </div>
    )
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Treino {workoutIndex + 1} de {plan.workouts.length}
            </p>
            <h1 className="font-bold text-white text-sm leading-tight">{currentWorkout.label}</h1>
          </div>

          {isSessionActive ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-gray-900 px-3 py-1.5 rounded-xl border border-gray-700">
                <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-brand-400 animate-pulse' : 'bg-gray-500'}`} />
                <span className="font-mono text-sm font-bold text-white tabular-nums">{sessionDisplay}</span>
                <button onClick={pauseResumeSession} className="text-gray-400 hover:text-white">
                  {isRunning ? <Pause size={14} /> : <Play size={14} />}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setActiveView('plan')}
              className="text-gray-500 hover:text-white p-2 -mr-2"
              title="Editar plano"
            >
              <ListChecks size={20} />
            </button>
          )}
        </div>

        {isSessionActive && (
          <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* Notes section */}
        {plan.userNotes && (
          <>
            <button
              onClick={() => setShowNotes(n => !n)}
              className="w-full flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 text-sm">⚠️</span>
                <span className="text-xs text-yellow-400/80 font-medium">Restrição ombro anterior</span>
              </div>
              {showNotes ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
            </button>
            {showNotes && (
              <div className="bg-gray-900 border border-yellow-900/40 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-300 leading-relaxed">{plan.userNotes.split('\n')[0]}</p>
              </div>
            )}
          </>
        )}

        {/* Start / active session */}
        {!isSessionActive ? (
          <button
            onClick={startSession}
            className="w-full flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 active:scale-95 text-white font-bold py-4 rounded-2xl text-lg transition-all shadow-lg shadow-brand-900/40"
          >
            <Play size={24} />
            Começar treino
          </button>
        ) : (
          <>
            {/* Exercise cards */}
            {currentWorkout.exercises.map((exercise, idx) => {
              const record = activeSession.exercises.find(e => e.exerciseId === exercise.id)
              if (!record) return null
              const isCardActive = idx === 0 || activeSession.exercises
                .slice(0, idx)
                .every(e => e.completed || e.skipped)

              return (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  record={record}
                  isActive={isCardActive && !record.completed && !record.skipped}
                  onSetComplete={(setIdx, w, r) => handleSetComplete(exercise.id, setIdx, w, r)}
                  onExerciseComplete={() => handleExerciseComplete(exercise.id)}
                  onRequestSubstitute={() => handleRequestSubstitute(exercise)}
                />
              )
            })}

            {/* Substitute exercise cards */}
            {activeSession.exercises
              .filter(e => e.originalExerciseId)
              .map(subRecord => {
                return (
                  <div key={subRecord.exerciseId} className="rounded-2xl border border-blue-700/50 bg-blue-950/20 p-4">
                    <p className="text-xs text-blue-400 font-medium mb-1">Substituição</p>
                    <p className="font-semibold text-white text-sm">{subRecord.exerciseName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Motivo: {subRecord.substituteReason}</p>
                    <div className="mt-3 space-y-2">
                      {subRecord.sets.map((s, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">S{i + 1}</span>
                          {s.completedAt ? (
                            <span className="text-sm text-brand-400 font-mono font-bold">
                              ✓ {s.weight}kg × {s.actualReps}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-600">Pendente</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

            {/* Finish / cancel */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={cancelSession}
                className="flex-1 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 font-medium py-3 rounded-xl transition-all text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleFinish}
                disabled={finishLoading}
                className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {finishLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Analisando...
                  </>
                ) : allDone ? (
                  'Finalizar treino'
                ) : (
                  'Finalizar agora'
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showRestTimer && (
        <RestTimer
          timer={restTimer}
          onClose={() => setShowRestTimer(false)}
        />
      )}

      {substituteFor && (
        <SubstituteModal
          exercise={substituteFor}
          onConfirm={handleConfirmSubstitute}
          onCancel={() => setSubstituteFor(null)}
        />
      )}
    </div>
  )
}
