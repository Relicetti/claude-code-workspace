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

const LABEL_ACCURACY_INSTRUCTIONS = `Precisao e a prioridade maxima, mais do que velocidade ou confianca aparente:
- Se a foto mostrar uma tabela nutricional impressa (rotulo de embalagem, nota fiscal, cardapio com informacao nutricional), LEIA OS NUMEROS IMPRESSOS EXATAMENTE como estao, em vez de estimar visualmente — isso vale mesmo que a porcao da tabela seja diferente da porcao visivel; nesse caso escale os valores da tabela pela proporcao entre a porcao mostrada e a porcao da tabela, nunca estime do zero por aparencia quando ha numeros impressos disponiveis.
- Para produtos industrializados de marca conhecida (ex: "Leite Ninho", "Whey Growth", refrigerantes, barras de proteina), use os valores nutricionais reais e especificos daquele produto que voce conhece, nao uma media generica de "leite" ou "barra de proteina". Se nao tiver certeza do produto exato, diga isso via "confidence" mais baixo em vez de inventar um numero preciso.

VIES CONHECIDO A CORRIGIR: modelos de IA tendem a SUPERESTIMAR tanto o tamanho da porcao quanto as calorias — e mais comum errar pra cima do que pra baixo. Corrija ativamente esse vies:
- Ao estimar peso/volume de uma porcao por foto ou descricao vaga (sem tabela nutricional visivel), va pela estimativa MAIS BAIXA dentro do que for plausivel, nunca a mais generosa. Compare mentalmente com referencias de tamanho conhecidas (uma colher de sopa, um punho fechado, um baralho de cartas, uma xicara) antes de decidir o numero.
- Quando houver duvida entre um valor de kcal/macro mais alto e um mais baixo dentro da faixa plausivel para aquela porcao, escolha o mais baixo.
- Para comida caseira/preparada sem rotulo, parta de ingredientes e metodo de preparo tipicos (nao da versao mais calorica/com mais oleo/manteiga possivel) e seja conservador: e melhor um "confidence" mais baixo com uma estimativa modesta do que um numero inflado e confiante.
- Nunca arredonde pra numeros "bonitos" (ex: 200, 300) por convencao, e nunca arredonde pra cima "pra garantir" — de a estimativa mais proxima do valor real, mesmo que fique um numero quebrado e mais baixo do que pareceria "seguro".

CONFERENCIA OBRIGATORIA ANTES DE RESPONDER: pra cada item, confira que kcal e proteina/carboidrato/gordura sao consistentes entre si usando a formula kcal = (proteina x4) + (carboidrato x4) + (gordura x9). Uma margem de uns 10% e normal (fibra, alcool, arredondamento), mas se o kcal que voce ia dar destoar disso por mais que isso, um dos numeros esta errado — recalcule e ajuste o kcal (ou os macros, o que fizer mais sentido pro alimento) antes de responder. Nunca entregue um item onde as calorias nao batem matematicamente com os macros informados.`

function buildPhotoSystemPrompt(recentEntries) {
  return `Voce e um assistente de reconhecimento de alimentos em fotos para um app de controle calorico.

Analise a foto enviada e identifique cada alimento e bebida visivel, estimando a quantidade da porcao (em gramas, mililitros ou unidades, o que fizer mais sentido) pelo tamanho/volume aparente na imagem. Para bebidas com cafeina (cafe, cha, energetico, refrigerante de cola), estime o teor de cafeina em miligramas pela porcao visivel; para itens sem cafeina, retorne 0. Para agua e outras bebidas com alto teor de agua (agua, agua com gas, cha, sucos diluidos), estime o volume de agua em mililitros pela porcao visivel; para itens sem agua relevante, retorne 0.

${LABEL_ACCURACY_INSTRUCTIONS}

${buildKnownFoodsSection(recentEntries)}${RESPONSE_FORMAT_INSTRUCTIONS}`
}

function buildTextSystemPrompt(recentEntries) {
  return `Voce e um assistente de estimativa nutricional para um app de controle calorico.

O usuario vai descrever em texto o que comeu ou bebeu (pode ser um ou varios itens na mesma descricao). Identifique cada alimento e bebida mencionado, extraia ou estime a quantidade da porcao (em gramas, mililitros ou unidades — use porcoes tipicas/usuais quando a quantidade nao for especificada) e estime kcal, proteina, carboidrato e gordura para essa quantidade. Para bebidas com cafeina (cafe, cha, energetico, refrigerante de cola), estime o teor de cafeina em miligramas; para itens sem cafeina, retorne 0. Para agua e outras bebidas com alto teor de agua, estime o volume de agua em mililitros; para itens sem agua relevante, retorne 0.

${LABEL_ACCURACY_INSTRUCTIONS}

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
