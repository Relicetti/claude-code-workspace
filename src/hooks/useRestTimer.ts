import { useState, useEffect, useRef, useCallback } from 'react'

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

export function useRestTimer(): RestTimerState {
  const [remaining, setRemaining] = useState(0)
  const [total, setTotal] = useState(0)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

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

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const start = useCallback(
    (seconds: number) => {
      clear()
      setTotal(seconds)
      setRemaining(seconds)
      setRunning(true)
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!)
            intervalRef.current = null
            setRunning(false)
            playDone()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    },
    [clear, playDone],
  )

  const pause = useCallback(() => {
    clear()
    setRunning(false)
  }, [clear])

  const resume = useCallback(() => {
    setRunning(true)
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          intervalRef.current = null
          setRunning(false)
          playDone()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [playDone])

  const adjust = useCallback((delta: number) => {
    setRemaining(prev => Math.max(0, prev + delta))
  }, [])

  const reset = useCallback(() => {
    clear()
    setRemaining(0)
    setTotal(0)
    setRunning(false)
  }, [clear])

  useEffect(() => () => clear(), [clear])

  return { remaining, total, running, start, pause, resume, adjust, reset }
}
