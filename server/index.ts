import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import { migrate } from './db.js'
import { router } from './routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '../dist')

const app = express()
// Bumped from 5mb to fit shape-check photo uploads (3 compressed JPEGs as base64).
app.use(express.json({ limit: '20mb' }))
app.use(cookieParser())

app.use('/api', router)

app.use(express.static(DIST_DIR))
// Express 5's wildcard route syntax changed; a plain catch-all middleware
// avoids relying on path-to-regexp's new named-wildcard requirement.
app.use((req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'))
})

// Express 5 forwards rejected promises from async handlers here automatically.
// Avoid leaking stack traces/internals to the client.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'internal server error' })
})

const PORT = Number(process.env.PORT) || 3000

migrate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`)
    })
  })
  .catch(err => {
    console.error('Failed to run DB migration', err)
    process.exit(1)
  })
