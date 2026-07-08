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

    CREATE TABLE IF NOT EXISTS cardio_sessions (
      id UUID PRIMARY KEY,
      date DATE NOT NULL,
      type TEXT NOT NULL,
      custom_type_label TEXT,
      duration_seconds INTEGER NOT NULL,
      distance_meters INTEGER,
      calories_burned INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shape_assessments (
      id UUID PRIMARY KEY,
      date DATE NOT NULL,
      weight_kg NUMERIC NOT NULL,
      photos JSONB NOT NULL,
      ai_analysis TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_plans (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      plan JSONB NOT NULL,
      current_workout_id TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
  `)
}
