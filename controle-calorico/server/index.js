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
} from './dataStore.js'
import { analyzePhoto, analyzeTextDescription } from './anthropic.js'

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
  '/api/log/:date',
  asyncHandler(async (req, res) => {
    res.json(await getLog(req.params.date))
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

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API rodando em http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Falha ao inicializar o banco de dados:', err)
    process.exit(1)
  })
