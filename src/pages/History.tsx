import { useState } from 'react'
import { Calendar, Clock, ChevronDown, ChevronUp, Download, Upload, Flame, Trash2, Waves, Footprints, Bike, Zap, Thermometer, MoreHorizontal, MapPin } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'
import { exportData, importData } from '@/lib/storage'
import type { WorkoutType, WorkoutSession, WorkoutPlan, CardioType } from '@/types'

const CARDIO_ICONS: Record<CardioType, typeof Waves> = {
  natacao: Waves,
  corrida: Footprints,
  esteira: Zap,
  bike: Bike,
  sauna: Thermometer,
  outro: MoreHorizontal,
}

const CARDIO_LABELS: Record<CardioType, string> = {
  natacao: 'Natação',
  corrida: 'Corrida',
  esteira: 'Esteira',
  bike: 'Bike',
  sauna: 'Sauna',
  outro: 'Outro',
}

function buildFilters(plan: WorkoutPlan, sessions: WorkoutSession[]): { label: string; value: WorkoutType | 'all' }[] {
  const seen = new Map<string, string>()
  plan.workouts.forEach(w => seen.set(w.id, w.label))
  sessions.forEach(s => {
    if (!seen.has(s.workoutType)) seen.set(s.workoutType, s.workoutLabel)
  })
  return [
    { label: 'Todos', value: 'all' },
    ...Array.from(seen.entries()).map(([value, label]) => ({ label, value })),
  ]
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}min ${s}s` : `${s}s`
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)}km`
  return `${meters}m`
}

export function History() {
  const { sessions, cardioSessions, plan, loadFromStorage, deleteSessionResult, deleteCardioSessionResult } = useWorkoutStore()
  const [tab, setTab] = useState<'strength' | 'cardio'>('strength')
  const [filter, setFilter] = useState<WorkoutType | 'all'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [importError, setImportError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const filters = buildFilters(plan, sessions)

  const filtered = sessions
    .filter(s => filter === 'all' || s.workoutType === filter)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const sortedCardio = [...cardioSessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const handleExport = async () => {
    const data = await exportData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `treino-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const result = await importData(ev.target?.result as string)
        await loadFromStorage()
        alert(`Importado: ${result.sessions} sessões, ${result.analyses} análises`)
      } catch {
        setImportError('Arquivo inválido')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Histórico</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors"
            title="Exportar dados"
          >
            <Download size={18} />
          </button>
          <label className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors cursor-pointer" title="Importar dados">
            <Upload size={18} />
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      {importError && (
        <p className="text-red-400 text-sm bg-red-950/40 rounded-xl px-3 py-2">{importError}</p>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('strength')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'strength' ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Musculação
        </button>
        <button
          onClick={() => setTab('cardio')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'cardio' ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Cardio
        </button>
      </div>

      {tab === 'strength' && (
        <>
          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {filters.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <Calendar size={40} className="mx-auto mb-3 opacity-40" />
              <p>Nenhuma sessão registrada</p>
            </div>
          )}

          {filtered.map(session => {
            const isExpanded = expanded === session.id
            const completedExercises = session.exercises.filter(e => e.completed && !e.skipped).length
            const date = new Date(session.date + 'T12:00:00')

            return (
              <div key={session.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="w-full flex items-center justify-between p-4">
                  <button
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                    onClick={() => setExpanded(isExpanded ? null : session.id)}
                  >
                    <div className="bg-gray-800 w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-white leading-none">
                        {date.toLocaleDateString('pt-BR', { day: '2-digit' })}
                      </span>
                      <span className="text-xs text-gray-500 leading-none uppercase">
                        {date.toLocaleDateString('pt-BR', { month: 'short' })}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{session.workoutLabel}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span>{completedExercises} exercícios</span>
                        {session.durationSeconds && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Clock size={11} />
                              {formatDuration(session.durationSeconds)}
                            </span>
                          </>
                        )}
                        {session.caloriesBurned != null && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Flame size={11} />
                              {session.caloriesBurned} kcal
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  {confirmDelete === session.id ? (
                    <div className="flex items-center gap-2 shrink-0 pl-2">
                      <button
                        onClick={() => { deleteSessionResult(session.id); setConfirmDelete(null) }}
                        className="text-xs text-red-400 font-semibold px-2 py-1"
                      >
                        Excluir
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs text-gray-500 px-2 py-1"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 shrink-0 pl-2">
                      <button
                        onClick={() => setConfirmDelete(session.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button onClick={() => setExpanded(isExpanded ? null : session.id)}>
                        {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                      </button>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-800 pt-3">
                    {session.aiFeedback && (
                      <div className="bg-gray-800/60 rounded-xl p-3">
                        <p className="text-xs text-brand-400 font-medium mb-1">Feedback IA</p>
                        <p className="text-xs text-gray-300 leading-relaxed">{session.aiFeedback}</p>
                      </div>
                    )}
                    {session.exercises.filter(e => !e.skipped).map(ex => {
                      const completedSets = ex.sets.filter(s => s.completedAt !== null)
                      if (completedSets.length === 0) return null
                      return (
                        <div key={ex.exerciseId}>
                          <p className="text-sm font-medium text-gray-300 mb-1">{ex.exerciseName}</p>
                          <div className="flex flex-wrap gap-2">
                            {completedSets.map(s => (
                              <span key={s.setNumber} className="text-xs bg-gray-800 text-gray-300 font-mono px-2 py-1 rounded-lg">
                                {s.weight ?? 0}kg×{s.actualReps ?? 0}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {tab === 'cardio' && (
        <>
          {sortedCardio.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <Waves size={40} className="mx-auto mb-3 opacity-40" />
              <p>Nenhuma atividade de cardio registrada</p>
            </div>
          )}

          {sortedCardio.map(c => {
            const Icon = CARDIO_ICONS[c.type]
            const label = c.type === 'outro' ? (c.customTypeLabel || 'Outro') : CARDIO_LABELS[c.type]
            const date = new Date(c.date + 'T12:00:00')

            return (
              <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="w-full flex items-center justify-between p-4">
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <div className="bg-gray-800 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-brand-400">
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{label}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 flex-wrap">
                        <span>{date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {formatDuration(c.durationSeconds)}
                        </span>
                        {c.distanceMeters != null && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <MapPin size={11} />
                              {formatDistance(c.distanceMeters)}
                            </span>
                          </>
                        )}
                        {c.caloriesBurned != null && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Flame size={11} />
                              {c.caloriesBurned} kcal
                            </span>
                          </>
                        )}
                      </div>
                      {c.notes && <p className="text-xs text-gray-500 mt-1">{c.notes}</p>}
                    </div>
                  </div>

                  {confirmDelete === c.id ? (
                    <div className="flex items-center gap-2 shrink-0 pl-2">
                      <button
                        onClick={() => { deleteCardioSessionResult(c.id); setConfirmDelete(null) }}
                        className="text-xs text-red-400 font-semibold px-2 py-1"
                      >
                        Excluir
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs text-gray-500 px-2 py-1"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(c.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors shrink-0 pl-2"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
