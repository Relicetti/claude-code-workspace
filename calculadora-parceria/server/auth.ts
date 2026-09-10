import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { db } from './db';

export type Perfil = 'adm' | 'operador';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
}

const SESSAO_DURACAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function hashSenha(senha: string, salt: string): string {
  return crypto.scryptSync(senha, salt, 64).toString('hex');
}

export function criarHashSenha(senha: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  return { hash: hashSenha(senha, salt), salt };
}

function senhaConfere(senha: string, hash: string, salt: string): boolean {
  const calculado = Buffer.from(hashSenha(senha, salt), 'hex');
  const esperado = Buffer.from(hash, 'hex');
  return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
}

/** Cria o primeiro usuário ADM a partir de ADMIN_EMAIL/ADMIN_SENHA (variáveis de ambiente),
 * só se a tabela de usuários estiver vazia. Nunca hardcoda credenciais no código. */
export function seedAdminIfEmpty(): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM usuarios').get() as { c: number }).c;
  if (count > 0) return;
  const email = process.env.ADMIN_EMAIL;
  const senha = process.env.ADMIN_SENHA;
  if (!email || !senha) {
    console.warn('[auth] ADMIN_EMAIL/ADMIN_SENHA não definidos — nenhum usuário ADM foi criado.');
    return;
  }
  const { hash, salt } = criarHashSenha(senha);
  db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, senha_salt, perfil, ativo, criado_em)
    VALUES (?, ?, ?, ?, 'adm', 1, ?)
  `).run('Administrador', email.trim().toLowerCase(), hash, salt, new Date().toISOString());
  console.log(`[auth] Usuário ADM inicial criado: ${email}`);
}

function paraUsuario(row: any): Usuario {
  return { id: row.id, nome: row.nome, email: row.email, perfil: row.perfil, ativo: !!row.ativo };
}

export function autenticar(email: string, senha: string): Usuario | null {
  const row = db.prepare(`
    SELECT id, nome, email, senha_hash, senha_salt, perfil, ativo FROM usuarios WHERE email = ?
  `).get(email.trim().toLowerCase()) as any;
  if (!row || !row.ativo) return null;
  if (!senhaConfere(senha, row.senha_hash, row.senha_salt)) return null;
  return paraUsuario(row);
}

export function criarSessao(usuarioId: number): { token: string; expiraEm: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + SESSAO_DURACAO_MS).toISOString();
  db.prepare('INSERT INTO sessoes (token, usuario_id, criado_em, expira_em) VALUES (?, ?, ?, ?)')
    .run(token, usuarioId, agora.toISOString(), expiraEm);
  return { token, expiraEm };
}

export function apagarSessao(token: string): void {
  db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
}

export function usuarioPorSessao(token: string | undefined): Usuario | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.nome, u.email, u.perfil, u.ativo
    FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token = ? AND s.expira_em > ?
  `).get(token, new Date().toISOString()) as any;
  if (!row || !row.ativo) return null;
  return paraUsuario(row);
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const parte of header.split(';')) {
    const idx = parte.indexOf('=');
    if (idx === -1) continue;
    out[parte.slice(0, idx).trim()] = decodeURIComponent(parte.slice(idx + 1).trim());
  }
  return out;
}

export function listarUsuarios(): Usuario[] {
  const rows = db.prepare('SELECT id, nome, email, perfil, ativo FROM usuarios ORDER BY id ASC').all();
  return (rows as any[]).map(paraUsuario);
}

export function criarUsuario(input: { nome: string; email: string; senha: string; perfil: Perfil }): Usuario {
  const { hash, salt } = criarHashSenha(input.senha);
  const info = db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, senha_salt, perfil, ativo, criado_em)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(input.nome, input.email.trim().toLowerCase(), hash, salt, input.perfil, new Date().toISOString());
  return { id: Number(info.lastInsertRowid), nome: input.nome, email: input.email, perfil: input.perfil, ativo: true };
}

export function alterarStatusUsuario(id: number, ativo: boolean): void {
  db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, id);
}

export function atualizarUsuario(id: number, input: { nome: string; email: string; perfil: Perfil }): void {
  db.prepare('UPDATE usuarios SET nome = ?, email = ?, perfil = ? WHERE id = ?')
    .run(input.nome, input.email.trim().toLowerCase(), input.perfil, id);
}

export function alterarSenhaUsuario(id: number, novaSenha: string): void {
  const { hash, salt } = criarHashSenha(novaSenha);
  db.prepare('UPDATE usuarios SET senha_hash = ?, senha_salt = ? WHERE id = ?').run(hash, salt, id);
}
