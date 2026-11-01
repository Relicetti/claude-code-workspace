import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getProgresso, sincronizarAneel } from './aneel.ts';
import { Auth, type UsuarioPublico } from './auth.ts';
import { autentiqueConfigurada, autentiqueSandbox, baixarPdf, consultarDocumento, criarDocumento, type SignatarioAutentique } from './autentique.ts';
import { arquivoModelo, gerarDocx, MODELOS, validarModelo, type Modelo } from './gerarDocx.ts';
import { apagar, registrarRevisao, type NovaRevisao, type Proposta } from '../src/lib/propostas.ts';
import {
  anexarDocumento, atualizarCadastro, atualizarCondicoes, clienteDaProposta, clienteNovo, mudarStatus, pendenciasContrato,
  removerDocumento, ROTULO_DOCUMENTO, soDigitos, TAMANHO_MAX_ARQUIVO, TIPOS_ARQUIVO_ACEITOS,
  type Cliente, type DocumentoCliente, type EnvioAssinatura, type SignatarioEnvio, type StatusCliente, type TipoDocumento,
} from '../src/lib/clientes.ts';
import { dadosModelo } from '../src/lib/contratos.ts';
import {
  baixarFatura, cancelarFatura, emitirFatura, emitirQuitacao, lancar, proximoNumeroFatura, reajustar, removerLancamento,
  type LancamentoMensal,
} from '../src/lib/controle.ts';
import { configVazia, limparConfig, pendenciasConfig, pendenciasModelo, type ConfigKora } from '../src/lib/config.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Funciona tanto de server/ (dev) quanto de dist-server/ (produção): os dois ficam na raiz.
const SEED = path.join(__dirname, '..', 'src', 'data', 'tarifas.json');
// Tarifas sincronizadas da ANEEL, propostas, clientes e anexos vão para o volume persistente em produção.
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? path.join(__dirname, '..', 'server', 'data');
const ATUAL = path.join(DATA_DIR, 'tarifas.json');
const PROPOSTAS = path.join(DATA_DIR, 'propostas.json');
const CLIENTES = path.join(DATA_DIR, 'clientes.json');
const CONFIG = path.join(DATA_DIR, 'config.json');
const DOCUMENTOS = path.join(DATA_DIR, 'documentos');
const DIR_MODELOS = path.join(DATA_DIR, 'modelos');

export const auth = new Auth(DATA_DIR);
auth.inicializar();

let sincronizando = false;
let ultimoErro: string | null = null;

class ErroHttp extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function lerJson<T>(p: string, vazio: T): T {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : vazio;
}
function gravarJson(p: string, v: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(`${p}.tmp`, JSON.stringify(v));
  fs.renameSync(`${p}.tmp`, p);
}

const lerPropostas = () => lerJson<Proposta[]>(PROPOSTAS, []);
const gravarPropostas = (l: Proposta[]) => gravarJson(PROPOSTAS, l);
const lerClientes = () => lerJson<Cliente[]>(CLIENTES, []);
const gravarClientes = (l: Cliente[]) => gravarJson(CLIENTES, l);
// Dados da Kora nos documentos (sócios, CPF/RG) vêm por padrão da variável KORA_DADOS_PADRAO (JSON), que fica só
// no Railway — o repositório é público. O que for salvo na aba Configurações tem prioridade.
function configPadrao(): Partial<ConfigKora> {
  try { return JSON.parse(process.env.KORA_DADOS_PADRAO ?? '{}'); } catch { console.error('[config] KORA_DADOS_PADRAO não é JSON válido'); return {}; }
}
const lerConfig = (): ConfigKora => {
  const salvo = limparConfig(lerJson<Partial<ConfigKora>>(CONFIG, configVazia()));
  const padrao = limparConfig(configPadrao());
  return {
    ...salvo,
    representanteContrato: salvo.representanteContrato.nome ? salvo.representanteContrato : padrao.representanteContrato,
    sociosProcuracao: salvo.sociosProcuracao || padrao.sociosProcuracao,
    signatariosKora: salvo.signatariosKora.length ? salvo.signatariosKora : padrao.signatariosKora,
    testemunhas: [0, 1].map((i) => (salvo.testemunhas[i].email ? salvo.testemunhas[i] : padrao.testemunhas[i])) as ConfigKora['testemunhas'],
  };
};

function cliente(id: string): Cliente {
  const c = lerClientes().find((x) => x.id === id);
  if (!c) throw new ErroHttp(404, 'Cliente não encontrado.');
  return c;
}

