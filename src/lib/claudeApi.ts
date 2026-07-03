import type {
  Exercise,
  WorkoutSession,
  WorkoutPlan,
  CardioSession,
  ShapeAssessment,
  AIAlternativesResponse,
  AIAnalyticsResponse,
} from '@/types'
import { useWorkoutStore } from '@/store/workoutStore'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined

type MessageContent =
  | string
  | ({ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } })[]

async function callClaude(systemPrompt: string, userMessage: MessageContent, maxTokens = 1024): Promise<string> {
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

const CARDIO_LABELS: Record<CardioSession['type'], string> = {
  natacao: 'Natação',
  corrida: 'Corrida',
  esteira: 'Esteira',
  bike: 'Bike',
  sauna: 'Sauna',
  outro: 'Outro',
}

function formatCardioSummary(cardioSessions: CardioSession[]): string {
  if (cardioSessions.length === 0) return 'Nenhum cardio registrado.'
  return cardioSessions
    .map(c => {
      const label = c.type === 'outro' ? (c.customTypeLabel || 'Outro') : CARDIO_LABELS[c.type]
      const minutes = Math.round(c.durationSeconds / 60)
      const distance = c.distanceMeters != null ? `, ${c.distanceMeters}m` : ''
      const calories = c.caloriesBurned != null ? `, ${c.caloriesBurned}kcal` : ''
      return `  ${label} (${new Date(c.date).toLocaleDateString('pt-BR')}): ${minutes}min${distance}${calories}`
    })
    .join('\n')
}

export async function getWeeklyAnalysis(
  sessions: WorkoutSession[],
  previousWeekSessions: WorkoutSession[],
  plan: WorkoutPlan,
  cardioSessions: CardioSession[] = [],
  previousWeekCardioSessions: CardioSession[] = [],
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
      "targetWeight": null,
      "substituteExerciseName": null
    }
  ]
}

Para sugestões do tipo "increase_weight", SEMPRE preencha "targetWeight" com um número concreto em kg (a carga recomendada pra próxima sessão, baseada na carga máxima real que o atleta já levantou nesse exercício). Esse valor será usado para pré-preencher a carga automaticamente na próxima vez que o atleta for treinar esse exercício, então precisa ser um número específico, nunca null nesse caso.

PLANO DE TREINO ATUAL DO ATLETA (esta é a referência de verdade — não sugira "adicionar" um exercício ou grupo muscular que já está listado aqui; se ele não apareceu na sessão da semana, é porque não foi feito, não porque falta no plano):
${planSummary}

CONTEXTO DO ATLETA:
${getShoulderContext()}`

  const sessionsSummary = sessions.map(s => {
    const exSummary = s.exercises
      .filter(e => !e.skipped)
      .map(e => `  ${e.exerciseName}: ${formatSetDetails(e.sets)}`)
      .join('\n')
    const duration = s.durationSeconds != null ? `${Math.round(s.durationSeconds / 60)}min` : 'duração não registrada'
    const calories = s.caloriesBurned != null ? `, ${s.caloriesBurned}kcal` : ''
    return `${s.workoutLabel} (${new Date(s.date).toLocaleDateString('pt-BR')}) — ${duration}${calories}:\n${exSummary}`
  }).join('\n\n')

  const prevSummary = previousWeekSessions.length > 0
    ? `\nSemana anterior (referência):\n${previousWeekSessions.map(s =>
        `${s.workoutLabel}: ${s.exercises.filter(e => !e.skipped).length} exercícios completados`
      ).join('\n')}`
    : '\nNão há dados da semana anterior para comparação.'

  const cardioSummary = formatCardioSummary(cardioSessions)
  const prevCardioSummary = previousWeekCardioSessions.length > 0
    ? `\nCardio semana anterior:\n${formatCardioSummary(previousWeekCardioSessions)}`
    : ''

  const userMessage = `Semana atual:\n${sessionsSummary}${prevSummary}

Cardio da semana (natação, corrida, esteira, bike etc — atividade separada do plano de musculação):
${cardioSummary}${prevCardioSummary}

Analise o progresso, volume por grupo muscular, tempo de treino, calorias gastas e o cardio realizado, e sugira ajustes concretos no plano. Considere o cardio como parte do condicionamento geral do atleta (ex: se está fazendo pouco ou muito cardio em relação à musculação, se o tempo total de treino está adequado). Máx 5 sugestões prioritárias.`

  const raw = await callClaude(systemPrompt, userMessage, 2048)
  return parseJSON<AIAnalyticsResponse>(raw)
}

const ANGLE_LABELS: Record<ShapeAssessment['photos'][number]['angle'], string> = {
  frente: 'Frente',
  lado: 'Lado',
  costas: 'Costas',
}

function dataUrlToImageBlock(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/)
  if (!match) throw new Error('Formato de imagem inválido')
  const [, mediaType, data] = match
  return { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data } }
}

export async function getShapeAnalysis(
  current: ShapeAssessment,
  previous: ShapeAssessment | null,
): Promise<string> {
  const systemPrompt = `Você é um personal trainer especializado em avaliação física e composição corporal.
Analise as fotos e o peso em jejum do atleta de forma direta e honesta, comparando com a avaliação anterior quando houver uma.
Foque em: mudanças visuais de definição muscular, gordura corporal aparente, postura e simetria, e o que a variação de peso sugere.
Não invente números que não podem ser estimados de fotos (percentual de gordura exato, medidas em cm, etc) — fale em termos qualitativos e comparativos.
Tom: direto, encorajador mas honesto, como um personal que acompanha de perto e não infla elogio.
NÃO use JSON. Responda em texto simples em português, 4-6 frases.

Contexto do atleta:
${getShoulderContext()}`

  const content: (
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  )[] = []

  content.push({
    type: 'text',
    text: `Avaliação atual — ${new Date(current.date).toLocaleDateString('pt-BR')}, peso em jejum: ${current.weightKg}kg`,
  })
  current.photos.forEach(p => {
    content.push({ type: 'text', text: `Foto atual (${ANGLE_LABELS[p.angle]}):` })
    content.push(dataUrlToImageBlock(p.dataUrl))
  })

  if (previous) {
    const weightDiff = current.weightKg - previous.weightKg
    content.push({
      type: 'text',
      text: `Avaliação anterior — ${new Date(previous.date).toLocaleDateString('pt-BR')}, peso em jejum: ${previous.weightKg}kg (variação: ${weightDiff >= 0 ? '+' : ''}${weightDiff.toFixed(1)}kg)`,
    })
    previous.photos.forEach(p => {
      content.push({ type: 'text', text: `Foto anterior (${ANGLE_LABELS[p.angle]}):` })
      content.push(dataUrlToImageBlock(p.dataUrl))
    })
  } else {
    content.push({ type: 'text', text: 'Esta é a primeira avaliação registrada — não há fotos anteriores para comparar.' })
  }

  content.push({ type: 'text', text: 'Avalie o progresso físico com base nas fotos e no peso em jejum.' })

  return callClaude(systemPrompt, content, 1024)
}
