import { useEffect, useState } from 'react'
import { api, dateKeysBack } from '../api.js'

export default function HealthConnectCard() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  function loadStatus() {
    api
      .getHealthConnectStatus()
      .then(setStatus)
      .catch((err) => setError(err.message))
  }

  useEffect(loadStatus, [])

  async function handleConnect() {
    setBusy(true)
    setError(null)
    try {
      const { url } = await api.getHealthConnectAuthUrl()
      window.location.href = url
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar o Google Health? Os dados ja sincronizados continuam salvos.')) return
    setBusy(true)
    setError(null)
    try {
      await api.disconnectHealthConnect()
      loadStatus()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSync() {
    setBusy(true)
    setError(null)
    setSyncResult(null)
    try {
      const keys = dateKeysBack(14)
      const result = await api.syncHealthConnect(keys[0], keys[keys.length - 1])
      setSyncResult(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null

  return (
    <div className="health-connect-card">
      <div className="health-connect-title">Google Health (Fitbit)</div>

      {!status.configured && (
        <p className="health-connect-hint">
          Integracao ainda nao configurada no servidor. Veja o guia de configuracao pra habilitar.
        </p>
      )}

      {status.configured && !status.connected && (
        <>
          <p className="health-connect-hint">
            Conecte pra usar o gasto calorico real do seu Fitbit em vez da estimativa por tipo de dia.
          </p>
          <button type="button" className="btn btn-secondary" onClick={handleConnect} disabled={busy}>
            Conectar Google Health
          </button>
        </>
      )}

      {status.connected && (
        <>
          <p className="health-connect-hint">
            Conectado{status.connectedAt ? ` desde ${new Date(status.connectedAt).toLocaleDateString('pt-BR')}` : ''}.
          </p>
          <div className="health-connect-actions">
            <button type="button" className="btn btn-secondary btn-small" onClick={handleSync} disabled={busy}>
              {busy ? 'Sincronizando...' : 'Sincronizar agora'}
            </button>
            <button type="button" className="btn btn-danger btn-small" onClick={handleDisconnect} disabled={busy}>
              Desconectar
            </button>
          </div>
          {syncResult && (
            <p className="health-connect-hint">
              {syncResult.synced} de {syncResult.total} dias sincronizados.
            </p>
          )}
        </>
      )}

      {error && <div className="estimate-error">{error}</div>}
    </div>
  )
}
