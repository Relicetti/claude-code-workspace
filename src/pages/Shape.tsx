import { useState } from 'react'
import { Camera, Scale, Trash2, ChevronDown, ChevronUp, Loader2, Brain, Ruler, TrendingUp, TrendingDown, Minus as MinusIcon, AlertCircle } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useWorkoutStore } from '@/store/workoutStore'
import { getShapeAnalysis } from '@/lib/claudeApi'
import { fileToResizedDataUrl } from '@/lib/imageUtils'
import { todayLocalDate } from '@/lib/date'
import type { BodyPhotoAngle, BodyPhoto, BodyMeasurement } from '@/types'

const ANGLES: { value: BodyPhotoAngle; label: string }[] = [
  { value: 'frente', label: 'Frente' },
  { value: 'lado', label: 'Lado' },
  { value: 'costas', label: 'Costas' },
]

type MeasurementKey = 'neck' | 'shoulders' | 'chest' | 'relaxedArm' | 'flexedArm' | 'thigh' | 'calf' | 'weight' | 'waist' | 'abdomen' | 'hip'

interface MeasurementField {
  key: MeasurementKey
  label: string
  unit: string
  group: 'sempre' | 'jejum'
  // Which direction of change reads as "good" for this measurement — drives
  // the color of the delta comparison. Fat-related measures are inverted
  // (shrinking is the goal); muscle measures are the opposite. Weight/hip
  // depend on the person's current phase (cutting/bulking), so they're left
  // neutral rather than guessing.
  better: 'up' | 'down' | 'neutral'
}

const MEASUREMENT_FIELDS: MeasurementField[] = [
  { key: 'neck', label: 'Pescoço', unit: 'cm', group: 'sempre', better: 'neutral' },
  { key: 'shoulders', label: 'Ombros', unit: 'cm', group: 'sempre', better: 'up' },
  { key: 'chest', label: 'Peito', unit: 'cm', group: 'sempre', better: 'up' },
  { key: 'relaxedArm', label: 'Braço relaxado', unit: 'cm', group: 'sempre', better: 'up' },
  { key: 'flexedArm', label: 'Braço contraído', unit: 'cm', group: 'sempre', better: 'up' },
  { key: 'thigh', label: 'Coxa', unit: 'cm', group: 'sempre', better: 'up' },
  { key: 'calf', label: 'Panturrilha', unit: 'cm', group: 'sempre', better: 'up' },
  { key: 'weight', label: 'Peso', unit: 'kg', group: 'jejum', better: 'neutral' },
  { key: 'waist', label: 'Cintura', unit: 'cm', group: 'jejum', better: 'down' },
  { key: 'abdomen', label: 'Abdômen', unit: 'cm', group: 'jejum', better: 'down' },
  { key: 'hip', label: 'Quadril', unit: 'cm', group: 'jejum', better: 'neutral' },
]

function deltaColor(delta: number, better: MeasurementField['better']): string {
  if (delta === 0 || better === 'neutral') return 'text-gray-400'
  const isGood = better === 'up' ? delta > 0 : delta < 0
  return isGood ? 'text-brand-400' : 'text-red-400'
}

function DeltaArrow({ delta }: { delta: number }) {
  if (delta > 0) return <TrendingUp size={13} />
  if (delta < 0) return <TrendingDown size={13} />
  return <MinusIcon size={13} />
}

