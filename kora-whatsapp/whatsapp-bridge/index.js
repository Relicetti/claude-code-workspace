const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys')
const QRCode = require('qrcode')
const axios = require('axios')
const pino = require('pino')
const path = require('path')
const http = require('http')

const BOT_URL  = process.env.BOT_URL || 'http://localhost:8000/webhook/whatsapp'
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'auth')
const DEBOUNCE_MS = 4000

const pendentes = {}
let sockGlobal = null
let qrAtual = null

// Mapa local LID → telefone real (preenchido pelos eventos de contato)
const lidMap = {}

function limparFlags(texto) {
  return texto.replace(/\[HANDOFF_VENDEDOR\]/g, '').replace(/\[ENCERRAR\]/g, '').trim()
}

// Resolve JID (incluindo @lid) para número de telefone limpo
function resolverTelefone(jid) {
  if (!jid.includes('@lid')) {
    return jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
  }
  // Tenta resolver pelo mapa local
  if (lidMap[jid]) return lidMap[jid]
  return jid
}

const MSG_ABERTURA = process.env.MSG_ABERTURA || 'Boa tarde! Tudo bem? Aqui é o Luan, da Kora Energia 👋 Falo com {nome}?'

function paginaHTML(status, resultado) {
  const statusBar = sockGlobal
    ? '<div style="background:#22c55e;color:#fff;padding:8px 16px;border-radius:6px;font-size:13px">● WhatsApp conectado</div>'
    : '<div style="background:#ef4444;color:#fff;padding:8px 16px;border-radius:6px;font-size:13px">● WhatsApp desconectado</div>'

  const alerta = resultado
    ? `<div style="margin:16px 0;padding:12px 16px;border-radius:8px;background:${resultado.ok ? '#dcfce7' : '#fee2e2'};color:${resultado.ok ? '#166534' : '#991b1b'};font-size:14px">${resultado.msg}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Kora Energia — Disparador</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#f0fdf4;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 16px}
    .card{background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:32px;width:100%;max-width:480px}
    h1{font-size:22px;font-weight:700;color:#166534;margin-bottom:4px}
    .sub{font-size:13px;color:#6b7280;margin-bottom:24px}
    label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:4px}
    input,textarea{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin-bottom:16px;outline:none}
    input:focus,textarea:focus{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.15)}
    textarea{resize:vertical;min-height:72px;font-family:inherit}
    button{width:100%;background:#16a34a;color:#fff;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:600;cursor:pointer}
    button:hover{background:#15803d}
    .status{display:flex;justify-content:flex-end;margin-bottom:20px}
    .preview{font-size:12px;color:#6b7280;margin-top:-12px;margin-bottom:16px}
  </style>
</head>
<body>
  <div class="card">
    <div class="status">${statusBar}</div>
    <h1>Kora Energia</h1>
    <p class="sub">Disparador de prospecção WhatsApp</p>
    ${alerta}
    <form method="POST" action="/disparar">
      <label>Telefone (com DDD e DDI)</label>
      <input name="telefone" placeholder="5541999990000" required pattern="[0-9]{12,13}"/>
      <label>Nome do contato</label>
      <input name="nome" placeholder="João Silva" required/>
      <label>Mensagem de abertura</label>
      <textarea name="mensagem">${MSG_ABERTURA}</textarea>
      <p class="preview">Use {nome} para inserir o nome automaticamente</p>
      <button type="submit">Enviar mensagem</button>
    </form>
  </div>
</body>
</html>`
}

