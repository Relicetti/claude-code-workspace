import type { WorkoutSession, WeeklyAnalysis } from '@/types'

const SESSIONS_KEY = 'workout_sessions_v1'
const ANALYSES_KEY = 'workout_analyses_v1'
const CUSTOM_PLAN_KEY = 'workout_custom_plan_v1'

export function loadSessions(): WorkoutSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    return raw ? (JSON.parse(raw) as WorkoutSession[]) : []
  } catch {
    return []
  }
}

export function saveSession(session: WorkoutSession): void {
  const sessions = loadSessions()
  const idx = sessions.findIndex(s => s.id === session.id)
  if (idx >= 0) {
    sessions[idx] = session
  } else {
    sessions.push(session)
  }
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

export function deleteSession(id: string): void {
  const sessions = loadSessions().filter(s => s.id !== id)
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

export function loadAnalyses(): WeeklyAnalysis[] {
  try {
    const raw = localStorage.getItem(ANALYSES_KEY)
    return raw ? (JSON.parse(raw) as WeeklyAnalysis[]) : []
  } catch {
    return []
  }
}

export function saveAnalysis(analysis: WeeklyAnalysis): void {
  const analyses = loadAnalyses()
  const idx = analyses.findIndex(a => a.id === analysis.id)
  if (idx >= 0) {
    analyses[idx] = analysis
  } else {
    analyses.unshift(analysis)
  }
  localStorage.setItem(ANALYSES_KEY, JSON.stringify(analyses))
}

export function exportData(): string {
  return JSON.stringify(
    {
      sessions: loadSessions(),
      analyses: loadAnalyses(),
      exportedAt: new Date().toISOString(),
    },
    null,
    2,
  )
}

export function importData(json: string): { sessions: number; analyses: number } {
  const data = JSON.parse(json) as {
    sessions?: WorkoutSession[]
    analyses?: WeeklyAnalysis[]
  }

  if (data.sessions) {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(data.sessions))
  }
  if (data.analyses) {
    localStorage.setItem(ANALYSES_KEY, JSON.stringify(data.analyses))
  }

  return {
    sessions: data.sessions?.length ?? 0,
    analyses: data.analyses?.length ?? 0,
  }
}

export function saveCustomPlan(plan: unknown): void {
  localStorage.setItem(CUSTOM_PLAN_KEY, JSON.stringify(plan))
}

export function loadCustomPlan(): unknown | null {
  try {
    const raw = localStorage.getItem(CUSTOM_PLAN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
