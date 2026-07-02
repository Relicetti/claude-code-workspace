import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
})

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      date DATE NOT NULL,
      workout_type TEXT NOT NULL,
      workout_label TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ,
      duration_seconds INTEGER,
      ai_feedback TEXT,
      exercises JSONB NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id UUID PRIMARY KEY,
      generated_at TIMESTAMPTZ NOT NULL,
      week_start TIMESTAMPTZ NOT NULL,
      week_end TIMESTAMPTZ NOT NULL,
      summary TEXT NOT NULL,
      volume_by_muscle JSONB NOT NULL DEFAULT '{}',
      adjustments JSONB NOT NULL DEFAULT '[]',
      applied JSONB NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );

    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS calories_burned INTEGER;
  `)
}
