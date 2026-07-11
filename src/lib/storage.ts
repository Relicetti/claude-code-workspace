import type { WorkoutSession, WeeklyAnalysis, WorkoutPlan, CardioSession, ShapeAssessment, SavedPlan, AdminUser } from '@/types'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error ?? `Erro ${response.status}`)
  }
  return response.json() as Promise<T>
}

// --- Auth ---

export async function login(username: string, password: string): Promise<void> {
  await apiFetch('/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export async function logout(): Promise<void> {
  await apiFetch('/logout', { method: 'POST' })
}

export async function checkSession(): Promise<{ authenticated: boolean; isAdmin: boolean }> {
  return apiFetch<{ authenticated: boolean; isAdmin: boolean }>('/session')
}

// --- Admin: user management ---

export async function loadUsers(): Promise<AdminUser[]> {
  const { users } = await apiFetch<{ users: AdminUser[] }>('/admin/users')
  return users
}

export async function createUser(username: string, password: string): Promise<void> {
  await apiFetch('/admin/users', { method: 'POST', body: JSON.stringify({ username, password }) })
}

// --- Sessions ---

export async function loadSessions(): Promise<WorkoutSession[]> {
  const { sessions } = await apiFetch<{ sessions: WorkoutSession[] }>('/sessions')
  return sessions
}

export async function saveSession(session: WorkoutSession): Promise<void> {
  await apiFetch(`/sessions/${session.id}`, { method: 'PUT', body: JSON.stringify(session) })
}

export async function deleteSession(id: string): Promise<void> {
  await apiFetch(`/sessions/${id}`, { method: 'DELETE' })
}

// --- Cardio ---

export async function loadCardioSessions(): Promise<CardioSession[]> {
  const { cardioSessions } = await apiFetch<{ cardioSessions: CardioSession[] }>('/cardio')
  return cardioSessions
}

export async function saveCardioSession(session: CardioSession): Promise<void> {
  await apiFetch(`/cardio/${session.id}`, { method: 'PUT', body: JSON.stringify(session) })
}

export async function deleteCardioSession(id: string): Promise<void> {
  await apiFetch(`/cardio/${id}`, { method: 'DELETE' })
}

// --- Shape assessments ---

export async function loadShapeAssessments(): Promise<ShapeAssessment[]> {
  const { shapeAssessments } = await apiFetch<{ shapeAssessments: ShapeAssessment[] }>('/shape')
  return shapeAssessments
}

export async function saveShapeAssessment(assessment: ShapeAssessment): Promise<void> {
  await apiFetch(`/shape/${assessment.id}`, { method: 'PUT', body: JSON.stringify(assessment) })
}

export async function deleteShapeAssessment(id: string): Promise<void> {
  await apiFetch(`/shape/${id}`, { method: 'DELETE' })
}

// --- Analyses ---

export async function loadAnalyses(): Promise<WeeklyAnalysis[]> {
  const { analyses } = await apiFetch<{ analyses: WeeklyAnalysis[] }>('/analyses')
  return analyses
}

export async function saveAnalysis(analysis: WeeklyAnalysis): Promise<void> {
  await apiFetch(`/analyses/${analysis.id}`, { method: 'PUT', body: JSON.stringify(analysis) })
}

export async function deleteAnalysis(id: string): Promise<void> {
  await apiFetch(`/analyses/${id}`, { method: 'DELETE' })
}

// --- Plan ---

export async function saveCustomPlan(plan: WorkoutPlan): Promise<void> {
  await apiFetch('/plan', { method: 'PUT', body: JSON.stringify({ plan }) })
}

export async function loadCustomPlan(): Promise<WorkoutPlan | null> {
  const { plan } = await apiFetch<{ plan: WorkoutPlan | null }>('/plan')
  return plan
}

export async function clearCustomPlan(): Promise<void> {
  await apiFetch('/plan', { method: 'DELETE' })
}

// --- Saved plans (library of switchable training plans) ---

export async function loadSavedPlans(): Promise<SavedPlan[]> {
  const { savedPlans } = await apiFetch<{ savedPlans: SavedPlan[] }>('/saved-plans')
  return savedPlans
}

export async function saveSavedPlan(plan: SavedPlan): Promise<void> {
  await apiFetch(`/saved-plans/${plan.id}`, { method: 'PUT', body: JSON.stringify(plan) })
}

export async function deleteSavedPlan(id: string): Promise<void> {
  await apiFetch(`/saved-plans/${id}`, { method: 'DELETE' })
}

export async function loadActivePlanId(): Promise<string | null> {
  const { id } = await apiFetch<{ id: string | null }>('/active-plan-id')
  return id
}

export async function saveActivePlanId(id: string): Promise<void> {
  await apiFetch('/active-plan-id', { method: 'PUT', body: JSON.stringify({ id }) })
}

export async function clearActivePlanId(): Promise<void> {
  await apiFetch('/active-plan-id', { method: 'DELETE' })
}

// --- Current workout pointer ---

export async function saveCurrentWorkoutId(id: string): Promise<void> {
  await apiFetch('/current-workout', { method: 'PUT', body: JSON.stringify({ id }) })
}

export async function loadCurrentWorkoutId(): Promise<string | null> {
  const { id } = await apiFetch<{ id: string | null }>('/current-workout')
  return id
}

export async function clearCurrentWorkoutId(): Promise<void> {
  await apiFetch('/current-workout', { method: 'DELETE' })
}

// --- Weight suggestions ---

export async function loadWeightSuggestions(): Promise<Record<string, number>> {
  const { suggestions } = await apiFetch<{ suggestions: Record<string, number> }>('/weight-suggestions')
  return suggestions
}

export async function saveWeightSuggestions(suggestions: Record<string, number>): Promise<void> {
  await apiFetch('/weight-suggestions', { method: 'PUT', body: JSON.stringify({ suggestions }) })
}

// --- Export / Import ---

export async function exportData(): Promise<string> {
  const data = await apiFetch('/export')
  return JSON.stringify(data, null, 2)
}

export async function importData(json: string): Promise<{ sessions: number; analyses: number }> {
  const data = JSON.parse(json)
  return apiFetch('/import', { method: 'POST', body: JSON.stringify(data) })
}
