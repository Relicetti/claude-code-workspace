import { useState } from 'react'
import { Dumbbell, Loader2 } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'

export function Login() {
  const { login } = useWorkoutStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    setError('')
    const ok = await login(username, password)
    setLoading(false)
    if (!ok) setError('Usuário ou senha incorretos')
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mb-4">
        <Dumbbell size={32} className="text-white" />
      </div>
      <h1 className="text-xl font-bold text-white mb-1">Treino IA</h1>
      <p className="text-sm text-gray-500 mb-8">Entre com seu usuário e senha</p>

      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
        <input
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Usuário"
          className="w-full bg-gray-900 text-white text-center text-lg rounded-xl px-4 py-3.5 border border-gray-800 focus:border-brand-500 outline-none"
        />

        <input
          type="password"
          inputMode="text"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Senha"
          className="w-full bg-gray-900 text-white text-center text-lg rounded-xl px-4 py-3.5 border border-gray-800 focus:border-brand-500 outline-none"
        />

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
