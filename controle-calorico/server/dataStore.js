import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
const LOGS_DIR = path.join(DATA_DIR, 'logs')
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json')
const FOOD_DB_PATH = path.join(DATA_DIR, 'food-db.json')

const DEFAULT_SETTINGS = {
  calorieGoal: 2000,
  proteinGoal: 150,
  carbGoal: 200,
  fatGoal: 65,
  caffeineGoal: 400,
  waterGoal: 2000,
  creatineGoal: 5,
}

async function ensureDirs() {
  await fs.mkdir(LOGS_DIR, { recursive: true })
}

// Serializes read-modify-write cycles per file path so concurrent requests
// (e.g. rapid taps on the quick-add buttons) can't interleave and clobber
// each other or race with a write that's still in progress.
const locks = new Map()

function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve()
  const run = previous.catch(() => {}).then(fn)
  locks.set(
    key,
    run.catch(() => {})
  )
  return run
}

async function readJSON(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return fallback
    throw err
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// On Windows, renaming onto an existing file can transiently fail with EPERM/EBUSY
// while another process (antivirus, OneDrive sync, since this folder lives under
// D:\OneDrive\...) briefly holds a handle on it. Retry a few times before giving up.
async function renameWithRetry(from, to, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.rename(from, to)
      return
    } catch (err) {
      const transient = err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES'
      if (!transient || i === attempts - 1) throw err
      await sleep(20 * (i + 1))
    }
  }
}

// Writes via a temp file + rename so a reader never observes a
// partially-written (truncated / corrupt) file.
async function writeJSON(filePath, data) {
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  await renameWithRetry(tmpPath, filePath)
}

const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

export function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export async function getSettings() {
  await ensureDirs()
  return readJSON(SETTINGS_PATH, DEFAULT_SETTINGS)
}

export async function saveSettings(settings) {
  await ensureDirs()
  return withLock(SETTINGS_PATH, async () => {
    const current = await readJSON(SETTINGS_PATH, DEFAULT_SETTINGS)
    const merged = { ...current, ...settings }
    await writeJSON(SETTINGS_PATH, merged)
    return merged
  })
}

function logPath(date) {
  return path.join(LOGS_DIR, `${date}.json`)
}

export async function getLog(date) {
  await ensureDirs()
  return readJSON(logPath(date), [])
}

export async function addLogEntry(date, entry) {
  await ensureDirs()
  return withLock(logPath(date), async () => {
    const entries = await readJSON(logPath(date), [])
    entries.push(entry)
    await writeJSON(logPath(date), entries)
    return entries
  })
}

export async function updateLogEntry(date, id, updates) {
  await ensureDirs()
  return withLock(logPath(date), async () => {
    const entries = await readJSON(logPath(date), [])
    const idx = entries.findIndex((e) => e.id === id)
    if (idx === -1) return null
    entries[idx] = { ...entries[idx], ...updates, id }
    await writeJSON(logPath(date), entries)
    return entries[idx]
  })
}

export async function deleteLogEntry(date, id) {
  await ensureDirs()
  return withLock(logPath(date), async () => {
    const entries = await readJSON(logPath(date), [])
    const filtered = entries.filter((e) => e.id !== id)
    await writeJSON(logPath(date), filtered)
    return filtered
  })
}

export async function clearLog(date) {
  await ensureDirs()
  return withLock(logPath(date), async () => {
    await writeJSON(logPath(date), [])
    return []
  })
}

export async function getFoodDb() {
  await ensureDirs()
  return readJSON(FOOD_DB_PATH, {})
}

export async function upsertFoodDbEntry(entry) {
  await ensureDirs()
  return withLock(FOOD_DB_PATH, async () => {
    const db = await readJSON(FOOD_DB_PATH, {})
    const normalizedName = normalizeName(entry.name)
    db[normalizedName] = {
      normalizedName,
      name: entry.name,
      kcal: entry.kcal,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      caffeine: entry.caffeine || 0,
      water: entry.water || 0,
      creatine: entry.creatine || 0,
      updatedAt: Date.now(),
    }
    await writeJSON(FOOD_DB_PATH, db)
    return db[normalizedName]
  })
}

export async function getRecentFoodDbEntries(limit = 40) {
  const db = await getFoodDb()
  return Object.values(db)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}
