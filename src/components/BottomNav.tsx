import { Dumbbell, History, TrendingUp, Brain } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'

const TABS = [
  { id: 'today', label: 'Treino', icon: Dumbbell },
  { id: 'history', label: 'Histórico', icon: History },
  { id: 'progress', label: 'Progresso', icon: TrendingUp },
  { id: 'analytics', label: 'Analytics', icon: Brain },
] as const

export function BottomNav() {
  const { activeView, setActiveView, activeSession } = useWorkoutStore()

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-gray-950/95 backdrop-blur border-t border-gray-800 z-40">
      <div className="flex">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeView === tab.id
          const hasActiveSession = tab.id === 'today' && !!activeSession

          return (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors relative ${
                isActive ? 'text-brand-400' : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {hasActiveSession && (
                <span className="absolute top-2 right-1/2 translate-x-3 w-2 h-2 bg-brand-400 rounded-full animate-pulse" />
              )}
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>
      {/* iOS safe area */}
      <div className="h-safe-area-inset-bottom" />
    </nav>
  )
}
