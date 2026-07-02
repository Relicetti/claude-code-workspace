import { Router } from 'express'
import { pool } from './db.js'
import { checkPassword, issueToken, setAuthCookie, clearAuthCookie, isAuthenticated, requireAuth } from './auth.js'
import type { WorkoutSession, WeeklyAnalysis, WorkoutPlan } from '../src/types/index.js'

export const router = Router()

// --- Auth ---

router.post('/login', (req, res) => {
  const { password } = req.body as { password?: string }
  if (!password || !checkPassword(password)) {
    res.status(401).json({ error: 'senha incorreta' })
    return
  }
  setAuthCookie(res, issueToken())
  res.json({ ok: true })
})

router.post('/logout', (req, res) => {
  clearAuthCookie(res)
  res.json({ ok: true })
})

router.get('/session', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) })
})

router.use(requireAuth)

// --- Plan ---

router.get('/plan', async (req, res) => {
  const result = await pool.query("SELECT value FROM app_state WHERE key = 'plan'")
  res.json({ plan: (result.rows[0]?.value as WorkoutPlan) ?? null })
})

router.put('/plan', async (req, res) => {
  const { plan } = req.body as { plan: WorkoutPlan }
  await pool.query(
    "INSERT INTO app_state (key, value) VALUES ('plan', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [JSON.stringify(plan)],
  )
  res.json({ ok: true })
})

router.delete('/plan', async (req, res) => {
  await pool.query("DELETE FROM app_state WHERE key = 'plan'")
  res.json({ ok: true })
})

// --- Current workout ---

router.get('/current-workout', async (req, res) => {
  const result = await pool.query("SELECT value FROM app_state WHERE key = 'current_workout_id'")
  res.json({ id: (result.rows[0]?.value as string) ?? null })
})

router.put('/current-workout', async (req, res) => {
  const { id } = req.body as { id: string }
  await pool.query(
    "INSERT INTO app_state (key, value) VALUES ('current_workout_id', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [JSON.stringify(id)],
  )
  res.json({ ok: true })
})

router.delete('/current-workout', async (req, res) => {
  await pool.query("DELETE FROM app_state WHERE key = 'current_workout_id'")
  res.json({ ok: true })
})

// --- Sessions ---

function rowToSession(row: Record<string, unknown>): WorkoutSession {
  return {
    id: row.id as string,
    date: (row.date as Date).toISOString().split('T')[0],
    workoutType: row.workout_type as string,
    workoutLabel: row.workout_label as string,
    startedAt: (row.started_at as Date).toISOString(),
    finishedAt: row.finished_at ? (row.finished_at as Date).toISOString() : null,
    durationSeconds: row.duration_seconds as number | null,
    aiFeedback: (row.ai_feedback as string) ?? undefined,
    caloriesBurned: (row.calories_burned as number) ?? null,
    exercises: row.exercises as WorkoutSession['exercises'],
  }
}

router.get('/sessions', async (req, res) => {
  const result = await pool.query('SELECT * FROM sessions ORDER BY started_at ASC')
  res.json({ sessions: result.rows.map(rowToSession) })
})

router.put('/sessions/:id', async (req, res) => {
  const session = req.body as WorkoutSession
  await pool.query(
    `INSERT INTO sessions (id, date, workout_type, workout_label, started_at, finished_at, duration_seconds, ai_feedback, exercises, calories_burned)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       date = $2, workout_type = $3, workout_label = $4, started_at = $5,
       finished_at = $6, duration_seconds = $7, ai_feedback = $8, exercises = $9, calories_burned = $10`,
    [
      session.id,
      session.date,
      session.workoutType,
      session.workoutLabel,
      session.startedAt,
      session.finishedAt,
      session.durationSeconds,
      session.aiFeedback ?? null,
      JSON.stringify(session.exercises),
      session.caloriesBurned ?? null,
    ],
  )
  res.json({ ok: true })
})

