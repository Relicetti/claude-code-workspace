import { useState, useEffect, useRef, useCallback } from 'react'
import { scheduleRestDoneNotification, cancelRestDoneNotification } from '@/lib/push'

interface RestTimerState {
  remaining: number
  total: number
  running: boolean
  start: (seconds: number) => void
  pause: () => void
  resume: () => void
  adjust: (delta: number) => void
  reset: () => void
}

// WakeLockSentinel isn't in every TS DOM lib version yet
interface WakeLockSentinelLike {
  release: () => Promise<void>
}

export function useRestTimer(): RestTimerState {
  const [remaining, setRemaining] = useState(0)
  const [total, setTotal] = useState(0)
  const [running, setRunning] = useState(false)

  // Absolute timestamp (ms) the countdown should hit zero — survives
  // setInterval being throttled/paused while the screen is off or the
  // app is backgrounded, since remaining is recomputed from real time
  // instead of decremented tick by tick.
  const endTimestampRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const firedDoneRef = useRef(false)
  const scheduleIdRef = useRef<string | null>(null)

  const cancelScheduledPush = useCallback(() => {
    if (scheduleIdRef.current) {
      cancelRestDoneNotification(scheduleIdRef.current)
      scheduleIdRef.current = null
    }
  }, [])

  const playDone = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
    } catch {
      // Audio not available — silently ignore
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
      }
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request('screen')
      }
    } catch {
      // Not supported, or permission/battery-saver denial — degrade silently
    }
  }, [])

  const clearInt = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const tick = useCallback(() => {
    if (endTimestampRef.current === null) return
    const secondsLeft = Math.max(0, Math.round((endTimestampRef.current - Date.now()) / 1000))
    setRemaining(secondsLeft)
    if (secondsLeft <= 0) {
      clearInt()
      setRunning(false)
      endTimestampRef.current = null
      releaseWakeLock()
      // The local timer caught it in time — no need for the server's push
      // to also arrive (it exists only to cover the screen-off/backgrounded case).
      cancelScheduledPush()
      if (!firedDoneRef.current) {
        firedDoneRef.current = true
        playDone()
      }
    }
  }, [clearInt, playDone, releaseWakeLock, cancelScheduledPush])

  const start = useCallback(
    (seconds: number) => {
      clearInt()
      firedDoneRef.current = false
      setTotal(seconds)
      setRemaining(seconds)
      endTimestampRef.current = Date.now() + seconds * 1000
      setRunning(true)
      requestWakeLock()
      intervalRef.current = setInterval(tick, 1000)
      scheduleIdRef.current = crypto.randomUUID()
      scheduleRestDoneNotification(scheduleIdRef.current, seconds)
    },
    [clearInt, tick, requestWakeLock],
  )

  const pause = useCallback(() => {
    if (endTimestampRef.current !== null) {
      const secondsLeft = Math.max(0, Math.round((endTimestampRef.current - Date.now()) / 1000))
      setRemaining(secondsLeft)
      endTimestampRef.current = null
    }
    clearInt()
    setRunning(false)
    releaseWakeLock()
    cancelScheduledPush()
  }, [clearInt, releaseWakeLock, cancelScheduledPush])

  const resume = useCallback(() => {
    setRemaining(current => {
      endTimestampRef.current = Date.now() + current * 1000
      scheduleIdRef.current = crypto.randomUUID()
      scheduleRestDoneNotification(scheduleIdRef.current, current)
      return current
    })
    firedDoneRef.current = false
    setRunning(true)
    requestWakeLock()
    intervalRef.current = setInterval(tick, 1000)
  }, [tick, requestWakeLock])

  const adjust = useCallback((delta: number) => {
    setRemaining(prev => {
      const next = Math.max(0, prev + delta)
      if (endTimestampRef.current !== null) {
        endTimestampRef.current = Date.now() + next * 1000
        if (scheduleIdRef.current) {
          scheduleRestDoneNotification(scheduleIdRef.current, next)
        }
      }
      return next
    })
  }, [])

  const reset = useCallback(() => {
    clearInt()
    setRemaining(0)
    setTotal(0)
    setRunning(false)
    endTimestampRef.current = null
    firedDoneRef.current = false
    releaseWakeLock()
    cancelScheduledPush()
  }, [clearInt, releaseWakeLock, cancelScheduledPush])

  // Catch up immediately when the screen/app comes back into view —
  // setInterval ticks are throttled or fully paused while backgrounded,
  // so without this the countdown looks "stuck" (or worse, silently
  // wrong) until the next natural tick.
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (endTimestampRef.current !== null) {
        tick()
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisible)
    window.addEventListener('focus', handleVisible)
    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      window.removeEventListener('focus', handleVisible)
    }
  }, [tick, requestWakeLock])

  useEffect(() => {
    return () => {
      clearInt()
      releaseWakeLock()
    }
  }, [clearInt, releaseWakeLock])

  return { remaining, total, running, start, pause, resume, adjust, reset }
}
