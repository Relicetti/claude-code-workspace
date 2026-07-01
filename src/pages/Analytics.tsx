import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Brain, Loader2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'
import { getWeeklyAnalysis } from '@/lib/claudeApi'
import { workoutPlan } from '@/data/workoutPlan'
import type { WeeklyAnalysis } from '@/types'

const MUSCLE_LABELS: Record<string, string> = {
  peito: 'Peito',
  costas: 'Costas',
  ombro: 'Ombro',
  triceps: 'Tríceps',
  biceps: 'Bíceps',
  quadriceps: 'Quadríceps',
  posterior: 'Posterior',
  adutora: 'Adutora',
  abdutora: 'Abdutora',
  panturrilha: 'Panturrilha',
  abdomen: 'Abdômen',
  trapezio: 'Trapézio',
}

const ADJUSTMENT_LABELS: Record<string, string> = {
  increase_weight: '↑ Aumentar carga',
  decrease_volume: '↓ Reduzir volume',
  increase_volume: '↑ Aumentar volume',
  swap_exercise: '⇄ Trocar exercício',
  rest_exercise: '⏸ Descansar exercício',
}

function computeVolumeByMuscle(sessions: ReturnType<typeof useWorkoutStore.getState>['sessions']): Record<string, number> {
  const vol: Record<string, number> = {}

  sessions.forEach(session => {
    session.exercises.forEach(ex => {
      if (ex.skipped) return
      const planDay = workoutPlan.days.find(d => d.type === session.workoutType)
      const planEx = planDay?.exercises.find(e => e.id === ex.exerciseId)
      if (!planEx) return
      const completedSets = ex.sets.filter(s => s.completedAt !== null).length
      planEx.muscleGroups.forEach(m => {
        vol[m] = (vol[m] ?? 0) + completedSets
      })
    })
  })

  return vol
}

export function Analytics() {
  const { sessions, analyses, saveAnalysisResult, applyAdjustment } = useWorkoutStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 7)
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(weekStart.getDate() - 7)

  const thisWeekSessions = sessions.filter(s => {
    const d = new Date(s.date)
    return d >= weekStart && d <= now
  })

  const prevWeekSessions = sessions.filter(s => {
    const d = new Date(s.date)
    return d >= prevWeekStart && d < weekStart
  })

  const volumeData = computeVolumeByMuscle(thisWeekSessions)
  const chartData = Object.entries(volumeData)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([key, value]) => ({
      muscle: MUSCLE_LABELS[key] ?? key,
      sets: value,
    }))

  const handleAnalyze = async () => {
    if (thisWeekSessions.length === 0) {
      setError('Nenhuma sessão nos últimos 7 dias para analisar.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await getWeeklyAnalysis(thisWeekSessions, prevWeekSessions)
      const analysis: WeeklyAnalysis = {
        id: crypto.randomUUID(),
        generatedAt: new Date().toISOString(),
        weekStart: weekStart.toISOString(),
        weekEnd: now.toISOString(),
        summary: result.summary,
        volumeByMuscle: volumeData,
        adjustments: result.adjustments,
        applied: new Array(result.adjustments.length).fill(false),
      }
      saveAnalysisResult(analysis)
      setExpanded(analysis.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar análise')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-4 pb-24 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Analytics Semanal</h1>
        <span className="text-xs text-gray-500">{thisWeekSessions.length} sessões esta semana</span>
      </div>

      {/* Volume chart */}
      {chartData.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-4">Volume por grupo muscular (séries)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="muscle" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  color: '#f9fafb',
                }}
                formatter={(v: number) => [`${v} séries`, 'Volume']}
              />
              <Bar dataKey="sets" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.sets < 10 ? '#ef4444' : entry.sets > 20 ? '#f59e0b' : '#22c55e'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> {'<'}10 séries</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-500 inline-block" /> 10-20</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> {'>'}20</span>
          </div>
        </div>
      )}

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white font-semibold py-4 rounded-2xl transition-all"
      >
        {loading ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Analisando com IA...
          </>
        ) : (
          <>
            <Brain size={20} />
            Analisar minha semana
          </>
        )}
      </button>

      {error && (
        <p className="text-red-400 text-sm bg-red-950/40 rounded-xl px-3 py-2">{error}</p>
      )}

      {/* Past analyses */}
      {analyses.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Análises anteriores</p>
          {analyses.map(analysis => {
            const isExpanded = expanded === analysis.id
            const appliedCount = analysis.applied.filter(Boolean).length

            return (
              <div key={analysis.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-4 text-left"
                  onClick={() => setExpanded(isExpanded ? null : analysis.id)}
                >
                  <div>
                    <p className="font-semibold text-white text-sm">
                      Semana de {new Date(analysis.weekStart).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {analysis.adjustments.length} sugestões · {appliedCount} aplicadas
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-800 pt-3">
                    {/* Summary */}
                    <div className="bg-gray-800/60 rounded-xl p-3">
                      <p className="text-xs text-brand-400 font-medium mb-1 uppercase tracking-wide">Resumo</p>
                      <p className="text-sm text-gray-200 leading-relaxed">{analysis.summary}</p>
                    </div>

                    {/* Adjustments */}
                    {analysis.adjustments.map((adj, idx) => (
                      <div
                        key={idx}
                        className={`border rounded-xl p-3 ${
                          analysis.applied[idx]
                            ? 'border-brand-800 bg-brand-950/30'
                            : 'border-gray-700 bg-gray-800/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-gray-400 bg-gray-700 px-2 py-0.5 rounded-md">
                                {ADJUSTMENT_LABELS[adj.type] ?? adj.type}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-white">{adj.exerciseName}</p>
                            <p className="text-sm text-gray-300 mt-0.5">{adj.suggestion}</p>
                            <p className="text-xs text-gray-500 mt-1">{adj.justification}</p>
                          </div>
                          {analysis.applied[idx] ? (
                            <CheckCircle2 size={20} className="text-brand-400 shrink-0 mt-1" />
                          ) : (
                            <button
                              onClick={() => applyAdjustment(analysis.id, idx)}
                              className="shrink-0 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors mt-1"
                            >
                              Aplicar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
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