router.delete('/sessions/:id', async (req, res) => {
  await pool.query('DELETE FROM sessions WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

// --- Analyses ---

function rowToAnalysis(row: Record<string, unknown>): WeeklyAnalysis {
  return {
    id: row.id as string,
    generatedAt: (row.generated_at as Date).toISOString(),
    weekStart: (row.week_start as Date).toISOString(),
    weekEnd: (row.week_end as Date).toISOString(),
    summary: row.summary as string,
    volumeByMuscle: row.volume_by_muscle as Record<string, number>,
    adjustments: row.adjustments as WeeklyAnalysis['adjustments'],
    applied: row.applied as boolean[],
  }
}

router.get('/analyses', async (req, res) => {
  const result = await pool.query('SELECT * FROM analyses ORDER BY generated_at DESC')
  res.json({ analyses: result.rows.map(rowToAnalysis) })
})

router.put('/analyses/:id', async (req, res) => {
  const analysis = req.body as WeeklyAnalysis
  await pool.query(
    `INSERT INTO analyses (id, generated_at, week_start, week_end, summary, volume_by_muscle, adjustments, applied)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       generated_at = $2, week_start = $3, week_end = $4, summary = $5,
       volume_by_muscle = $6, adjustments = $7, applied = $8`,
    [
      analysis.id,
      analysis.generatedAt,
      analysis.weekStart,
      analysis.weekEnd,
      analysis.summary,
      JSON.stringify(analysis.volumeByMuscle),
      JSON.stringify(analysis.adjustments),
      JSON.stringify(analysis.applied),
    ],
  )
  res.json({ ok: true })
})

router.delete('/analyses/:id', async (req, res) => {
  await pool.query('DELETE FROM analyses WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

// --- Export / Import ---

router.get('/export', async (req, res) => {
  const [sessionsResult, analysesResult, planResult, currentWorkoutResult] = await Promise.all([
    pool.query('SELECT * FROM sessions ORDER BY started_at ASC'),
    pool.query('SELECT * FROM analyses ORDER BY generated_at DESC'),
    pool.query("SELECT value FROM app_state WHERE key = 'plan'"),
    pool.query("SELECT value FROM app_state WHERE key = 'current_workout_id'"),
  ])

  res.json({
    sessions: sessionsResult.rows.map(rowToSession),
    analyses: analysesResult.rows.map(rowToAnalysis),
    plan: planResult.rows[0]?.value ?? null,
    currentWorkoutId: currentWorkoutResult.rows[0]?.value ?? null,
    exportedAt: new Date().toISOString(),
  })
})

router.post('/import', async (req, res) => {
  const data = req.body as {
    sessions?: WorkoutSession[]
    analyses?: WeeklyAnalysis[]
    plan?: WorkoutPlan
    currentWorkoutId?: string
  }

  let sessionsImported = 0
  let analysesImported = 0

  if (data.sessions) {
    for (const session of data.sessions) {
      await pool.query(
        `INSERT INTO sessions (id, date, workout_type, workout_label, started_at, finished_at, duration_seconds, ai_feedback, exercises)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           date = $2, workout_type = $3, workout_label = $4, started_at = $5,
           finished_at = $6, duration_seconds = $7, ai_feedback = $8, exercises = $9`,
        [
          session.id,
          session.date,
          session.workoutType,
          session.workoutLabel,
          session.startedAt,
          session.finishedAt,
          session.durationSeconds,
          session.aiFeedback ?? null,
          JSON.stringify(session.exercises),
        ],
      )
      sessionsImported++
    }
  }

  if (data.analyses) {
    for (const analysis of data.analyses) {
      await pool.query(
        `INSERT INTO analyses (id, generated_at, week_start, week_end, summary, volume_by_muscle, adjustments, applied)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           generated_at = $2, week_start = $3, week_end = $4, summary = $5,
           volume_by_muscle = $6, adjustments = $7, applied = $8`,
        [
          analysis.id,
          analysis.generatedAt,
          analysis.weekStart,
          analysis.weekEnd,
          analysis.summary,
          JSON.stringify(analysis.volumeByMuscle),
          JSON.stringify(analysis.adjustments),
          JSON.stringify(analysis.applied),
        ],
      )
      analysesImported++
    }
  }

  if (data.plan) {
    await pool.query(
      "INSERT INTO app_state (key, value) VALUES ('plan', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [JSON.stringify(data.plan)],
    )
  }

  if (data.currentWorkoutId) {
    await pool.query(
      "INSERT INTO app_state (key, value) VALUES ('current_workout_id', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [JSON.stringify(data.currentWorkoutId)],
    )
  }

  res.json({ sessions: sessionsImported, analyses: analysesImported })
})
