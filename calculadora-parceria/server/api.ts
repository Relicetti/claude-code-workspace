import type { IncomingMessage, ServerResponse } from 'node:http';
import { db, getSyncMeta } from './db';
import { syncTarifasB1, syncComponentesTarifarias, seedFromJsonIfEmpty, getProgressoSync, limparProgressoSync } from './aneelSync';
import { listarPropostas, emitirProposta, obterProposta, apagarProposta } from './propostas';
import { listarImpostosOverrides, salvarImpostoOverride, removerImpostoOverride } from './impostos';
import { listarIsencoesOverrides, salvarIsencaoOverride, removerIsencaoOverride } from './isencoes';
import {
  seedAdminIfEmpty, autenticar, criarSessao, apagarSessao, usuarioPorSessao, parseCookies,
  listarUsuarios, criarUsuario, alterarStatusUsuario, atualizarUsuario, alterarSenhaUsuario,
  type Usuario, type Perfil,
} from './auth';

seedFromJsonIfEmpty();
seedAdminIfEmpty();

let sincronizando = false;
const NOME_COOKIE = 'sessao';
const PRODUCAO = process.env.NODE_ENV === 'production';

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

function lerCorpoJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let corpo = '';
    req.on('data', (chunk) => { corpo += chunk; });
    req.on('end', () => {
      try {
        resolve(corpo ? JSON.parse(corpo) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function setCookieSessao(res: ServerResponse, token: string, expiraEm: string): void {
  const maxAgeSegundos = Math.max(0, Math.floor((new Date(expiraEm).getTime() - Date.now()) / 1000));
  const partes = [
    `${NOME_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSegundos}`,
  ];
  if (PRODUCAO) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

function limparCookieSessao(res: ServerResponse): void {
  res.setHeader('Set-Cookie', `${NOME_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
}

function selectAllTarifasB1() {
  return db.prepare(`
    SELECT codigo, resolucao, inicio_vigencia AS inicioVigencia, fim_vigencia AS fimVigencia,
           subgrupo, modalidade, classe, detalhe, tusd, te, total
    FROM tarifas_b1
  `).all();
}

function selectAllComponentes() {
  return db.prepare(`
    SELECT codigo, resolucao, inicio_vigencia AS inicioVigencia, fim_vigencia AS fimVigencia,
           subgrupo, modalidade, classe, componente, valor
    FROM componentes_tarifarios
    ORDER BY ordem ASC
  `).all();
}

export function apiHandler(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const url = req.url ?? '';
  const cookies = parseCookies(req);
  const usuario = usuarioPorSessao(cookies[NOME_COOKIE]);

  // ── Autenticação (não exige sessão) ─────────────────────────────────────
  if (req.method === 'POST' && url === '/auth/login') {
    lerCorpoJson(req)
      .then((body) => {
        const u = autenticar(String(body.email ?? ''), String(body.senha ?? ''));
        if (!u) {
          json(res, 401, { erro: 'E-mail ou senha inválidos.' });
          return;
        }
        const { token, expiraEm } = criarSessao(u.id);
        setCookieSessao(res, token, expiraEm);
        json(res, 200, u);
      })
      .catch((e: unknown) => json(res, 400, { erro: e instanceof Error ? e.message : String(e) }));
    return;
  }

  if (req.method === 'POST' && url === '/auth/logout') {
    if (cookies[NOME_COOKIE]) apagarSessao(cookies[NOME_COOKIE]);
    limparCookieSessao(res);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url === '/auth/me') {
    if (!usuario) { json(res, 401, { erro: 'Não autenticado.' }); return; }
    json(res, 200, usuario);
    return;
  }

  // ── Tudo daqui pra baixo exige sessão válida ────────────────────────────
  if (!usuario) {
    json(res, 401, { erro: 'Não autenticado.' });
    return;
  }
  const exigirAdm = (): boolean => {
    if (usuario!.perfil !== 'adm') {
      json(res, 403, { erro: 'Só administradores podem fazer isso.' });
      return false;
    }
    return true;
  };

  if (req.method === 'GET' && url === '/tarifas/status') {
    json(res, 200, { tarifasB1: getSyncMeta('tarifas_b1'), componentes: getSyncMeta('componentes_tarifarios') });
    return;
  }

  if (req.method === 'GET' && url === '/tarifas/progresso') {
    json(res, 200, { sincronizando, progresso: getProgressoSync() });
    return;
  }

  if (req.method === 'GET' && url === '/tarifas/b1') {
    json(res, 200, selectAllTarifasB1());
    return;
  }

  if (req.method === 'GET' && url === '/tarifas/componentes') {
    json(res, 200, selectAllComponentes());
    return;
  }

  if (req.method === 'POST' && url === '/tarifas/atualizar') {
    if (!exigirAdm()) return;
    if (sincronizando) {
      json(res, 409, { ok: false, error: 'Já existe uma atualização em andamento.' });
      return;
    }
    sincronizando = true;
    const inicio = Date.now();
    // Sequencial: as duas syncs usam a mesma conexão SQLite (transações não podem se sobrepor).
    syncTarifasB1()
      .then((tarifasB1Count) => syncComponentesTarifarias().then((componentesCount) => ({ tarifasB1Count, componentesCount })))
      .then(({ tarifasB1Count, componentesCount }) => {
        json(res, 200, { ok: true, tarifasB1Count, componentesCount, tookMs: Date.now() - inicio });
      })
      .catch((e: unknown) => {
        json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => { sincronizando = false; limparProgressoSync(); });
    return;
  }

  if (req.method === 'GET' && url === '/propostas') {
    json(res, 200, listarPropostas());
    return;
  }

  const matchProposta = url.match(/^\/propostas\/(\d+)$/);
  if (matchProposta && req.method === 'GET') {
    const proposta = obterProposta(Number(matchProposta[1]));
    if (!proposta) {
      json(res, 404, { erro: 'Proposta não encontrada.' });
      return;
    }
    json(res, 200, proposta);
    return;
  }
  if (matchProposta && req.method === 'DELETE') {
    if (!exigirAdm()) return;
    const apagou = apagarProposta(Number(matchProposta[1]));
    if (!apagou) { json(res, 404, { erro: 'Proposta não encontrada.' }); return; }
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url === '/propostas/emitir') {
    lerCorpoJson(req)
      .then((body) => {
        if (!body.nomeUsina || !String(body.nomeUsina).trim()) {
          json(res, 400, { erro: 'nomeUsina é obrigatório.' });
          return;
        }
        if (!body.negociador || !String(body.negociador).trim()) {
          json(res, 400, { erro: 'negociador é obrigatório.' });
          return;
        }
        const proposta = emitirProposta({
          nomeUsina: String(body.nomeUsina),
          potenciaKwp: Number(body.potenciaKwp) || 0,
          valorTarifa: Number(body.valorTarifa) || 0,
          negociador: String(body.negociador),
          snapshot: body.snapshot ?? null,
        });
        json(res, 200, proposta);
      })
      .catch((e: unknown) => {
        json(res, 400, { erro: e instanceof Error ? e.message : String(e) });
      });
    return;
  }

  // ── Gerenciamento de usuários (só ADM) ──────────────────────────────────
  if (req.method === 'GET' && url === '/usuarios') {
    if (!exigirAdm()) return;
    json(res, 200, listarUsuarios());
    return;
  }

  if (req.method === 'POST' && url === '/usuarios') {
    if (!exigirAdm()) return;
    lerCorpoJson(req)
      .then((body) => {
        const nome = String(body.nome ?? '').trim();
        const email = String(body.email ?? '').trim();
        const senha = String(body.senha ?? '');
        const perfil = body.perfil === 'adm' ? 'adm' : 'operador';
        if (!nome || !email || senha.length < 6) {
          json(res, 400, { erro: 'Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.' });
          return;
        }
        const novo = criarUsuario({ nome, email, senha, perfil });
        json(res, 200, novo);
      })
      .catch((e: unknown) => json(res, 400, { erro: e instanceof Error ? e.message : String(e) }));
    return;
  }

  const matchUsuario = url.match(/^\/usuarios\/(\d+)$/);
  if (matchUsuario && req.method === 'PATCH') {
    if (!exigirAdm()) return;
    lerCorpoJson(req)
      .then((body) => {
        if (typeof body.nome === 'string') {
          const nome = body.nome.trim();
          const email = String(body.email ?? '').trim();
          const perfil: Perfil = body.perfil === 'adm' ? 'adm' : 'operador';
          if (!nome || !email) {
            json(res, 400, { erro: 'Preencha nome e e-mail.' });
            return;
          }
          atualizarUsuario(Number(matchUsuario[1]), { nome, email, perfil });
        }
        if (typeof body.ativo === 'boolean') {
          alterarStatusUsuario(Number(matchUsuario[1]), body.ativo);
        }
        if (typeof body.senha === 'string' && body.senha.length > 0) {
          if (body.senha.length < 6) {
            json(res, 400, { erro: 'A senha precisa ter pelo menos 6 caracteres.' });
            return;
          }
          alterarSenhaUsuario(Number(matchUsuario[1]), body.senha);
        }
        json(res, 200, { ok: true });
      })
      .catch((e: unknown) => json(res, 400, { erro: e instanceof Error ? e.message : String(e) }));
    return;
  }

  // ── Overrides de ICMS/PIS-COFINS por concessionária ─────────────────────
  if (req.method === 'GET' && url === '/impostos/overrides') {
    json(res, 200, listarImpostosOverrides());
    return;
  }

  if (req.method === 'POST' && url === '/impostos/overrides') {
    if (!exigirAdm()) return;
    lerCorpoJson(req)
      .then((body) => {
        const distribuidora = String(body.distribuidora ?? '').trim();
        const icms = Number(body.icms);
        const pisCofins = Number(body.pisCofins);
        if (!distribuidora || !Number.isFinite(icms) || !Number.isFinite(pisCofins)) {
          json(res, 400, { erro: 'Preencha distribuidora, ICMS e PIS/COFINS válidos.' });
          return;
        }
        salvarImpostoOverride(distribuidora, icms, pisCofins);
        json(res, 200, { ok: true });
      })
      .catch((e: unknown) => json(res, 400, { erro: e instanceof Error ? e.message : String(e) }));
    return;
  }

  const matchImposto = url.match(/^\/impostos\/overrides\/(.+)$/);
  if (matchImposto && req.method === 'DELETE') {
    if (!exigirAdm()) return;
    removerImpostoOverride(decodeURIComponent(matchImposto[1]));
    json(res, 200, { ok: true });
    return;
  }

  // ── Overrides de isenções fiscais (TE/TUSD x ICMS/PIS-COFINS) por concessionária ──
  if (req.method === 'GET' && url === '/isencoes/overrides') {
    json(res, 200, listarIsencoesOverrides());
    return;
  }

  if (req.method === 'POST' && url === '/isencoes/overrides') {
    if (!exigirAdm()) return;
    lerCorpoJson(req)
      .then((body) => {
        const distribuidora = String(body.distribuidora ?? '').trim();
        const modalidade = String(body.modalidade ?? '').trim();
        if (!distribuidora || !modalidade) {
          json(res, 400, { erro: 'Distribuidora e modalidade são obrigatórias.' });
          return;
        }
        salvarIsencaoOverride(distribuidora, modalidade, {
          teIcms: !!body.teIcms,
          tePisCofins: !!body.tePisCofins,
          tusdIcms: !!body.tusdIcms,
          tusdPisCofins: !!body.tusdPisCofins,
        });
        json(res, 200, { ok: true });
      })
      .catch((e: unknown) => json(res, 400, { erro: e instanceof Error ? e.message : String(e) }));
    return;
  }

  const [urlSemQuery, queryString] = url.split('?');
  const matchIsencao = urlSemQuery.match(/^\/isencoes\/overrides\/(.+)$/);
  if (matchIsencao && req.method === 'DELETE') {
    if (!exigirAdm()) return;
    const modalidade = new URLSearchParams(queryString ?? '').get('modalidade') ?? '';
    if (!modalidade) {
      json(res, 400, { erro: 'Parâmetro modalidade é obrigatório.' });
      return;
    }
    removerIsencaoOverride(decodeURIComponent(matchIsencao[1]), modalidade);
    json(res, 200, { ok: true });
    return;
  }

  next();
}
