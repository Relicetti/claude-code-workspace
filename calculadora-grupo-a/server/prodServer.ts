import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiHandler } from './api.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3000;
// Senha única de acesso (HTTP Basic — o navegador pede e lembra). Sem APP_SENHA o app fica aberto,
// o que só faz sentido rodando local.
const SENHA = process.env.APP_SENHA;

function autorizado(req: IncomingMessage): boolean {
  if (!SENHA) return true;
  const [tipo, valor] = (req.headers.authorization ?? '').split(' ');
  if (tipo !== 'Basic' || !valor) return false;
  const senha = Buffer.from(valor, 'base64').toString('utf-8').split(':').slice(1).join(':');
  const a = crypto.createHash('sha256').update(senha).digest();
  const b = crypto.createHash('sha256').update(SENHA).digest();
  return crypto.timingSafeEqual(a, b);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function enviarArquivo(res: ServerResponse, filePath: string): void {
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function servirEstatico(req: IncomingMessage, res: ServerResponse): void {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const requested = path.normalize(path.join(DIST_DIR, urlPath));
  if (!requested.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.stat(requested, (err, stats) => {
    if (!err && stats.isFile()) {
      enviarArquivo(res, requested);
      return;
    }
    // Fallback de SPA: qualquer rota não encontrada serve o index (roteamento é client-side).
    enviarArquivo(res, path.join(DIST_DIR, 'index.html'));
  });
}

// Ícones e manifesto ficam fora da senha: o iPhone busca o ícone da tela de início sem mandar o login.
const PUBLICOS = new Set(['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/favicon.png', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest']);

const server = http.createServer((req, res) => {
  const caminho = (req.url ?? '/').split('?')[0];
  if (PUBLICOS.has(caminho)) {
    const arquivo = caminho === '/apple-touch-icon-precomposed.png' ? '/apple-touch-icon.png' : caminho;
    enviarArquivo(res, path.join(DIST_DIR, arquivo));
    return;
  }
  if (!autorizado(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Calculadora Kora", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acesso restrito. Usuário: qualquer um; senha: a da equipe.');
    return;
  }
  const url = req.url ?? '';
  if (url === '/api' || url.startsWith('/api/')) {
    req.url = url.slice('/api'.length) || '/';
    apiHandler(req, res, () => {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ erro: 'Rota não encontrada.' }));
    });
    return;
  }
  servirEstatico(req, res);
});

server.listen(PORT, () => {
  console.log(`[prodServer] Calculadora Kora rodando na porta ${PORT}`);
});
