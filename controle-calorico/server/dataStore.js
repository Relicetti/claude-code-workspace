import { query } from './db.js'

const DEFAULT_SETTINGS = {
  calorieGoal: 2000,
  proteinGoal: 150,
  carbGoal: 200,
  fatGoal: 65,
  caffeineGoal: 400,
  waterGoal: 2000,
  creatineGoal: 5,
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

function settingsRowToObject(row) {
  return {
    calorieGoal: row.calorie_goal,
    proteinGoal: row.protein_goal,
    carbGoal: row.carb_goal,
    fatGoal: row.fat_goal,
    caffeineGoal: row.caffeine_goal,
    waterGoal: row.water_goal,
    creatineGoal: row.creatine_goal,
  }
}

function logRowToEntry(row) {
  return {
    id: row.id,
    name: row.name,
    kcal: row.kcal,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    caffeine: row.caffeine,
    water: row.water,
    creatine: row.creatine,
    timestamp: Number(row.timestamp),
    mealGroup: row.meal_group,
  }
}

function foodDbRowToEntry(row) {
  return {
    normalizedName: row.normalized_name,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    kcal: row.kcal,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    caffeine: row.caffeine,
    water: row.water,
    creatine: row.creatine,
    updatedAt: Number(row.updated_at),
  }
}

export async function getSettings() {
  const { rows } = await query('SELECT * FROM settings WHERE id = 1')
  if (rows.length === 0) return { ...DEFAULT_SETTINGS }
  return settingsRowToObject(rows[0])
}

export async function saveSettings(settings) {
  const current = await getSettings()
  const merged = { ...current, ...settings }
  const { rows } = await query(
    `INSERT INTO settings (id, calorie_goal, protein_goal, carb_goal, fat_goal, caffeine_goal, water_goal, creatine_goal)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       calorie_goal = EXCLUDED.calorie_goal,
       protein_goal = EXCLUDED.protein_goal,
       carb_goal = EXCLUDED.carb_goal,
       fat_goal = EXCLUDED.fat_goal,
       caffeine_goal = EXCLUDED.caffeine_goal,
       water_goal = EXCLUDED.water_goal,
       creatine_goal = EXCLUDED.creatine_goal
     RETURNING *`,
    [
      merged.calorieGoal,
      merged.proteinGoal,
      merged.carbGoal,
      merged.fatGoal,
      merged.caffeineGoal,
      merged.waterGoal,
      merged.creatineGoal,
    ]
  )
  return settingsRowToObject(rows[0])
}

export async function getLog(date) {
  const { rows } = await query(
    'SELECT * FROM log_entries WHERE log_date = $1 ORDER BY "timestamp" ASC',
    [date]
  )
  return rows.map(logRowToEntry)
}

export async function getDailySummary(fromDate, toDate) {
  const { rows } = await query(
    `SELECT log_date,
            SUM(kcal) AS kcal,
            SUM(protein) AS protein,
            SUM(carbs) AS carbs,
            SUM(fat) AS fat
     FROM log_entries
     WHERE log_date >= $1 AND log_date <= $2
     GROUP BY log_date
     ORDER BY log_date ASC`,
    [fromDate, toDate]
  )
  return rows.map((row) => ({
    date: row.log_date,
    kcal: row.kcal,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
  }))
}

export async function addLogEntry(date, entry) {
  await query(
    `INSERT INTO log_entries (id, log_date, name, kcal, protein, carbs, fat, caffeine, water, creatine, "timestamp", meal_group)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      entry.id,
      date,
      entry.name,
      entry.kcal,
      entry.protein,
      entry.carbs,
      entry.fat,
      entry.caffeine,
      entry.water,
      entry.creatine,
      entry.timestamp,
      entry.mealGroup || null,
    ]
  )
  return getLog(date)
}

export async function updateLogEntry(date, id, updates) {
  const { rows: existingRows } = await query(
    'SELECT * FROM log_entries WHERE log_date = $1 AND id = $2',
    [date, id]
  )
  if (existingRows.length === 0) return null
  const merged = { ...logRowToEntry(existingRows[0]), ...updates, id }
  const { rows } = await query(
    `UPDATE log_entries SET
       name = $1, kcal = $2, protein = $3, carbs = $4, fat = $5,
       caffeine = $6, water = $7, creatine = $8, "timestamp" = $9, meal_group = $10
     WHERE log_date = $11 AND id = $12
     RETURNING *`,
    [
      merged.name,
      merged.kcal,
      merged.protein,
      merged.carbs,
      merged.fat,
      merged.caffeine,
      merged.water,
      merged.creatine,
      merged.timestamp,
      merged.mealGroup || null,
      date,
      id,
    ]
  )
  return logRowToEntry(rows[0])
}

export async function deleteLogEntry(date, id) {
  await query('DELETE FROM log_entries WHERE log_date = $1 AND id = $2', [date, id])
  return getLog(date)
}

export async function clearLog(date) {
  await query('DELETE FROM log_entries WHERE log_date = $1', [date])
  return []
}

export async function getFoodDb() {
  const { rows } = await query('SELECT * FROM food_db')
  const db = {}
  for (const row of rows) {
    db[row.normalized_name] = foodDbRowToEntry(row)
  }
  return db
}

export async function upsertFoodDbEntry(entry) {
  const normalizedName = normalizeName(entry.name)
  const updatedAt = Date.now()
  const { rows } = await query(
    `INSERT INTO food_db (normalized_name, name, quantity, unit, kcal, protein, carbs, fat, caffeine, water, creatine, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (normalized_name) DO UPDATE SET
       name = EXCLUDED.name,
       quantity = EXCLUDED.quantity,
       unit = EXCLUDED.unit,
       kcal = EXCLUDED.kcal,
       protein = EXCLUDED.protein,
       carbs = EXCLUDED.carbs,
       fat = EXCLUDED.fat,
       caffeine = EXCLUDED.caffeine,
       water = EXCLUDED.water,
       creatine = EXCLUDED.creatine,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      normalizedName,
      entry.name,
      entry.quantity || null,
      entry.unit || null,
      entry.kcal,
      entry.protein,
      entry.carbs,
      entry.fat,
      entry.caffeine || 0,
      entry.water || 0,
      entry.creatine || 0,
      updatedAt,
    ]
  )
  return foodDbRowToEntry(rows[0])
}

export async function getRecentFoodDbEntries(limit = 40) {
  const { rows } = await query('SELECT * FROM food_db ORDER BY updated_at DESC LIMIT $1', [limit])
  return rows.map(foodDbRowToEntry)
}
