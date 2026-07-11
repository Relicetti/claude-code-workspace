import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from './db.js'
import { checkCredentials, issueToken, setAuthCookie, clearAuthCookie, getSessionInfo, requireAuth, requireAdmin } from './auth.js'
import { scheduleRestDoneNotification, cancelScheduledNotification } from './push.js'
import type { WorkoutSession, WeeklyAnalysis, WorkoutPlan, CardioSession, ShapeAssessment, SavedPlan } from '../src/types/index.js'

export const router = Router()

// --- Auth ---

router.post('/login', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string }
  const user = username && password ? await checkCredentials(username, password) : null
  if (!user) {
    res.status(401).json({ error: 'usuário ou senha incorretos' })
    return
  }
  setAuthCookie(res, issueToken(user.id, user.username, user.isAdmin))
  res.json({ ok: true })
})

router.post('/logout', (req, res) => {
  clearAuthCookie(res)
  res.json({ ok: true })
})

router.get('/session', (req, res) => {
  res.json(getSessionInfo(req))
})

router.use(requireAuth)

// --- Admin: user management ---

router.get('/admin/users', requireAdmin, async (req, res) => {
  const result = await pool.query('SELECT id, username, is_admin, created_at FROM users ORDER BY created_at ASC')
  res.json({
    users: result.rows.map(r => ({
      id: r.id as number,
      username: r.username as string,
      isAdmin: r.is_admin as boolean,
      createdAt: (r.created_at as Date).toISOString(),
    })),
  })
})

router.post('/admin/users', requireAdmin, async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string }
  if (!username?.trim() || !password) {
    res.status(400).json({ error: 'usuário e senha são obrigatórios' })
    return
  }
  const passwordHash = await bcrypt.hash(password, 10)
  try {
    await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username.trim(), passwordHash])
    res.json({ ok: true })
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'esse nome de usuário já existe' })
      return
    }
    throw err
  }
})

// --- Plan ---

router.get('/plan', async (req, res) => {
  const result = await pool.query("SELECT value FROM app_state WHERE user_id = $1 AND key = 'plan'", [res.locals.userId])
  res.json({ plan: (result.rows[0]?.value as WorkoutPlan) ?? null })
})

router.put('/plan', async (req, res) => {
  const { plan } = req.body as { plan: WorkoutPlan }
  await pool.query(
    "INSERT INTO app_state (user_id, key, value) VALUES ($1, 'plan', $2) ON CONFLICT (user_id, key) DO UPDATE SET value = $2",
    [res.locals.userId, JSON.stringify(plan)],
  )
  res.json({ ok: true })
})

router.delete('/plan', async (req, res) => {
  await pool.query("DELETE FROM app_state WHERE user_id = $1 AND key = 'plan'", [res.locals.userId])
  res.json({ ok: true })
})

// --- Current workout ---

router.get('/current-workout', async (req, res) => {
  const result = await pool.query("SELECT value FROM app_state WHERE user_id = $1 AND key = 'current_workout_id'", [res.locals.userId])
  res.json({ id: (result.rows[0]?.value as string) ?? null })
})

router.put('/current-workout', async (req, res) => {
  const { id } = req.body as { id: string }
  await pool.query(
    "INSERT INTO app_state (user_id, key, value) VALUES ($1, 'current_workout_id', $2) ON CONFLICT (user_id, key) DO UPDATE SET value = $2",
    [res.locals.userId, JSON.stringify(id)],
  )
  res.json({ ok: true })
})

router.delete('/current-workout', async (req, res) => {
  await pool.query("DELETE FROM app_state WHERE user_id = $1 AND key = 'current_workout_id'", [res.locals.userId])
  res.json({ ok: true })
})

// --- Weight suggestions (from applied "increase_weight" analysis adjustments) ---

router.get('/weight-suggestions', async (req, res) => {
  const result = await pool.query("SELECT value FROM app_state WHERE user_id = $1 AND key = 'weight_suggestions'", [res.locals.userId])
  res.json({ suggestions: (result.rows[0]?.value as Record<string, number>) ?? {} })
})

router.put('/weight-suggestions', async (req, res) => {
  const { suggestions } = req.body as { suggestions: Record<string, number> }
  await pool.query(
    "INSERT INTO app_state (user_id, key, value) VALUES ($1, 'weight_suggestions', $2) ON CONFLICT (user_id, key) DO UPDATE SET value = $2",
    [res.locals.userId, JSON.stringify(suggestions)],
  )
  res.json({ ok: true })
})

