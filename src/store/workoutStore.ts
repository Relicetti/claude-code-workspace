import { create } from 'zustand'
import type {
  WorkoutSession,
  ExerciseRecord,
  SetRecord,
  WorkoutType,
  WeeklyAnalysis,
} from '@/types'
import { loadSessions, saveSession, loadAnalyses, saveAnalysis } from '@/lib/storage'
import { getTodayWorkout, workoutPlan } from '@/data/workoutPlan'

interface WorkoutStore {
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
  activeView: 'today' | 'history' | 'progress' | 'analytics'

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

  getSessionsByType: (type: WorkoutType) => WorkoutSession[]
  getLastSessionByType: (type: WorkoutType) => WorkoutSession | null
  getSessionsInRange: (startDate: Date, endDate: Date) => WorkoutSession[]
}

function buildInitialExercises(session: ReturnType<typeof getTodayWorkout>): ExerciseRecord[] {
  return session.exercises.map(ex => ({
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
  sessions: [],
  activeSession: null,
  sessionStartTime: null,
  sessionPaused: false,
  sessionElapsedSeconds: 0,
  analyses: [],
  activeView: 'today',

  loadFromStorage: () => {
    set({
      sessions: loadSessions(),
      analyses: loadAnalyses(),
    })
  },

  startSession: () => {
    const todayWorkout = getTodayWorkout()
    if (todayWorkout.type === 'off') return

    const session: WorkoutSession = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      workoutType: todayWorkout.type,
      workoutLabel: todayWorkout.label,
      exercises: buildInitialExercises(todayWorkout),
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
    const { activeSession, sessionStartTime, sessionElapsedSeconds, sessions } = get()
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
    set({
      sessions: [...sessions.filter(s => s.id !== finished.id), finished],
      activeSession: null,
      sessionStartTime: null,
      sessionPaused: false,
      sessionElapsedSeconds: 0,
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
    const { analyses } = get()
    const analysis = analyses.find(a => a.id === analysisId)
    if (!analysis) return

    const applied = [...analysis.applied]
    applied[adjustmentIndex] = true

    const updated = { ...analysis, applied }
    saveAnalysis(updated)
    set(state => ({
      analyses: state.analyses.map(a => (a.id === analysisId ? updated : a)),
    }))
  },

  setActiveView: (view) => set({ activeView: view }),

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

  getSessionsInRange: (startDate, endDate) => {
    return get().sessions.filter(s => {
      const d = new Date(s.date)
      return d >= startDate && d <= endDate
    })
  },
}))

// Make workoutPlan accessible for external references
export { workoutPlan }
