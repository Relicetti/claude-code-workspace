import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getProgresso, sincronizarAneel } from './aneel.ts';
import { registrarRevisao, type NovaRevisao, type Proposta } from '../src/lib/propostas.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Funciona tanto de server/ (dev) quanto de dist-server/ (produção): os dois ficam na raiz.
const SEED = path.join(__dirname, '..', 'src', 'data', 'tarifas.json');
// Tarifas sincronizadas da ANEEL vão para o volume persistente em produção.
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? path.join(__dirname, '..', 'server', 'data');
const ATUAL = path.join(DATA_DIR, 'tarifas.json');
const PROPOSTAS = path.join(DATA_DIR, 'propostas.json');

let sincronizando = false;
let ultimoErro: string | null = null;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function lerPropostas(): Proposta[] {
  return fs.existsSync(PROPOSTAS) ? JSON.parse(fs.readFileSync(PROPOSTAS, 'utf-8')) : [];
}

function gravarPropostas(lista: Proposta[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(`${PROPOSTAS}.tmp`, JSON.stringify(lista));
  fs.renameSync(`${PROPOSTAS}.tmp`, PROPOSTAS);
}

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let corpo = '';
    req.on('data', (c) => {
      corpo += c;
      if (corpo.length > 5_000_000) { reject(new Error('Corpo grande demais.')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(JSON.parse(corpo)); } catch { reject(new Error('JSON inválido.')); } });
    req.on('error', reject);
  });
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

  if (req.method === 'GET' && url === '/propostas') {
    json(res, 200, lerPropostas());
    return;
  }

  // POST /propostas cria (Rev. 00); POST /propostas/KORA-2026-001/revisoes sobe a revisão.
  const revisoes = url.match(/^\/propostas\/([A-Z0-9-]+)\/revisoes$/);
  if (req.method === 'POST' && (url === '/propostas' || revisoes)) {
    lerCorpo(req)
      .then((corpo) => {
        const nova = corpo as NovaRevisao;
        if (!nova?.dados || !nova.r || !nova.op || !nova.entrada || !nova.operacao) return json(res, 400, { erro: 'Proposta incompleta.' });
        // Leitura e gravação síncronas, sem await no meio: duas gerações simultâneas não perdem revisão.
        const { lista, proposta } = registrarRevisao(lerPropostas(), nova, new Date(), revisoes?.[1]);
        gravarPropostas(lista);
        json(res, 201, proposta);
      })
      .catch((e: Error) => json(res, /não encontrada/.test(e.message) ? 404 : 400, { erro: e.message }));
    return;
  }

  next();
}
