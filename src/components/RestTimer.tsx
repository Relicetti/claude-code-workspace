import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Plus, Minus, X, Bell, Sparkles, Send } from 'lucide-react'
import type { useRestTimer } from '@/hooks/useRestTimer'
import type { LiveTipTurn } from '@/lib/claudeApi'
import { isPushSupported, getPushPermission, enablePushNotifications } from '@/lib/push'

interface Props {
  timer: ReturnType<typeof useRestTimer>
  onClose: () => void
  liveTipTurns?: LiveTipTurn[]
  liveTipLoading?: boolean
  onSendTipReply?: (text: string) => void
}

export function RestTimer({ timer, onClose, liveTipTurns = [], liveTipLoading, onSendTipReply }: Props) {
  const { remaining, total, running, pause, resume, adjust, reset } = timer
  const [permission, setPermission] = useState(getPushPermission())
  const [replyText, setReplyText] = useState('')
  const turnsEndRef = useRef<HTMLDivElement>(null)

  // Keeps the newest message in view instead of letting it get clipped at
  // the bottom of the scroll container — a fixed max-height caps how much
  // vertical space the conversation can eat inside this small popup.
  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [liveTipTurns, liveTipLoading])

  const handleEnableNotifications = async () => {
    const granted = await enablePushNotifications()
    setPermission(granted ? 'granted' : getPushPermission())
  }

  const handleSendReply = () => {
    const text = replyText.trim()
    if (!text || !onSendTipReply) return
    onSendTipReply(text)
    setReplyText('')
  }

  const progress = total > 0 ? (remaining / total) * 100 : 0
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60

  const circumference = 2 * Math.PI * 54
  const dashOffset = circumference * (1 - progress / 100)

  return (
    <div className="fixed inset-0 bg-gray-950/90 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-xs text-center border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Descanso</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white" title="Minimizar (o descanso continua contando)">
            <X size={20} />
          </button>
        </div>

        {isPushSupported() && permission !== 'granted' && (
          <button
            onClick={handleEnableNotifications}
            className="flex items-center justify-center gap-2 w-full bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-4"
          >
            <Bell size={14} />
            Ativar notificação de fim de descanso
          </button>
        )}

        {/* Circular progress */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <svg width="128" height="128" className="-rotate-90">
            <circle cx="64" cy="64" r="54" fill="none" stroke="#1f2937" strokeWidth="8" />
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke={remaining <= 5 ? '#ef4444' : '#22c55e'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute">
            <span className="text-4xl font-mono font-bold text-white tabular-nums">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Live coaching tip — loading briefly while the AI call resolves,
            silently absent if it failed (never blocks/interrupts the rest).
            The athlete can reply once a tip is up, turning it into a short
            back-and-forth (e.g. "senti dor no ombro nessa série"). */}
        {(liveTipLoading || liveTipTurns.length > 0) && (
          <div className="mb-5 text-left space-y-2">
            {liveTipTurns.length === 0 ? (
              <div className="flex items-start gap-2 bg-gray-800/60 rounded-xl px-3 py-2.5">
                <Sparkles size={14} className="text-brand-400 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500">Analisando série...</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {liveTipTurns.map((turn, i) =>
                  turn.role === 'assistant' ? (
                    <div key={i} className="flex items-start gap-2 bg-gray-800/60 rounded-xl px-3 py-2.5">
                      <Sparkles size={14} className="text-brand-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-300 leading-relaxed">{turn.text}</p>
                    </div>
                  ) : (
                    <div key={i} className="flex justify-end">
                      <p className="text-xs text-gray-400 bg-gray-800/30 rounded-xl px-3 py-2 max-w-[85%]">{turn.text}</p>
                    </div>
                  ),
                )}
                {liveTipLoading && (
                  <div className="flex items-start gap-2 bg-gray-800/60 rounded-xl px-3 py-2.5">
                    <Sparkles size={14} className="text-brand-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-500">Respondendo...</p>
                  </div>
                )}
                <div ref={turnsEndRef} />
              </div>
            )}

            {liveTipTurns.length > 0 && onSendTipReply && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSendReply()
                  }}
                  placeholder="Responder (opcional)..."
                  disabled={liveTipLoading}
                  className="flex-1 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 outline-none disabled:opacity-50"
                />
                <button
                  onClick={handleSendReply}
                  disabled={liveTipLoading || !replyText.trim()}
                  className="shrink-0 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-brand-400 p-2 rounded-lg transition-colors"
                >
                  <Send size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Adjust buttons */}
        <div className="flex items-center justify-center gap-4 mb-5">
          <button
            onClick={() => adjust(-15)}
            className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Minus size={14} />15s
          </button>
          <button
            onClick={running ? pause : resume}
            className="bg-brand-500 hover:bg-brand-600 text-white w-12 h-12 rounded-full flex items-center justify-center transition-colors"
          >
            {running ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button
            onClick={() => adjust(15)}
            className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} />15s
          </button>
        </div>

        <button
          onClick={() => { reset(); onClose() }}
          className="text-gray-500 text-sm hover:text-gray-300 transition-colors"
        >
          Pular descanso
        </button>
      </div>
    </div>
  )
}
