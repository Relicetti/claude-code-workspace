import { create } from 'zustand'
import type {
  WorkoutSession,
  ExerciseRecord,
  SetRecord,
  WorkoutType,
  WeeklyAnalysis,
  WorkoutPlan,
  WorkoutDay,
  CardioSession,
  ShapeAssessment,
} from '@/types'
import {
  loadSessions,
  saveSession,
  deleteSession as apiDeleteSession,
  loadCardioSessions,
  saveCardioSession,
  deleteCardioSession as apiDeleteCardioSession,
  loadAnalyses,
  saveAnalysis,
  deleteAnalysis as apiDeleteAnalysis,
  loadShapeAssessments,
  saveShapeAssessment,
  deleteShapeAssessment as apiDeleteShapeAssessment,
  loadCustomPlan,
  saveCustomPlan,
  clearCustomPlan,
  loadCurrentWorkoutId,
  saveCurrentWorkoutId,
  clearCurrentWorkoutId,
  loadWeightSuggestions,
  saveWeightSuggestions,
  login as apiLogin,
  logout as apiLogout,
  checkAuthenticated,
} from '@/lib/storage'
import { defaultWorkoutPlan } from '@/data/workoutPlan'

interface WorkoutStore {
  // Auth
  authChecked: boolean
  isAuthenticated: boolean
  dataLoaded: boolean

  // Active workout plan (custom if edited, else default)
  plan: WorkoutPlan

  // Id of the workout that comes up next in the sequence
  currentWorkoutId: string | null

  // All historical sessions
  sessions: WorkoutSession[]

  // Cardio activities (independent of the strength plan)
  cardioSessions: CardioSession[]

  // Active session being tracked
  activeSession: WorkoutSession | null

  // Session stopwatch
  sessionStartTime: number | null
  sessionPaused: boolean
  sessionElapsedSeconds: number

  // Weekly analyses
  analyses: WeeklyAnalysis[]

  // Weekly shape/physique check-ins (photos + fasting weight)
  shapeAssessments: ShapeAssessment[]

  // Weight suggested for an exercise (from an applied "increase_weight"
  // analysis adjustment), keyed by normalized exercise name
  weightSuggestions: Record<string, number>

  // Current view
  activeView: 'today' | 'history' | 'progress' | 'analytics' | 'plan' | 'about' | 'shape'

  // Actions
  checkAuth: () => Promise<void>
  login: (password: string) => Promise<boolean>
  logout: () => Promise<void>
  loadFromStorage: () => Promise<void>

  startSession: () => void
  pauseResumeSession: () => void
  finishSession: () => void
  cancelSession: () => void

  updateSetRecord: (exerciseId: string, setIndex: number, data: Partial<SetRecord>) => void
  markExerciseComplete: (exerciseId: string) => void
  skipExercise: (exerciseId: string, reason?: string) => void
  addSubstituteExercise: (
    originalExerciseId: string,
    substitute: Omit<ExerciseRecord, 'sets'> & { targetSets: number; repsMin: number; repsMax: number },
    reason: string,
  ) => void
  updateAIFeedback: (feedback: string) => void
  updateSessionCalories: (calories: number | null) => void
  deleteSessionResult: (sessionId: string) => void

  addCardioSession: (entry: Omit<CardioSession, 'id' | 'createdAt'>) => void
  deleteCardioSessionResult: (id: string) => void

  saveAnalysisResult: (analysis: WeeklyAnalysis) => void
  deleteAnalysisResult: (analysisId: string) => void
  applyAdjustment: (analysisId: string, adjustmentIndex: number) => void

  addShapeAssessment: (entry: Omit<ShapeAssessment, 'id' | 'createdAt'>) => ShapeAssessment
  updateShapeAssessmentAnalysis: (id: string, aiAnalysis: string) => void
  deleteShapeAssessmentResult: (id: string) => void
  getPreviousShapeAssessment: (beforeId: string) => ShapeAssessment | null

