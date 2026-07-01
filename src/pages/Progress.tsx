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
import type { WorkoutPlan } from '@/types'

function getAllExercises(plan: WorkoutPlan) {
  const exs: { id: string; name: string }[] = []
  plan.workouts.forEach(w => {
    w.exercises.forEach(e => {
      if (!exs.find(x => x.id === e.id)) {
        exs.push({ id: e.id, name: e.name })
      }
    })
  })
  return exs
}

export function Progress() {
  const { sessions, plan } = useWorkoutStore()
  const allExercises = getAllExercises(plan)
  const [selectedId, setSelectedId] = useState(allExercises[0]?.id ?? '')

  const chartData = sessions
    .filter(s => s.exercises.some(e => e.exerciseId === selectedId && !e.skipped))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(session => {
      const ex = session.exercises.find(e => e.exerciseId === selectedId)
      const doneSets = ex?.sets.filter(s => s.completedAt !== null) ?? []
      const avgWeight = doneSets.length > 0
        ? doneSets.reduce((acc, s) => acc + (s.weight ?? 0), 0) / doneSets.length
        : 0
      const maxWeight = doneSets.length > 0
        ? Math.max(...doneSets.map(s => s.weight ?? 0))
        : 0
      const avgReps = doneSets.length > 0
        ? doneSets.reduce((acc, s) => acc + (s.actualReps ?? 0), 0) / doneSets.length
        : 0
      return {
        date: new Date(session.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        avgWeight: parseFloat(avgWeight.toFixed(1)),
        maxWeight,
        avgReps: parseFloat(avgReps.toFixed(1)),
        sets: doneSets.length,
      }
    })

  // Progress comparison: last two sessions
  const trend =
    chartData.length >= 2
      ? chartData[chartData.length - 1].avgWeight > chartData[chartData.length - 2].avgWeight
        ? 'up'
        : chartData[chartData.length - 1].avgWeight < chartData[chartData.length - 2].avgWeight
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
              Última: {chartData[chartData.length - 1]?.avgWeight}kg · Anterior: {chartData[chartData.length - 2]?.avgWeight}kg
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
          {/* Weight chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-4">Carga média por sessão (kg)</p>
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
                  formatter={(value: number) => [`${value}kg`, 'Carga média']}
                />
                <Line
                  type="monotone"
                  dataKey="avgWeight"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  dot={{ fill: '#22c55e', r: 4 }}
                  activeDot={{ r: 6, fill: '#4ade80' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Reps chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-4">Reps médias por sessão</p>
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
                  formatter={(value: number) => [`${value}`, 'Reps médias']}
                />
                <Line
                  type="monotone"
                  dataKey="avgReps"
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
                  <span className="font-mono font-bold text-white">{d.avgWeight}kg</span>
                  <span className="text-gray-500">{d.sets} séries</span>
                  <span className="text-gray-400">{d.avgReps} reps</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
