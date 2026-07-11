import webpush from 'web-push'
import { pool } from './db.js'

const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:noreply@treino-ia.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

interface PushPayload {
  title: string
  body: string
}

async function sendToUserSubscriptions(userId: number, payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return

  const result = await pool.query('SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = $1', [userId])
  await Promise.all(
    result.rows.map(async row => {
      try {
        await webpush.sendNotification(row.subscription, JSON.stringify(payload))
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        // 404/410 means the subscription is gone (uninstalled, permission revoked) — clean it up.
        if (statusCode === 404 || statusCode === 410) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]).catch(() => {})
        } else {
          console.error('push send failed', err)
        }
      }
    }),
  )
}

// In-memory scheduling is fine here: rest timers are a couple minutes at
// most, and losing a scheduled notification on a redeploy mid-rest is an
// acceptable edge case for this app's scale.
const scheduled = new Map<string, ReturnType<typeof setTimeout>>()

export function scheduleRestDoneNotification(scheduleId: string, seconds: number, userId: number): void {
  cancelScheduledNotification(scheduleId)
  const timeout = setTimeout(() => {
    scheduled.delete(scheduleId)
    sendToUserSubscriptions(userId, { title: 'Descanso acabou!', body: 'Hora da próxima série 💪' }).catch(console.error)
  }, seconds * 1000)
  scheduled.set(scheduleId, timeout)
}

export function cancelScheduledNotification(scheduleId: string): void {
  const existing = scheduled.get(scheduleId)
  if (existing) {
    clearTimeout(existing)
    scheduled.delete(scheduleId)
  }
}
