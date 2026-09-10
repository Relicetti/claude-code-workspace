import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiHandler } from './api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3000;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
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

const server = http.createServer((req, res) => {
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
  console.log(`[prodServer] Calculadora de Parceria rodando na porta ${PORT}`);
});
