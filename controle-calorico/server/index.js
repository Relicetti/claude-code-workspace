import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
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
import { analyzePhoto } from './anthropic.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || process.env.API_PORT || 3001

app.use(cors())
app.use(express.json({ limit: '15mb' }))

app.get('/api/settings', async (req, res) => {
  res.json(await getSettings())
})

app.put('/api/settings', async (req, res) => {
  res.json(await saveSettings(req.body))
})

app.get('/api/log/:date', async (req, res) => {
  res.json(await getLog(req.params.date))
})

app.post('/api/log/:date', async (req, res) => {
  const entry = {
    id: crypto.randomUUID(),
    name: req.body.name,
    kcal: Number(req.body.kcal) || 0,
    protein: Number(req.body.protein) || 0,
    carbs: Number(req.body.carbs) || 0,
    fat: Number(req.body.fat) || 0,
    timestamp: Date.now(),
  }
  const entries = await addLogEntry(req.params.date, entry)
  await upsertFoodDbEntry(entry)
  res.json(entries)
})

app.put('/api/log/:date/:id', async (req, res) => {
  const updated = await updateLogEntry(req.params.date, req.params.id, req.body)
  if (!updated) return res.status(404).json({ error: 'Entrada nao encontrada' })
  await upsertFoodDbEntry(updated)
  res.json(updated)
})

app.delete('/api/log/:date/:id', async (req, res) => {
  res.json(await deleteLogEntry(req.params.date, req.params.id))
})

app.delete('/api/log/:date', async (req, res) => {
  res.json(await clearLog(req.params.date))
})

app.post('/api/analyze-photo', async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body
    if (!imageBase64 || !mediaType) {
      return res.status(400).json({ error: 'imageBase64 e mediaType sao obrigatorios' })
    }
    const items = await analyzePhoto({ imageBase64, mediaType })
    res.json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Falha ao analisar a foto' })
  }
})

const distPath = path.join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`)
})
