import { useState } from 'react'
import { Camera, Scale, Trash2, ChevronDown, ChevronUp, Loader2, Brain } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useWorkoutStore } from '@/store/workoutStore'
import { getShapeAnalysis } from '@/lib/claudeApi'
import { fileToResizedDataUrl } from '@/lib/imageUtils'
import type { BodyPhotoAngle, BodyPhoto } from '@/types'

const ANGLES: { value: BodyPhotoAngle; label: string }[] = [
  { value: 'frente', label: 'Frente' },
  { value: 'lado', label: 'Lado' },
  { value: 'costas', label: 'Costas' },
]

export function Shape() {
  const {
    shapeAssessments,
    addShapeAssessment,
    updateShapeAssessmentAnalysis,
    deleteShapeAssessmentResult,
    getPreviousShapeAssessment,
  } = useWorkoutStore()

  const [photos, setPhotos] = useState<Partial<Record<BodyPhotoAngle, string>>>({})
  const [weight, setWeight] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const canSubmit = ANGLES.every(a => photos[a.value]) && weight.trim() !== '' && Number(weight) > 0 && !submitting

  const handlePhotoChange = async (angle: BodyPhotoAngle, file: File | undefined) => {
    if (!file) return
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      setPhotos(p => ({ ...p, [angle]: dataUrl }))
    } catch {
      setError('Não foi possível processar a foto. Tenta outra.')
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const bodyPhotos: BodyPhoto[] = ANGLES.map(a => ({ angle: a.value, dataUrl: photos[a.value]! }))
      const created = addShapeAssessment({ date, weightKg: Number(weight), photos: bodyPhotos, aiAnalysis: null })
      setPhotos({})
      setWeight('')
      setExpanded(created.id)

      const previous = getPreviousShapeAssessment(created.id)
      try {
        const analysis = await getShapeAnalysis(created, previous)
        updateShapeAssessmentAnalysis(created.id, analysis)
      } catch (e) {
        updateShapeAssessmentAnalysis(
          created.id,
          e instanceof Error ? `Não deu pra analisar com IA: ${e.message}` : 'Não deu pra analisar com IA.',
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar avaliação')
    } finally {
      setSubmitting(false)
    }
  }

  const sorted = [...shapeAssessments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const chartData = [...shapeAssessments]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(a => ({
      date: new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      weight: a.weightKg,
    }))

  return (
    <div className="px-4 py-4 pb-24 space-y-5">
      <h1 className="text-xl font-bold text-white">Avaliação de Shape</h1>

      {/* New assessment form */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-4">
        <p className="text-sm text-gray-400">Nova avaliação semanal</p>

        <div className="grid grid-cols-3 gap-2">
          {ANGLES.map(a => (
            <label
              key={a.value}
              className={`flex flex-col items-center justify-center gap-1.5 aspect-square rounded-xl border-2 border-dashed cursor-pointer transition-colors overflow-hidden relative ${
                photos[a.value] ? 'border-brand-600' : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              {photos[a.value] ? (
                <img src={photos[a.value]} alt={a.label} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <>
                  <Camera size={20} className="text-gray-500" />
                  <span className="text-xs text-gray-500">{a.label}</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => handlePhotoChange(a.value, e.target.files?.[0])}
              />
              {photos[a.value] && (
                <span className="absolute bottom-1 left-1 right-1 text-center text-[10px] font-medium bg-gray-950/70 text-white rounded px-1 py-0.5">
                  {a.label}
                </span>
              )}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Peso em jejum (kg)</p>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="0.0"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              className="w-full bg-gray-800 text-white text-lg font-mono font-bold rounded-xl px-3 py-2.5 border border-gray-700 focus:border-brand-500 outline-none"
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Data</p>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 text-sm border border-gray-700 focus:border-brand-500 outline-none"
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950/40 rounded-xl px-3 py-2">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all"
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Enviando...
            </>
          ) : (
            'Enviar avaliação'
          )}
        </button>
      </div>

      {/* Weight trend */}
      {chartData.length > 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-4">Peso em jejum (kg)</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} domain={['dataMin - 2', 'dataMax + 2']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '12px', color: '#f9fafb' }}
                formatter={(v: number) => [`${v}kg`, 'Peso']}
              />
              <Line type="monotone" dataKey="weight" stroke="#22c55e" strokeWidth={2.5} dot={{ fill: '#22c55e', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* History */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <Scale size={40} className="mx-auto mb-3 opacity-40" />
          <p>Nenhuma avaliação registrada</p>
          <p className="text-sm mt-1">Envie fotos + peso em jejum toda semana pra acompanhar o progresso</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Histórico</p>
          {sorted.map(a => {
            const isExpanded = expanded === a.id
            return (
              <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="w-full flex items-center justify-between p-4">
                  <button
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                    onClick={() => setExpanded(isExpanded ? null : a.id)}
                  >
                    <div className="bg-gray-800 w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-white leading-none">
                        {new Date(a.date + 'T12:00:00').getDate()}
                      </span>
                      <span className="text-[9px] text-gray-500 uppercase">
                        {new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm">{a.weightKg}kg</p>
                      <p className="text-xs text-gray-500">
                        {a.photos.length} fotos{a.aiAnalysis == null ? ' · analisando...' : ''}
                      </p>
                    </div>
                  </button>

                  {confirmDelete === a.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => { deleteShapeAssessmentResult(a.id); setConfirmDelete(null) }}
                        className="text-xs text-red-400 font-semibold px-2 py-1"
                      >
                        Excluir
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 px-2 py-1">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => setConfirmDelete(a.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 size={16} />
                      </button>
                      <button onClick={() => setExpanded(isExpanded ? null : a.id)}>
                        {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                      </button>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-800 pt-3">
                    <div className="grid grid-cols-3 gap-2">
                      {a.photos.map(p => (
                        <div key={p.angle} className="rounded-xl overflow-hidden aspect-square relative">
                          <img src={p.dataUrl} alt={p.angle} className="w-full h-full object-cover" />
                          <span className="absolute bottom-1 left-1 right-1 text-center text-[10px] font-medium bg-gray-950/70 text-white rounded px-1 py-0.5">
                            {ANGLES.find(x => x.value === p.angle)?.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="bg-gray-800/60 rounded-xl p-3">
                      <p className="text-xs text-brand-400 font-medium mb-1 uppercase tracking-wide flex items-center gap-1">
                        <Brain size={12} /> Análise da IA
                      </p>
                      {a.aiAnalysis == null ? (
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin" /> Analisando...
                        </p>
                      ) : (
                        <p className="text-sm text-gray-200 leading-relaxed">{a.aiAnalysis}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
