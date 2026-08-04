import { query } from './db.js'
import { DAY_TYPE_BY_KEY, DEFAULT_DAY_TYPE } from './dayTypes.js'

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

function dayTypeRowToEntry(date, row) {
  if (!row) {
    const preset = DAY_TYPE_BY_KEY[DEFAULT_DAY_TYPE]
    return {
      date,
      dayType: DEFAULT_DAY_TYPE,
      calorieGoal: preset.calorieGoal,
      proteinGoal: preset.proteinGoal,
      carbGoal: preset.carbGoal,
      fatGoal: preset.fatGoal,
      expenditure: preset.expenditure,
      extraExpenditure: 0,
    }
  }
  // Rows saved before the expenditure column existed have it as null;
  // fall back to the preset's current value so old days still show a number.
  const fallbackPreset = DAY_TYPE_BY_KEY[row.day_type]
  return {
    date,
    dayType: row.day_type,
    calorieGoal: row.calorie_goal,
    proteinGoal: row.protein_goal,
    carbGoal: row.carb_goal,
    fatGoal: row.fat_goal,
    expenditure: row.expenditure ?? fallbackPreset?.expenditure ?? null,
    extraExpenditure: row.extra_expenditure || 0,
  }
}

// `expenditure` stays the predicted/estimated value (from the day-type preset
// or manual pick) untouched. When Google Health has real synced data for a
// date, it's attached separately as `realExpenditure` so the UI can show
// predicted vs. realized side by side instead of one overwriting the other.
function attachRealExpenditure(entry, realKcal) {
  return { ...entry, realExpenditure: realKcal ?? null }
}

export async function getHealthExpenditureInRange(fromDate, toDate) {
  const { rows } = await query(
    'SELECT log_date, kcal FROM health_expenditure WHERE log_date >= $1 AND log_date <= $2',
    [fromDate, toDate]
  )
  return new Map(rows.map((r) => [r.log_date, r.kcal]))
}

export async function upsertHealthExpenditure(date, kcal) {
  await query(
    `INSERT INTO health_expenditure (log_date, kcal, synced_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (log_date) DO UPDATE SET kcal = EXCLUDED.kcal, synced_at = EXCLUDED.synced_at`,
    [date, kcal, Date.now()]
  )
}

export async function getGoogleHealthTokens() {
  const { rows } = await query('SELECT * FROM google_health_tokens WHERE id = 1')
  if (rows.length === 0) return null
  return {
    accessToken: rows[0].access_token,
    refreshToken: rows[0].refresh_token,
    expiresAt: Number(rows[0].expires_at),
    scope: rows[0].scope,
    connectedAt: Number(rows[0].connected_at),
  }
}

export async function saveGoogleHealthTokens(tokens) {
  const current = await getGoogleHealthTokens()
  await query(
    `INSERT INTO google_health_tokens (id, access_token, refresh_token, expires_at, scope, connected_at)
     VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at,
       scope = EXCLUDED.scope`,
    [tokens.accessToken, tokens.refreshToken, tokens.expiresAt, tokens.scope || null, current?.connectedAt || Date.now()]
  )
}

export async function clearGoogleHealthTokens() {
  await query('DELETE FROM google_health_tokens WHERE id = 1')
}

export async function getDayType(date) {
  const { rows } = await query('SELECT * FROM day_activity WHERE log_date = $1', [date])
  const entry = dayTypeRowToEntry(date, rows[0])
  const realMap = await getHealthExpenditureInRange(date, date)
  return attachRealExpenditure(entry, realMap.get(date))
}

export async function setDayType(date, dayType) {
  const preset = DAY_TYPE_BY_KEY[dayType]
  if (!preset) throw new Error('Tipo de dia invalido')
  await query(
    `INSERT INTO day_activity (log_date, day_type, calorie_goal, protein_goal, carb_goal, fat_goal, expenditure, extra_expenditure)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
     ON CONFLICT (log_date) DO UPDATE SET
       day_type = EXCLUDED.day_type,
       calorie_goal = EXCLUDED.calorie_goal,
       protein_goal = EXCLUDED.protein_goal,
       carb_goal = EXCLUDED.carb_goal,
       fat_goal = EXCLUDED.fat_goal,
       expenditure = EXCLUDED.expenditure`,
    [date, dayType, preset.calorieGoal, preset.proteinGoal, preset.carbGoal, preset.fatGoal, preset.expenditure]
  )
  return getDayType(date)
}

export async function setExtraExpenditure(date, extra) {
  const current = await getDayType(date)
  await query(
    `INSERT INTO day_activity (log_date, day_type, calorie_goal, protein_goal, carb_goal, fat_goal, expenditure, extra_expenditure)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (log_date) DO UPDATE SET extra_expenditure = EXCLUDED.extra_expenditure`,
    [
      date,
      current.dayType,
      current.calorieGoal,
      current.proteinGoal,
      current.carbGoal,
      current.fatGoal,
      current.expenditure,
      extra,
    ]
  )
  return getDayType(date)
}

export async function getDayTypesInRange(fromDate, toDate) {
  const { rows } = await query('SELECT * FROM day_activity WHERE log_date >= $1 AND log_date <= $2', [fromDate, toDate])
  const byDate = new Map(rows.map((row) => [row.log_date, row]))
  const realMap = await getHealthExpenditureInRange(fromDate, toDate)
  // Union of dates the user explicitly set a day type for AND dates with real
  // synced data, so a day with Fitbit data still shows the true expenditure
  // even if the user never touched the day-type selector that day.
  const allDates = new Set([...byDate.keys(), ...realMap.keys()])
  return Array.from(allDates)
    .sort()
    .map((date) => attachRealExpenditure(dayTypeRowToEntry(date, byDate.get(date)), realMap.get(date)))
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
