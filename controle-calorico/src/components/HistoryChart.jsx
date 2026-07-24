import { useEffect, useMemo, useRef, useState } from 'react'
import { api, dateKeysBack } from '../api.js'
import { DAY_TYPE_BY_KEY, DEFAULT_DAY_TYPE } from '../dayTypes.js'

const DAYS = 14

const SERIES = [
  { key: 'kcal', label: 'Calorias', unit: 'kcal', color: '#2a78d6', goalKey: 'calorieGoal', dash: null, fill: true },
  { key: 'protein', label: 'Proteina', unit: 'g', color: '#eb6834', goalKey: 'proteinGoal', dash: '7 4' },
  { key: 'carbs', label: 'Carboidrato', unit: 'g', color: '#1baf7a', goalKey: 'carbGoal', dash: '1.5 3.5' },
  { key: 'fat', label: 'Gordura', unit: 'g', color: '#eda100', goalKey: 'fatGoal', dash: '7 3 1.5 3' },
]

const GRID_COLOR = '#e1e0d9'
const AXIS_COLOR = '#c3c2b7'
const MUTED_INK = '#898781'

const VB_W = 340
const VB_H = 220
const PLOT_TOP = 14
const PLOT_BOTTOM = 168
const PLOT_LEFT = 34
const PLOT_RIGHT = 328
const LABELS_Y = 186
const DOT_R = 2.75
const DOT_R_HOVER = 4.5

function shortDate(dateStr) {
  const [, mm, dd] = dateStr.split('-')
  return `${dd}/${mm}`
}

// Catmull-Rom -> cubic Bezier smoothing, so the line reads as a soft curve
// instead of a straight-segment polyline (matches the reference chart look).
function smoothPath(points) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }
  return d
}

function formatDeficit(value) {
  const rounded = Math.round(value)
  return rounded >= 0 ? `${rounded} kcal` : `-${Math.abs(rounded)} kcal`
}

const DEFAULT_PRESET = DAY_TYPE_BY_KEY[DEFAULT_DAY_TYPE]

