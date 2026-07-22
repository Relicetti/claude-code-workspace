import { useEffect, useMemo, useRef, useState } from 'react'
import { api, dateKeysBack } from '../api.js'

const DAYS = 14

const SERIES = [
  { key: 'kcal', label: 'Calorias', unit: 'kcal', color: '#2a78d6', goalKey: 'calorieGoal' },
  { key: 'protein', label: 'Proteina', unit: 'g', color: '#eb6834', goalKey: 'proteinGoal' },
  { key: 'carbs', label: 'Carboidrato', unit: 'g', color: '#1baf7a', goalKey: 'carbGoal' },
  { key: 'fat', label: 'Gordura', unit: 'g', color: '#eda100', goalKey: 'fatGoal' },
]

const GRID_COLOR = '#e1e0d9'
const AXIS_COLOR = '#c3c2b7'
const MUTED_INK = '#898781'
const SECONDARY_INK = '#52514e'
const PRIMARY_INK = '#0b0b0b'
const SURFACE = '#ffffff'

const VB_W = 340
const VB_H = 220
const PLOT_LEFT = 34
const PLOT_RIGHT = 328
const PLOT_TOP = 14
const PLOT_BOTTOM = 168
const LABELS_Y = 186

function shortDate(dateStr) {
  const [, mm, dd] = dateStr.split('-')
  return `${dd}/${mm}`
}

export default function HistoryChart({ goals }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [hoverIdx, setHoverIdx] = useState(null)
  const svgRef = useRef(null)

  const keys = useMemo(() => dateKeysBack(DAYS), [])

  useEffect(() => {
    let cancelled = false
    api
      .getLogSummary(keys[0], keys[keys.length - 1])
      .then((summary) => {
        if (cancelled) return
        const byDate = new Map(summary.map((r) => [r.date, r]))
        setRows(keys.map((date) => byDate.get(date) || { date, kcal: 0, protein: 0, carbs: 0, fat: 0 }))
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [keys])

  if (error) return <div className="history-chart-error">{error}</div>
  if (!rows) return null

  const pctRows = rows.map((row) => {
    const pct = {}
    for (const s of SERIES) {
      const goal = goals[s.goalKey]
      pct[s.key] = goal > 0 ? (row[s.key] / goal) * 100 : 0
    }
    return pct
  })

  const maxPct = Math.max(150, ...pctRows.flatMap((p) => SERIES.map((s) => p[s.key])))
  const yMax = Math.ceil(maxPct / 50) * 50
  const yTicks = []
  for (let v = 0; v <= yMax; v += 50) yTicks.push(v)

  const stepX = keys.length > 1 ? (PLOT_RIGHT - PLOT_LEFT) / (keys.length - 1) : 0
  const xFor = (i) => PLOT_LEFT + stepX * i
  const yFor = (pct) => PLOT_BOTTOM - (pct / yMax) * (PLOT_BOTTOM - PLOT_TOP)

  const paths = SERIES.map((s) => ({
    ...s,
    d: pctRows.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p[s.key])}`).join(' '),
  }))

  const labelStep = Math.ceil(keys.length / 6)
  const tickIdx = []
  for (let i = 0; i < keys.length; i += labelStep) tickIdx.push(i)
  const lastIdx = keys.length - 1
  if (tickIdx[tickIdx.length - 1] !== lastIdx) {
    if (lastIdx - tickIdx[tickIdx.length - 1] < labelStep) tickIdx.pop()
    tickIdx.push(lastIdx)
  }

  function handlePointer(e) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const relX = ((clientX - rect.left) / rect.width) * VB_W
    let idx = Math.round((relX - PLOT_LEFT) / stepX)
    idx = Math.max(0, Math.min(keys.length - 1, idx))
    setHoverIdx(idx)
  }

  const hovered = hoverIdx !== null ? { date: rows[hoverIdx].date, row: rows[hoverIdx], pct: pctRows[hoverIdx] } : null
  const tooltipFlip = hoverIdx !== null && hoverIdx > keys.length - 4
  const tooltipX = hoverIdx !== null ? (tooltipFlip ? xFor(hoverIdx) - 132 : xFor(hoverIdx) + 8) : 0

  return (
    <div className="history-chart">
      <h4 className="history-chart-title">Ultimos {DAYS} dias</h4>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="220"
        onPointerMove={handlePointer}
        onPointerLeave={() => setHoverIdx(null)}
        onTouchMove={handlePointer}
        onTouchEnd={() => setHoverIdx(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PLOT_LEFT}
              x2={PLOT_RIGHT}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke={v === 100 ? AXIS_COLOR : GRID_COLOR}
              strokeWidth="1"
            />
            <text x={PLOT_LEFT - 6} y={yFor(v) + 3} textAnchor="end" fontSize="9" fill={MUTED_INK}>
              {v}%
            </text>
          </g>
        ))}
        <text x={PLOT_RIGHT} y={yFor(100) - 4} textAnchor="end" fontSize="9" fill={MUTED_INK}>
          meta
        </text>

        {tickIdx.map((i) => (
          <text key={keys[i]} x={xFor(i)} y={LABELS_Y} textAnchor="middle" fontSize="9" fill={MUTED_INK}>
            {shortDate(keys[i])}
          </text>
        ))}

        {hoverIdx !== null && (
          <line
            x1={xFor(hoverIdx)}
            x2={xFor(hoverIdx)}
            y1={PLOT_TOP}
            y2={PLOT_BOTTOM}
            stroke={AXIS_COLOR}
            strokeWidth="1"
          />
        )}

        {paths.map((s) => (
          <path key={s.key} d={s.d} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {paths.map((s) => (
          <circle
            key={s.key}
            cx={xFor(lastIdx)}
            cy={yFor(pctRows[lastIdx][s.key])}
            r="5"
            fill={s.color}
            stroke={SURFACE}
            strokeWidth="2"
          />
        ))}

        {hoverIdx !== null &&
          SERIES.map((s) => (
            <circle
              key={s.key}
              cx={xFor(hoverIdx)}
              cy={yFor(hovered.pct[s.key])}
              r="4"
              fill={s.color}
              stroke={SURFACE}
              strokeWidth="2"
            />
          ))}

        {hovered && (
          <g transform={`translate(${tooltipX}, ${PLOT_TOP})`}>
            <rect width="124" height="92" rx="6" fill={SURFACE} stroke={GRID_COLOR} strokeWidth="1" />
            <text x="10" y="16" fontSize="10" fontWeight="700" fill={PRIMARY_INK}>
              {shortDate(hovered.date)}
            </text>
            {SERIES.map((s, i) => (
              <g key={s.key} transform={`translate(10, ${32 + i * 15})`}>
                <rect width="10" height="3" y="-4" fill={s.color} />
                <text x="16" y="0" fontSize="9" fill={SECONDARY_INK}>
                  {s.label}
                </text>
                <text x="108" y="0" textAnchor="end" fontSize="9" fontWeight="700" fill={PRIMARY_INK}>
                  {Math.round(hovered.row[s.key])} {s.unit}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
      <div className="history-chart-legend">
        {SERIES.map((s) => (
          <span className="history-chart-legend-item" key={s.key}>
            <span className="history-chart-legend-swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
