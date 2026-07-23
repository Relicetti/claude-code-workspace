import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  ChevronsDown,
  Plus,
  Trash2,
  Sparkles,
  RotateCcw,
  Star,
  Info,
  Upload,
  Check,
  Wand2,
  Loader2,
} from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'
import { NumberStepper } from '@/components/NumberStepper'
import { SubstituteModal } from '@/components/SubstituteModal'
import { ALL_MUSCLE_GROUPS, MUSCLE_LABELS } from '@/lib/muscleLabels'
import { generateWorkoutPlan } from '@/lib/claudeApi'
import { BUILT_IN_EXERCISE_LIBRARY } from '@/data/exerciseLibrary'
import type { Exercise, WorkoutDay, WorkoutPlan, MuscleGroup, ExerciseAlternative } from '@/types'

function newExercise(): Exercise {
  return {
    id: `ex_${crypto.randomUUID()}`,
    name: 'Novo exercício',
    muscleGroups: [],
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 60,
  }
}

function newWorkout(): WorkoutDay {
  return {
    id: `w_${crypto.randomUUID()}`,
    label: 'Novo treino',
    exercises: [],
  }
}

const ADVANCED_TECHNIQUES = ['Dropset', 'Rest-pause', 'Bi-set/Super-set', 'Reps forçadas/negativas']

