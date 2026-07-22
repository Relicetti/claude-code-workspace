import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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
}

async function ensureDirs() {
  await fs.mkdir(LOGS_DIR, { recursive: true })
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

async function writeJSON(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
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
  const current = await getSettings()
  const merged = { ...current, ...settings }
  await writeJSON(SETTINGS_PATH, merged)
  return merged
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
  const entries = await getLog(date)
  entries.push(entry)
  await writeJSON(logPath(date), entries)
  return entries
}

export async function updateLogEntry(date, id, updates) {
  await ensureDirs()
  const entries = await getLog(date)
  const idx = entries.findIndex((e) => e.id === id)
  if (idx === -1) return null
  entries[idx] = { ...entries[idx], ...updates, id }
  await writeJSON(logPath(date), entries)
  return entries[idx]
}

export async function deleteLogEntry(date, id) {
  await ensureDirs()
  const entries = await getLog(date)
  const filtered = entries.filter((e) => e.id !== id)
  await writeJSON(logPath(date), filtered)
  return filtered
}

export async function clearLog(date) {
  await ensureDirs()
  await writeJSON(logPath(date), [])
  return []
}

export async function getFoodDb() {
  await ensureDirs()
  return readJSON(FOOD_DB_PATH, {})
}

export async function upsertFoodDbEntry(entry) {
  await ensureDirs()
  const db = await getFoodDb()
  const normalizedName = normalizeName(entry.name)
  db[normalizedName] = {
    normalizedName,
    name: entry.name,
    kcal: entry.kcal,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    updatedAt: Date.now(),
  }
  await writeJSON(FOOD_DB_PATH, db)
  return db[normalizedName]
}

export async function getRecentFoodDbEntries(limit = 40) {
  const db = await getFoodDb()
  return Object.values(db)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}
