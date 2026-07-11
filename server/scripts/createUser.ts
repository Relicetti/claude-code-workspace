import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool, migrate } from '../db.js'

// Tables that got a user_id column added when this app became multi-user.
// Rows created before that migration have a NULL user_id; the very first
// account created inherits all of them, so existing data isn't orphaned.
const USER_SCOPED_TABLES = [
  'sessions',
  'analyses',
  'app_state',
  'cardio_sessions',
  'shape_assessments',
  'saved_plans',
  'push_subscriptions',
]

async function main() {
  const [username, password] = process.argv.slice(2)
  if (!username || !password) {
    console.error('uso: npx tsx server/scripts/createUser.ts <username> <senha>')
    process.exit(1)
  }

  await migrate()

  const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM users')
  const isFirstUser = Number(countRows[0].count) === 0

  const passwordHash = await bcrypt.hash(password, 10)
  const { rows } = await pool.query(
    'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id',
    [username, passwordHash, isFirstUser],
  )
  const userId = rows[0].id as number
  console.log(`Usuário "${username}" criado (id ${userId}).`)

  if (isFirstUser) {
    console.log('Primeiro usuário da base — virou admin e herdou os dados existentes...')
    for (const table of USER_SCOPED_TABLES) {
      const result = await pool.query(`UPDATE ${table} SET user_id = $1 WHERE user_id IS NULL`, [userId])
      console.log(`  ${table}: ${result.rowCount} linha(s) migrada(s)`)
    }
  }

  await pool.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