// --- Saved plans (library of switchable training plans) ---

router.get('/active-plan-id', async (req, res) => {
  const result = await pool.query("SELECT value FROM app_state WHERE user_id = $1 AND key = 'active_plan_id'", [res.locals.userId])
  res.json({ id: (result.rows[0]?.value as string) ?? null })
})

router.put('/active-plan-id', async (req, res) => {
  const { id } = req.body as { id: string }
  await pool.query(
    "INSERT INTO app_state (user_id, key, value) VALUES ($1, 'active_plan_id', $2) ON CONFLICT (user_id, key) DO UPDATE SET value = $2",
    [res.locals.userId, JSON.stringify(id)],
  )
  res.json({ ok: true })
})

function rowToSavedPlan(row: Record<string, unknown>): SavedPlan {
  return {
    id: row.id as string,
    name: row.name as string,
    plan: row.plan as WorkoutPlan,
    currentWorkoutId: (row.current_workout_id as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  }
}

router.get('/saved-plans', async (req, res) => {
  const result = await pool.query('SELECT * FROM saved_plans WHERE user_id = $1 ORDER BY created_at ASC', [res.locals.userId])
  res.json({ savedPlans: result.rows.map(rowToSavedPlan) })
})

router.put('/saved-plans/:id', async (req, res) => {
  const p = req.body as SavedPlan
  await pool.query(
    `INSERT INTO saved_plans (id, user_id, name, plan, current_workout_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       name = $3, plan = $4, current_workout_id = $5, created_at = $6`,
    [
      p.id,
      res.locals.userId,
      p.name,
      JSON.stringify(p.plan),
      p.currentWorkoutId,
      p.createdAt,
    ],
  )
  res.json({ ok: true })
})

router.delete('/saved-plans/:id', async (req, res) => {
  await pool.query('DELETE FROM saved_plans WHERE id = $1 AND user_id = $2', [req.params.id, res.locals.userId])
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
  const result = await pool.query('SELECT * FROM sessions WHERE user_id = $1 ORDER BY started_at ASC', [res.locals.userId])
  res.json({ sessions: result.rows.map(rowToSession) })
})

router.put('/sessions/:id', async (req, res) => {
  const session = req.body as WorkoutSession
  await pool.query(
    `INSERT INTO sessions (id, user_id, date, workout_type, workout_label, started_at, finished_at, duration_seconds, ai_feedback, exercises, calories_burned)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       date = $3, workout_type = $4, workout_label = $5, started_at = $6,
       finished_at = $7, duration_seconds = $8, ai_feedback = $9, exercises = $10, calories_burned = $11`,
    [
      session.id,
      res.locals.userId,
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
  await pool.query('DELETE FROM sessions WHERE id = $1 AND user_id = $2', [req.params.id, res.locals.userId])
  res.json({ ok: true })
})

// --- Cardio sessions ---

function rowToCardio(row: Record<string, unknown>): CardioSession {
  return {
    id: row.id as string,
    date: (row.date as Date).toISOString().split('T')[0],
    type: row.type as CardioSession['type'],
    customTypeLabel: (row.custom_type_label as string) ?? undefined,
    durationSeconds: row.duration_seconds as number,
    distanceMeters: (row.distance_meters as number) ?? null,
    caloriesBurned: (row.calories_burned as number) ?? null,
    notes: (row.notes as string) ?? undefined,
    createdAt: (row.created_at as Date).toISOString(),
  }
}

router.get('/cardio', async (req, res) => {
  const result = await pool.query('SELECT * FROM cardio_sessions WHERE user_id = $1 ORDER BY date DESC, created_at DESC', [res.locals.userId])
  res.json({ cardioSessions: result.rows.map(rowToCardio) })
})

router.put('/cardio/:id', async (req, res) => {
  const c = req.body as CardioSession
  await pool.query(
    `INSERT INTO cardio_sessions (id, user_id, date, type, custom_type_label, duration_seconds, distance_meters, calories_burned, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       date = $3, type = $4, custom_type_label = $5, duration_seconds = $6,
       distance_meters = $7, calories_burned = $8, notes = $9, created_at = $10`,
    [
      c.id,
      res.locals.userId,
      c.date,
      c.type,
      c.customTypeLabel ?? null,
      c.durationSeconds,
      c.distanceMeters,
      c.caloriesBurned,
      c.notes ?? null,
      c.createdAt,
    ],
  )
  res.json({ ok: true })
})

router.delete('/cardio/:id', async (req, res) => {
  await pool.query('DELETE FROM cardio_sessions WHERE id = $1 AND user_id = $2', [req.params.id, res.locals.userId])
  res.json({ ok: true })
})

// --- Shape assessments ---

function rowToShape(row: Record<string, unknown>): ShapeAssessment {
  return {
    id: row.id as string,
    date: (row.date as Date).toISOString().split('T')[0],
    weightKg: Number(row.weight_kg),
    photos: row.photos as ShapeAssessment['photos'],
    aiAnalysis: (row.ai_analysis as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  }
}

router.get('/shape', async (req, res) => {
  const result = await pool.query('SELECT * FROM shape_assessments WHERE user_id = $1 ORDER BY date DESC, created_at DESC', [res.locals.userId])
  res.json({ shapeAssessments: result.rows.map(rowToShape) })
})

router.put('/shape/:id', async (req, res) => {
  const s = req.body as ShapeAssessment
  await pool.query(
    `INSERT INTO shape_assessments (id, user_id, date, weight_kg, photos, ai_analysis, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       date = $3, weight_kg = $4, photos = $5, ai_analysis = $6, created_at = $7`,
    [
      s.id,
      res.locals.userId,
      s.date,
      s.weightKg,
      JSON.stringify(s.photos),
      s.aiAnalysis ?? null,
      s.createdAt,
    ],
  )
  res.json({ ok: true })
})

router.delete('/shape/:id', async (req, res) => {
  await pool.query('DELETE FROM shape_assessments WHERE id = $1 AND user_id = $2', [req.params.id, res.locals.userId])
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
  const result = await pool.query('SELECT * FROM analyses WHERE user_id = $1 ORDER BY generated_at DESC', [res.locals.userId])
  res.json({ analyses: result.rows.map(rowToAnalysis) })
})

router.put('/analyses/:id', async (req, res) => {
  const analysis = req.body as WeeklyAnalysis
  await pool.query(
    `INSERT INTO analyses (id, user_id, generated_at, week_start, week_end, summary, volume_by_muscle, adjustments, applied)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       generated_at = $3, week_start = $4, week_end = $5, summary = $6,
       volume_by_muscle = $7, adjustments = $8, applied = $9`,
    [
      analysis.id,
      res.locals.userId,
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
  await pool.query('DELETE FROM analyses WHERE id = $1 AND user_id = $2', [req.params.id, res.locals.userId])
  res.json({ ok: true })
})

// --- Push notifications (rest timer done, works even with the screen off) ---

router.post('/push/subscribe', async (req, res) => {
  const subscription = req.body as { endpoint: string }
  if (!subscription?.endpoint) {
    res.status(400).json({ error: 'assinatura inválida' })
    return
  }
  await pool.query(
    `INSERT INTO push_subscriptions (endpoint, user_id, subscription, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, subscription = $3`,
    [subscription.endpoint, res.locals.userId, JSON.stringify(subscription)],
  )
  res.json({ ok: true })
})

router.post('/push/unsubscribe', async (req, res) => {
  const { endpoint } = req.body as { endpoint: string }
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, res.locals.userId])
  res.json({ ok: true })
})

router.post('/push/schedule-rest-done', (req, res) => {
  const { scheduleId, seconds } = req.body as { scheduleId: string; seconds: number }
  if (!scheduleId || !seconds || seconds <= 0) {
    res.status(400).json({ error: 'scheduleId e seconds são obrigatórios' })
    return
  }
  scheduleRestDoneNotification(scheduleId, seconds, res.locals.userId as number)
  res.json({ ok: true })
})

router.post('/push/cancel-scheduled', (req, res) => {
  const { scheduleId } = req.body as { scheduleId: string }
  if (scheduleId) cancelScheduledNotification(scheduleId)
  res.json({ ok: true })
})

// --- Export / Import ---

router.get('/export', async (req, res) => {
  const userId = res.locals.userId
  const [sessionsResult, cardioResult, analysesResult, shapeResult, planResult, currentWorkoutResult] = await Promise.all([
    pool.query('SELECT * FROM sessions WHERE user_id = $1 ORDER BY started_at ASC', [userId]),
    pool.query('SELECT * FROM cardio_sessions WHERE user_id = $1 ORDER BY date ASC, created_at ASC', [userId]),
    pool.query('SELECT * FROM analyses WHERE user_id = $1 ORDER BY generated_at DESC', [userId]),
    pool.query('SELECT * FROM shape_assessments WHERE user_id = $1 ORDER BY date ASC, created_at ASC', [userId]),
    pool.query("SELECT value FROM app_state WHERE user_id = $1 AND key = 'plan'", [userId]),
    pool.query("SELECT value FROM app_state WHERE user_id = $1 AND key = 'current_workout_id'", [userId]),
  ])

  res.json({
    sessions: sessionsResult.rows.map(rowToSession),
    cardioSessions: cardioResult.rows.map(rowToCardio),
    analyses: analysesResult.rows.map(rowToAnalysis),
    shapeAssessments: shapeResult.rows.map(rowToShape),
    plan: planResult.rows[0]?.value ?? null,
    currentWorkoutId: currentWorkoutResult.rows[0]?.value ?? null,
    exportedAt: new Date().toISOString(),
  })
})

router.post('/import', async (req, res) => {
  const userId = res.locals.userId
  const data = req.body as {
    sessions?: WorkoutSession[]
    cardioSessions?: CardioSession[]
    analyses?: WeeklyAnalysis[]
    shapeAssessments?: ShapeAssessment[]
    plan?: WorkoutPlan
    currentWorkoutId?: string
  }

  let sessionsImported = 0
  let cardioImported = 0
  let analysesImported = 0
  let shapeImported = 0

  if (data.sessions) {
    for (const session of data.sessions) {
      await pool.query(
        `INSERT INTO sessions (id, user_id, date, workout_type, workout_label, started_at, finished_at, duration_seconds, ai_feedback, exercises, calories_burned)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           date = $3, workout_type = $4, workout_label = $5, started_at = $6,
           finished_at = $7, duration_seconds = $8, ai_feedback = $9, exercises = $10, calories_burned = $11`,
        [
          session.id,
          userId,
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
      sessionsImported++
    }
  }

  if (data.cardioSessions) {
    for (const c of data.cardioSessions) {
      await pool.query(
        `INSERT INTO cardio_sessions (id, user_id, date, type, custom_type_label, duration_seconds, distance_meters, calories_burned, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           date = $3, type = $4, custom_type_label = $5, duration_seconds = $6,
           distance_meters = $7, calories_burned = $8, notes = $9, created_at = $10`,
        [
          c.id,
          userId,
          c.date,
          c.type,
          c.customTypeLabel ?? null,
          c.durationSeconds,
          c.distanceMeters,
          c.caloriesBurned,
          c.notes ?? null,
          c.createdAt,
        ],
      )
      cardioImported++
    }
  }

  if (data.analyses) {
    for (const analysis of data.analyses) {
      await pool.query(
        `INSERT INTO analyses (id, user_id, generated_at, week_start, week_end, summary, volume_by_muscle, adjustments, applied)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           generated_at = $3, week_start = $4, week_end = $5, summary = $6,
           volume_by_muscle = $7, adjustments = $8, applied = $9`,
        [
          analysis.id,
          userId,
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

  if (data.shapeAssessments) {
    for (const s of data.shapeAssessments) {
      await pool.query(
        `INSERT INTO shape_assessments (id, user_id, date, weight_kg, photos, ai_analysis, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           date = $3, weight_kg = $4, photos = $5, ai_analysis = $6, created_at = $7`,
        [
          s.id,
          userId,
          s.date,
          s.weightKg,
          JSON.stringify(s.photos),
          s.aiAnalysis ?? null,
          s.createdAt,
        ],
      )
      shapeImported++
    }
  }

  if (data.plan) {
    await pool.query(
      "INSERT INTO app_state (user_id, key, value) VALUES ($1, 'plan', $2) ON CONFLICT (user_id, key) DO UPDATE SET value = $2",
      [userId, JSON.stringify(data.plan)],
    )
  }

  if (data.currentWorkoutId) {
    await pool.query(
      "INSERT INTO app_state (user_id, key, value) VALUES ($1, 'current_workout_id', $2) ON CONFLICT (user_id, key) DO UPDATE SET value = $2",
      [userId, JSON.stringify(data.currentWorkoutId)],
    )
  }

  res.json({ sessions: sessionsImported, cardio: cardioImported, analyses: analysesImported, shape: shapeImported })
})
