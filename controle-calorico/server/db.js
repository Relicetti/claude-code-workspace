import pg from 'pg'

const { Pool } = pg

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    'DATABASE_URL nao configurada. Adicione o addon Postgres no Railway (ou aponte DATABASE_URL pra um Postgres local em dev).'
  )
}

// Railway's public/proxy connection requires TLS but uses a cert the default
// CA bundle won't validate; the internal network connection doesn't need TLS
// at all. localhost (local dev) never needs it either.
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString)

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

export async function query(text, params) {
  return pool.query(text, params)
}

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      calorie_goal DOUBLE PRECISION NOT NULL DEFAULT 2000,
      protein_goal DOUBLE PRECISION NOT NULL DEFAULT 150,
      carb_goal DOUBLE PRECISION NOT NULL DEFAULT 200,
      fat_goal DOUBLE PRECISION NOT NULL DEFAULT 65,
      caffeine_goal DOUBLE PRECISION NOT NULL DEFAULT 400,
      water_goal DOUBLE PRECISION NOT NULL DEFAULT 2000,
      creatine_goal DOUBLE PRECISION NOT NULL DEFAULT 5,
      CONSTRAINT settings_single_row CHECK (id = 1)
    );

    CREATE TABLE IF NOT EXISTS log_entries (
      id UUID PRIMARY KEY,
      log_date TEXT NOT NULL,
      name TEXT NOT NULL,
      kcal DOUBLE PRECISION NOT NULL DEFAULT 0,
      protein DOUBLE PRECISION NOT NULL DEFAULT 0,
      carbs DOUBLE PRECISION NOT NULL DEFAULT 0,
      fat DOUBLE PRECISION NOT NULL DEFAULT 0,
      caffeine DOUBLE PRECISION NOT NULL DEFAULT 0,
      water DOUBLE PRECISION NOT NULL DEFAULT 0,
      creatine DOUBLE PRECISION NOT NULL DEFAULT 0,
      "timestamp" BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_log_entries_log_date ON log_entries (log_date);

    CREATE TABLE IF NOT EXISTS food_db (
      normalized_name TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kcal DOUBLE PRECISION NOT NULL DEFAULT 0,
      protein DOUBLE PRECISION NOT NULL DEFAULT 0,
      carbs DOUBLE PRECISION NOT NULL DEFAULT 0,
      fat DOUBLE PRECISION NOT NULL DEFAULT 0,
      caffeine DOUBLE PRECISION NOT NULL DEFAULT 0,
      water DOUBLE PRECISION NOT NULL DEFAULT 0,
      creatine DOUBLE PRECISION NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL
    );
  `)
}
