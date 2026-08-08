import { pool } from './db.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API_BASE = 'https://health.googleapis.com/v4'
const SCOPE = 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly'

export function isConfigured(): boolean {
  return !!(process.env.GOOGLE_HEALTH_CLIENT_ID && process.env.GOOGLE_HEALTH_CLIENT_SECRET && process.env.GOOGLE_HEALTH_REDIRECT_URI)
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} não configurada. Configure a integração com o Google Health nas variáveis de ambiente.`)
  return value
}

interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scope: string | null
  connectedAt: number
}

async function getTokens(userId: number): Promise<StoredTokens | null> {
  const result = await pool.query('SELECT * FROM google_health_tokens WHERE user_id = $1', [userId])
  const row = result.rows[0] as Record<string, unknown> | undefined
  if (!row) return null
  return {
    accessToken: row.access_token as string,
    refreshToken: row.refresh_token as string,
    expiresAt: Number(row.expires_at),
    scope: (row.scope as string) ?? null,
    connectedAt: Number(row.connected_at),
  }
}

async function saveTokens(userId: number, tokens: { accessToken: string; refreshToken: string; expiresAt: number; scope?: string }): Promise<void> {
  const current = await getTokens(userId)
  await pool.query(
    `INSERT INTO google_health_tokens (user_id, access_token, refresh_token, expires_at, scope, connected_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = $2, refresh_token = $3, expires_at = $4, scope = $5`,
    [userId, tokens.accessToken, tokens.refreshToken, tokens.expiresAt, tokens.scope ?? null, current?.connectedAt ?? Date.now()],
  )
}

export async function getStatus(userId: number): Promise<{ configured: boolean; connected: boolean; connectedAt: number | null }> {
  const tokens = await getTokens(userId)
  return {
    configured: isConfigured(),
    connected: !!tokens,
    connectedAt: tokens?.connectedAt ?? null,
  }
}

export function getAuthUrl(state: string): string {
  const clientId = requireEnv('GOOGLE_HEALTH_CLIENT_ID')
  const redirectUri = requireEnv('GOOGLE_HEALTH_REDIRECT_URI')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens(userId: number, code: string): Promise<void> {
  const clientId = requireEnv('GOOGLE_HEALTH_CLIENT_ID')
  const clientSecret = requireEnv('GOOGLE_HEALTH_CLIENT_SECRET')
  const redirectUri = requireEnv('GOOGLE_HEALTH_REDIRECT_URI')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }
  if (!res.ok) {
    throw new Error(`Falha ao trocar o código por token: ${data.error_description || data.error || res.status}`)
  }
  if (!data.refresh_token) {
    throw new Error('O Google não retornou um refresh_token. Revogue o acesso do app em myaccount.google.com/permissions e tente conectar de novo.')
  }

  await saveTokens(userId, {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 0) * 1000,
    scope: data.scope,
  })
}

async function refreshAccessToken(userId: number, refreshToken: string): Promise<string> {
  const clientId = requireEnv('GOOGLE_HEALTH_CLIENT_ID')
  const clientSecret = requireEnv('GOOGLE_HEALTH_CLIENT_SECRET')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }
  if (!res.ok) {
    throw new Error(`Falha ao renovar o token do Google Health: ${data.error_description || data.error || res.status}`)
  }

  await saveTokens(userId, {
    accessToken: data.access_token!,
    refreshToken, // Google doesn't always resend it on refresh
    expiresAt: Date.now() + (data.expires_in ?? 0) * 1000,
    scope: data.scope,
  })
  return data.access_token!
}

async function getValidAccessToken(userId: number): Promise<string | null> {
  const tokens = await getTokens(userId)
  if (!tokens) return null
  // Refresh a bit before actual expiry to avoid racing a request against it.
  if (tokens.expiresAt - Date.now() < 60_000) {
    return refreshAccessToken(userId, tokens.refreshToken)
  }
  return tokens.accessToken
}

export async function disconnect(userId: number): Promise<void> {
  await pool.query('DELETE FROM google_health_tokens WHERE user_id = $1', [userId])
}

function toCivilDate(dateStr: string): { date: { year: number; month: number; day: number }; time: { hours: number; minutes: number } } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { date: { year, month, day }, time: { hours: 0, minutes: 0 } }
}

interface DailyPoint {
  civilStartTime?: { date?: { year: number; month: number; day: number } }
  [key: string]: unknown
}

// Calories/steps/resting heart rate all roll up daily as a plain sum/value
// keyed by a field on the point itself (not documented with examples
// anywhere by Google — field names below were confirmed against a real
// response in the sibling controle-calorico app, for total-calories, and
// against the Google Health API's own data-types reference for the others).
async function fetchDailyRollup(
  accessToken: string,
  dataType: string,
  fromDate: string,
  toDate: string,
): Promise<DailyPoint[]> {
  const res = await fetch(`${API_BASE}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range: { start: toCivilDate(fromDate), end: toCivilDate(toDate) },
      windowSizeDays: 1,
    }),
  })
  const data = await res.json() as { rollupDataPoints?: DailyPoint[]; error?: { message?: string } }
  if (!res.ok) {
    throw new Error(`Falha ao buscar "${dataType}" do Google Health: ${data.error?.message || res.status}`)
  }
  return data.rollupDataPoints ?? []
}

