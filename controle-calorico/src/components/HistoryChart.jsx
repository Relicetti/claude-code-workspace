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
const SECONDARY_INK = '#52514e'
const PRIMARY_INK = '#0b0b0b'
const SURFACE = '#ffffff'

const VB_H = 220
const PLOT_TOP = 14
const PLOT_BOTTOM = 168
const LABELS_Y = 186
const AXIS_W = 34
const LARGE_SCALE = 2.3
const LARGE_DAY_W = 22
const TOOLTIP_W = 130
const TOOLTIP_H = 185
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

const DEFAULT_PRESET = DAY_TYPE_BY_KEY[DEFAULT_DAY_TYPE]

export default function HistoryChart({ large = false }) {
  const [rows, setRows] = useState(null)
  const [dayGoals, setDayGoals] = useState(null)
  const [error, setError] = useState(null)
  const [hoverIdx, setHoverIdx] = useState(null)
  const [tooltipX, setTooltipX] = useState(0)
  const svgRef = useRef(null)
  const scrollRef = useRef(null)

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

  const PLOT_LEFT = large ? 10 : 34
  const PLOT_RIGHT = large ? PLOT_LEFT + LARGE_DAY_W * (keys.length - 1) : 328
  const VB_W = large ? PLOT_RIGHT + 24 : 340

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

    const container = scrollRef.current || svg
    const containerRect = container.getBoundingClientRect()
    const scale = rect.width / VB_W
    const visibleMinX = (Math.max(rect.left, containerRect.left) - rect.left) / scale
    const visibleMaxX = (Math.min(rect.right, containerRect.right) - rect.left) / scale
    const preferred = xFor(idx) + 8
    // Keep the left edge in view above all else: if the visible window is
    // narrower than the tooltip (small phones, zoomed-in large mode), the
    // left-bound clamp must win so labels never scroll off before values do.
    let clamped = Math.max(preferred, visibleMinX + 4)
    clamped = Math.min(clamped, visibleMaxX - TOOLTIP_W - 4)
    clamped = Math.max(clamped, visibleMinX + 4)
    setTooltipX(clamped)
  }

  const hovered =
    hoverIdx !== null
      ? { date: rows[hoverIdx].date, row: rows[hoverIdx], pct: pctRows[hoverIdx], dayGoal: dayGoals[hoverIdx] }
      : null

  function formatDeficit(value) {
    const rounded = Math.round(value)
    return rounded >= 0 ? `${rounded} kcal` : `-${Math.abs(rounded)} kcal`
  }

  const axisSvg = large && (
    <svg viewBox={`0 0 ${AXIS_W} ${VB_H}`} width={AXIS_W * LARGE_SCALE} height={VB_H * LARGE_SCALE} className="history-chart-axis">
      {yTicks.map((v) => (
        <text key={v} x={AXIS_W - 6} y={yFor(v) + 3} textAnchor="end" fontSize="9" fill={MUTED_INK}>
          {v}%
        </text>
      ))}
    </svg>
  )

  const baselineY = yFor(0)

  const plotSvg = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={large ? VB_W * LARGE_SCALE : '100%'}
      height={large ? VB_H * LARGE_SCALE : VB_H}
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
      {!large &&
        yTicks.map((v) => (
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
            stroke={SURFACE}
            strokeWidth={hoverIdx === i ? 2 : 1.5}
          />
        ))
      )}

      {hovered && (
        <g transform={`translate(${tooltipX}, ${PLOT_TOP})`}>
          <rect width={TOOLTIP_W} height={TOOLTIP_H} rx="6" fill={SURFACE} stroke={GRID_COLOR} strokeWidth="1" />
          <text x="10" y="16" fontSize="10" fontWeight="700" fill={PRIMARY_INK}>
            {shortDate(hovered.date)}
          </text>

          {SERIES.map((s, i) => (
            <g key={s.key} transform={`translate(${10 + (i % 2) * (TOOLTIP_W / 2 - 10)}, ${30 + Math.floor(i / 2) * 30})`}>
              <line x1="0" x2="9" y1="-9" y2="-9" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash || undefined} />
              <text x="0" y="0" fontSize="8" fill={SECONDARY_INK}>
                {s.label}
              </text>
              <text x="0" y="11" fontSize="10" fontWeight="700" fill={PRIMARY_INK}>
                {Math.round(hovered.row[s.key])} {s.unit}
              </text>
            </g>
          ))}

          {hovered.dayGoal.expenditure && (
            <>
              <line x1="10" x2={TOOLTIP_W - 10} y1="86" y2="86" stroke={GRID_COLOR} strokeWidth="1" />
              <g transform="translate(10, 104)">
                <text x="0" y="0" fontSize="8" fill={SECONDARY_INK}>
                  Gasto estimado
                </text>
                <text x="0" y="11" fontSize="10" fontWeight="700" fill={PRIMARY_INK}>
                  {Math.round(hovered.dayGoal.expenditure)} kcal
                </text>
              </g>
              <g transform="translate(10, 134)">
                <text x="0" y="0" fontSize="8" fill={SECONDARY_INK}>
                  Deficit previsto
                </text>
                <text x="0" y="11" fontSize="10" fontWeight="700" fill={PRIMARY_INK}>
                  {formatDeficit(hovered.dayGoal.expenditure - hovered.dayGoal.calorieGoal)}
                </text>
              </g>
              <g transform="translate(10, 164)">
                <text x="0" y="0" fontSize="8" fill={SECONDARY_INK}>
                  Deficit real
                </text>
                <text x="0" y="11" fontSize="10" fontWeight="700" fill={PRIMARY_INK}>
                  {formatDeficit(hovered.dayGoal.expenditure - hovered.row.kcal)}
                </text>
              </g>
            </>
          )}
        </g>
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
      {large ? (
        <div className="history-chart-row">
          {axisSvg}
          <div className="history-chart-scroll" ref={scrollRef}>
            {plotSvg}
          </div>
        </div>
      ) : (
        plotSvg
      )}
    </div>
  )
}
