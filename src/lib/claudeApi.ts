import type {
  Exercise,
  WorkoutSession,
  WorkoutPlan,
  AIAlternativesResponse,
  AIAnalyticsResponse,
} from '@/types'
import { useWorkoutStore } from '@/store/workoutStore'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined

async function callClaude(systemPrompt: string, userMessage: string, maxTokens = 1024): Promise<string> {
  if (!API_KEY) {
    throw new Error('VITE_ANTHROPIC_API_KEY não configurada. Adicione no arquivo .env ou nas variáveis do Railway.')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Anthropic API error ${response.status}: ${err}`)
  }

  const data = await response.json() as { content: { type: string; text: string }[]; stop_reason?: string }
  const textBlock = data.content.find(b => b.type === 'text')
  if (!textBlock) throw new Error('Resposta vazia da API')
  if (data.stop_reason === 'max_tokens') {
    throw new Error('A resposta da IA foi cortada por ficar longa demais. Tenta de novo — geralmente resolve.')
  }
  return textBlock.text
}

function parseJSON<T>(raw: string): T {
  const match = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/(\{[\s\S]*\})/)
  const jsonStr = match ? match[1] : raw
  try {
    return JSON.parse(jsonStr) as T
  } catch {
    throw new Error('A IA respondeu num formato inesperado. Tenta de novo.')
  }
}

function getShoulderContext(): string {
  return useWorkoutStore.getState().plan.userNotes
}

// Averaging weight across sets hides real progression on pyramid-style
// schemes (e.g. 120/160/200/220kg) — the average lands nowhere near what
// was actually worked. List each set and call out the top-set weight
// instead, so the AI reasons about what was actually lifted.
function formatSetDetails(sets: WorkoutSession['exercises'][number]['sets']): string {
  const done = sets.filter(s => s.completedAt !== null)
  if (done.length === 0) return 'não realizado'
  const detail = done.map(s => `${s.weight ?? 0}kg×${s.actualReps ?? 0}`).join(', ')
  const maxWeight = Math.max(...done.map(s => s.weight ?? 0))
  return `${done.length} séries (${detail}) — carga máxima: ${maxWeight}kg`
}

export async function getExerciseAlternatives(
  exercise: Exercise,
  reason: string,
  suggestedExercise?: string,
): Promise<AIAlternativesResponse> {
  const isUpperBody = exercise.muscleGroups.some(m =>
    ['peito', 'ombro', 'triceps', 'costas', 'biceps', 'trapezio'].includes(m),
  )

  const systemPrompt = `Você é um personal trainer especializado em musculação e reabilitação.
Responda APENAS com JSON válido, sem texto adicional antes ou depois.
Formato exigido:
{
  "alternatives": [
    {
      "name": "Nome do exercício",
      "sets": 3,
      "repsMin": 10,
      "repsMax": 12,
      "reason": "Justificativa curta de por que é uma boa substituição"
    }
  ]
}

${isUpperBody ? `RESTRIÇÃO CRÍTICA DO ATLETA:\n${getShoulderContext()}` : ''}`

  const suggestionInstruction = suggestedExercise
    ? `\n\nO atleta sugeriu especificamente este exercício: "${suggestedExercise}". Avalie essa sugestão primeiro:
- Se for adequada (respeitando a restrição do ombro quando aplicável), inclua ela como a PRIMEIRA alternativa, com séries/reps ajustados ao contexto.
- Se não for adequada ou for arriscada, ainda assim inclua ela na lista mas explique claramente na justificativa por que não é ideal, e ofereça as outras alternativas como opções mais seguras.`
    : ''

  const userMessage = `Exercício a substituir: ${exercise.name}
Grupos musculares: ${exercise.muscleGroups.join(', ')}
Motivo da troca: ${reason}
Séries/reps originais: ${exercise.sets}x${exercise.repsMin}-${exercise.repsMax}

Sugira 2-3 alternativas disponíveis numa academia comum, priorizando máquinas e movimentos controlados.${suggestionInstruction}`

  const raw = await callClaude(systemPrompt, userMessage)
  return parseJSON<AIAlternativesResponse>(raw)
}

export async function getSessionFeedback(
  session: WorkoutSession,
  previousSession: WorkoutSession | null,
): Promise<string> {
  const systemPrompt = `Você é um personal trainer direto e honesto.
Dê feedback curto (3-5 frases) sobre a sessão de treino.
Reconheça progresso real (com números), aponte estagnação se houver, e mencione o contexto de lesão no ombro quando relevante.
Tom: direto, sem enrolação, sem elogio vazio. Como um personal que também é amigo.
NÃO use JSON. Responda em texto simples em português.`

  const exerciseSummary = session.exercises
    .filter(e => !e.skipped)
    .map(e => {
      let prevInfo = ''
      if (previousSession) {
        const prevEx = previousSession.exercises.find(pe => pe.exerciseId === e.exerciseId)
        if (prevEx) {
          const prevDone = prevEx.sets.filter(s => s.completedAt !== null)
          if (prevDone.length > 0) {
            const prevMax = Math.max(...prevDone.map(s => s.weight ?? 0))
            prevInfo = ` (sessão anterior — carga máxima: ${prevMax}kg)`
          }
        }
      }

      return `- ${e.exerciseName}: ${formatSetDetails(e.sets)}${prevInfo}`
    })
    .join('\n')

  const duration = session.durationSeconds
    ? `Duração: ${Math.round(session.durationSeconds / 60)} minutos`
    : ''

  const userMessage = `Sessão: ${session.workoutLabel} — ${new Date(session.date).toLocaleDateString('pt-BR')}
${duration}

Exercícios:
${exerciseSummary}

Contexto do atleta:
${getShoulderContext()}`

  return callClaude(systemPrompt, userMessage)
}

export async function getWeeklyAnalysis(
  sessions: WorkoutSession[],
  previousWeekSessions: WorkoutSession[],
  plan: WorkoutPlan,
): Promise<AIAnalyticsResponse> {
  const planSummary = plan.workouts.map(w => {
    const exList = w.exercises
      .map(e => `  - ${e.name} (${e.muscleGroups.join(', ')}) — ${e.sets}x${e.repsMin === e.repsMax ? e.repsMax : `${e.repsMin}-${e.repsMax}`}`)
      .join('\n')
    return `${w.label}:\n${exList}`
  }).join('\n\n')

  const systemPrompt = `Você é um personal trainer especializado em hipertrofia e reabilitação.
Responda APENAS com JSON válido, sem texto adicional.
Formato exigido:
{
  "summary": "Resumo direto da semana em 2-4 frases",
  "adjustments": [
    {
      "type": "increase_weight|decrease_volume|increase_volume|swap_exercise|rest_exercise",
      "exerciseName": "Nome do exercício",
      "suggestion": "O que fazer de forma concreta",
      "justification": "Por que fazer isso",
      "targetSets": null,
      "targetRepsMin": null,
      "targetRepsMax": null,
      "substituteExerciseName": null
    }
  ]
}

PLANO DE TREINO ATUAL DO ATLETA (esta é a referência de verdade — não sugira "adicionar" um exercício ou grupo muscular que já está listado aqui; se ele não apareceu na sessão da semana, é porque não foi feito, não porque falta no plano):
${planSummary}

CONTEXTO DO ATLETA:
${getShoulderContext()}`

  const sessionsSummary = sessions.map(s => {
    const exSummary = s.exercises
      .filter(e => !e.skipped)
      .map(e => `  ${e.exerciseName}: ${formatSetDetails(e.sets)}`)
      .join('\n')
    return `${s.workoutLabel} (${new Date(s.date).toLocaleDateString('pt-BR')}):\n${exSummary}`
  }).join('\n\n')

  const prevSummary = previousWeekSessions.length > 0
    ? `\nSemana anterior (referência):\n${previousWeekSessions.map(s =>
        `${s.workoutLabel}: ${s.exercises.filter(e => !e.skipped).length} exercícios completados`
      ).join('\n')}`
    : '\nNão há dados da semana anterior para comparação.'

  const userMessage = `Semana atual:\n${sessionsSummary}${prevSummary}

Analise o progresso, volume por grupo muscular, e sugira ajustes concretos no plano. Máx 5 sugestões prioritárias.`

  const raw = await callClaude(systemPrompt, userMessage, 2048)
  return parseJSON<AIAnalyticsResponse>(raw)
}
