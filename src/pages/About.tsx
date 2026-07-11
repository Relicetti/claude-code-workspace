import { useEffect, useState } from 'react'
import { ChevronLeft, Dumbbell, LogOut, UserPlus, Shield, Loader2 } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'
import { loadUsers, createUser } from '@/lib/storage'
import type { AdminUser } from '@/types'

const buildDate = new Date(__BUILD_TIME__)

function AdminUsersSection() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => loadUsers().then(setUsers).catch(() => {})

  useEffect(() => {
    refresh()
  }, [])

  const handleCreate = async () => {
    if (!username.trim() || !password || creating) return
    setCreating(true)
    setError('')
    try {
      await createUser(username.trim(), password)
      setUsername('')
      setPassword('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Shield size={15} className="text-brand-400" />
        Gerenciar usuários
      </div>

      <div className="space-y-1.5">
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between text-sm bg-gray-800/60 rounded-lg px-3 py-2">
            <span className="text-gray-300">{u.username}</span>
            {u.isAdmin && <span className="text-xs text-brand-400 font-medium">admin</span>}
          </div>
        ))}
      </div>

      <div className="space-y-2 pt-1">
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Novo usuário"
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 outline-none"
        />
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Senha"
          type="password"
          className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 outline-none"
        />

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={!username.trim() || !password || creating}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 disabled:opacity-40 hover:bg-brand-500 text-white text-sm font-semibold py-2 rounded-lg transition-all"
        >
          {creating ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
          {creating ? 'Criando...' : 'Criar usuário'}
        </button>
      </div>
    </div>
  )
}

export function About() {
  const { setActiveView, logout, isAdmin } = useWorkoutStore()

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

      {isAdmin && <AdminUsersSection />}

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
