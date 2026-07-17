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
  SavedPlan,
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
  loadSavedPlans,
  saveSavedPlan,
  deleteSavedPlan as apiDeleteSavedPlan,
  loadActivePlanId,
  saveActivePlanId,
  clearActivePlanId,
  login as apiLogin,
  logout as apiLogout,
  checkSession,
} from '@/lib/storage'
import { defaultWorkoutPlan } from '@/data/workoutPlan'
import { todayLocalDate } from '@/lib/date'

interface WorkoutStore {
  // Auth
  authChecked: boolean
  isAuthenticated: boolean
  isAdmin: boolean
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

  // Library of switchable training plans. The active one is mirrored into
  // `plan`/`currentWorkoutId` above; the rest sit here until switched into.
  savedPlans: SavedPlan[]
  activePlanId: string | null

  // Current view
  activeView: 'today' | 'history' | 'progress' | 'analytics' | 'plan' | 'about' | 'shape'

  // Actions
  checkAuth: () => Promise<void>
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  loadFromStorage: () => Promise<void>

  startSession: () => void
  pauseResumeSession: () => void
  finishSession: () => Promise<boolean>
  cancelSession: () => Promise<boolean>

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
  updateHistoricalSession: (sessionId: string, updater: (s: WorkoutSession) => WorkoutSession) => void

  addCardioSession: (entry: Omit<CardioSession, 'id' | 'createdAt'>) => void
  updateCardioSessionResult: (id: string, updates: Partial<Omit<CardioSession, 'id' | 'createdAt'>>) => void
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

  switchActivePlan: (id: string) => void
  addSavedPlan: (name: string, plan: WorkoutPlan) => SavedPlan
  deleteSavedPlanResult: (id: string) => void
  renameSavedPlan: (id: string, name: string) => void

  getSessionsByType: (type: WorkoutType) => WorkoutSession[]
  getLastSessionByType: (type: WorkoutType) => WorkoutSession | null
  getMostRecentSession: () => WorkoutSession | null
  getSessionsInRange: (startDate: Date, endDate: Date) => WorkoutSession[]
  getSuggestedWeight: (exerciseId: string, exerciseName: string) => number | null
}

// Incremental saves (a set confirmed, an exercise marked done) fire without
// being awaited, so a slow one can otherwise land at the server *after* the
// final "finish" save and silently overwrite finishedAt back to null —
// resurrecting a session the user already saw finish. Routing every save
// through this chain forces them to hit the server in the order they were
// issued, so nothing queued before finishSession's save can ever complete
// after it.
let sessionSaveQueue: Promise<unknown> = Promise.resolve()

function queueSaveSession(session: WorkoutSession): Promise<void> {
  const result = sessionSaveQueue.catch(() => {}).then(() => saveSession(session))
  sessionSaveQueue = result.catch(() => {})
  return result
}

