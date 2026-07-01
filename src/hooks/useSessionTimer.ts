import { useEffect, useState } from 'react'
import { useWorkoutStore } from '@/store/workoutStore'

export function useSessionTimer() {
  const { sessionStartTime, sessionPaused, sessionElapsedSeconds } = useWorkoutStore()
  const [display, setDisplay] = useState('00:00')

  useEffect(() => {
    if (sessionPaused || sessionStartTime === null) {
      const total = sessionElapsedSeconds
      const h = Math.floor(total / 3600)
      const m = Math.floor((total % 3600) / 60)
      const s = total % 60
      setDisplay(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
      return
    }

    const interval = setInterval(() => {
      const total = sessionElapsedSeconds + Math.floor((Date.now() - sessionStartTime) / 1000)
      const h = Math.floor(total / 3600)
      const m = Math.floor((total % 3600) / 60)
      const s = total % 60
      setDisplay(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionStartTime, sessionPaused, sessionElapsedSeconds])

  return display
}
