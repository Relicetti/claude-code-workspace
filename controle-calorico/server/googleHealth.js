import {
  getGoogleHealthTokens,
  saveGoogleHealthTokens,
  clearGoogleHealthTokens,
  upsertHealthExpenditure,
} from './dataStore.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API_BASE = 'https://health.googleapis.com/v4'
const SCOPE = 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} nao configurada. Veja o guia de configuracao do Google Health.`)
  }
  return value
}

export function isConfigured() {
  return !!(process.env.GOOGLE_HEALTH_CLIENT_ID && process.env.GOOGLE_HEALTH_CLIENT_SECRET && process.env.GOOGLE_HEALTH_REDIRECT_URI)
}

export function getAuthUrl(state) {
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

export async function exchangeCodeForTokens(code) {
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
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Falha ao trocar o codigo por token: ${data.error_description || data.error || res.status}`)
  }
  if (!data.refresh_token) {
    throw new Error(
      'O Google nao retornou um refresh_token. Revogue o acesso do app em myaccount.google.com/permissions e tente conectar de novo.'
    )
  }

  await saveGoogleHealthTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  })
}

async function refreshAccessToken(refreshToken) {
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
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Falha ao renovar o token do Google Health: ${data.error_description || data.error || res.status}`)
  }

  const tokens = {
    accessToken: data.access_token,
    refreshToken: refreshToken, // Google doesn't always resend it on refresh
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  }
  await saveGoogleHealthTokens(tokens)
  return tokens.accessToken
}

async function getValidAccessToken() {
  const tokens = await getGoogleHealthTokens()
  if (!tokens) return null
  // Refresh a bit before actual expiry to avoid racing a request against it.
  if (tokens.expiresAt - Date.now() < 60_000) {
    return refreshAccessToken(tokens.refreshToken)
  }
  return tokens.accessToken
}

function toCivilDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { date: { year, month, day }, time: { hours: 0, minutes: 0 } }
}

// Fetches per-day total calorie expenditure (active + basal) for the given
// range and caches it locally. Google's API caps this data type at a 14-day
// range per request, matching the history window this app already uses.
export async function syncDailyExpenditure(fromDate, toDate) {
  const accessToken = await getValidAccessToken()
  if (!accessToken) {
    throw new Error('Google Health nao esta conectado.')
  }

  const res = await fetch(`${API_BASE}/users/me/dataTypes/total-calories/dataPoints:dailyRollUp`, {
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
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Falha ao buscar dados do Google Health: ${data.error?.message || res.status}`)
  }

  const points = data.rollupDataPoints || []
  let synced = 0
  for (const point of points) {
    const d = point.civilStartTime?.date
    const kcal = point.value?.totalCalories?.value ?? point.value?.totalCalories?.kcal
    if (!d || kcal == null) continue
    const dateStr = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
    await upsertHealthExpenditure(dateStr, kcal)
    synced += 1
  }
  const result = { synced, total: points.length }
  // Diagnostic aid: if nothing could be extracted, surface the raw shape of
  // the first point so a schema mismatch (like Google renaming a field) is
  // visible in the response instead of silently syncing zero days.
  if (synced === 0 && points.length > 0) {
    result.sample = points[0]
  }
  return result
}

export async function disconnect() {
  await clearGoogleHealthTokens()
}