function buildInitialExercises(workout: WorkoutDay): ExerciseRecord[] {
  return workout.exercises.map(ex => ({
    exerciseId: ex.id,
    exerciseName: ex.name,
    muscleGroups: ex.muscleGroups,
    repsMin: ex.repsMin,
    repsMax: ex.repsMax,
    restSeconds: ex.restSeconds,
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
  isAdmin: false,
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
  savedPlans: [],
  activePlanId: null,
  activeView: 'today',

  checkAuth: async () => {
    try {
      const { authenticated, isAdmin } = await checkSession()
      set({ isAuthenticated: authenticated, isAdmin, authChecked: true })
      if (authenticated) await get().loadFromStorage()
    } catch {
      set({ isAuthenticated: false, isAdmin: false, authChecked: true })
    }
  },

  login: async (username, password) => {
    try {
      await apiLogin(username, password)
      const { isAdmin } = await checkSession()
      set({ isAuthenticated: true, isAdmin })
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
      isAdmin: false,
      dataLoaded: false,
      plan: defaultWorkoutPlan,
      currentWorkoutId: null,
      sessions: [],
      cardioSessions: [],
      analyses: [],
      shapeAssessments: [],
      weightSuggestions: {},
      savedPlans: [],
      activePlanId: null,
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

    const [allSessions, cardioSessions, analyses, shapeAssessments, weightSuggestions, savedPlansRaw, activePlanIdRaw] = await Promise.all([
      loadSessions().catch(() => []),
      loadCardioSessions().catch(() => []),
      loadAnalyses().catch(() => []),
      loadShapeAssessments().catch(() => []),
      loadWeightSuggestions().catch(() => ({})),
      loadSavedPlans().catch(() => []),
      loadActivePlanId().catch(() => null),
    ])

    // First time this feature runs for an existing user: wrap their current
    // plan as the first entry in the saved-plans library instead of leaving
    // it empty.
    let savedPlans = savedPlansRaw
    let activePlanId = activePlanIdRaw && savedPlans.some(p => p.id === activePlanIdRaw) ? activePlanIdRaw : null
    if (!activePlanId) {
      const migrated: SavedPlan = {
        id: crypto.randomUUID(),
        name: 'Meu Plano',
        plan,
        currentWorkoutId,
        createdAt: new Date().toISOString(),
      }
      savedPlans = [...savedPlans, migrated]
      activePlanId = migrated.id
      saveSavedPlan(migrated).catch(console.error)
      saveActivePlanId(migrated.id).catch(console.error)
    }

    // A session with no finishedAt was left running when the app closed/reloaded
    // mid-workout (e.g. a PWA update forcing a reload). Resume the most recent
    // one instead of leaving it stuck looking like a finished history entry.
    const unfinished = allSessions
      .filter(s => s.finishedAt === null)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    const resumedSession = unfinished[0] ?? null
    const sessions = allSessions.filter(s => s.finishedAt !== null)

    set({
      plan,
      currentWorkoutId,
      sessions,
      cardioSessions,
      analyses,
      shapeAssessments,
      weightSuggestions,
      savedPlans,
      activePlanId,
      activeSession: resumedSession,
      sessionStartTime: resumedSession ? Date.now() : null,
      sessionPaused: false,
      sessionElapsedSeconds: resumedSession
        ? Math.max(0, Math.floor((Date.now() - new Date(resumedSession.startedAt).getTime()) / 1000))
        : 0,
      dataLoaded: true,
    })
  },

  startSession: () => {
    const workout = get().getCurrentWorkout()
    if (!workout) return

    const session: WorkoutSession = {
      id: crypto.randomUUID(),
      date: todayLocalDate(),
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

  finishSession: async () => {
    const { activeSession, sessionStartTime, sessionElapsedSeconds, sessions, plan } = get()
    if (!activeSession) return true

    const totalElapsed = sessionStartTime
      ? sessionElapsedSeconds + Math.floor((Date.now() - sessionStartTime) / 1000)
      : sessionElapsedSeconds

    const finished: WorkoutSession = {
      ...activeSession,
      finishedAt: new Date().toISOString(),
      durationSeconds: totalElapsed,
    }

    // Unlike per-set saves (which self-heal on the next update), this is the
    // terminal write for the session — if it silently drops, the session is
    // stuck forever with finishedAt still null server-side, which later gets
    // mistaken for an in-progress workout and "resumed" with a stale timer.
    // So retry a few times and only clear the active session on success.
    let saved = false
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt))
        await queueSaveSession(finished)
        saved = true
      } catch (err) {
        console.error(err)
      }
    }
    if (!saved) return false

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
    return true
  },

  cancelSession: async () => {
    const { activeSession } = get()
    // Sets are saved incrementally as they're confirmed, so a cancelled
    // session may already have a row persisted with finishedAt still null.
    // Delete it so it doesn't linger and get mistaken for a resumable
    // session — same failure mode as finishSession, so same fix: retry a
    // few times and only clear the active session once the delete is
    // actually confirmed, instead of clearing the screen and hoping.
    if (activeSession) {
      let deleted = false
      for (let attempt = 0; attempt < 3 && !deleted; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt))
          // Wait for any already-queued incremental save to finish first —
          // otherwise it can land after this delete and re-insert the row
          // via its upsert, resurrecting the session we just cancelled.
          await sessionSaveQueue.catch(() => {})
          await apiDeleteSession(activeSession.id)
          deleted = true
        } catch (err) {
          console.error(err)
        }
      }
      if (!deleted) return false
    }
    set({
      activeSession: null,
      sessionStartTime: null,
      sessionPaused: false,
      sessionElapsedSeconds: 0,
    })
    return true
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
    queueSaveSession(updated).catch(console.error)
  },

  markExerciseComplete: (exerciseId) => {
    const { activeSession } = get()
    if (!activeSession) return

    const exercises = activeSession.exercises.map(ex =>
      ex.exerciseId === exerciseId ? { ...ex, completed: true } : ex,
    )

    const updated = { ...activeSession, exercises }
    set({ activeSession: updated })
    queueSaveSession(updated).catch(console.error)
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
    queueSaveSession(updated).catch(console.error)
  },

  addSubstituteExercise: (originalExerciseId, substitute, reason) => {
    const { activeSession } = get()
    if (!activeSession) return

    const subRecord: ExerciseRecord = {
      exerciseId: `sub_${crypto.randomUUID()}`,
      exerciseName: substitute.exerciseName,
      muscleGroups: substitute.muscleGroups,
      repsMin: substitute.repsMin,
      repsMax: substitute.repsMax,
      restSeconds: substitute.restSeconds,
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
    queueSaveSession(updated).catch(console.error)
  },

  updateAIFeedback: (feedback) => {
    const { activeSession } = get()
    if (!activeSession) return
    const updated = { ...activeSession, aiFeedback: feedback }
    set({ activeSession: updated })
    queueSaveSession(updated).catch(console.error)
  },

  updateSessionCalories: (calories) => {
    const { activeSession } = get()
    if (!activeSession) return
    const updated = { ...activeSession, caloriesBurned: calories }
    set({ activeSession: updated })
    queueSaveSession(updated).catch(console.error)
  },

  deleteSessionResult: (sessionId) => {
    apiDeleteSession(sessionId).catch(console.error)
    set(state => ({
      sessions: state.sessions.filter(s => s.id !== sessionId),
    }))
  },

  updateHistoricalSession: (sessionId, updater) => {
    const { sessions } = get()
    const target = sessions.find(s => s.id === sessionId)
    if (!target) return
    const updated = updater(target)
    queueSaveSession(updated).catch(console.error)
    set(state => ({
      sessions: state.sessions.map(s => (s.id === sessionId ? updated : s)),
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

  updateCardioSessionResult: (id, updates) => {
    const { cardioSessions } = get()
    const target = cardioSessions.find(c => c.id === id)
    if (!target) return
    const updated = { ...target, ...updates }
    saveCardioSession(updated).catch(console.error)
    set(state => ({
      cardioSessions: state.cardioSessions.map(c => (c.id === id ? updated : c)),
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

  switchActivePlan: (targetId) => {
    const { plan, currentWorkoutId, savedPlans, activePlanId } = get()
    const target = savedPlans.find(p => p.id === targetId)
    if (!target || targetId === activePlanId) return

    // Snapshot the plan we're leaving so its progress (edits, sequence
    // position) isn't lost when we switch away from it.
    const outgoing = activePlanId ? { id: activePlanId, plan, currentWorkoutId } : null
    const updatedSavedPlans = outgoing
      ? savedPlans.map(p => (p.id === outgoing.id ? { ...p, plan: outgoing.plan, currentWorkoutId: outgoing.currentWorkoutId } : p))
      : savedPlans

    set({
      savedPlans: updatedSavedPlans,
      plan: target.plan,
      currentWorkoutId: target.currentWorkoutId,
      activePlanId: targetId,
    })

    if (outgoing) {
      const outgoingUpdated = updatedSavedPlans.find(p => p.id === outgoing.id)
      if (outgoingUpdated) saveSavedPlan(outgoingUpdated).catch(console.error)
    }
    saveCustomPlan(target.plan).catch(console.error)
    saveCurrentWorkoutId(target.currentWorkoutId ?? '').catch(console.error)
    saveActivePlanId(targetId).catch(console.error)
  },

  addSavedPlan: (name, planData) => {
    const newPlan: SavedPlan = {
      id: crypto.randomUUID(),
      name,
      plan: planData,
      currentWorkoutId: planData.workouts[0]?.id ?? null,
      createdAt: new Date().toISOString(),
    }
    saveSavedPlan(newPlan).catch(console.error)
    set(state => ({ savedPlans: [...state.savedPlans, newPlan] }))
    return newPlan
  },

  deleteSavedPlanResult: (id) => {
    const { activePlanId, savedPlans } = get()
    apiDeleteSavedPlan(id).catch(console.error)
    const remaining = savedPlans.filter(p => p.id !== id)

    if (id !== activePlanId) {
      set({ savedPlans: remaining })
      return
    }

    // The active plan was deleted — promote another saved plan if one is
    // left, otherwise fall back to the built-in default so there's always
    // something active.
    const next = remaining[0]
    if (next) {
      set({ savedPlans: remaining, plan: next.plan, currentWorkoutId: next.currentWorkoutId, activePlanId: next.id })
      saveCustomPlan(next.plan).catch(console.error)
      saveCurrentWorkoutId(next.currentWorkoutId ?? '').catch(console.error)
      saveActivePlanId(next.id).catch(console.error)
    } else {
      set({
        savedPlans: remaining,
        plan: defaultWorkoutPlan,
        currentWorkoutId: defaultWorkoutPlan.workouts[0]?.id ?? null,
        activePlanId: null,
      })
      clearCustomPlan().catch(console.error)
      clearCurrentWorkoutId().catch(console.error)
      clearActivePlanId().catch(console.error)
    }
  },

  renameSavedPlan: (id, name) => {
    const { savedPlans } = get()
    const target = savedPlans.find(p => p.id === id)
    if (!target) return
    const updated = { ...target, name }
    saveSavedPlan(updated).catch(console.error)
    set(state => ({ savedPlans: state.savedPlans.map(p => (p.id === id ? updated : p)) }))
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
      const d = new Date(s.date + 'T12:00:00')
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
