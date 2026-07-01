import { useEffect } from 'react'
import { useWorkoutStore } from '@/store/workoutStore'
import { BottomNav } from '@/components/BottomNav'
import { TodayWorkout } from '@/pages/TodayWorkout'
import { History } from '@/pages/History'
import { Progress } from '@/pages/Progress'
import { Analytics } from '@/pages/Analytics'

export default function App() {
  const { activeView, loadFromStorage } = useWorkoutStore()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <main className="max-w-lg mx-auto">
        {activeView === 'today' && <TodayWorkout />}
        {activeView === 'history' && <History />}
        {activeView === 'progress' && <Progress />}
        {activeView === 'analytics' && <Analytics />}
      </main>
      <BottomNav />
    </div>
  )
}
