const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID_PUBLIC_KEY
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

// Requests permission and registers a push subscription with the backend.
// Must be called from a user gesture (button click) — browsers reject a
// permission prompt triggered any other way.
export async function enablePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
    })
  }
  await fetch('/api/push/subscribe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  })
  return true
}

// Asks the server to send a push notification in `seconds` — arrives even if
// this tab gets backgrounded/throttled or the screen turns off, unlike the
// in-page timer/beep which only catches up once the app is foregrounded again.
export function scheduleRestDoneNotification(scheduleId: string, seconds: number): void {
  if (Notification.permission !== 'granted') return
  fetch('/api/push/schedule-rest-done', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduleId, seconds }),
  }).catch(() => {})
}

export function cancelRestDoneNotification(scheduleId: string): void {
  if (Notification.permission !== 'granted') return
  fetch('/api/push/cancel-scheduled', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduleId }),
  }).catch(() => {})
}
