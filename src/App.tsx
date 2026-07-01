import { useEffect } from 'react'
import { useWorkoutStore } from '@/store/workoutStore'
import { BottomNav } from '@/components/BottomNav'
import { TodayWorkout } from '@/pages/TodayWorkout'
import { History } from '@/pages/History'
import { Progress } from '@/pages/Progress'
import { Analytics } from '@/pages/Analytics'
import { PlanEditor } from '@/pages/PlanEditor'
import { About } from '@/pages/About'

export default function App() {
  const { activeView, loadFromStorage } = useWorkoutStore()

  useEffect(() => {
    loadFromStorage()

    // Ask the browser to treat this site's storage as persistent, so
    // iOS/mobile browsers are less likely to silently evict localStorage
    // (workout history, plan, analyses) under low-storage pressure.
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {})
    }
  }, [loadFromStorage])

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <main className="max-w-lg mx-auto">
        {activeView === 'today' && <TodayWorkout />}
        {activeView === 'plan' && <PlanEditor />}
        {activeView === 'history' && <History />}
        {activeView === 'progress' && <Progress />}
        {activeView === 'analytics' && <Analytics />}
        {activeView === 'about' && <About />}
      </main>
      <BottomNav />
    </div>
  )
}