  setActiveView: (view: WorkoutStore['activeView']) => void

  getCurrentWorkout: () => WorkoutDay | null
  setCurrentWorkout: (id: string) => void
  updatePlan: (plan: WorkoutPlan) => void
  resetPlan: () => void

  getSessionsByType: (type: WorkoutType) => WorkoutSession[]
  getLastSessionByType: (type: WorkoutType) => WorkoutSession | null
  getMostRecentSession: () => WorkoutSession | null
  getSessionsInRange: (startDate: Date, endDate: Date) => WorkoutSession[]
  getSuggestedWeight: (exerciseId: string, exerciseName: string) => number | null
}

function buildInitialExercises(workout: WorkoutDay): ExerciseRecord[] {
  return workout.exercises.map(ex => ({
    exerciseId: ex.id,
    exerciseName: ex.name,
    muscleGroups: ex.muscleGroups,
    completed: false,
    skipped: false,
    sets: Array.from({ length: ex.sets }, (_, i) => ({
      setNumber: i + 1,
      targetReps: ex.repsMax,
      actualReps: null,
      weight: null,
      completedAt: null,
    })),
  }))
}

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  authChecked: false,
  isAuthenticated: false,
  dataLoaded: false,
  plan: defaultWorkoutPlan,
  currentWorkoutId: null,
  sessions: [],
  cardioSessions: [],
  activeSession: null,
  sessionStartTime: null,
  sessionPaused: false,
  sessionElapsedSeconds: 0,
  analyses: [],
  shapeAssessments: [],
  weightSuggestions: {},
  activeView: 'today',

  checkAuth: async () => {
    try {
      const authenticated = await checkAuthenticated()
      set({ isAuthenticated: authenticated, authChecked: true })
      if (authenticated) await get().loadFromStorage()
    } catch {
      set({ isAuthenticated: false, authChecked: true })
    }
  },

  login: async (password) => {
    try {
      await apiLogin(password)
      set({ isAuthenticated: true })
      await get().loadFromStorage()
      return true
    } catch {
      return false
    }
  },

  logout: async () => {
    await apiLogout().catch(() => {})
    set({
      isAuthenticated: false,
      dataLoaded: false,
      plan: defaultWorkoutPlan,
      currentWorkoutId: null,
      sessions: [],
      cardioSessions: [],
      analyses: [],
      shapeAssessments: [],
      weightSuggestions: {},
      activeSession: null,
    })
  },

  loadFromStorage: async () => {
    const customPlan = await loadCustomPlan().catch(() => null)
    const plan = customPlan ?? defaultWorkoutPlan
    const storedId = await loadCurrentWorkoutId().catch(() => null)
    const currentWorkoutId = storedId && plan.workouts.some(w => w.id === storedId)
      ? storedId
      : (plan.workouts[0]?.id ?? null)

    const [sessions, cardioSessions, analyses, shapeAssessments, weightSuggestions] = await Promise.all([
      loadSessions().catch(() => []),
      loadCardioSessions().catch(() => []),
      loadAnalyses().catch(() => []),
      loadShapeAssessments().catch(() => []),
      loadWeightSuggestions().catch(() => ({})),
    ])

    set({
      plan,
      currentWorkoutId,
      sessions,
      cardioSessions,
      analyses,
      shapeAssessments,
      weightSuggestions,
      dataLoaded: true,
    })
  },

  startSession: () => {
    const workout = get().getCurrentWorkout()
    if (!workout) return

    const session: WorkoutSession = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      workoutType: workout.id,
      workoutLabel: workout.label,
      exercises: buildInitialExercises(workout),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      durationSeconds: null,
    }

    set({
      activeSession: session,
      sessionStartTime: Date.now(),
      sessionPaused: false,
      sessionElapsedSeconds: 0,
    })
  },

  pauseResumeSession: () => {
    const { sessionPaused, sessionStartTime, sessionElapsedSeconds } = get()
    if (sessionPaused) {
      set({ sessionPaused: false, sessionStartTime: Date.now() })
    } else {
      const elapsed = sessionStartTime
        ? sessionElapsedSeconds + Math.floor((Date.now() - sessionStartTime) / 1000)
        : sessionElapsedSeconds
      set({ sessionPaused: true, sessionElapsedSeconds: elapsed, sessionStartTime: null })
    }
  },

  finishSession: () => {
    const { activeSession, sessionStartTime, sessionElapsedSeconds, sessions, plan } = get()
    if (!activeSession) return

    const totalElapsed = sessionStartTime
      ? sessionElapsedSeconds + Math.floor((Date.now() - sessionStartTime) / 1000)
      : sessionElapsedSeconds

    const finished: WorkoutSession = {
      ...activeSession,
      finishedAt: new Date().toISOString(),
      durationSeconds: totalElapsed,
    }

    saveSession(finished).catch(console.error)

    // Advance to the next workout in the sequence
    const idx = plan.workouts.findIndex(w => w.id === finished.workoutType)
    const nextWorkout = plan.workouts.length > 0
      ? plan.workouts[(idx + 1) % plan.workouts.length]
      : null
    if (nextWorkout) {
      saveCurrentWorkoutId(nextWorkout.id).catch(console.error)
    }

    set({
      sessions: [...sessions.filter(s => s.id !== finished.id), finished],
      activeSession: null,
      sessionStartTime: null,
      sessionPaused: false,
      sessionElapsedSeconds: 0,
      currentWorkoutId: nextWorkout?.id ?? get().currentWorkoutId,
    })
  },

  cancelSession: () => {
    set({
      activeSession: null,
      sessionStartTime: null,
      sessionPaused: false,
      sessionElapsedSeconds: 0,
    })
  },

  updateSetRecord: (exerciseId, setIndex, data) => {
    const { activeSession } = get()
    if (!activeSession) return

    const exercises = activeSession.exercises.map(ex => {
      if (ex.exerciseId !== exerciseId) return ex
      const sets = ex.sets.map((s, i) => (i === setIndex ? { ...s, ...data } : s))
      return { ...ex, sets }
    })

    const updated = { ...activeSession, exercises }
    set({ activeSession: updated })
    saveSession(updated).catch(console.error)
  },

  markExerciseComplete: (exerciseId) => {
    const { activeSession } = get()
    if (!activeSession) return

    const exercises = activeSession.exercises.map(ex =>
      ex.exerciseId === exerciseId ? { ...ex, completed: true } : ex,
    )

    const updated = { ...activeSession, exercises }
    set({ activeSession: updated })
    saveSession(updated).catch(console.error)
  },

  skipExercise: (exerciseId, reason) => {
    const { activeSession } = get()
    if (!activeSession) return

    const exercises = activeSession.exercises.map(ex =>
      ex.exerciseId === exerciseId
        ? { ...ex, skipped: true, substituteReason: reason }
        : ex,
    )

    const updated = { ...activeSession, exercises }
    set({ activeSession: updated })
    saveSession(updated).catch(console.error)
  },

  addSubstituteExercise: (originalExerciseId, substitute, reason) => {
    const { activeSession } = get()
    if (!activeSession) return

    const subRecord: ExerciseRecord = {
      exerciseId: `sub_${crypto.randomUUID()}`,
      exerciseName: substitute.exerciseName,
      muscleGroups: substitute.muscleGroups,
      completed: false,
      skipped: false,
      substituteReason: reason,
      originalExerciseId,
      sets: Array.from({ length: substitute.targetSets }, (_, i) => ({
        setNumber: i + 1,
        targetReps: substitute.repsMax,
        actualReps: null,
        weight: null,
        completedAt: null,
      })),
    }

    const exercises = activeSession.exercises.flatMap(ex =>
      ex.exerciseId === originalExerciseId
        ? [{ ...ex, skipped: true, substituteReason: reason }, subRecord]
        : [ex],
    )

    const updated = { ...activeSession, exercises }
    set({ activeSession: updated })
    saveSession(updated).catch(console.error)
  },

  updateAIFeedback: (feedback) => {
    const { activeSession } = get()
    if (!activeSession) return
    const updated = { ...activeSession, aiFeedback: feedback }
    set({ activeSession: updated })
    saveSession(updated).catch(console.error)
  },

  updateSessionCalories: (calories) => {
    const { activeSession } = get()
    if (!activeSession) return
    const updated = { ...activeSession, caloriesBurned: calories }
    set({ activeSession: updated })
    saveSession(updated).catch(console.error)
  },

  deleteSessionResult: (sessionId) => {
    apiDeleteSession(sessionId).catch(console.error)
    set(state => ({
      sessions: state.sessions.filter(s => s.id !== sessionId),
    }))
  },

  addCardioSession: (entry) => {
    const session: CardioSession = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    saveCardioSession(session).catch(console.error)
    set(state => ({
      cardioSessions: [session, ...state.cardioSessions],
    }))
  },

  deleteCardioSessionResult: (id) => {
    apiDeleteCardioSession(id).catch(console.error)
    set(state => ({
      cardioSessions: state.cardioSessions.filter(c => c.id !== id),
    }))
  },

  saveAnalysisResult: (analysis) => {
    saveAnalysis(analysis).catch(console.error)
    set(state => ({
      analyses: [analysis, ...state.analyses.filter(a => a.id !== analysis.id)],
    }))
  },

  deleteAnalysisResult: (analysisId) => {
    apiDeleteAnalysis(analysisId).catch(console.error)
    set(state => ({
      analyses: state.analyses.filter(a => a.id !== analysisId),
    }))
  },

  applyAdjustment: (analysisId, adjustmentIndex) => {
    const { analyses, plan, weightSuggestions } = get()
    const analysis = analyses.find(a => a.id === analysisId)
    if (!analysis) return

    const adj = analysis.adjustments[adjustmentIndex]
    let updatedPlan = plan
    let updatedWeightSuggestions = weightSuggestions

    if (adj) {
      const normalizedTarget = adj.exerciseName.trim().toLowerCase()
      const workouts = plan.workouts.map(w => ({
        ...w,
        exercises: w.exercises.map(ex => {
          if (ex.name.trim().toLowerCase() !== normalizedTarget) return ex

          if (adj.type === 'increase_volume' || adj.type === 'decrease_volume') {
            return {
              ...ex,
              sets: adj.targetSets ?? ex.sets,
              repsMin: adj.targetRepsMin ?? ex.repsMin,
              repsMax: adj.targetRepsMax ?? ex.repsMax,
            }
          }
          if (adj.type === 'swap_exercise' && adj.substituteExerciseName) {
            return { ...ex, name: adj.substituteExerciseName }
          }
          return ex
        }),
      }))

      updatedPlan = { ...plan, workouts }
      saveCustomPlan(updatedPlan).catch(console.error)

      if (adj.type === 'increase_weight' && adj.targetWeight != null) {
        updatedWeightSuggestions = { ...weightSuggestions, [normalizedTarget]: adj.targetWeight }
        saveWeightSuggestions(updatedWeightSuggestions).catch(console.error)
      }
    }

    const applied = [...analysis.applied]
    applied[adjustmentIndex] = true

    const updatedAnalysis = { ...analysis, applied }
    saveAnalysis(updatedAnalysis).catch(console.error)
    set(state => ({
      plan: updatedPlan,
      weightSuggestions: updatedWeightSuggestions,
      analyses: state.analyses.map(a => (a.id === analysisId ? updatedAnalysis : a)),
    }))
  },

  addShapeAssessment: (entry) => {
    const assessment: ShapeAssessment = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    saveShapeAssessment(assessment).catch(console.error)
    set(state => ({
      shapeAssessments: [assessment, ...state.shapeAssessments],
    }))
    return assessment
  },

  updateShapeAssessmentAnalysis: (id, aiAnalysis) => {
    const { shapeAssessments } = get()
    const assessment = shapeAssessments.find(a => a.id === id)
    if (!assessment) return
    const updated = { ...assessment, aiAnalysis }
    saveShapeAssessment(updated).catch(console.error)
    set(state => ({
      shapeAssessments: state.shapeAssessments.map(a => (a.id === id ? updated : a)),
    }))
  },

  deleteShapeAssessmentResult: (id) => {
    apiDeleteShapeAssessment(id).catch(console.error)
    set(state => ({
      shapeAssessments: state.shapeAssessments.filter(a => a.id !== id),
    }))
  },

  getPreviousShapeAssessment: (beforeId) => {
    const { shapeAssessments } = get()
    const sorted = [...shapeAssessments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const idx = sorted.findIndex(a => a.id === beforeId)
    if (idx === -1) return sorted[0] ?? null
    return sorted[idx + 1] ?? null
  },

  setActiveView: (view) => set({ activeView: view }),

  getCurrentWorkout: () => {
    const { plan, currentWorkoutId } = get()
    if (plan.workouts.length === 0) return null
    return plan.workouts.find(w => w.id === currentWorkoutId) ?? plan.workouts[0]
  },

  setCurrentWorkout: (id) => {
    saveCurrentWorkoutId(id).catch(console.error)
    set({ currentWorkoutId: id })
  },

  updatePlan: (plan) => {
    saveCustomPlan(plan).catch(console.error)
    const currentWorkoutId = get().currentWorkoutId
    const stillValid = currentWorkoutId && plan.workouts.some(w => w.id === currentWorkoutId)
    const nextCurrentId = stillValid ? currentWorkoutId : (plan.workouts[0]?.id ?? null)
    if (nextCurrentId) saveCurrentWorkoutId(nextCurrentId).catch(console.error)
    set({ plan, currentWorkoutId: nextCurrentId })
  },

  resetPlan: () => {
    clearCustomPlan().catch(console.error)
    clearCurrentWorkoutId().catch(console.error)
    set({ plan: defaultWorkoutPlan, currentWorkoutId: defaultWorkoutPlan.workouts[0]?.id ?? null })
  },

  getSessionsByType: (type) => {
    return get().sessions.filter(s => s.workoutType === type).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
  },

  getLastSessionByType: (type) => {
    const sessions = get()
      .sessions.filter(s => s.workoutType === type && s.finishedAt !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return sessions[0] ?? null
  },

  getMostRecentSession: () => {
    const sessions = get()
      .sessions.filter(s => s.finishedAt !== null)
      .sort((a, b) => new Date(b.finishedAt!).getTime() - new Date(a.finishedAt!).getTime())
    return sessions[0] ?? null
  },

  getSessionsInRange: (startDate, endDate) => {
    return get().sessions.filter(s => {
      const d = new Date(s.date)
      return d >= startDate && d <= endDate
    })
  },

  getSuggestedWeight: (exerciseId, exerciseName) => {
    const { weightSuggestions, sessions } = get()

    const applied = weightSuggestions[exerciseName.trim().toLowerCase()]
    if (applied != null) return applied

    // Fall back to the weight used last time this exercise was performed,
    // most recent session first, using the first completed set as the
    // starting reference (pyramids ramp up from there).
    const sorted = [...sessions]
      .filter(s => s.finishedAt !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    for (const session of sorted) {
      const record = session.exercises.find(e => e.exerciseId === exerciseId && !e.skipped)
      if (!record) continue
      const firstDone = record.sets.find(s => s.completedAt !== null)
      if (firstDone?.weight != null) return firstDone.weight
    }

    return null
  },
}))
