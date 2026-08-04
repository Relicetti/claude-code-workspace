import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { initSchema } from './db.js'
import {
  getSettings,
  saveSettings,
  getLog,
  addLogEntry,
  updateLogEntry,
  deleteLogEntry,
  clearLog,
  upsertFoodDbEntry,
  getDailySummary,
  getDayType,
  setDayType,
  setExtraExpenditure,
  getDayTypesInRange,
  getGoogleHealthTokens,
} from './dataStore.js'
import { analyzePhoto, analyzeTextDescription } from './anthropic.js'
import { DAY_TYPES } from './dayTypes.js'
import * as googleHealth from './googleHealth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
// In production (single combined process, e.g. Railway) honor the platform-assigned PORT.
// In local dev (separate Vite + API processes) stick to API_PORT so an ambient PORT
// meant for the Vite dev server doesn't make the API bind to the same port.
const PORT = process.env.NODE_ENV === 'production' ? process.env.PORT || 3001 : process.env.API_PORT || 3001

// A route handler throwing/rejecting must never take the whole process down —
// route it to Express's error handler instead of crashing the server.
function asyncHandler(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

app.use(cors())
app.use(express.json({ limit: '15mb' }))

app.get(
  '/api/settings',
  asyncHandler(async (req, res) => {
    res.json(await getSettings())
  })
)

app.put(
  '/api/settings',
  asyncHandler(async (req, res) => {
    res.json(await saveSettings(req.body))
  })
)

app.get(
  '/api/log/summary',
  asyncHandler(async (req, res) => {
    const { from, to } = req.query
    if (!from || !to) {
      return res.status(400).json({ error: 'from e to sao obrigatorios' })
    }
    res.json(await getDailySummary(from, to))
  })
)

app.get(
  '/api/log/:date',
  asyncHandler(async (req, res) => {
    res.json(await getLog(req.params.date))
  })
)

app.get('/api/day-types', (req, res) => {
  res.json(DAY_TYPES)
})

app.get(
  '/api/day-type/summary',
  asyncHandler(async (req, res) => {
    const { from, to } = req.query
    if (!from || !to) {
      return res.status(400).json({ error: 'from e to sao obrigatorios' })
    }
    res.json(await getDayTypesInRange(from, to))
  })
)

app.get(
  '/api/day-type/:date',
  asyncHandler(async (req, res) => {
    res.json(await getDayType(req.params.date))
  })
)

app.put(
  '/api/day-type/:date',
  asyncHandler(async (req, res) => {
    if (!DAY_TYPES.some((d) => d.key === req.body.dayType)) {
      return res.status(400).json({ error: 'Tipo de dia invalido' })
    }
    res.json(await setDayType(req.params.date, req.body.dayType))
  })
)

app.put(
  '/api/day-type/:date/extra',
  asyncHandler(async (req, res) => {
    const extra = Number(req.body.extra) || 0
    res.json(await setExtraExpenditure(req.params.date, extra))
  })
)

// A single-process personal app doesn't need a session store — an in-memory
// nonce is enough to check the OAuth callback's `state` matches a request we
// actually issued.
let pendingOAuthState = null

app.get(
  '/api/health-connect/status',
  asyncHandler(async (req, res) => {
    const tokens = await getGoogleHealthTokens()
    res.json({
      configured: googleHealth.isConfigured(),
      connected: !!tokens,
      connectedAt: tokens?.connectedAt || null,
    })
  })
)

app.get('/api/health-connect/auth-url', (req, res) => {
  try {
    pendingOAuthState = crypto.randomUUID()
    res.json({ url: googleHealth.getAuthUrl(pendingOAuthState) })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.get(
  '/api/health-connect/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query
    if (error) {
      return res.status(400).send(`Autorizacao negada pelo Google: ${error}`)
    }
    if (!code || !state || state !== pendingOAuthState) {
      return res.status(400).send('Estado invalido. Tente conectar novamente pelo app.')
    }
    pendingOAuthState = null
    await googleHealth.exchangeCodeForTokens(code)
    res.redirect('/')
  })
)

app.post(
  '/api/health-connect/disconnect',
  asyncHandler(async (req, res) => {
    await googleHealth.disconnect()
    res.json({ ok: true })
  })
)

app.post(
  '/api/health-connect/sync',
  asyncHandler(async (req, res) => {
    const { from, to } = req.body
    if (!from || !to) {
      return res.status(400).json({ error: 'from e to sao obrigatorios' })
    }
    res.json(await googleHealth.syncDailyExpenditure(from, to))
  })
)

app.post(
  '/api/log/:date',
  asyncHandler(async (req, res) => {
    const entry = {
      id: crypto.randomUUID(),
      name: req.body.name,
      kcal: Number(req.body.kcal) || 0,
      protein: Number(req.body.protein) || 0,
      carbs: Number(req.body.carbs) || 0,
      fat: Number(req.body.fat) || 0,
      caffeine: Number(req.body.caffeine) || 0,
      water: Number(req.body.water) || 0,
      creatine: Number(req.body.creatine) || 0,
      timestamp: Date.now(),
      mealGroup: req.body.mealGroup || null,
    }
    const entries = await addLogEntry(req.params.date, entry)
    await upsertFoodDbEntry(entry)
    res.json(entries)
  })
)

app.put(
  '/api/log/:date/:id',
  asyncHandler(async (req, res) => {
    const updated = await updateLogEntry(req.params.date, req.params.id, req.body)
    if (!updated) return res.status(404).json({ error: 'Entrada nao encontrada' })
    await upsertFoodDbEntry(updated)
    res.json(updated)
  })
)

app.delete(
  '/api/log/:date/:id',
  asyncHandler(async (req, res) => {
    res.json(await deleteLogEntry(req.params.date, req.params.id))
  })
)

app.delete(
  '/api/log/:date',
  asyncHandler(async (req, res) => {
    res.json(await clearLog(req.params.date))
  })
)

app.post(
  '/api/analyze-photo',
  asyncHandler(async (req, res) => {
    const { imageBase64, mediaType } = req.body
    if (!imageBase64 || !mediaType) {
      return res.status(400).json({ error: 'imageBase64 e mediaType sao obrigatorios' })
    }
    const items = await analyzePhoto({ imageBase64, mediaType })
    res.json({ items })
  })
)

app.post(
  '/api/analyze-text',
  asyncHandler(async (req, res) => {
    const { description } = req.body
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'description e obrigatorio' })
    }
    const items = await analyzeTextDescription({ description })
    res.json({ items })
  })
)

