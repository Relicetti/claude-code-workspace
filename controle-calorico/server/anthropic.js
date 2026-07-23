import Anthropic from '@anthropic-ai/sdk'
import { getRecentFoodDbEntries } from './dataStore.js'

const client = new Anthropic()

const MODEL = 'claude-opus-4-8'

function buildKnownFoodsList(recentEntries) {
  return recentEntries
    .map(
      (e) =>
        `- ${e.name}: para ${e.quantity || '?'}${e.unit || 'g'} -> ${e.kcal} kcal, ${e.protein}g proteina, ${e.carbs}g carboidrato, ${e.fat}g gordura, ${e.caffeine || 0}mg cafeina, ${e.water || 0}ml agua (porcao corrigida pelo usuario)`
    )
    .join('\n')
}

function buildKnownFoodsSection(recentEntries) {
  if (recentEntries.length === 0) return ''
  const knownFoods = buildKnownFoodsList(recentEntries)
  return `O usuario ja registrou estes alimentos antes (valores corrigidos por ele mesmo, com a quantidade exata que geraram esses valores). Se reconhecer o mesmo alimento, priorize esses valores por unidade de quantidade como referencia, escalando proporcionalmente para a quantidade identificada agora:\n${knownFoods}\n\n`
}

const RESPONSE_FORMAT_INSTRUCTIONS = `Responda APENAS com um array JSON, sem markdown, sem texto adicional, no formato exato:
[{"name": "string", "quantity": number, "unit": "string", "kcal": number, "protein": number, "carbs": number, "fat": number, "caffeine": number, "water": number, "confidence": number}]

"name" e o nome do alimento, sem incluir a quantidade no texto (a quantidade vai no campo separado). "quantity" e a quantidade estimada da porcao (um numero, ex: 220, 1, 2). "unit" e a unidade dessa quantidade (ex: "g", "ml", "unidade", "fatia", "colher"). Os valores de kcal/proteina/carboidrato/gordura/cafeina/agua devem corresponder exatamente a essa quantidade e unidade informadas — se a quantidade for editada depois, esses valores serao escalados proporcionalmente, entao a proporcao entre eles precisa estar correta. "caffeine" e a estimativa de cafeina em miligramas (0 se nao aplicavel). "water" e a estimativa de volume de agua em mililitros (0 se nao aplicavel). "confidence" e um numero de 0 a 1 indicando sua confianca na identificacao e estimativa. Se nao identificar nenhum alimento, responda com um array vazio [].`

function buildPhotoSystemPrompt(recentEntries) {
  return `Voce e um assistente de reconhecimento de alimentos em fotos para um app de controle calorico.

Analise a foto enviada e identifique cada alimento e bebida visivel, estimando a quantidade da porcao (em gramas, mililitros ou unidades, o que fizer mais sentido) pelo tamanho/volume aparente na imagem. Para bebidas com cafeina (cafe, cha, energetico, refrigerante de cola), estime o teor de cafeina em miligramas pela porcao visivel; para itens sem cafeina, retorne 0. Para agua e outras bebidas com alto teor de agua (agua, agua com gas, cha, sucos diluidos), estime o volume de agua em mililitros pela porcao visivel; para itens sem agua relevante, retorne 0.

${buildKnownFoodsSection(recentEntries)}${RESPONSE_FORMAT_INSTRUCTIONS}`
}

function buildTextSystemPrompt(recentEntries) {
  return `Voce e um assistente de estimativa nutricional para um app de controle calorico.

O usuario vai descrever em texto o que comeu ou bebeu (pode ser um ou varios itens na mesma descricao). Identifique cada alimento e bebida mencionado, extraia ou estime a quantidade da porcao (em gramas, mililitros ou unidades — use porcoes tipicas/usuais quando a quantidade nao for especificada) e estime kcal, proteina, carboidrato e gordura para essa quantidade. Para bebidas com cafeina (cafe, cha, energetico, refrigerante de cola), estime o teor de cafeina em miligramas; para itens sem cafeina, retorne 0. Para agua e outras bebidas com alto teor de agua, estime o volume de agua em mililitros; para itens sem agua relevante, retorne 0.

${buildKnownFoodsSection(recentEntries)}${RESPONSE_FORMAT_INSTRUCTIONS}`
}

function extractJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  return JSON.parse(cleaned)
}

async function runAnalysis(systemPrompt, userContent) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userContent,
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
    quantity: Number(item.quantity) || 0,
    unit: String(item.unit ?? 'g'),
    kcal: Number(item.kcal) || 0,
    protein: Number(item.protein) || 0,
    carbs: Number(item.carbs) || 0,
    fat: Number(item.fat) || 0,
    caffeine: Number(item.caffeine) || 0,
    water: Number(item.water) || 0,
    creatine: 0,
    confidence: Number(item.confidence) || 0,
  }))
}

export async function analyzePhoto({ imageBase64, mediaType }) {
  const recentEntries = await getRecentFoodDbEntries(40)
  const systemPrompt = buildPhotoSystemPrompt(recentEntries)

  return runAnalysis(systemPrompt, [
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
  ])
}

export async function analyzeTextDescription({ description }) {
  const recentEntries = await getRecentFoodDbEntries(40)
  const systemPrompt = buildTextSystemPrompt(recentEntries)

  return runAnalysis(systemPrompt, [
    {
      type: 'text',
      text: `Descricao do usuario: "${description}"\n\nEstime os alimentos/bebidas descritos e retorne o JSON conforme instruido.`,
    },
  ])
}
