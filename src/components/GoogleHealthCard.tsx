import { useEffect, useState } from 'react'
import { HeartPulse, Loader2 } from 'lucide-react'
import { getGoogleHealthStatus, getGoogleHealthAuthUrl, disconnectGoogleHealth, syncGoogleHealth } from '@/lib/storage'
import { useWorkoutStore } from '@/store/workoutStore'
import type { GoogleHealthStatus } from '@/types'

function dateKeysBack(days: number): [string, string] {
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - (days - 1))
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return [fmt(from), fmt(today)]
}

export function GoogleHealthCard() {
  const refreshHealthVitals = useWorkoutStore(s => s.refreshHealthVitals)
  const [status, setStatus] = useState<GoogleHealthStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; total: number; warnings: string[] } | null>(null)

  const loadStatus = () => {
    getGoogleHealthStatus().then(setStatus).catch(err => setError(err.message))
  }

  useEffect(loadStatus, [])

  const handleConnect = async () => {
    setBusy(true)
    setError('')
    try {
      const url = await getGoogleHealthAuthUrl()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar')
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Desconectar o Google Health? Os dados já sincronizados continuam salvos.')) return
    setBusy(true)
    setError('')
    try {
      await disconnectGoogleHealth()
      loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao desconectar')
    } finally {
      setBusy(false)
    }
  }

  const handleSync = async () => {
    setBusy(true)
    setError('')
    setSyncResult(null)
    try {
      const [from, to] = dateKeysBack(14)
      const result = await syncGoogleHealth(from, to)
      setSyncResult(result)
      await refreshHealthVitals()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar')
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <HeartPulse size={15} className="text-brand-400" />
        Google Health
      </div>

      {!status.configured && (
        <p className="text-xs text-gray-500">
          Integração ainda não configurada no servidor.
        </p>
      )}

      {status.configured && !status.connected && (
        <>
          <p className="text-xs text-gray-500">
            Conecte pra IA usar sono, frequência cardíaca de repouso, passos e calorias do dia
            como contexto nas dicas ao vivo durante o treino.
          </p>
          <button
            onClick={handleConnect}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Conectar Google Health
          </button>
        </>
      )}

      {status.connected && (
        <>
          <p className="text-xs text-gray-500">
            Conectado{status.connectedAt ? ` desde ${new Date(status.connectedAt).toLocaleDateString('pt-BR')}` : ''}.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={busy}
              className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {busy ? 'Sincronizando...' : 'Sincronizar agora'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="flex-1 bg-red-950/40 hover:bg-red-950/70 disabled:opacity-40 text-red-400 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              Desconectar
            </button>
          </div>
          {syncResult && (
            <div className="text-xs text-gray-500 space-y-1">
              <p>{syncResult.synced} de {syncResult.total} dias sincronizados.</p>
              {syncResult.warnings.length > 0 && (
                <p className="text-yellow-500/80">
                  Alguns dados não sincronizaram: {syncResult.warnings.join(' · ')}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
