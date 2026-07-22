import Anthropic from '@anthropic-ai/sdk'
import { getRecentFoodDbEntries } from './dataStore.js'

const client = new Anthropic()

const MODEL = 'claude-opus-4-8'

function buildSystemPrompt(recentEntries) {
  const knownFoods = recentEntries
    .map((e) => `- ${e.name}: ${e.kcal} kcal, ${e.protein}g proteina, ${e.carbs}g carboidrato, ${e.fat}g gordura (por porcao registrada)`)
    .join('\n')

  return `Voce e um assistente de reconhecimento de alimentos em fotos para um app de controle calorico.

Analise a foto enviada e identifique cada alimento visivel, estimando a porcao pelo tamanho/volume aparente na imagem.

${recentEntries.length > 0 ? `O usuario ja registrou estes alimentos antes (valores corrigidos por ele mesmo). Se reconhecer o mesmo alimento na foto, priorize esses valores como referencia, ajustando apenas proporcionalmente ao tamanho da porcao visivel:\n${knownFoods}\n` : ''}

Responda APENAS com um array JSON, sem markdown, sem texto adicional, no formato exato:
[{"name": "string", "kcal": number, "protein": number, "carbs": number, "fat": number, "confidence": number}]

"confidence" e um numero de 0 a 1 indicando sua confianca na identificacao e estimativa. Se nao identificar nenhum alimento, responda com um array vazio [].`
}

function extractJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  return JSON.parse(cleaned)
}

export async function analyzePhoto({ imageBase64, mediaType }) {
  const recentEntries = await getRecentFoodDbEntries(40)
  const systemPrompt = buildSystemPrompt(recentEntries)

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: 'Identifique os alimentos nesta foto e retorne o JSON conforme instruido.',
          },
        ],
      },
    ],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('A analise foi recusada pelo modelo.')
  }

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock) {
    throw new Error('Resposta do modelo nao contem texto.')
  }

  let items
  try {
    items = extractJson(textBlock.text)
  } catch (err) {
    throw new Error('Nao foi possivel interpretar a resposta do modelo como JSON.')
  }

  if (!Array.isArray(items)) {
    throw new Error('Resposta do modelo nao e um array.')
  }

  return items.map((item) => ({
    name: String(item.name ?? ''),
    kcal: Number(item.kcal) || 0,
    protein: Number(item.protein) || 0,
    carbs: Number(item.carbs) || 0,
    fat: Number(item.fat) || 0,
    confidence: Number(item.confidence) || 0,
  }))
}