// Servidor HTTP: disparos + QR Code + painel web
const PORT_BRIDGE = parseInt(process.env.BRIDGE_PORT || '9000')
const server = http.createServer(async (req, res) => {

  // Página principal — disparador
  if (req.method === 'GET' && (req.url === '/' || req.url === '')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(paginaHTML(sockGlobal, null))
    return
  }

  // Formulário de disparo
  if (req.method === 'POST' && req.url === '/disparar') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', async () => {
      const params = new URLSearchParams(body)
      const telefone = (params.get('telefone') || '').trim()
      const nome = (params.get('nome') || '').trim()
      const mensagemTemplate = params.get('mensagem') || MSG_ABERTURA
      const mensagem = mensagemTemplate.replace('{nome}', nome)
      let resultado
      try {
        if (!sockGlobal) throw new Error('WhatsApp não conectado')
        if (!telefone || !nome) throw new Error('Telefone e nome são obrigatórios')
        const jid = `${telefone}@s.whatsapp.net`
        await sockGlobal.sendMessage(jid, { text: mensagem })
        console.log(`[OK] Disparo para ${nome} (${telefone})`)
        resultado = { ok: true, msg: `Mensagem enviada para ${nome} (${telefone})` }
      } catch (e) {
        console.error(`[ERRO] Disparo: ${e.message}`)
        resultado = { ok: false, msg: `Erro: ${e.message}` }
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(paginaHTML(sockGlobal, resultado))
    })
    return
  }

  // QR Code
  if (req.method === 'GET' && req.url === '/qr') {
    if (!qrAtual) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      const msg = sockGlobal ? '✅ WhatsApp já está conectado!' : 'Aguardando QR Code...<script>setTimeout(()=>location.reload(),5000)</script>'
      res.end(`<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>${msg}</h2><p><a href="/">Voltar ao painel</a></p></body></html>`)
      return
    }
    const imgDataUrl = await QRCode.toDataURL(qrAtual, { width: 300 })
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<html><body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:40px">
      <h2>Escaneie com o WhatsApp Business</h2>
      <img src="${imgDataUrl}" style="width:300px;height:300px"/>
      <p>WhatsApp → três pontinhos → Dispositivos vinculados → Vincular dispositivo</p>
      <script>setTimeout(()=>location.reload(),20000)</script>
      </body></html>`)
    return
  }

  // API de envio (usado pelo disparar.py local)
  if (req.method === 'POST' && req.url === '/send') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', async () => {
      try {
        const { telefone, mensagem } = JSON.parse(body)
        if (!sockGlobal) throw new Error('WhatsApp não conectado')
        const jid = telefone.includes('@') ? telefone : `${telefone}@s.whatsapp.net`
        await sockGlobal.sendMessage(jid, { text: mensagem })
        console.log(`[OK] Disparo enviado para ${telefone}`)
        res.writeHead(200); res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        console.error(`[ERRO] Disparo: ${e.message}`)
        res.writeHead(500); res.end(JSON.stringify({ ok: false, erro: e.message }))
      }
    })
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200); res.end(JSON.stringify({ ok: true, conectado: !!sockGlobal }))
    return
  }

  res.writeHead(404); res.end()
})
server.listen(PORT_BRIDGE, () => console.log(`Bridge HTTP na porta ${PORT_BRIDGE}`))

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Kora Energia', 'Chrome', '120.0'],
  })

  sock.ev.on('creds.update', saveCreds)

  // Popula mapa LID → telefone quando contatos são carregados
  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts) {
      if (c.id && c.lid) lidMap[c.lid] = c.id.replace('@s.whatsapp.net', '')
      if (c.id && c.id.includes('@lid') && c.notify) {
        // fallback pelo nome não é ideal, mas registra o LID
      }
    }
  })

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrAtual = qr
      console.log(`[QR] Acesse /qr para escanear o QR Code`)
    }
    if (connection === 'open') {
      qrAtual = null
      sockGlobal = sock
      console.log('[OK] WhatsApp conectado!')
    }
    if (connection === 'close') {
      sockGlobal = null
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) setTimeout(conectar, 3000)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (msg.key.fromMe) continue
      if (msg.key.remoteJid.endsWith('@g.us')) continue

      const texto = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || ''

      if (!texto) continue

      const jid      = msg.key.remoteJid
      const telefone = resolverTelefone(jid)

      // Para LIDs não resolvidos, usa o LID como chave de rastreamento
      // e envia a resposta de volta ao mesmo JID — funciona normalmente
      const chave = telefone.includes('@lid') ? jid : telefone
      if (telefone.includes('@lid')) {
        console.log(`⚠️  LID não resolvido: ${jid} — processando com LID como chave`)
      }

      if (!pendentes[chave]) pendentes[chave] = { textos: [], msg }
      pendentes[chave].textos.push(texto)
      clearTimeout(pendentes[chave].timer)

      pendentes[chave].timer = setTimeout(async () => {
        const textoFinal   = pendentes[chave].textos.join(' ')
        const msgOriginal  = pendentes[chave].msg
        delete pendentes[chave]

        // Resolve o telefone para passar ao bot — tenta de novo após debounce
        const telFinal = resolverTelefone(jid)
        const remoteJidBot = telFinal.includes('@lid')
          ? jid  // passa o LID mesmo — bot vai tratar como ID único
          : `${telFinal}@s.whatsapp.net`

        console.log(`📨 [${telFinal}]: ${textoFinal.substring(0, 80)}`)

        try {
          const resp = await axios.post(BOT_URL, {
            event: 'messages.upsert',
            data: {
              key: { ...msgOriginal.key, remoteJid: remoteJidBot },
              message: { conversation: textoFinal },
              pushName: msgOriginal.pushName || '',
            }
          }, { timeout: 30000 })

          const { proxima_mensagem, intencao } = resp.data || {}

          if (proxima_mensagem) {
            const textoLimpo = limparFlags(proxima_mensagem)
            if (textoLimpo) {
              await new Promise(r => setTimeout(r, 2000))
              await sock.sendMessage(jid, { text: textoLimpo })
              console.log(`✉️  [${intencao}] Resposta para ${telefone}`)
            }
          }
        } catch (err) {
          console.error(`❌ Erro ao chamar bot: ${err.message}`)
        }
      }, DEBOUNCE_MS)
    }
  })
}

conectar()