function toggleTechnique(current: string | undefined, technique: string): string | undefined {
  const parts = (current ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const next = parts.includes(technique) ? parts.filter(p => p !== technique) : [...parts, technique]
  return next.length > 0 ? next.join(', ') : undefined
}

export function PlanEditor() {
  const {
    plan,
    currentWorkoutId,
    updatePlan,
    resetPlan,
    setCurrentWorkout,
    setActiveView,
    savedPlans,
    activePlanId,
    switchActivePlan,
    addSavedPlan,
    deleteSavedPlanResult,
    renameSavedPlan,
  } = useWorkoutStore()
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null)
  const [aiSwapTarget, setAiSwapTarget] = useState<{ workoutId: string; exercise: Exercise } | null>(null)
  const [showNotesEditor, setShowNotesEditor] = useState(false)
  const [notesDraft, setNotesDraft] = useState(plan.userNotes)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null)
  const [previewPlanId, setPreviewPlanId] = useState<string | null>(activePlanId)
  const [pendingUpload, setPendingUpload] = useState<WorkoutPlan | null>(null)
  const [pendingUploadName, setPendingUploadName] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [showAiGenerator, setShowAiGenerator] = useState(false)
  const [aiGoals, setAiGoals] = useState('')
  const [aiDays, setAiDays] = useState(4)
  const [aiPain, setAiPain] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiGenError, setAiGenError] = useState('')

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        const candidate: WorkoutPlan = Array.isArray(parsed?.plan?.workouts)
          ? parsed.plan
          : parsed
        if (!Array.isArray(candidate?.workouts)) {
          throw new Error('formato inválido')
        }
        setPendingUpload(candidate)
        setPendingUploadName(file.name.replace(/\.json$/i, ''))
      } catch {
        setUploadError('Arquivo inválido — precisa ser um plano exportado (JSON com "workouts").')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const confirmUpload = () => {
    if (!pendingUpload || !pendingUploadName.trim()) return
    addSavedPlan(pendingUploadName.trim(), pendingUpload)
    setPendingUpload(null)
    setPendingUploadName('')
  }

  const handleGeneratePlan = async () => {
    if (!aiGoals.trim() || aiGenerating) return
    setAiGenerating(true)
    setAiGenError('')
    try {
      const generated = await generateWorkoutPlan({
        goals: aiGoals.trim(),
        daysPerWeek: aiDays,
        painLimitations: aiPain.trim(),
      })
      setPendingUpload(generated)
      setPendingUploadName(`Plano IA — ${aiGoals.trim().slice(0, 30)}`)
      setShowAiGenerator(false)
      setAiGoals('')
      setAiPain('')
    } catch (err) {
      setAiGenError(err instanceof Error ? err.message : 'Erro ao gerar plano')
    } finally {
      setAiGenerating(false)
    }
  }

  const updateWorkout = (workoutId: string, updater: (w: WorkoutDay) => WorkoutDay) => {
    updatePlan({
      ...plan,
      workouts: plan.workouts.map(w => (w.id === workoutId ? updater(w) : w)),
    })
  }

  const updateExercise = (workoutId: string, exerciseId: string, updater: (e: Exercise) => Exercise) => {
    updateWorkout(workoutId, w => ({
      ...w,
      exercises: w.exercises.map(e => (e.id === exerciseId ? updater(e) : e)),
    }))
  }

  const moveWorkout = (workoutId: string, direction: -1 | 1) => {
    const idx = plan.workouts.findIndex(w => w.id === workoutId)
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= plan.workouts.length) return
    const workouts = [...plan.workouts]
    ;[workouts[idx], workouts[targetIdx]] = [workouts[targetIdx], workouts[idx]]
    updatePlan({ ...plan, workouts })
  }

  const moveExercise = (workoutId: string, exerciseId: string, direction: -1 | 1) => {
    updateWorkout(workoutId, w => {
      const idx = w.exercises.findIndex(e => e.id === exerciseId)
      const targetIdx = idx + direction
      if (idx === -1 || targetIdx < 0 || targetIdx >= w.exercises.length) return w
      const exercises = [...w.exercises]
      ;[exercises[idx], exercises[targetIdx]] = [exercises[targetIdx], exercises[idx]]
      return { ...w, exercises }
    })
  }

  const deleteWorkout = (workoutId: string) => {
    updatePlan({ ...plan, workouts: plan.workouts.filter(w => w.id !== workoutId) })
  }

  const addWorkout = () => {
    const w = newWorkout()
    updatePlan({ ...plan, workouts: [...plan.workouts, w] })
    setExpandedWorkout(w.id)
  }

  const deleteExercise = (workoutId: string, exerciseId: string) => {
    updateWorkout(workoutId, w => ({ ...w, exercises: w.exercises.filter(e => e.id !== exerciseId) }))
  }

  const addExercise = (workoutId: string) => {
    updateWorkout(workoutId, w => ({ ...w, exercises: [...w.exercises, newExercise()] }))
  }

  const handleAiSwapConfirm = (alt: ExerciseAlternative) => {
    if (!aiSwapTarget) return
    updateExercise(aiSwapTarget.workoutId, aiSwapTarget.exercise.id, ex => ({
      ...ex,
      name: alt.name,
      sets: alt.sets,
      repsMin: alt.repsMin,
      repsMax: alt.repsMax,
    }))
    setAiSwapTarget(null)
  }

  const handleSaveNotes = () => {
    updatePlan({ ...plan, userNotes: notesDraft })
    setShowNotesEditor(false)
  }

  const handleReset = () => {
    resetPlan()
    setConfirmReset(false)
    setNotesDraft(plan.userNotes)
  }

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Meu Plano</h1>
        {!confirmReset ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveView('about')}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title="Sobre o app"
            >
              <Info size={16} />
            </button>
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <RotateCcw size={14} />
              Restaurar padrão
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Tem certeza?</span>
            <button onClick={handleReset} className="text-xs text-red-400 font-semibold">Sim</button>
            <button onClick={() => setConfirmReset(false)} className="text-xs text-gray-500">Não</button>
          </div>
        )}
      </div>

      {/* Plan library — switch between saved plans, upload a new one, or generate one with AI */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Meus Planos</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAiGenerator(v => !v)}
              className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              <Wand2 size={13} />
              Gerar plano com IA
            </button>
            <label className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 cursor-pointer transition-colors">
              <Upload size={13} />
              Fazer upload de plano
              <input type="file" accept=".json" onChange={handleUploadFile} className="hidden" />
            </label>
          </div>
        </div>

        {showAiGenerator && (
          <div className="bg-gray-900 border border-brand-700 rounded-2xl p-3 space-y-2.5">
            <div>
              <p className="text-xs text-gray-500 mb-1">Objetivo</p>
              <textarea
                value={aiGoals}
                onChange={e => setAiGoals(e.target.value)}
                placeholder="Ex: hipertrofia, foco em pernas e costas"
                rows={2}
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 outline-none resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-500 shrink-0">Dias de treino por semana</p>
              <NumberStepper value={aiDays} onChange={setAiDays} min={1} max={7} size="sm" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Dores / limitações (opcional)</p>
              <textarea
                value={aiPain}
                onChange={e => setAiPain(e.target.value)}
                placeholder="Ex: dor no ombro direito ao levantar acima da cabeça"
                rows={2}
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 outline-none resize-none"
              />
            </div>

            {aiGenError && <p className="text-red-400 text-xs">{aiGenError}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleGeneratePlan}
                disabled={!aiGoals.trim() || aiGenerating}
                className="flex-1 flex items-center justify-center gap-2 bg-brand-600 disabled:opacity-40 hover:bg-brand-500 text-white text-sm font-semibold py-2 rounded-lg transition-all"
              >
                {aiGenerating ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                {aiGenerating ? 'Gerando...' : 'Gerar plano'}
              </button>
              <button
                onClick={() => { setShowAiGenerator(false); setAiGenError('') }}
                disabled={aiGenerating}
                className="flex-1 text-gray-400 hover:text-white text-sm py-2 disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <p className="text-red-400 text-xs bg-red-950/40 rounded-xl px-3 py-2">{uploadError}</p>
        )}

        {pendingUpload && (
          <div className="bg-gray-900 border border-brand-700 rounded-2xl p-3 space-y-2">
            <p className="text-xs text-gray-400">
              Plano com {pendingUpload.workouts.length} treino{pendingUpload.workouts.length === 1 ? '' : 's'} — dá um nome pra ele:
            </p>
            <input
              value={pendingUploadName}
              onChange={e => setPendingUploadName(e.target.value)}
              placeholder="Nome do plano"
              className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={confirmUpload}
                disabled={!pendingUploadName.trim()}
                className="flex-1 bg-brand-600 disabled:opacity-40 hover:bg-brand-500 text-white text-sm font-semibold py-2 rounded-lg transition-all"
              >
                Salvar plano
              </button>
              <button
                onClick={() => { setPendingUpload(null); setPendingUploadName('') }}
                className="flex-1 text-gray-400 hover:text-white text-sm py-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {savedPlans.map(sp => {
          const isActive = sp.id === activePlanId
          const isPreviewing = previewPlanId === sp.id

          return (
            <div key={sp.id} className={`rounded-2xl border overflow-hidden ${isActive ? 'border-brand-600 bg-brand-950/20' : 'border-gray-800 bg-gray-900'}`}>
              <div className="flex items-center gap-2 px-3 py-3">
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => setPreviewPlanId(isPreviewing ? null : sp.id)}
                >
                  <input
                    value={sp.name}
                    onChange={e => renameSavedPlan(sp.id, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="bg-transparent text-sm font-semibold text-white outline-none min-w-0 w-full truncate"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">{sp.plan.workouts.length} treinos</p>
                </button>

                {isActive ? (
                  <span className="flex items-center gap-1 text-xs text-brand-400 font-medium shrink-0 bg-brand-950/50 px-2 py-1 rounded-lg">
                    <Check size={12} />
                    Ativo
                  </span>
                ) : (
                  <button
                    onClick={() => switchActivePlan(sp.id)}
                    className="text-xs text-gray-300 hover:text-brand-400 shrink-0 bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded-lg transition-colors"
                  >
                    Ativar
                  </button>
                )}

                {confirmDeletePlanId === sp.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => { deleteSavedPlanResult(sp.id); setConfirmDeletePlanId(null) }}
                      className="text-xs text-red-400 font-semibold px-1.5"
                    >
                      Excluir
                    </button>
                    <button onClick={() => setConfirmDeletePlanId(null)} className="text-xs text-gray-500 px-1.5">
                      Não
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeletePlanId(sp.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors shrink-0 p-1"
                    title={isActive ? 'Excluir (troca automática pra outro plano)' : 'Excluir'}
                  >
                    <Trash2 size={14} />
                  </button>
                )}

                <button
                  onClick={() => setPreviewPlanId(isPreviewing ? null : sp.id)}
                  className="text-gray-500 p-1 shrink-0"
                >
                  {isPreviewing ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {isPreviewing && (
                <div className="px-3 pb-3 space-y-3 border-t border-gray-800 pt-3">
                  {isActive ? (
                    <>
                      {/* Shoulder / context notes */}
                      <div className="bg-gray-800/60 border border-gray-700 rounded-2xl overflow-hidden">
                        <button
                          onClick={() => setShowNotesEditor(v => !v)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left"
                        >
                          <span className="text-xs text-yellow-400/80 font-medium">⚠️ Contexto / restrições (usado pela IA)</span>
                          {showNotesEditor ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                        </button>
                        {showNotesEditor && (
                          <div className="px-4 pb-4 space-y-2">
                            <textarea
                              value={notesDraft}
                              onChange={e => setNotesDraft(e.target.value)}
                              rows={6}
                              className="w-full bg-gray-900 text-white text-sm rounded-xl px-3 py-2 border border-gray-700 focus:border-brand-500 outline-none resize-none"
                            />
                            <button
                              onClick={handleSaveNotes}
                              className="w-full bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold py-2.5 rounded-xl transition-all"
                            >
                              Salvar contexto
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Workout sequence */}
                      <div className="space-y-3">
                        {plan.workouts.map((workout, idx) => {
                          const isExpanded = expandedWorkout === workout.id
                          const isCurrent = currentWorkoutId === workout.id

                          return (
                            <div key={workout.id} className={`rounded-2xl border overflow-hidden ${isCurrent ? 'border-brand-600 bg-brand-950/30' : 'border-gray-700 bg-gray-800/60'}`}>
                              <div className="flex items-center gap-2 px-3 py-3">
                                <div className="flex flex-col shrink-0">
                                  <button
                                    onClick={() => moveWorkout(workout.id, -1)}
                                    disabled={idx === 0}
                                    className="text-gray-600 disabled:opacity-20 hover:text-gray-300 p-0.5"
                                  >
                                    <ChevronsUp size={14} />
                                  </button>
                                  <button
                                    onClick={() => moveWorkout(workout.id, 1)}
                                    disabled={idx === plan.workouts.length - 1}
                                    className="text-gray-600 disabled:opacity-20 hover:text-gray-300 p-0.5"
                                  >
                                    <ChevronsDown size={14} />
                                  </button>
                                </div>

                                <button
                                  className="flex-1 min-w-0 text-left"
                                  onClick={() => setExpandedWorkout(isExpanded ? null : workout.id)}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 shrink-0">#{idx + 1}</span>
                                    <input
                                      value={workout.label}
                                      onChange={e => updateWorkout(workout.id, w => ({ ...w, label: e.target.value }))}
                                      onClick={e => e.stopPropagation()}
                                      className="bg-transparent text-sm font-semibold text-white outline-none min-w-0 flex-1 truncate"
                                    />
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5">{workout.exercises.length} exercícios</p>
                                </button>

                                {isCurrent ? (
                                  <span className="flex items-center gap-1 text-xs text-brand-400 font-medium shrink-0 bg-brand-950/50 px-2 py-1 rounded-lg">
                                    <Star size={12} fill="currentColor" />
                                    Próximo
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => setCurrentWorkout(workout.id)}
                                    className="text-xs text-gray-500 hover:text-brand-400 shrink-0 px-2 py-1 transition-colors"
                                  >
                                    Tornar próximo
                                  </button>
                                )}

                                <button
                                  onClick={() => setExpandedWorkout(isExpanded ? null : workout.id)}
                                  className="text-gray-500 p-1 shrink-0"
                                >
                                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="px-3 pb-3 space-y-2 border-t border-gray-700 pt-3">
                                  {workout.exercises.map((exercise, exerciseIdx) => (
                                    <ExerciseEditRow
                                      key={exercise.id}
                                      exercise={exercise}
                                      onChange={updater => updateExercise(workout.id, exercise.id, updater)}
                                      onDelete={() => deleteExercise(workout.id, exercise.id)}
                                      onRequestAiSwap={() => setAiSwapTarget({ workoutId: workout.id, exercise })}
                                      onMoveUp={() => moveExercise(workout.id, exercise.id, -1)}
                                      onMoveDown={() => moveExercise(workout.id, exercise.id, 1)}
                                      canMoveUp={exerciseIdx > 0}
                                      canMoveDown={exerciseIdx < workout.exercises.length - 1}
                                    />
                                  ))}

                                  <button
                                    onClick={() => addExercise(workout.id)}
                                    className="w-full flex items-center justify-center gap-2 text-gray-500 hover:text-gray-300 text-sm py-2 border border-dashed border-gray-700 rounded-xl transition-colors"
                                  >
                                    <Plus size={14} />
                                    Adicionar exercício
                                  </button>

                                  <button
                                    onClick={() => deleteWorkout(workout.id)}
                                    className="w-full flex items-center justify-center gap-2 text-red-500/70 hover:text-red-400 text-xs py-2 transition-colors"
                                  >
                                    <Trash2 size={12} />
                                    Remover este treino
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <button
                        onClick={addWorkout}
                        className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-3 rounded-xl transition-all"
                      >
                        <Plus size={16} />
                        Adicionar treino
                      </button>
                    </>
                  ) : (
                    sp.plan.workouts.map(w => (
                      <div key={w.id} className="bg-gray-800/40 rounded-xl p-2.5">
                        <p className="text-sm font-medium text-white">{w.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {w.exercises.map(e => e.name).join(' · ')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ExerciseLibrarySection />

      {aiSwapTarget && (
        <SubstituteModal
          exercise={aiSwapTarget.exercise}
          onConfirm={(alt) => handleAiSwapConfirm(alt)}
          onCancel={() => setAiSwapTarget(null)}
        />
      )}
    </div>
  )
}

function ExerciseLibrarySection() {
  const { customExerciseLibrary, addCustomLibraryExercise, deleteCustomLibraryExercise } = useWorkoutStore()
  const [expanded, setExpanded] = useState(false)
  const [showBuiltIn, setShowBuiltIn] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [aliasesText, setAliasesText] = useState('')
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([])

  const toggleMuscle = (m: MuscleGroup) => {
    setMuscleGroups(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]))
  }

  const resetForm = () => {
    setShowForm(false)
    setName('')
    setAliasesText('')
    setMuscleGroups([])
  }

  const handleAdd = () => {
    if (!name.trim() || muscleGroups.length === 0) return
    addCustomLibraryExercise({
      name: name.trim(),
      muscleGroups,
      aliases: aliasesText.split(',').map(a => a.trim()).filter(Boolean),
    })
    resetForm()
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3">
      <button onClick={() => setExpanded(v => !v)} className="w-full flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Biblioteca de exercícios</p>
        {expanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-500">
            Nomes diferentes do mesmo exercício (ex: "Crucifixo", "Peck deck", "Crucifixo Hammer") são unificados no Progresso a partir desta lista. Se um exercício seu não estiver sendo reconhecido, adicione ele aqui.
          </p>

          {customExerciseLibrary.length > 0 && (
            <div className="space-y-1.5">
              {customExerciseLibrary.map(entry => (
                <div key={entry.id} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm text-white">{entry.name}</p>
                    {entry.aliases.length > 0 && (
                      <p className="text-xs text-gray-500">{entry.aliases.join(', ')}</p>
                    )}
                  </div>
                  <button onClick={() => deleteCustomLibraryExercise(entry.id)} className="text-gray-600 hover:text-red-400 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showForm ? (
            <div className="bg-gray-800/40 rounded-xl p-3 space-y-2.5">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nome do exercício (ex: Crucifixo)"
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 outline-none"
              />
              <input
                value={aliasesText}
                onChange={e => setAliasesText(e.target.value)}
                placeholder="Outros nomes/variantes, separados por vírgula"
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 outline-none"
              />
              <div className="flex flex-wrap gap-1.5">
                {ALL_MUSCLE_GROUPS.map(m => (
                  <button
                    key={m}
                    onClick={() => toggleMuscle(m)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      muscleGroups.includes(m)
                        ? 'bg-brand-600 border-brand-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400'
                    }`}
                  >
                    {MUSCLE_LABELS[m]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!name.trim() || muscleGroups.length === 0}
                  className="flex-1 bg-brand-600 disabled:opacity-40 hover:bg-brand-500 text-white text-sm font-semibold py-2 rounded-lg transition-all"
                >
                  Adicionar
                </button>
                <button onClick={resetForm} className="flex-1 text-gray-400 hover:text-white text-sm py-2">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2.5 rounded-xl transition-all"
            >
              <Plus size={16} />
              Adicionar exercício à biblioteca
            </button>
          )}

          <button
            onClick={() => setShowBuiltIn(v => !v)}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            {showBuiltIn ? 'Ocultar exercícios já reconhecidos' : 'Ver exercícios já reconhecidos'}
          </button>

          {showBuiltIn && (
            <p className="text-xs text-gray-500 leading-relaxed">
              {BUILT_IN_EXERCISE_LIBRARY.map(e => e.name).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ExerciseEditRow({
  exercise,
  onChange,
  onDelete,
  onRequestAiSwap,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  exercise: Exercise
  onChange: (updater: (e: Exercise) => Exercise) => void
  onDelete: () => void
  onRequestAiSwap: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const toggleMuscle = (m: MuscleGroup) => {
    onChange(e => ({
      ...e,
      muscleGroups: e.muscleGroups.includes(m)
        ? e.muscleGroups.filter(mg => mg !== m)
        : [...e.muscleGroups, m],
    }))
  }

  return (
    <div className="bg-gray-800/60 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-col shrink-0">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="text-gray-600 disabled:opacity-20 hover:text-gray-300 p-0.5"
          >
            <ChevronsUp size={13} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="text-gray-600 disabled:opacity-20 hover:text-gray-300 p-0.5"
          >
            <ChevronsDown size={13} />
          </button>
        </div>
        <input
          value={exercise.name}
          onChange={e => onChange(ex => ({ ...ex, name: e.target.value }))}
          className="flex-1 min-w-0 bg-gray-900 text-white text-sm font-medium rounded-lg px-2.5 py-1.5 border border-gray-700 focus:border-brand-500 outline-none truncate"
        />
        <button
          onClick={onRequestAiSwap}
          className="shrink-0 text-brand-400 hover:text-brand-300 p-1.5"
          title="Trocar com ajuda da IA"
        >
          <Sparkles size={16} />
        </button>
        <button
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 text-gray-500 p-1.5"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button onClick={onDelete} className="shrink-0 text-red-500/70 hover:text-red-400 p-1.5">
          <Trash2 size={15} />
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Séries</span>
          <NumberStepper
            value={exercise.sets}
            onChange={v => onChange(ex => ({ ...ex, sets: v }))}
            min={1}
            max={10}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500">Reps</span>
          <NumberStepper
            value={exercise.repsMin}
            onChange={v => onChange(ex => ({ ...ex, repsMin: Math.min(v, ex.repsMax) }))}
            min={1}
            max={50}
            size="sm"
          />
          <span className="text-xs text-gray-600">a</span>
          <NumberStepper
            value={exercise.repsMax}
            onChange={v => onChange(ex => ({ ...ex, repsMax: Math.max(v, ex.repsMin) }))}
            min={1}
            max={50}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Descanso</span>
          <NumberStepper
            value={exercise.restSeconds}
            onChange={v => onChange(ex => ({ ...ex, restSeconds: v }))}
            min={15}
            max={300}
            step={15}
            suffix="s"
            size="sm"
          />
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 pt-1">
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Grupos musculares</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_MUSCLE_GROUPS.map(m => (
                <button
                  key={m}
                  onClick={() => toggleMuscle(m)}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                    exercise.muscleGroups.includes(m)
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-900 text-gray-500 hover:bg-gray-700'
                  }`}
                >
                  {MUSCLE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-yellow-400/80">
            <input
              type="checkbox"
              checked={!!exercise.touchesShoulderAnterior}
              onChange={e => onChange(ex => ({ ...ex, touchesShoulderAnterior: e.target.checked }))}
              className="accent-brand-600"
            />
            Envolve ombro anterior (risco para lesão)
          </label>

          <div>
            <p className="text-xs text-gray-500 mb-1.5">Técnica avançada</p>
            <div className="flex flex-wrap gap-1.5">
              {ADVANCED_TECHNIQUES.map(t => {
                const active = (exercise.intensityTechnique ?? '').split(',').map(s => s.trim()).includes(t)
                return (
                  <button
                    key={t}
                    onClick={() => onChange(ex => ({ ...ex, intensityTechnique: toggleTechnique(ex.intensityTechnique, t) }))}
                    className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                      active ? 'bg-amber-600 text-white' : 'bg-gray-900 text-gray-500 hover:bg-gray-700'
                    }`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          <input
            placeholder="Detalhe da técnica (ex: só na última série)"
            value={exercise.intensityTechnique ?? ''}
            onChange={e => onChange(ex => ({ ...ex, intensityTechnique: e.target.value || undefined }))}
            className="w-full bg-gray-900 text-gray-300 text-xs rounded-lg px-2.5 py-2 border border-gray-700 focus:border-brand-500 outline-none"
          />

          <input
            placeholder="Notas (ex: substituir se doer)"
            value={exercise.notes ?? ''}
            onChange={e => onChange(ex => ({ ...ex, notes: e.target.value || undefined }))}
            className="w-full bg-gray-900 text-gray-300 text-xs rounded-lg px-2.5 py-2 border border-gray-700 focus:border-brand-500 outline-none"
          />
        </div>
      )}
    </div>
  )
}
