import { useState } from 'react'
import { Play, Pause, CheckCircle2, Loader2, ChevronDown, ChevronUp, ListChecks, Flame, HeartPulse } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'
import { ExerciseCard } from '@/components/ExerciseCard'
import { RestTimer } from '@/components/RestTimer'
import { SubstituteModal } from '@/components/SubstituteModal'
import { CardioModal } from '@/components/CardioModal'
import { useRestTimer } from '@/hooks/useRestTimer'
import { useSessionTimer } from '@/hooks/useSessionTimer'
import { getSessionFeedback } from '@/lib/claudeApi'
import type { Exercise, ExerciseAlternative } from '@/types'

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

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
    updateSessionCalories,
    sessionStartTime,
    sessionPaused,
    getLastSessionByType,
    getCurrentWorkout,
    getMostRecentSession,
    getSuggestedWeight,
    setCurrentWorkout,
    setActiveView,
  } = useWorkoutStore()

  const currentWorkout = getCurrentWorkout()

  const sessionDisplay = useSessionTimer()
  const restTimer = useRestTimer()

  const [showRestTimer, setShowRestTimer] = useState(false)
  const [substituteFor, setSubstituteFor] = useState<Exercise | null>(null)
  const [finishLoading, setFinishLoading] = useState(false)
  const [finishError, setFinishError] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [aiFeedback, setAIFeedback] = useState('')
  const [showFinishedCard, setShowFinishedCard] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [showCaloriesPrompt, setShowCaloriesPrompt] = useState(false)
  const [calories, setCalories] = useState<number | null>(null)
  const [finishedCalories, setFinishedCalories] = useState<number | null>(null)
  const [showCardioModal, setShowCardioModal] = useState(false)

  const isSessionActive = !!activeSession
  const isRunning = isSessionActive && sessionStartTime !== null && !sessionPaused

  const handleSetComplete = (exerciseId: string, setIndex: number, weight: number, reps: number) => {
    updateSetRecord(exerciseId, setIndex, {
      actualReps: reps,
      weight,
      completedAt: new Date().toISOString(),
    })

    // Read rest time off the session record rather than the plan, so this
    // works for substituted exercises too (they have no entry in the plan).
    const record = activeSession?.exercises.find(e => e.exerciseId === exerciseId)
    const restSeconds = record?.restSeconds ?? currentWorkout?.exercises.find(e => e.id === exerciseId)?.restSeconds
    if (restSeconds) {
      restTimer.start(restSeconds)
      setShowRestTimer(true)
    }
  }

  const handleSetEdit = (exerciseId: string, setIndex: number, weight: number, reps: number) => {
    updateSetRecord(exerciseId, setIndex, { actualReps: reps, weight })
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
        muscleGroups: substituteFor.muscleGroups,
        restSeconds: substituteFor.restSeconds,
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

  const handleFinish = async (caloriesValue: number | null) => {
    if (!activeSession) return
    setShowCaloriesPrompt(false)
    setFinishLoading(true)
    setFinishError('')

    if (caloriesValue !== null) updateSessionCalories(caloriesValue)

    const prevSession = getLastSessionByType(activeSession.workoutType)
    try {
      const feedback = await getSessionFeedback(activeSession, prevSession)
      setAIFeedback(feedback)
      updateAIFeedback(feedback)
    } catch {
      setAIFeedback('')
    }

    const saved = await finishSession()
    setFinishLoading(false)

    if (!saved) {
      setFinishError('Não conseguimos salvar o treino — confere sua conexão e tenta finalizar de novo.')
      return
    }

    setFinishedCalories(caloriesValue)
    setCalories(null)
    setShowFinishedCard(true)
  }

  const handleCancel = async () => {
    setCancelLoading(true)
    setCancelError('')
    const cancelled = await cancelSession()
    setCancelLoading(false)
    if (!cancelled) {
      setCancelError('Não conseguimos cancelar — confere sua conexão e tenta de novo.')
    }
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

        {finishedCalories !== null && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 flex items-center gap-3">
            <Flame size={20} className="text-orange-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Calorias gastas</p>
              <p className="text-sm font-semibold text-white">{finishedCalories} kcal</p>
            </div>
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
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Treino {workoutIndex + 1} de {plan.workouts.length}
            </p>
            {isSessionActive ? (
              <h1 className="font-bold text-white text-sm leading-tight">{currentWorkout.label}</h1>
            ) : (
              <select
                value={currentWorkout.id}
                onChange={e => setCurrentWorkout(e.target.value)}
                className="font-bold text-white text-sm leading-tight bg-transparent outline-none -ml-0.5 max-w-full"
              >
                {plan.workouts.map(w => (
                  <option key={w.id} value={w.id} className="bg-gray-900 text-white">
                    {w.label}
                  </option>
                ))}
              </select>
            )}
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
            <div className="flex items-center gap-1 -mr-2">
              <button
                onClick={() => setShowCardioModal(true)}
                className="text-gray-500 hover:text-white p-2"
                title="Registrar cardio"
              >
                <HeartPulse size={20} />
              </button>
              <button
                onClick={() => setActiveView('plan')}
                className="text-gray-500 hover:text-white p-2"
                title="Editar plano"
              >
                <ListChecks size={20} />
              </button>
            </div>
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

        {/* Last workout indicator */}
        {!isSessionActive && (() => {
          const lastSession = getMostRecentSession()
          return lastSession ? (
            <p className="text-xs text-gray-500 text-center">
              Último treino: <span className="text-gray-300 font-medium">{lastSession.workoutLabel}</span> · {formatShortDate(lastSession.date)}
            </p>
          ) : null
        })()}

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
                  suggestedWeight={getSuggestedWeight(exercise.id, exercise.name)}
                  onSetComplete={(setIdx, w, r) => handleSetComplete(exercise.id, setIdx, w, r)}
                  onSetEdit={(setIdx, w, r) => handleSetEdit(exercise.id, setIdx, w, r)}
                  onExerciseComplete={() => handleExerciseComplete(exercise.id)}
                  onRequestSubstitute={() => handleRequestSubstitute(exercise)}
                />
              )
            })}

            {/* Substitute exercise cards — same interactive card as plan exercises,
                built from the substitute's own snapshot since it has no plan entry */}
            {activeSession.exercises
              .filter(e => e.originalExerciseId)
              .map(subRecord => {
                const substituteExercise: Exercise = {
                  id: subRecord.exerciseId,
                  name: subRecord.exerciseName,
                  muscleGroups: subRecord.muscleGroups ?? [],
                  sets: subRecord.sets.length,
                  repsMin: subRecord.repsMin ?? subRecord.sets[0]?.targetReps ?? 10,
                  repsMax: subRecord.repsMax ?? subRecord.sets[0]?.targetReps ?? 10,
                  restSeconds: subRecord.restSeconds ?? 60,
                }

                return (
                  <div key={subRecord.exerciseId} className="space-y-1.5">
                    <p className="text-xs text-blue-400 font-medium px-1">
                      Substituição · {subRecord.substituteReason}
                    </p>
                    <ExerciseCard
                      exercise={substituteExercise}
                      record={subRecord}
                      isActive={!subRecord.completed && !subRecord.skipped}
                      suggestedWeight={getSuggestedWeight(subRecord.exerciseId, subRecord.exerciseName)}
                      onSetComplete={(setIdx, w, r) => handleSetComplete(subRecord.exerciseId, setIdx, w, r)}
                      onSetEdit={(setIdx, w, r) => handleSetEdit(subRecord.exerciseId, setIdx, w, r)}
                      onExerciseComplete={() => handleExerciseComplete(subRecord.exerciseId)}
                      onRequestSubstitute={() => handleRequestSubstitute(substituteExercise)}
                    />
                  </div>
                )
              })}

            {/* Finish / cancel */}
            {finishError && (
              <p className="text-red-400 text-sm bg-red-950/40 rounded-xl px-3 py-2">{finishError}</p>
            )}
            {cancelError && (
              <p className="text-red-400 text-sm bg-red-950/40 rounded-xl px-3 py-2">{cancelError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancel}
                disabled={cancelLoading}
                className="flex-1 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-60 font-medium py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
              >
                {cancelLoading ? <Loader2 size={16} className="animate-spin" /> : 'Cancelar'}
              </button>
              <button
                onClick={() => setShowCaloriesPrompt(true)}
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

      {/* Minimized rest timer keeps counting in the background (sound/push
          still fire when it ends) — this chip brings the popup back up. */}
      {!showRestTimer && restTimer.remaining > 0 && (
        <button
          onClick={() => setShowRestTimer(true)}
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-mono font-bold px-4 py-2.5 rounded-full shadow-lg tabular-nums transition-colors"
        >
          {String(Math.floor(restTimer.remaining / 60)).padStart(2, '0')}:{String(restTimer.remaining % 60).padStart(2, '0')}
        </button>
      )}

      {substituteFor && (
        <SubstituteModal
          exercise={substituteFor}
          onConfirm={handleConfirmSubstitute}
          onCancel={() => setSubstituteFor(null)}
        />
      )}

      {showCaloriesPrompt && (
        <div className="fixed inset-0 bg-gray-950/90 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm p-6 text-center">
            <Flame size={32} className="text-orange-400 mx-auto mb-2" />
            <p className="text-sm text-gray-400 mb-4">Quantas calorias você gastou nesse treino? (opcional)</p>
            <div className="flex items-center justify-center gap-2 mb-6">
              <input
                type="number"
                inputMode="numeric"
                autoFocus
                value={calories ?? ''}
                onChange={e => setCalories(e.target.value === '' ? null : Number(e.target.value))}
                placeholder="0"
                className="w-32 bg-gray-800 text-white text-3xl font-mono font-bold text-center rounded-xl px-3 py-2.5 border border-gray-700 focus:border-brand-500 outline-none"
              />
              <span className="text-gray-500 text-sm">kcal</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleFinish(null)}
                className="flex-1 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 font-medium py-3 rounded-xl transition-all text-sm"
              >
                Pular
              </button>
              <button
                onClick={() => handleFinish(calories)}
                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3 rounded-xl transition-all text-sm"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCardioModal && (
        <CardioModal onClose={() => setShowCardioModal(false)} />
      )}
    </div>
  )
}
