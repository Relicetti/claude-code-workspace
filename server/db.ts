import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
})

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

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

    -- Multi-user support: each table gets a user_id so accounts are fully
    -- isolated. Nullable at the schema level (existing rows predate this and
    -- get backfilled by server/scripts/createUser.ts, run once per account);
    -- application code always writes/filters by user_id going forward.
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
    ALTER TABLE analyses ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
    ALTER TABLE cardio_sessions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
    ALTER TABLE shape_assessments ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
    ALTER TABLE saved_plans ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);

    -- app_state was keyed by "key" alone (one row per key, shared globally);
    -- now keyed by (user_id, key) so each account has its own plan/current
    -- workout/etc. A unique index (rather than a NOT NULL composite PK)
    -- tolerates the transient NULL user_id on pre-existing rows.
    ALTER TABLE app_state ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
    ALTER TABLE app_state DROP CONSTRAINT IF EXISTS app_state_pkey;
    CREATE UNIQUE INDEX IF NOT EXISTS app_state_user_key_idx ON app_state(user_id, key);
  `)
}
