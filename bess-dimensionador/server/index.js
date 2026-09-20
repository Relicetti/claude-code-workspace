import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { extrairDadosFatura } from './anthropic.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
// Em produção (processo único, ex. Railway) respeita o PORT atribuído pela plataforma.
// Em dev local (processos Vite + API separados) usa API_PORT, pra um PORT ambiente
// destinado ao Vite não fazer a API tentar subir na mesma porta.
const PORT = process.env.NODE_ENV === 'production' ? process.env.PORT || 3001 : process.env.API_PORT || 3001

// Um handler de rota que rejeita/lança nunca deve derrubar o processo inteiro —
// encaminha pro error handler do Express em vez de crashar.
function asyncHandler(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

app.use(cors())
app.use(express.json({ limit: '15mb' }))

app.post(
  '/api/extrair-fatura',
  asyncHandler(async (req, res) => {
    const { pdfBase64 } = req.body
    if (!pdfBase64) {
      return res.status(400).json({ error: 'pdfBase64 é obrigatório' })
    }
    const dados = await extrairDadosFatura({ pdfBase64 })
    res.json(dados)
  })
)

const distPath = path.join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// Error handler final: qualquer erro de rota vira um JSON 500 em vez de
// crashar o processo ou deixar a requisição pendurada.
app.use((err, req, res, next) => {
  console.error(err)
  if (res.headersSent) return next(err)
  res.status(500).json({ error: err.message || 'Erro interno do servidor' })
})

// Rede de segurança final: loga erros inesperados em vez de deixar o processo
// morrer e levar junto todas as requisições em andamento.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`)
})
