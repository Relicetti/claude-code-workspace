import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getProgresso, sincronizarAneel } from './aneel.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Funciona tanto de server/ (dev) quanto de dist-server/ (produção): os dois ficam na raiz.
const SEED = path.join(__dirname, '..', 'src', 'data', 'tarifas.json');
// Tarifas sincronizadas da ANEEL vão para o volume persistente em produção.
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? path.join(__dirname, '..', 'server', 'data');
const ATUAL = path.join(DATA_DIR, 'tarifas.json');

let sincronizando = false;
let ultimoErro: string | null = null;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function apiHandler(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const url = (req.url ?? '/').split('?')[0];

  if (req.method === 'GET' && url === '/dados') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    fs.createReadStream(fs.existsSync(ATUAL) ? ATUAL : SEED).pipe(res);
    return;
  }

  if (req.method === 'GET' && url === '/tarifas/progresso') {
    json(res, 200, { sincronizando, descricao: getProgresso(), erro: ultimoErro });
    return;
  }

  if (req.method === 'POST' && url === '/tarifas/atualizar') {
    if (sincronizando) return json(res, 409, { erro: 'Já existe uma atualização em andamento.' });
    sincronizando = true;
    ultimoErro = null;
    sincronizarAneel(path.join(DATA_DIR, 'aneel-temp'))
      .then((dados) => {
        // Grava num temporário e renomeia: um GET /dados no meio nunca lê arquivo pela metade.
        fs.writeFileSync(`${ATUAL}.tmp`, JSON.stringify(dados));
        fs.renameSync(`${ATUAL}.tmp`, ATUAL);
      })
      .catch((e: Error) => { ultimoErro = e.message; console.error('[aneel] falha na sincronização', e); })
      .finally(() => { sincronizando = false; });
    return json(res, 202, { ok: true });
  }

  next();
}