const distPath = path.join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// Final error handler: any route error lands here as a JSON 500 instead of
// crashing the process or hanging the request.
app.use((err, req, res, next) => {
  console.error(err)
  if (res.headersSent) return next(err)
  res.status(500).json({ error: err.message || 'Erro interno do servidor' })
})

// Last-resort safety net: log unexpected errors instead of letting the
// process die and taking every in-flight request down with it.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})

// The app's dates are all in the user's local calendar (Brasilia time), but
// Railway runs the server in UTC — computing "today" naively would roll the
// day over ~3h early and sync an unfinished day. Format "now" directly in
// the target timezone instead of doing manual offset arithmetic (also
// sidesteps DST, which Brazil doesn't observe anyway).
const USER_TIMEZONE = 'America/Sao_Paulo'
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: USER_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function localDateKey(date) {
  return dateFormatter.format(date)
}

let lastAutoSyncDate = null

// Runs shortly after the user's local midnight (checked periodically, since
// a precise cron isn't needed) so "yesterday" is fully closed out before we
// pull it — syncing mid-day would only capture a partial day's expenditure.
async function runAutoSyncIfDue() {
  if (!googleHealth.isConfigured()) return
  const today = localDateKey(new Date())
  if (today === lastAutoSyncDate) return

  const tokens = await getGoogleHealthTokens()
  if (!tokens) return

  const fromDate = localDateKey(new Date(Date.now() - 13 * 24 * 60 * 60 * 1000))
  try {
    const result = await googleHealth.syncDailyExpenditure(fromDate, today)
    console.log(`Auto-sync Google Health: ${result.synced}/${result.total} dias`)
    lastAutoSyncDate = today
  } catch (err) {
    console.error('Falha no auto-sync do Google Health:', err.message)
  }
}

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API rodando em http://localhost:${PORT}`)
    })
    runAutoSyncIfDue()
    setInterval(runAutoSyncIfDue, 15 * 60 * 1000)
  })
  .catch((err) => {
    console.error('Falha ao inicializar o banco de dados:', err)
    process.exit(1)
  })
