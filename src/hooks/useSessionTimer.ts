import { useEffect, useState, useCallback } from 'react'
import { useWorkoutStore } from '@/store/workoutStore'

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function useSessionTimer() {
  const { sessionStartTime, sessionPaused, sessionElapsedSeconds } = useWorkoutStore()
  const [display, setDisplay] = useState('00:00')

  const recompute = useCallback(() => {
    if (sessionPaused || sessionStartTime === null) {
      setDisplay(formatElapsed(sessionElapsedSeconds))
      return
    }
    const total = sessionElapsedSeconds + Math.floor((Date.now() - sessionStartTime) / 1000)
    setDisplay(formatElapsed(total))
  }, [sessionStartTime, sessionPaused, sessionElapsedSeconds])

  useEffect(() => {
    recompute()
    if (sessionPaused || sessionStartTime === null) return

    const interval = setInterval(recompute, 1000)
    return () => clearInterval(interval)
  }, [recompute, sessionStartTime, sessionPaused])

  // The elapsed calculation is already wall-clock based, so it's never
  // actually wrong — but setInterval ticks are throttled while the
  // screen is off or the app is backgrounded, so the display can look
  // frozen for a moment. Force an immediate redraw on return.
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') recompute()
    }
    document.addEventListener('visibilitychange', handleVisible)
    window.addEventListener('focus', handleVisible)
    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      window.removeEventListener('focus', handleVisible)
    }
  }, [recompute])

  return display
}