export function Shape() {
  const {
    shapeAssessments,
    addShapeAssessment,
    updateShapeAssessmentAnalysis,
    deleteShapeAssessmentResult,
    getPreviousShapeAssessment,
    bodyMeasurements,
    addBodyMeasurement,
    deleteBodyMeasurementResult,
  } = useWorkoutStore()

  const [activeTab, setActiveTab] = useState<'fotos' | 'medidas'>('fotos')

  const [photos, setPhotos] = useState<Partial<Record<BodyPhotoAngle, string>>>({})
  const [weight, setWeight] = useState('')
  const [date, setDate] = useState(todayLocalDate())
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

  // --- Measurements (perímetros) ---
  const [mDate, setMDate] = useState(todayLocalDate())
  const [fasting, setFasting] = useState(false)
  const [values, setValues] = useState<Partial<Record<MeasurementKey, string>>>({})
  const [notes, setNotes] = useState('')
  const [mError, setMError] = useState('')
  const [confirmDeleteM, setConfirmDeleteM] = useState<string | null>(null)
  const [expandedM, setExpandedM] = useState<string | null>(null)
  const [chartField, setChartField] = useState<MeasurementKey>('waist')

  const sortedMeasurements = [...bodyMeasurements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const daysSinceLast = sortedMeasurements[0]
    ? Math.floor((Date.now() - new Date(sortedMeasurements[0].date + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24))
    : null
  const showReminder = daysSinceLast === null || daysSinceLast >= 30

  const canSubmitMeasurement = MEASUREMENT_FIELDS.some(f => values[f.key]?.trim())

  const handleSubmitMeasurement = () => {
    if (!canSubmitMeasurement) return
    setMError('')
    const entry: Omit<BodyMeasurement, 'id' | 'createdAt'> = { date: mDate, fasting, notes: notes.trim() || undefined }
    MEASUREMENT_FIELDS.forEach(f => {
      const raw = values[f.key]?.trim()
      if (raw) entry[f.key] = Number(raw.replace(',', '.'))
    })
    addBodyMeasurement(entry)
    setValues({})
    setNotes('')
    setFasting(false)
  }

  const measurementFieldsWithData = MEASUREMENT_FIELDS.filter(f => bodyMeasurements.some(m => m[f.key] != null))
  const measurementChartData = [...bodyMeasurements]
    .filter(m => m[chartField] != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(m => ({
      date: new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      value: m[chartField] as number,
    }))

  return (
    <div className="px-4 py-4 pb-24 space-y-5">
      <h1 className="text-xl font-bold text-white">Avaliação de Shape</h1>

      {/* Tab switcher */}
      <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('fotos')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'fotos' ? 'bg-brand-600 text-white' : 'text-gray-400'
          }`}
        >
          <Camera size={14} />
          Fotos e peso
        </button>
        <button
          onClick={() => setActiveTab('medidas')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'medidas' ? 'bg-brand-600 text-white' : 'text-gray-400'
          }`}
        >
          <Ruler size={14} />
          Medidas
        </button>
      </div>

      {activeTab === 'fotos' && (
        <>
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
        </>
      )}

      {activeTab === 'medidas' && (
        <>
          {showReminder && (
            <div className="flex items-center gap-2 bg-yellow-950/40 border border-yellow-800 rounded-xl px-3 py-2.5">
              <AlertCircle size={16} className="text-yellow-400 shrink-0" />
              <p className="text-sm text-yellow-300">
                {daysSinceLast === null
                  ? 'Você ainda não registrou suas medidas.'
                  : `Já fazem ${daysSinceLast} dias desde a última medição.`} Hora de medir!
              </p>
            </div>
          )}

          {/* New measurement form */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">Novo registro de medidas</p>
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={fasting}
                  onChange={e => setFasting(e.target.checked)}
                  className="accent-brand-600"
                />
                Em jejum
              </label>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1.5">Data</p>
              <input
                type="date"
                value={mDate}
                onChange={e => setMDate(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 text-sm border border-gray-700 focus:border-brand-500 outline-none"
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Sempre disponíveis</p>
              <div className="grid grid-cols-2 gap-3">
                {MEASUREMENT_FIELDS.filter(f => f.group === 'sempre').map(f => (
                  <div key={f.key}>
                    <p className="text-xs text-gray-500 mb-1">{f.label} ({f.unit})</p>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="0.0"
                      value={values[f.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:border-brand-500 outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Idealmente em jejum, sem treino há 8h</p>
              <div className="grid grid-cols-2 gap-3">
                {MEASUREMENT_FIELDS.filter(f => f.group === 'jejum').map(f => (
                  <div key={f.key}>
                    <p className="text-xs text-gray-500 mb-1">{f.label} ({f.unit})</p>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="0.0"
                      value={values[f.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:border-brand-500 outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1.5">Observações (opcional)</p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Ex: medido logo após acordar"
                className="w-full bg-gray-800 text-white text-sm rounded-xl px-3 py-2 border border-gray-700 focus:border-brand-500 outline-none resize-none"
              />
            </div>

            {mError && <p className="text-red-400 text-sm bg-red-950/40 rounded-xl px-3 py-2">{mError}</p>}

            <button
              onClick={handleSubmitMeasurement}
              disabled={!canSubmitMeasurement}
              className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all"
            >
              Salvar registro
            </button>
          </div>

          {/* Comparison with previous */}
          {sortedMeasurements.length >= 2 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Comparação com medição anterior</p>
              {MEASUREMENT_FIELDS.filter(
                f => sortedMeasurements[0][f.key] != null && sortedMeasurements[1][f.key] != null,
              ).map(f => {
                const current = sortedMeasurements[0][f.key] as number
                const previous = sortedMeasurements[1][f.key] as number
                const delta = Math.round((current - previous) * 10) / 10
                return (
                  <div key={f.key} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{f.label}</span>
                    <span className="font-mono text-white">{current}{f.unit}</span>
                    <span className={`flex items-center gap-1 font-mono text-xs ${deltaColor(delta, f.better)}`}>
                      <DeltaArrow delta={delta} />
                      {delta > 0 ? '+' : ''}{delta}{f.unit}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Evolution chart */}
          {measurementFieldsWithData.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Evolução</p>
                <select
                  value={chartField}
                  onChange={e => setChartField(e.target.value as MeasurementKey)}
                  className="bg-gray-800 text-white text-xs rounded-lg px-2 py-1.5 border border-gray-700 focus:border-brand-500 outline-none"
                >
                  {measurementFieldsWithData.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>
              {measurementChartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={measurementChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} domain={['dataMin - 2', 'dataMax + 2']} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '12px', color: '#f9fafb' }}
                      formatter={(v: number) => [`${v}${MEASUREMENT_FIELDS.find(f => f.key === chartField)?.unit ?? ''}`, 'Medida']}
                    />
                    <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2.5} dot={{ fill: '#22c55e', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-600 text-center py-6">Precisa de pelo menos 2 registros com essa medida pra mostrar o gráfico</p>
              )}
            </div>
          )}

          {/* History */}
          {sortedMeasurements.length === 0 ? (
            <div className="text-center py-12 text-gray-600">
              <Ruler size={40} className="mx-auto mb-3 opacity-40" />
              <p>Nenhuma medida registrada</p>
              <p className="text-sm mt-1">Registre suas medidas todo mês pra acompanhar a evolução</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Histórico</p>
              {sortedMeasurements.map(m => {
                const isExpanded = expandedM === m.id
                const filledFields = MEASUREMENT_FIELDS.filter(f => m[f.key] != null)
                return (
                  <div key={m.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="w-full flex items-center justify-between p-4">
                      <button
                        className="flex-1 flex items-center gap-3 text-left min-w-0"
                        onClick={() => setExpandedM(isExpanded ? null : m.id)}
                      >
                        <div className="bg-gray-800 w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-white leading-none">
                            {new Date(m.date + 'T12:00:00').getDate()}
                          </span>
                          <span className="text-[9px] text-gray-500 uppercase">
                            {new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white text-sm">
                            {filledFields.length} medida{filledFields.length === 1 ? '' : 's'}{m.fasting ? ' · jejum' : ''}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {filledFields.slice(0, 3).map(f => `${f.label} ${m[f.key]}${f.unit}`).join(' · ')}
                          </p>
                        </div>
                      </button>

                      {confirmDeleteM === m.id ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => { deleteBodyMeasurementResult(m.id); setConfirmDeleteM(null) }}
                            className="text-xs text-red-400 font-semibold px-2 py-1"
                          >
                            Excluir
                          </button>
                          <button onClick={() => setConfirmDeleteM(null)} className="text-xs text-gray-500 px-2 py-1">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 shrink-0">
                          <button onClick={() => setConfirmDeleteM(m.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                            <Trash2 size={16} />
                          </button>
                          <button onClick={() => setExpandedM(isExpanded ? null : m.id)}>
                            {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                          </button>
                        </div>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-2 border-t border-gray-800 pt-3">
                        {filledFields.map(f => (
                          <div key={f.key} className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">{f.label}</span>
                            <span className="font-mono text-white">{m[f.key]}{f.unit}</span>
                          </div>
                        ))}
                        {m.notes && (
                          <p className="text-sm text-gray-400 italic pt-2 border-t border-gray-800 mt-2">{m.notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
