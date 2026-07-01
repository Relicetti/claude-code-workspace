import { create } from 'zustand'
import type {
  WorkoutSession,
  ExerciseRecord,
  SetRecord,
  WorkoutType,
  WeeklyAnalysis,
  WorkoutPlan,
  WorkoutDay,
} from '@/types'
import {
  loadSessions,
  saveSession,
  loadAnalyses,
  saveAnalysis,
  loadCustomPlan,
  saveCustomPlan,
  clearCustomPlan,
  loadCurrentWorkoutId,
  saveCurrentWorkoutId,
  clearCurrentWorkoutId,
} from '@/lib/storage'
import { defaultWorkoutPlan } from '@/data/workoutPlan'

interface WorkoutStore {
  // Active workout plan (custom if edited, else default)
  plan: WorkoutPlan

  // Id of the workout that comes up next in the sequence
  currentWorkoutId: string | null

  // All historical sessions
  sessions: WorkoutSession[]

  // Active session being tracked
  activeSession: WorkoutSession | null

  // Session stopwatch
  sessionStartTime: number | null
  sessionPaused: boolean
  sessionElapsedSeconds: number

  // Weekly analyses
  analyses: WeeklyAnalysis[]

  // Current view
  activeView: 'today' | 'history' | 'progress' | 'analytics' | 'plan'

  // Actions
  loadFromStorage: () => void
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

  saveAnalysisResult: (analysis: WeeklyAnalysis) => void
  applyAdjustment: (analysisId: string, adjustmentIndex: number) => void

  setActiveView: (view: WorkoutStore['activeView']) => void

  getCurrentWorkout: () => WorkoutDay | null
  setCurrentWorkout: (id: string) => void
  updatePlan: (plan: WorkoutPlan) => void
  resetPlan: () => void

  getSessionsByType: (type: WorkoutType) => WorkoutSession[]
  getLastSessionByType: (type: WorkoutType) => WorkoutSession | null
  getMostRecentSession: () => WorkoutSession | null
  getSessionsInRange: (startDate: Date, endDate: Date) => WorkoutSession[]
}

function buildInitialExercises(workout: WorkoutDay): ExerciseRecord[] {
  return workout.exercises.map(ex => ({
    exerciseId: ex.id,
    exerciseName: ex.name,
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
  plan: defaultWorkoutPlan,
  currentWorkoutId: null,
  sessions: [],
  activeSession: null,
  sessionStartTime: null,
  sessionPaused: false,
  sessionElapsedSeconds: 0,
  analyses: [],
  activeView: 'today',

  loadFromStorage: () => {
    const customPlan = loadCustomPlan()
    const plan = customPlan ?? defaultWorkoutPlan
    const storedId = loadCurrentWorkoutId()
    const currentWorkoutId = storedId && plan.workouts.some(w => w.id === storedId)
      ? storedId
      : (plan.workouts[0]?.id ?? null)

    set({
      plan,
      currentWorkoutId,
      sessions: loadSessions(),
      analyses: loadAnalyses(),
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

    saveSession(finished)

    // Advance to the next workout in the sequence
    const idx = plan.workouts.findIndex(w => w.id === finished.workoutType)
    const nextWorkout = plan.workouts.length > 0
      ? plan.workouts[(idx + 1) % plan.workouts.length]
      : null
    if (nextWorkout) {
      saveCurrentWorkoutId(nextWorkout.id)
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
    saveSession(updated)
  },

  markExerciseComplete: (exerciseId) => {
    const { activeSession } = get()
    if (!activeSession) return

    const exercises = activeSession.exercises.map(ex =>
      ex.exerciseId === exerciseId ? { ...ex, completed: true } : ex,
    )

    const updated = { ...activeSession, exercises }
    set({ activeSession: updated })
    saveSession(updated)
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
    saveSession(updated)
  },

  addSubstituteExercise: (originalExerciseId, substitute, reason) => {
    const { activeSession } = get()
    if (!activeSession) return

    const subRecord: ExerciseRecord = {
      exerciseId: `sub_${crypto.randomUUID()}`,
      exerciseName: substitute.exerciseName,
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
    saveSession(updated)
  },

  updateAIFeedback: (feedback) => {
    const { activeSession } = get()
    if (!activeSession) return
    const updated = { ...activeSession, aiFeedback: feedback }
    set({ activeSession: updated })
    saveSession(updated)
  },

  saveAnalysisResult: (analysis) => {
    saveAnalysis(analysis)
    set(state => ({
      analyses: [analysis, ...state.analyses.filter(a => a.id !== analysis.id)],
    }))
  },

  applyAdjustment: (analysisId, adjustmentIndex) => {
    const { analyses, plan } = get()
    const analysis = analyses.find(a => a.id === analysisId)
    if (!analysis) return

    const adj = analysis.adjustments[adjustmentIndex]
    let updatedPlan = plan

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
      saveCustomPlan(updatedPlan)
    }

    const applied = [...analysis.applied]
    applied[adjustmentIndex] = true

    const updatedAnalysis = { ...analysis, applied }
    saveAnalysis(updatedAnalysis)
    set(state => ({
      plan: updatedPlan,
      analyses: state.analyses.map(a => (a.id === analysisId ? updatedAnalysis : a)),
    }))
  },

  setActiveView: (view) => set({ activeView: view }),

  getCurrentWorkout: () => {
    const { plan, currentWorkoutId } = get()
    if (plan.workouts.length === 0) return null
    return plan.workouts.find(w => w.id === currentWorkoutId) ?? plan.workouts[0]
  },

  setCurrentWorkout: (id) => {
    saveCurrentWorkoutId(id)
    set({ currentWorkoutId: id })
  },

  updatePlan: (plan) => {
    saveCustomPlan(plan)
    const currentWorkoutId = get().currentWorkoutId
    const stillValid = currentWorkoutId && plan.workouts.some(w => w.id === currentWorkoutId)
    const nextCurrentId = stillValid ? currentWorkoutId : (plan.workouts[0]?.id ?? null)
    if (nextCurrentId) saveCurrentWorkoutId(nextCurrentId)
    set({ plan, currentWorkoutId: nextCurrentId })
  },

  resetPlan: () => {
    clearCustomPlan()
    clearCurrentWorkoutId()
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
}))
