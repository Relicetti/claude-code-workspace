import { useState } from 'react'

const buildDate = new Date(__BUILD_TIME__)

function formatShort(): string {
  return buildDate.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFull(): string {
  return buildDate.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function BuildBadge() {
  const [expanded, setExpanded] = useState(false)

  return (
    <button
      onClick={() => setExpanded(v => !v)}
      className="fixed bottom-[68px] right-2 z-50 text-[10px] font-mono text-gray-600/80 bg-gray-950/70 backdrop-blur px-1.5 py-0.5 rounded-md active:text-gray-400"
    >
      {expanded ? `build ${formatFull()} · ${__BUILD_COMMIT__}` : formatShort()}
    </button>
  )
}
