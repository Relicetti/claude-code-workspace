import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus as MinusIcon } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'
import type { WorkoutSession } from '@/types'

// The same real-world exercise can carry different exerciseIds across
// sessions — the plan's own id, a substitute's synthetic id, or an imported
// history entry's id — so group by name instead, otherwise today's set gets
// tracked as a "different" exercise from past sessions of the same lift.
//
// Plan rewrites (e.g. switching to a coach's PPL plan) also renamed a few
// exercises that are the same real movement — grouping by exact name alone
// splits their history right at the switch. Canonicalize known renames so
// they keep merging; only exercises confirmed to be the same movement are
// listed here, not just similarly-named ones (e.g. "Rosca scott" and "Rosca
// direta" are different lifts and are deliberately NOT merged).
const EXERCISE_NAME_ALIASES: Record<string, string> = {
  'supino reto barra/máquina': 'supino reto máquina',
  'elevação lateral': 'elevação lateral máquina',
  'stiff/levantamento romeno': 'stiff máquina/polia',
  'crucifixo/peck deck': 'peck deck',
  'fly machine (peck deck)': 'peck deck',
  'rosca alternada/martelo': 'rosca martelo polia',
  'face pull / rear delt': 'face pull',
  'remada baixa cabo': 'remada máquina baixa',
  'puxada frente/barra fixa': 'puxada frente pegada aberta',
  'leg press': 'leg press 45°',
}

function normalizeExerciseName(name: string): string {
  const key = name.trim().toLowerCase()
  return EXERCISE_NAME_ALIASES[key] ?? key
}

// Only exercises that actually have a logged set with a registered weight —
// plan exercises never performed shouldn't show up with an empty chart.
function getLoggedExercises(sessions: WorkoutSession[]) {
  const byKey = new Map<string, string>()
  sessions.forEach(s => {
    s.exercises.forEach(e => {
      if (e.skipped) return
      const hasLoggedWeight = e.sets.some(st => st.completedAt !== null && st.weight != null)
      if (!hasLoggedWeight) return
      const key = normalizeExerciseName(e.exerciseName)
      if (!byKey.has(key)) byKey.set(key, e.exerciseName)
    })
  })
  return Array.from(byKey.entries()).map(([id, name]) => ({ id, name }))
}

export function Progress() {
  const { sessions } = useWorkoutStore()
  const allExercises = getLoggedExercises(sessions)
  const [selectedId, setSelectedId] = useState(allExercises[0]?.id ?? '')

  const chartData = sessions
    .filter(s => s.exercises.some(e => normalizeExerciseName(e.exerciseName) === selectedId && !e.skipped))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(session => {
      const ex = session.exercises.find(e => normalizeExerciseName(e.exerciseName) === selectedId)
      const doneSets = ex?.sets.filter(s => s.completedAt !== null) ?? []
      const maxWeight = doneSets.length > 0
        ? Math.max(...doneSets.map(s => s.weight ?? 0))
        : 0
      const volume = doneSets.reduce((acc, s) => acc + (s.weight ?? 0) * (s.actualReps ?? 0), 0)
      return {
        date: new Date(session.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        maxWeight,
        volume,
        sets: doneSets.length,
      }
    })

  // Progress comparison: last two sessions
  const trend =
    chartData.length >= 2
      ? chartData[chartData.length - 1].maxWeight > chartData[chartData.length - 2].maxWeight
        ? 'up'
        : chartData[chartData.length - 1].maxWeight < chartData[chartData.length - 2].maxWeight
        ? 'down'
        : 'same'
      : null

  return (
    <div className="px-4 py-4 pb-24 space-y-5">
      <h1 className="text-xl font-bold text-white">Progresso</h1>

      {/* Exercise selector */}
      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-2">Exercício</label>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="w-full bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-3 text-sm focus:border-brand-500 outline-none"
        >
          {allExercises.map(ex => (
            <option key={ex.id} value={ex.id}>{ex.name}</option>
          ))}
        </select>
      </div>

      {/* Trend indicator */}
      {trend && (
        <div className={`flex items-center gap-2 p-3 rounded-xl ${
          trend === 'up' ? 'bg-brand-950/40 border border-brand-800' :
          trend === 'down' ? 'bg-red-950/40 border border-red-800' :
          'bg-gray-800/40 border border-gray-700'
        }`}>
          {trend === 'up' && <TrendingUp size={18} className="text-brand-400" />}
          {trend === 'down' && <TrendingDown size={18} className="text-red-400" />}
          {trend === 'same' && <MinusIcon size={18} className="text-gray-400" />}
          <div>
            <p className={`text-sm font-semibold ${
              trend === 'up' ? 'text-brand-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400'
            }`}>
              {trend === 'up' ? 'Progressão!' : trend === 'down' ? 'Queda de carga' : 'Carga estável'}
            </p>
            <p className="text-xs text-gray-500">
              Última: {chartData[chartData.length - 1]?.maxWeight}kg · Anterior: {chartData[chartData.length - 2]?.maxWeight}kg
            </p>
          </div>
        </div>
      )}

      {chartData.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <TrendingUp size={40} className="mx-auto mb-3 opacity-40" />
          <p>Nenhum dado para este exercício</p>
          <p className="text-sm mt-1">Complete alguns treinos para ver o progresso</p>
        </div>
      ) : (
        <>
          {/* Max weight chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-4">Carga máxima por sessão (kg)</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    color: '#f9fafb',
                  }}
                  formatter={(value: number) => [`${value}kg`, 'Carga máxima']}
                />
                <Line
                  type="monotone"
                  dataKey="maxWeight"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  dot={{ fill: '#22c55e', r: 4 }}
                  activeDot={{ r: 6, fill: '#4ade80' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Volume chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-4">Volume por sessão (kg)</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    color: '#f9fafb',
                  }}
                  formatter={(value: number) => [`${value}kg`, 'Volume']}
                />
                <Line
                  type="monotone"
                  dataKey="volume"
                  stroke="#60a5fa"
                  strokeWidth={2.5}
                  dot={{ fill: '#60a5fa', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Recent sessions table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Últimas sessões</p>
            <div className="space-y-2">
              {[...chartData].reverse().slice(0, 6).map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{d.date}</span>
                  <span className="font-mono font-bold text-white">{d.maxWeight}kg</span>
                  <span className="text-gray-500">{d.sets} séries</span>
                  <span className="text-gray-400">{d.volume}kg vol.</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