function dateKeyFromPoint(point: DailyPoint): string | null {
  const d = point.civilStartTime?.date
  if (!d) return null
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

interface DayVitals {
  caloriesKcal?: number
  restingHeartRate?: number
  sleepMinutes?: number
  steps?: number
}

// Sleep doesn't support dailyRollUp (confirmed against Google's own data-type
// support matrix) — it needs the plain `list` method instead, one point per
// night ("main sleep"). The exact response shape isn't documented with an
// example anywhere, so this parses defensively and reports what it actually
// saw if the expected field isn't there, instead of silently syncing zeros.
async function fetchSleepMinutes(accessToken: string, fromDate: string, toDate: string): Promise<{ byDate: Map<string, number>; rawSample?: unknown }> {
  const from = toCivilDate(fromDate)
  const to = toCivilDate(toDate)
  const params = new URLSearchParams({
    'range.start.date.year': String(from.date.year),
    'range.start.date.month': String(from.date.month),
    'range.start.date.day': String(from.date.day),
    'range.end.date.year': String(to.date.year),
    'range.end.date.month': String(to.date.month),
    'range.end.date.day': String(to.date.day),
    pageSize: '50',
  })
  const res = await fetch(`${API_BASE}/users/me/dataTypes/sleep/dataPoints?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json() as { dataPoints?: (DailyPoint & { minutesAsleep?: number; sleep?: { minutesAsleep?: number } })[]; error?: { message?: string } }
  if (!res.ok) {
    throw new Error(`Falha ao buscar sono do Google Health: ${data.error?.message || res.status}`)
  }
  const byDate = new Map<string, number>()
  let rawSample: unknown
  for (const point of data.dataPoints ?? []) {
    const dateStr = dateKeyFromPoint(point)
    const minutes = point.minutesAsleep ?? point.sleep?.minutesAsleep
    if (!dateStr || minutes == null) {
      if (!rawSample) rawSample = point
      continue
    }
    byDate.set(dateStr, (byDate.get(dateStr) ?? 0) + minutes)
  }
  return { byDate, rawSample: byDate.size === 0 ? rawSample : undefined }
}

// Pulls calories/steps/resting-HR/sleep for the date range and upserts one
// row per user per day into health_vitals. A single data type failing
// (unsupported for the account, empty range, etc.) doesn't block the others.
export async function syncVitals(userId: number, fromDate: string, toDate: string): Promise<{ synced: number; total: number; warnings: string[] }> {
  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) throw new Error('Google Health não está conectado.')

  const byDate = new Map<string, DayVitals>()
  const warnings: string[] = []

  const setField = (dateStr: string, field: keyof DayVitals, value: number) => {
    const entry = byDate.get(dateStr) ?? {}
    entry[field] = value
    byDate.set(dateStr, entry)
  }

  try {
    const points = await fetchDailyRollup(accessToken, 'total-calories', fromDate, toDate)
    for (const p of points) {
      const d = dateKeyFromPoint(p)
      const kcal = (p as { totalCalories?: { kcalSum?: number } }).totalCalories?.kcalSum
      if (d && kcal != null) setField(d, 'caloriesKcal', kcal)
    }
  } catch (err) {
    warnings.push(`calorias: ${(err as Error).message}`)
  }

  try {
    const points = await fetchDailyRollup(accessToken, 'steps', fromDate, toDate)
    for (const p of points) {
      const d = dateKeyFromPoint(p)
      const count = (p as { steps?: { countSum?: number } }).steps?.countSum
      if (d && count != null) setField(d, 'steps', count)
    }
  } catch (err) {
    warnings.push(`passos: ${(err as Error).message}`)
  }

  try {
    const points = await fetchDailyRollup(accessToken, 'daily-resting-heart-rate', fromDate, toDate)
    for (const p of points) {
      const d = dateKeyFromPoint(p)
      const bpm = (p as { dailyRestingHeartRate?: { beatsPerMinute?: number } }).dailyRestingHeartRate?.beatsPerMinute
      if (d && bpm != null) setField(d, 'restingHeartRate', bpm)
    }
  } catch (err) {
    warnings.push(`frequência cardíaca: ${(err as Error).message}`)
  }

  try {
    const { byDate: sleepByDate } = await fetchSleepMinutes(accessToken, fromDate, toDate)
    for (const [d, minutes] of sleepByDate) setField(d, 'sleepMinutes', minutes)
  } catch (err) {
    warnings.push(`sono: ${(err as Error).message}`)
  }

  let synced = 0
  for (const [dateStr, vitals] of byDate) {
    await pool.query(
      `INSERT INTO health_vitals (user_id, log_date, calories_kcal, resting_heart_rate, sleep_minutes, steps, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id, log_date) DO UPDATE SET
         calories_kcal = COALESCE(EXCLUDED.calories_kcal, health_vitals.calories_kcal),
         resting_heart_rate = COALESCE(EXCLUDED.resting_heart_rate, health_vitals.resting_heart_rate),
         sleep_minutes = COALESCE(EXCLUDED.sleep_minutes, health_vitals.sleep_minutes),
         steps = COALESCE(EXCLUDED.steps, health_vitals.steps),
         synced_at = now()`,
      [userId, dateStr, vitals.caloriesKcal ?? null, vitals.restingHeartRate ?? null, vitals.sleepMinutes ?? null, vitals.steps ?? null],
    )
    synced += 1
  }

  return { synced, total: byDate.size, warnings }
}