/** Lê, altera e grava num passo síncrono: duas requisições ao mesmo tempo não perdem alteração. */
function alterarCliente(id: string, fn: (c: Cliente) => Cliente): Cliente {
  const lista = lerClientes();
  const atual = lista.find((x) => x.id === id);
  if (!atual) throw new ErroHttp(404, 'Cliente não encontrado.');
  const novo = fn(atual);
  gravarClientes(lista.map((x) => (x.id === id ? novo : x)));
  return novo;
}

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let corpo = '';
    req.on('data', (c) => {
      corpo += c;
      if (corpo.length > 5_000_000) { reject(new ErroHttp(413, 'Corpo grande demais.')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(corpo ? JSON.parse(corpo) : {}); } catch { reject(new ErroHttp(400, 'JSON inválido.')); } });
    req.on('error', reject);
  });
}

function lerBinario(req: IncomingMessage, limite: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > limite) { reject(new ErroHttp(413, `Arquivo maior que ${Math.round(limite / 1024 / 1024)} MB.`)); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

// ── Documentos anexados ──────────────────────────────────────────────────────
const arquivoDoc = (clienteId: string, docId: string) => path.join(DOCUMENTOS, clienteId, docId);

function salvarDocumento(clienteId: string, tipo: TipoDocumento, nomeArquivo: string, mime: string, conteudo: Buffer, por: string): DocumentoCliente {
  const doc: DocumentoCliente = {
    id: crypto.randomBytes(12).toString('hex'), tipo, nomeArquivo: nomeArquivo.replace(/[\\/\r\n"]/g, '-').slice(0, 180),
    mime, tamanho: conteudo.length, enviadoEm: new Date().toISOString(), enviadoPor: por,
  };
  fs.mkdirSync(path.join(DOCUMENTOS, clienteId), { recursive: true });
  fs.writeFileSync(arquivoDoc(clienteId, doc.id), conteudo);
  return doc;
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_POR_EXTENSAO: Record<string, string> = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic',
  '.webp': 'image/webp', '.docx': DOCX, '.doc': 'application/msword',
};

const nomeSeguro = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').trim();

// ── Assinatura ───────────────────────────────────────────────────────────────
const TIPO_GERADO: Record<Modelo, TipoDocumento> = { contrato: 'contrato_gerado', procuracao: 'procuracao_gerada' };
const TIPO_ASSINADO: Record<Modelo, TipoDocumento> = { contrato: 'contrato_assinado', procuracao: 'procuracao' };
const TITULO: Record<Modelo, string> = { contrato: 'Contrato', procuracao: 'Procuração' };

function signatariosDe(c: Cliente, modelo: Modelo, cfg: ConfigKora, whatsapp: boolean): (SignatarioAutentique & { papel: SignatarioEnvio['papel'] })[] {
  const quem = c.tipo === 'PJ'
    ? { nome: c.representante.nome, email: c.representante.email, telefone: c.representante.telefone }
    : { nome: c.nome, email: c.email, telefone: c.telefone };
  if (whatsapp ? soDigitos(quem.telefone).length < 10 : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(quem.email.trim())) {
    throw new ErroHttp(400, whatsapp
      ? `Informe o celular ${c.tipo === 'PJ' ? 'do representante legal' : 'do cliente'} para mandar por WhatsApp.`
      : `Informe o e-mail ${c.tipo === 'PJ' ? 'do representante legal' : 'do cliente'}.`);
  }
  const lista: (SignatarioAutentique & { papel: SignatarioEnvio['papel'] })[] = [
    { papel: 'cliente', ...quem, whatsapp, testemunha: false },
  ];
  if (modelo === 'contrato') {
    const falta = pendenciasConfig(cfg);
    if (falta.length) throw new ErroHttp(400, `Configure antes (aba Configurações): ${falta.join('; ')}.`);
    for (const s of cfg.signatariosKora) lista.push({ papel: 'kora', ...s, whatsapp: false, testemunha: false });
    for (const t of cfg.testemunhas) lista.push({ papel: 'testemunha', ...t, whatsapp: false, testemunha: true });
  }
  return lista;
}

/** Consulta os envios pendentes; quando todos assinaram, baixa o PDF assinado e anexa. */
async function sincronizarAssinaturas(id: string, por: string): Promise<Cliente> {
  const pendentes = cliente(id).assinaturas.filter((e) => !e.concluidoEm && !e.cancelado);
  for (const envio of pendentes) {
    const doc = await consultarDocumento(envio.autentiqueId);
    const porId = new Map(doc.assinaturas.map((a) => [a.publicId, a]));
    const signatarios = envio.signatarios.map((s) => {
      const a = porId.get(s.publicId) ?? doc.assinaturas.find((x) => x.email && x.email === s.email);
      return a ? { ...s, assinadoEm: a.assinadoEm, recusadoEm: a.recusadoEm } : s;
    });
    const todos = signatarios.every((s) => s.assinadoEm);
    let anexo: DocumentoCliente | null = null;
    if (todos && doc.pdfAssinado) {
      const modelo = envio.documento;
      const pdf = await baixarPdf(doc.pdfAssinado);
      const c = cliente(id);
      anexo = salvarDocumento(id, TIPO_ASSINADO[modelo], nomeSeguro(`${TITULO[modelo]} assinado - ${c.nome}.pdf`), 'application/pdf', pdf, 'Autentique');
    }
    alterarCliente(id, (c) => {
      const agora = new Date();
      let novo: Cliente = {
        ...c,
        assinaturas: c.assinaturas.map((e) => (e.autentiqueId === envio.autentiqueId
          ? { ...e, signatarios, concluidoEm: anexo ? agora.toISOString() : e.concluidoEm } : e)),
      };
      if (anexo) {
        novo = anexarDocumento(novo, anexo, agora);
        novo.historico = [...novo.historico, { em: agora.toISOString(), por, texto: `${TITULO[envio.documento]} assinado por todos (Autentique).` }];
      }
      return novo;
    });
  }
  return cliente(id);
}

// ── Roteamento ───────────────────────────────────────────────────────────────
type Rota = (req: IncomingMessage, res: ServerResponse, m: RegExpMatchArray, u: UsuarioPublico) => Promise<void> | void;
const rotas: [string, RegExp, Rota, { admin?: boolean }?][] = [];
const rota = (metodo: string, padrao: RegExp, fn: Rota, opts?: { admin?: boolean }) => rotas.push([metodo, padrao, fn, opts]);

// Tarifas
rota('GET', /^\/dados$/, (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  fs.createReadStream(fs.existsSync(ATUAL) ? ATUAL : SEED).pipe(res);
});
rota('GET', /^\/tarifas\/progresso$/, (_req, res) => json(res, 200, { sincronizando, descricao: getProgresso(), erro: ultimoErro }));
rota('POST', /^\/tarifas\/atualizar$/, (_req, res) => {
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
  json(res, 202, { ok: true });
});

// Propostas
rota('GET', /^\/propostas$/, (_req, res) => {
  const fechadas = new Map(lerClientes().filter((c) => c.proposta && c.status !== 'cancelado').map((c) => [c.proposta!.numero, c.id]));
  json(res, 200, lerPropostas().map((p) => ({ ...p, clienteId: fechadas.get(p.numero) ?? null })));
});
// DELETE /propostas/KORA-2026-001 apaga a proposta; .../revisoes/1 apaga só essa revisão.
rota('DELETE', /^\/propostas\/([A-Z0-9-]+)(?:\/revisoes\/(\d+))?$/, (_req, res, m) => {
  try {
    gravarPropostas(apagar(lerPropostas(), m[1], m[2] === undefined ? undefined : Number(m[2])));
    json(res, 200, { ok: true });
  } catch (e) { throw new ErroHttp(404, (e as Error).message); }
});
// POST /propostas cria (Rev. 00); POST /propostas/KORA-2026-001/revisoes sobe a revisão.
rota('POST', /^\/propostas(?:\/([A-Z0-9-]+)\/revisoes)?$/, async (req, res, m) => {
  const nova = (await lerCorpo(req)) as NovaRevisao;
  if (!nova?.dados || !nova.r || !nova.op || !nova.entrada || !nova.operacao) throw new ErroHttp(400, 'Proposta incompleta.');
  try {
    // Leitura e gravação síncronas, sem await no meio: duas gerações simultâneas não perdem revisão.
    const { lista, proposta } = registrarRevisao(lerPropostas(), nova, new Date(), m[1]);
    gravarPropostas(lista);
    json(res, 201, proposta);
  } catch (e) { throw new ErroHttp(/não encontrada/.test((e as Error).message) ? 404 : 400, (e as Error).message); }
});
// Fechar a proposta: cria o cliente.
rota('POST', /^\/propostas\/([A-Z0-9-]+)\/fechar$/, async (req, res, m, u) => {
  const { revisao } = (await lerCorpo(req)) as { revisao?: number };
  const p = lerPropostas().find((x) => x.numero === m[1]);
  if (!p) throw new ErroHttp(404, 'Proposta não encontrada.');
  const rev = revisao ?? Math.max(...p.revisoes.map((r) => r.revisao));
  const lista = lerClientes();
  let novo: Cliente;
  try { novo = clienteDaProposta(lista, p, rev, new Date(), u.nome); } catch (e) { throw new ErroHttp(409, (e as Error).message); }
  gravarClientes([...lista, novo]);
  json(res, 201, novo);
});

// Clientes
rota('GET', /^\/clientes$/, (_req, res) => {
  // Lista leve: sem o retrato da proposta nem o histórico.
  json(res, 200, lerClientes().map(({ base, historico: _h, ...c }) => ({ ...c, base: base ? { resumo: base.resumo, operacao: base.operacao } : null })));
});
rota('POST', /^\/clientes$/, async (req, res, _m, u) => {
  const corpo = (await lerCorpo(req)) as Partial<Cliente>;
  const lista = lerClientes();
  const novo = clienteNovo(lista, corpo, new Date(), u.nome);
  gravarClientes([...lista, novo]);
  json(res, 201, novo);
});
rota('GET', /^\/clientes\/(CLI-\d+)$/, (_req, res, m) => json(res, 200, cliente(m[1])));
rota('PUT', /^\/clientes\/(CLI-\d+)$/, async (req, res, m, u) => {
  const corpo = (await lerCorpo(req)) as Partial<Cliente>;
  json(res, 200, alterarCliente(m[1], (c) => {
    let novo = atualizarCadastro(c, corpo, new Date(), u.nome);
    if (corpo.contrato) novo = atualizarCondicoes(novo, corpo.contrato, new Date(), u.nome);
    return novo;
  }));
});
rota('POST', /^\/clientes\/(CLI-\d+)\/status$/, async (req, res, m, u) => {
  const { status, motivo } = (await lerCorpo(req)) as { status: StatusCliente; motivo?: string };
  try {
    json(res, 200, alterarCliente(m[1], (c) => mudarStatus(c, status, new Date(), u.nome, motivo ?? '')));
  } catch (e) {
    if (e instanceof ErroHttp) throw e;
    throw new ErroHttp(409, (e as Error).message);
  }
});
rota('DELETE', /^\/clientes\/(CLI-\d+)$/, (_req, res, m) => {
  const c = cliente(m[1]);
  if (c.status !== 'cadastro' && c.status !== 'cancelado') throw new ErroHttp(409, 'Só dá para apagar cliente em cadastro ou cancelado.');
  gravarClientes(lerClientes().filter((x) => x.id !== c.id));
  fs.rmSync(path.join(DOCUMENTOS, c.id), { recursive: true, force: true });
  json(res, 200, { ok: true });
}, { admin: true });

// Anexos: POST com o arquivo cru no corpo; tipo e nome na query.
rota('POST', /^\/clientes\/(CLI-\d+)\/documentos$/, async (req, res, m, u) => {
  cliente(m[1]);
  const q = new URL(req.url ?? '', 'http://x').searchParams;
  const tipo = q.get('tipo') as TipoDocumento;
  const nome = q.get('nome') ?? 'arquivo';
  if (!(tipo in ROTULO_DOCUMENTO)) throw new ErroHttp(400, 'Tipo de documento inválido.');
  const mime = MIME_POR_EXTENSAO[path.extname(nome).toLowerCase()] ?? String(req.headers['content-type'] ?? '');
  if (!TIPOS_ARQUIVO_ACEITOS.includes(mime)) throw new ErroHttp(415, 'Formato não aceito. Envie PDF, imagem (JPG/PNG/HEIC) ou Word.');
  const conteudo = await lerBinario(req, TAMANHO_MAX_ARQUIVO);
  if (conteudo.length === 0) throw new ErroHttp(400, 'Arquivo vazio.');
  const doc = salvarDocumento(m[1], tipo, nome, mime, conteudo, u.nome);
  json(res, 201, alterarCliente(m[1], (c) => anexarDocumento(c, doc, new Date())));
});
rota('GET', /^\/clientes\/(CLI-\d+)\/documentos\/([a-f0-9]{24})$/, (req, res, m) => {
  const doc = cliente(m[1]).documentos.find((d) => d.id === m[2]);
  const arq = arquivoDoc(m[1], m[2]);
  if (!doc || !fs.existsSync(arq)) throw new ErroHttp(404, 'Documento não encontrado.');
  const baixar = new URL(req.url ?? '', 'http://x').searchParams.has('baixar');
  res.writeHead(200, {
    'Content-Type': doc.mime, 'Content-Length': doc.tamanho, 'Cache-Control': 'private, no-store',
    'Content-Disposition': `${baixar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(doc.nomeArquivo)}`,
  });
  fs.createReadStream(arq).pipe(res);
});
rota('DELETE', /^\/clientes\/(CLI-\d+)\/documentos\/([a-f0-9]{24})$/, (_req, res, m, u) => {
  const emUso = cliente(m[1]).assinaturas.some((e) => e.arquivoId === m[2] && !e.cancelado);
  if (emUso) throw new ErroHttp(409, 'Esse documento foi enviado para assinatura; cancele o envio antes.');
  const novo = alterarCliente(m[1], (c) => {
    try { return removerDocumento(c, m[2], new Date(), u.nome); } catch (e) { throw new ErroHttp(404, (e as Error).message); }
  });
  fs.rmSync(arquivoDoc(m[1], m[2]), { force: true });
  json(res, 200, novo);
});

// Contratos: gera o .docx a partir do modelo e anexa (substitui o gerado anterior que não foi para assinatura).
rota('POST', /^\/clientes\/(CLI-\d+)\/gerar\/(contrato|procuracao)$/, (_req, res, m, u) => {
  const modelo = m[2] as Modelo;
  const c = cliente(m[1]);
  const cfg = lerConfig();
  const falta = [...pendenciasContrato(c), ...pendenciasModelo(cfg, modelo)];
  if (falta.length) throw new ErroHttp(409, `Falta para gerar: ${falta.join('; ')}.`);
  let conteudo: Buffer;
  try { conteudo = gerarDocx(DIR_MODELOS, modelo, dadosModelo(c, new Date(), cfg)); } catch (e) { throw new ErroHttp(409, (e as Error).message); }
  const doc = salvarDocumento(c.id, TIPO_GERADO[modelo], nomeSeguro(`${TITULO[modelo]} KORA - ${c.nome}.docx`), DOCX, conteudo, u.nome);
  const enviados = new Set(c.assinaturas.filter((e) => !e.cancelado).map((e) => e.arquivoId));
  const antigos = c.documentos.filter((d) => d.tipo === TIPO_GERADO[modelo] && !enviados.has(d.id));
  const novo = alterarCliente(c.id, (atual) => {
    let x = atual;
    for (const d of antigos) x = { ...x, documentos: x.documentos.filter((y) => y.id !== d.id) };
    return anexarDocumento(x, doc, new Date());
  });
  for (const d of antigos) fs.rmSync(arquivoDoc(c.id, d.id), { force: true });
  json(res, 201, novo);
});

// Envia o último documento gerado para assinatura na Autentique.
rota('POST', /^\/clientes\/(CLI-\d+)\/assinaturas$/, async (req, res, m, u) => {
  if (!autentiqueConfigurada()) throw new ErroHttp(503, 'Assinatura eletrônica ainda não configurada (falta o token da Autentique da Kora).');
  const { documento, whatsapp } = (await lerCorpo(req)) as { documento: Modelo; whatsapp?: boolean };
  if (documento !== 'contrato' && documento !== 'procuracao') throw new ErroHttp(400, 'Documento inválido.');
  const c = cliente(m[1]);
  if (c.assinaturas.some((e) => e.documento === documento && !e.cancelado && !e.concluidoEm)) {
    throw new ErroHttp(409, `Já existe ${TITULO[documento].toLowerCase()} aguardando assinatura. Cancele o envio para mandar de novo.`);
  }
  const gerado = [...c.documentos].reverse().find((d) => d.tipo === TIPO_GERADO[documento]);
  if (!gerado) throw new ErroHttp(409, `Gere ${documento === 'contrato' ? 'o contrato' : 'a procuração'} antes de enviar.`);
  const signatarios = signatariosDe(c, documento, lerConfig(), !!whatsapp);
  const arquivo = fs.readFileSync(arquivoDoc(c.id, gerado.id));
  const doc = await criarDocumento(`${TITULO[documento]} Kora - ${c.nome}`, arquivo, gerado.nomeArquivo, gerado.mime, signatarios);
  // Associa as assinaturas devolvidas aos signatários (por e-mail; os de WhatsApp pelos que sobram, na ordem).
  const livres = [...doc.assinaturas];
  const envio: EnvioAssinatura = {
    documento, autentiqueId: doc.id, arquivoId: gerado.id, enviadoEm: new Date().toISOString(), enviadoPor: u.nome,
    sandbox: autentiqueSandbox(), concluidoEm: null, cancelado: false,
    signatarios: signatarios.map((s) => {
      let i = livres.findIndex((a) => a.email && a.email.toLowerCase() === s.email.trim().toLowerCase() && !s.whatsapp);
      if (i < 0) i = livres.findIndex((a) => !a.email);
      const a = i >= 0 ? livres.splice(i, 1)[0] : null;
      return {
        papel: s.papel, nome: s.nome, email: s.whatsapp ? '' : s.email.trim().toLowerCase(), telefone: s.whatsapp ? s.telefone : '',
        assinadoEm: null, recusadoEm: null, publicId: a?.publicId ?? '',
      };
    }),
  };
  json(res, 201, alterarCliente(c.id, (atual) => ({
    ...atual, assinaturas: [...atual.assinaturas, envio], atualizadoEm: envio.enviadoEm,
    historico: [...atual.historico, {
      em: envio.enviadoEm, por: u.nome,
      texto: `${TITULO[documento]} enviado para assinatura${envio.sandbox ? ' (TESTE/sandbox)' : ''}${whatsapp ? ' — cliente por WhatsApp' : ''}.`,
    }],
  })));
});
rota('POST', /^\/clientes\/(CLI-\d+)\/assinaturas\/atualizar$/, async (_req, res, m, u) => {
  if (!autentiqueConfigurada()) throw new ErroHttp(503, 'Assinatura eletrônica ainda não configurada.');
  json(res, 200, await sincronizarAssinaturas(m[1], u.nome));
});
// Marca o envio como cancelado no app (não apaga na Autentique).
rota('POST', /^\/clientes\/(CLI-\d+)\/assinaturas\/([A-Za-z0-9-]+)\/cancelar$/, (_req, res, m, u) => {
  json(res, 200, alterarCliente(m[1], (c) => {
    const e = c.assinaturas.find((x) => x.autentiqueId === m[2]);
    if (!e) throw new ErroHttp(404, 'Envio não encontrado.');
    const agora = new Date().toISOString();
    return {
      ...c, assinaturas: c.assinaturas.map((x) => (x === e ? { ...x, cancelado: true } : x)), atualizadoEm: agora,
      historico: [...c.historico, { em: agora, por: u.nome, texto: `Envio do ${TITULO[e.documento].toLowerCase()} para assinatura cancelado no app.` }],
    };
  }));
});

// ── Compensação mês a mês e faturas Kora ──
/** Altera o cliente; erro de regra de negócio vira 409. */
function regra(id: string, fn: (c: Cliente) => Cliente): Cliente {
  return alterarCliente(id, (c) => {
    try { return fn({ ...c, lancamentos: c.lancamentos ?? [], faturas: c.faturas ?? [] }); } catch (e) { throw e instanceof ErroHttp ? e : new ErroHttp(409, (e as Error).message); }
  });
}
const numeroFatura = (agora: Date) => proximoNumeroFatura(lerClientes().flatMap((c) => (c.faturas ?? []).map((f) => f.numero)), agora.getFullYear());

rota('POST', /^\/clientes\/(CLI-\d+)\/lancamentos$/, async (req, res, m, u) => {
  const b = (await lerCorpo(req)) as Partial<LancamentoMensal>;
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  const compensado = Number(b.compensadoKWh);
  const l: LancamentoMensal = {
    id: crypto.randomBytes(8).toString('hex'), mes: String(b.mes ?? ''), uc: String(b.uc ?? ''),
    compensadoKWh: compensado, saldoDebitadoKWh: num(b.saldoDebitadoKWh) ?? compensado, saldoFaturaKWh: num(b.saldoFaturaKWh),
    vencimento: String(b.vencimento ?? ''), valorDistribuidora: num(b.valorDistribuidora),
    faturaDistribuidoraId: b.faturaDistribuidoraId ? String(b.faturaDistribuidoraId) : null,
    observacao: String(b.observacao ?? '').trim(), criadoEm: new Date().toISOString(), criadoPor: u.nome,
  };
  json(res, 201, regra(m[1], (c) => lancar(c, l)));
});
rota('DELETE', /^\/clientes\/(CLI-\d+)\/lancamentos\/([a-f0-9]{16})$/, (_req, res, m, u) => {
  json(res, 200, regra(m[1], (c) => removerLancamento(c, m[2], new Date(), u.nome)));
});
rota('POST', /^\/clientes\/(CLI-\d+)\/faturas$/, async (req, res, m, u) => {
  const { mes, observacao } = (await lerCorpo(req)) as { mes: string; observacao?: string };
  const agora = new Date();
  json(res, 201, regra(m[1], (c) => emitirFatura(c, String(mes), numeroFatura(agora), agora, u.nome, String(observacao ?? '').trim())));
});
rota('POST', /^\/clientes\/(CLI-\d+)\/faturas\/quitacao$/, async (req, res, m, u) => {
  const { vencimento, motivo } = (await lerCorpo(req)) as { vencimento: string; motivo?: string };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(vencimento))) throw new ErroHttp(400, 'Informe o vencimento.');
  const agora = new Date();
  json(res, 201, regra(m[1], (c) => emitirQuitacao(c, numeroFatura(agora), vencimento, agora, u.nome, String(motivo ?? '').trim())));
});
rota('POST', /^\/clientes\/(CLI-\d+)\/faturas\/(FK-\d{4}-\d{4})\/baixa$/, async (req, res, m, u) => {
  const { pagaEm, valorPago } = (await lerCorpo(req)) as { pagaEm: string; valorPago: number };
  json(res, 200, regra(m[1], (c) => baixarFatura(c, m[2], String(pagaEm), Number(valorPago), new Date(), u.nome)));
});
rota('POST', /^\/clientes\/(CLI-\d+)\/faturas\/(FK-\d{4}-\d{4})\/cancelar$/, async (req, res, m, u) => {
  const { motivo } = (await lerCorpo(req)) as { motivo?: string };
  json(res, 200, regra(m[1], (c) => cancelarFatura(c, m[2], String(motivo ?? '').trim(), new Date(), u.nome)));
});
rota('POST', /^\/clientes\/(CLI-\d+)\/reajustes$/, async (req, res, m, u) => {
  const b = (await lerCorpo(req)) as { aPartirDe: string; precoKWh: number; motivo?: string };
  json(res, 201, regra(m[1], (c) => reajustar(c, { aPartirDe: String(b.aPartirDe), precoKWh: Number(b.precoKWh), motivo: String(b.motivo ?? '').trim() }, new Date(), u.nome)));
});
// Todas as faturas (aba Faturamento).
rota('GET', /^\/faturas$/, (_req, res) => {
  json(res, 200, lerClientes().flatMap((c) => (c.faturas ?? []).map((f) => ({ ...f, clienteId: c.id, cliente: c.nome, documento: c.documento, tipo: c.tipo }))));
});

// Consulta de CNPJ (BrasilAPI, dados públicos da Receita) para preencher o cadastro.
rota('GET', /^\/cnpj\/(\d{14})$/, async (_req, res, m) => {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${m[1]}`);
  if (r.status === 404) throw new ErroHttp(404, 'CNPJ não encontrado na Receita.');
  if (!r.ok) throw new ErroHttp(502, `Consulta de CNPJ indisponível (HTTP ${r.status}).`);
  const d = await r.json() as Record<string, unknown>;
  const s = (k: string) => String(d[k] ?? '').trim();
  json(res, 200, {
    nome: s('razao_social'), nomeFantasia: s('nome_fantasia'),
    endereco: {
      logradouro: [s('descricao_tipo_de_logradouro'), s('logradouro')].filter(Boolean).join(' '), numero: s('numero'),
      complemento: s('complemento'), bairro: s('bairro'), cidade: s('municipio'), uf: s('uf'), cep: s('cep'),
    },
    socios: ((d.qsa as { nome_socio?: string; qualificacao_socio?: string }[] | undefined) ?? [])
      .map((q) => ({ nome: q.nome_socio ?? '', qualificacao: q.qualificacao_socio ?? '' })),
  });
});

// Configurações da Kora
const infoModelos = () => Object.fromEntries(MODELOS.map((m) => {
  const arq = arquivoModelo(DIR_MODELOS, m);
  return [m, fs.existsSync(arq) ? { enviadoEm: fs.statSync(arq).mtime.toISOString(), tamanho: fs.statSync(arq).size } : null];
}));
rota('GET', /^\/config$/, (_req, res) => json(res, 200, {
  ...lerConfig(), autentique: { configurada: autentiqueConfigurada(), sandbox: autentiqueSandbox() }, modelos: infoModelos(),
}));
// Modelos .docx: PUT com o arquivo cru; GET baixa o atual.
rota('PUT', /^\/modelos\/(contrato|procuracao)$/, async (req, res, m) => {
  const conteudo = await lerBinario(req, 5 * 1024 * 1024);
  let campos: string[];
  try { campos = validarModelo(conteudo); } catch (e) { throw new ErroHttp(400, (e as Error).message); }
  fs.mkdirSync(DIR_MODELOS, { recursive: true });
  const arq = arquivoModelo(DIR_MODELOS, m[1] as Modelo);
  if (fs.existsSync(arq)) fs.copyFileSync(arq, `${arq}.${Date.now()}.bak`);
  fs.writeFileSync(`${arq}.tmp`, conteudo);
  fs.renameSync(`${arq}.tmp`, arq);
  json(res, 200, { campos, modelos: infoModelos() });
}, { admin: true });
rota('GET', /^\/modelos\/(contrato|procuracao)$/, (_req, res, m) => {
  const arq = arquivoModelo(DIR_MODELOS, m[1] as Modelo);
  if (!fs.existsSync(arq)) throw new ErroHttp(404, 'Modelo ainda não enviado.');
  res.writeHead(200, { 'Content-Type': DOCX, 'Content-Disposition': `attachment; filename="modelo-${m[1]}.docx"`, 'Cache-Control': 'no-store' });
  fs.createReadStream(arq).pipe(res);
});
rota('PUT', /^\/config$/, async (req, res) => {
  const cfg = limparConfig((await lerCorpo(req)) as Partial<ConfigKora>);
  gravarJson(CONFIG, cfg);
  json(res, 200, cfg);
}, { admin: true });

// Usuários
rota('GET', /^\/usuarios$/, (_req, res) => json(res, 200, auth.usuarios().map(Auth.publico)), { admin: true });
rota('POST', /^\/usuarios$/, async (req, res) => {
  const corpo = (await lerCorpo(req)) as { email: string; nome: string; senha: string; admin?: boolean };
  try { json(res, 201, auth.criarUsuario(corpo)); } catch (e) { throw new ErroHttp(400, (e as Error).message); }
}, { admin: true });
rota('PUT', /^\/usuarios\/([a-f0-9-]{36})$/, async (req, res, m) => {
  const corpo = (await lerCorpo(req)) as { nome?: string; email?: string; admin?: boolean; ativo?: boolean; senha?: string };
  try { json(res, 200, auth.alterarUsuario(m[1], corpo)); } catch (e) { throw new ErroHttp(400, (e as Error).message); }
}, { admin: true });
rota('POST', /^\/minha-senha$/, async (req, res, _m, u) => {
  const { atual, nova } = (await lerCorpo(req)) as { atual: string; nova: string };
  try {
    auth.login(req, res, u.email, atual); // confere a senha atual (e renova a sessão)
    auth.alterarUsuario(u.id, { senha: nova });
    auth.login(req, res, u.email, nova); // trocar a senha derruba as sessões; abre uma nova para quem trocou
  } catch (e) { throw new ErroHttp(400, (e as Error).message); }
  json(res, 200, { ok: true });
});

export function apiHandler(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const url = (req.url ?? '/').split('?')[0];

  // Sessão: as únicas rotas abertas.
  if (req.method === 'POST' && url === '/login') {
    lerCorpo(req)
      .then((c) => { const { email, senha } = c as { email: string; senha: string }; json(res, 200, auth.login(req, res, email, senha)); })
      .catch((e: Error) => json(res, e instanceof ErroHttp ? e.status : 401, { erro: e.message }));
    return;
  }
  if (req.method === 'POST' && url === '/logout') { auth.logout(req, res); json(res, 200, { ok: true }); return; }

  const usuario = auth.usuarioDa(req);
  if (url === '/sessao' && req.method === 'GET') {
    json(res, usuario ? 200 : 401, usuario ? { usuario, temUsuarios: true } : { erro: 'Sem sessão.', temUsuarios: auth.usuarios().length > 0 });
    return;
  }

  for (const [metodo, padrao, fn, opts] of rotas) {
    if (req.method !== metodo) continue;
    const m = url.match(padrao);
    if (!m) continue;
    if (!usuario) return json(res, 401, { erro: 'Faça login.' });
    if (opts?.admin && !usuario.admin) return json(res, 403, { erro: 'Só administradores.' });
    Promise.resolve()
      .then(() => fn(req, res, m, usuario))
      .catch((e: Error) => {
        if (!(e instanceof ErroHttp)) console.error('[api]', req.method, url, e);
        if (!res.headersSent) json(res, e instanceof ErroHttp ? e.status : 500, { erro: e.message });
      });
    return;
  }
  next();
}
