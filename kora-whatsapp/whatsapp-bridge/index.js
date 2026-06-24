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
const AUTH_DIR = path.join(__dirname, 'auth')
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

// Servidor HTTP: disparos do Python + página do QR Code
const PORT_BRIDGE = parseInt(process.env.PORT || '9000')
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/qr') {
    if (!qrAtual) {
      if (sockGlobal) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h2>✅ WhatsApp já está conectado!</h2>')
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h2>Aguardando QR Code... Recarregue em 5 segundos.</h2><script>setTimeout(()=>location.reload(),5000)</script>')
      }
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