export default function HistoryChart({ large = false }) {
  const [rows, setRows] = useState(null)
  const [dayGoals, setDayGoals] = useState(null)
  const [error, setError] = useState(null)
  const [hoverIdx, setHoverIdx] = useState(null)
  const svgRef = useRef(null)

  const keys = useMemo(() => dateKeysBack(DAYS), [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.getLogSummary(keys[0], keys[keys.length - 1]),
      api.getDayTypeSummary(keys[0], keys[keys.length - 1]),
    ])
      .then(([summary, dayTypes]) => {
        if (cancelled) return
        const byDate = new Map(summary.map((r) => [r.date, r]))
        setRows(keys.map((date) => byDate.get(date) || { date, kcal: 0, protein: 0, carbs: 0, fat: 0 }))
        const goalsByDate = new Map(dayTypes.map((r) => [r.date, r]))
        setDayGoals(
          keys.map(
            (date) =>
              goalsByDate.get(date) || {
                date,
                calorieGoal: DEFAULT_PRESET.calorieGoal,
                proteinGoal: DEFAULT_PRESET.proteinGoal,
                carbGoal: DEFAULT_PRESET.carbGoal,
                fatGoal: DEFAULT_PRESET.fatGoal,
                expenditure: DEFAULT_PRESET.expenditure,
              }
          )
        )
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [keys])

  if (error) return <div className="history-chart-error">{error}</div>
  if (!rows || !dayGoals) return null

  const pctRows = rows.map((row, i) => {
    const pct = {}
    for (const s of SERIES) {
      const goal = dayGoals[i][s.goalKey]
      pct[s.key] = goal > 0 ? (row[s.key] / goal) * 100 : 0
    }
    return pct
  })

  const maxPct = Math.max(150, ...pctRows.flatMap((p) => SERIES.map((s) => p[s.key])))
  const yMax = Math.ceil(maxPct / 50) * 50
  const yTicks = []
  for (let v = 0; v <= yMax; v += 50) yTicks.push(v)
  const yFor = (pct) => PLOT_BOTTOM - (pct / yMax) * (PLOT_BOTTOM - PLOT_TOP)

  const stepX = keys.length > 1 ? (PLOT_RIGHT - PLOT_LEFT) / (keys.length - 1) : 0
  const xFor = (i) => PLOT_LEFT + stepX * i

  const seriesPoints = SERIES.map((s) => ({
    ...s,
    points: pctRows.map((p, i) => ({ x: xFor(i), y: yFor(p[s.key]) })),
  }))

  const lastIdx = keys.length - 1

  const labelStep = Math.ceil(keys.length / 6)
  const tickIdx = []
  for (let i = 0; i < keys.length; i += labelStep) tickIdx.push(i)
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

  const hovered =
    hoverIdx !== null
      ? { date: rows[hoverIdx].date, row: rows[hoverIdx], pct: pctRows[hoverIdx], dayGoal: dayGoals[hoverIdx] }
      : null

  const baselineY = yFor(0)

  // width is always 100% of the container and height follows via aspect-ratio,
  // so the whole timeline always fits on screen without needing horizontal
  // scroll/drag — it just renders bigger in a wider container (e.g. the
  // fullscreen "large" history screen vs. the compact inline preview).
  const plotSvg = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      style={{ width: '100%', height: 'auto', aspectRatio: `${VB_W} / ${VB_H}` }}
      onPointerMove={handlePointer}
      onPointerLeave={() => setHoverIdx(null)}
      onTouchMove={handlePointer}
      onTouchEnd={() => setHoverIdx(null)}
    >
      <defs>
        {seriesPoints
          .filter((s) => s.fill)
          .map((s) => (
            <linearGradient key={s.key} id={`history-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
      </defs>

      {yTicks.map((v) => (
        <line
          key={v}
          x1={PLOT_LEFT}
          x2={PLOT_RIGHT}
          y1={yFor(v)}
          y2={yFor(v)}
          stroke={v === 100 ? AXIS_COLOR : GRID_COLOR}
          strokeWidth="1"
        />
      ))}
      {yTicks.map((v) => (
        <text key={v} x={PLOT_LEFT - 6} y={yFor(v) + 3} textAnchor="end" fontSize="9" fill={MUTED_INK}>
          {v}%
        </text>
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
        <line x1={xFor(hoverIdx)} x2={xFor(hoverIdx)} y1={PLOT_TOP} y2={PLOT_BOTTOM} stroke={AXIS_COLOR} strokeWidth="1" />
      )}

      {/* filled area under the primary series */}
      {seriesPoints
        .filter((s) => s.fill)
        .map((s) => (
          <path
            key={`area-${s.key}`}
            d={`${smoothPath(s.points)} L ${xFor(lastIdx)} ${baselineY} L ${xFor(0)} ${baselineY} Z`}
            fill={`url(#history-fill-${s.key})`}
            stroke="none"
          />
        ))}

      {/* lines */}
      {seriesPoints.map((s) => (
        <path
          key={s.key}
          d={smoothPath(s.points)}
          fill="none"
          stroke={s.color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={s.dash || undefined}
        />
      ))}

      {/* a dot on every data point, so the shape of the series reads clearly */}
      {seriesPoints.map((s) =>
        s.points.map((p, i) => (
          <circle
            key={`${s.key}-${i}`}
            cx={p.x}
            cy={p.y}
            r={hoverIdx === i ? DOT_R_HOVER : DOT_R}
            fill={s.color}
            stroke="#ffffff"
            strokeWidth={hoverIdx === i ? 2 : 1.5}
          />
        ))
      )}
    </svg>
  )

  return (
    <div className={`history-chart${large ? ' history-chart-large' : ''}`}>
      <div className="history-chart-legend">
        {SERIES.map((s) => (
          <span className="history-chart-legend-item" key={s.key}>
            <svg width="20" height="8" className="history-chart-legend-swatch">
              <line
                x1="0"
                x2="20"
                y1="4"
                y2="4"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={s.dash || undefined}
              />
            </svg>
            {s.label}
          </span>
        ))}
      </div>
      {!large && <h4 className="history-chart-title">Ultimos {DAYS} dias</h4>}
      {plotSvg}

      {/* Detail panel lives below the chart (plain HTML, not overlaid on the SVG)
          so it never covers the curves it's describing. */}
      <div className="history-detail-panel">
        {hovered ? (
          <>
            <div className="history-detail-date">{shortDate(hovered.date)}</div>
            <div className="history-detail-grid">
              {SERIES.map((s) => (
                <div className="history-detail-item" key={s.key}>
                  <svg width="14" height="6" className="history-detail-swatch">
                    <line
                      x1="0"
                      x2="14"
                      y1="3"
                      y2="3"
                      stroke={s.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={s.dash || undefined}
                    />
                  </svg>
                  <span className="history-detail-label">{s.label}</span>
                  <span className="history-detail-value">
                    {Math.round(hovered.row[s.key])} {s.unit}
                  </span>
                </div>
              ))}
            </div>
            {hovered.dayGoal.expenditure ? (
              <div className="history-detail-deficit">
                <div className="history-detail-item">
                  <span className="history-detail-label">Gasto estimado</span>
                  <span className="history-detail-value">{Math.round(hovered.dayGoal.expenditure)} kcal</span>
                </div>
                <div className="history-detail-item">
                  <span className="history-detail-label">Deficit previsto</span>
                  <span className="history-detail-value">
                    {formatDeficit(hovered.dayGoal.expenditure - hovered.dayGoal.calorieGoal)}
                  </span>
                </div>
                <div className="history-detail-item">
                  <span className="history-detail-label">Deficit real</span>
                  <span className="history-detail-value">
                    {formatDeficit(hovered.dayGoal.expenditure - hovered.row.kcal)}
                  </span>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="history-detail-hint">Toque no grafico pra ver os valores de cada dia.</div>
        )}
      </div>
    </div>
  )
}
