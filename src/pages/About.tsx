import { ChevronLeft, Dumbbell, LogOut } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'

const buildDate = new Date(__BUILD_TIME__)

export function About() {
  const { setActiveView, logout } = useWorkoutStore()

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      <button
        onClick={() => setActiveView('plan')}
        className="flex items-center gap-1 text-gray-400 hover:text-white text-sm"
      >
        <ChevronLeft size={18} />
        Voltar
      </button>

      <div className="flex flex-col items-center text-center py-6">
        <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mb-3">
          <Dumbbell size={32} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-white">Treino IA</h1>
        <p className="text-sm text-gray-500 mt-1">Controle de treino com assistente de IA</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl divide-y divide-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-gray-400">Versão</span>
          <span className="text-sm font-mono text-white">{__APP_VERSION__}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-gray-400">Build</span>
          <span className="text-sm font-mono text-white">
            {buildDate.toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-gray-400">Commit</span>
          <span className="text-sm font-mono text-white">{__BUILD_COMMIT__}</span>
        </div>
      </div>

      <p className="text-xs text-gray-600 text-center px-4">
        Se a data do build acima for anterior ao último ajuste que você pediu, o app instalado
        ainda não pegou a versão nova — feche e abra de novo, ou aguarde a atualização automática.
      </p>

      <button
        onClick={() => logout()}
        className="w-full flex items-center justify-center gap-2 text-gray-500 hover:text-red-400 text-sm py-3 transition-colors"
      >
        <LogOut size={15} />
        Sair
      </button>
    </div>
  )
}
