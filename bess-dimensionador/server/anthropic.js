import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const MODEL = 'claude-opus-5'

const SYSTEM_PROMPT = `Você é um assistente de extração de dados de faturas de energia elétrica da COPEL
(Companhia Paranaense de Energia), a distribuidora do Paraná. A fatura enviada é sempre no layout
padrão da COPEL.

Extraia os seguintes campos da fatura:
- nomeCliente: nome do titular da unidade consumidora (pessoa física ou razão social)
- unidadeConsumidora: número da UC (unidade consumidora), geralmente próximo ao código de barras ou no cabeçalho
- consumoMedioPontaKwh: consumo faturado no mês em kWh (some os postos ponta + fora-ponta se a fatura discriminar por posto tarifário; se for Grupo B, é o consumo total do mês)
- grupoTarifario: "A" se a fatura mostrar demanda contratada/medida em kW e tarifa diferenciada por posto horário (ponta/fora-ponta), "B" se for uma unidade de baixa tensão com só consumo em kWh, sem demanda medida
- endereco: endereço completo da unidade consumidora (logradouro, número, bairro, cidade, UF) — não o endereço de correspondência, se forem diferentes
- cep: CEP da unidade consumidora, no formato 00000-000

Responda APENAS com um objeto JSON, sem markdown, sem texto adicional, no formato exato:
{"nomeCliente": string, "unidadeConsumidora": string, "consumoMedioPontaKwh": number, "grupoTarifario": "A" | "B", "endereco": string, "cep": string}

Se algum campo não puder ser identificado com confiança na fatura, use string vazia "" (ou 0 para consumoMedioPontaKwh) nesse campo — nunca invente um valor.`

function extractJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  return JSON.parse(cleaned)
}

export async function extrairDadosFatura({ pdfBase64 }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: 'Extraia os dados desta fatura da COPEL e retorne o JSON conforme instruído.',
          },
        ],
      },
    ],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('A extração foi recusada pelo modelo.')
  }

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock) {
    throw new Error('Resposta do modelo não contém texto.')
  }

  let dados
  try {
    dados = extractJson(textBlock.text)
  } catch (err) {
    throw new Error('Não foi possível interpretar a resposta do modelo como JSON.')
  }

  return {
    nomeCliente: String(dados.nomeCliente ?? ''),
    unidadeConsumidora: String(dados.unidadeConsumidora ?? ''),
    consumoMedioPontaKwh: Number(dados.consumoMedioPontaKwh) || 0,
    grupoTarifario: dados.grupoTarifario === 'A' || dados.grupoTarifario === 'B' ? dados.grupoTarifario : 'B',
    endereco: String(dados.endereco ?? ''),
    cep: String(dados.cep ?? ''),
  }
}
