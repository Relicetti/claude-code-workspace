// Login por usuário (e-mail + senha). Senhas com scrypt; sessão em cookie HttpOnly, guardada (só o hash do
// token) em sessoes.json no volume — reiniciar o servidor não derruba ninguém.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  admin: boolean;
  ativo: boolean;
  salt: string;
  hash: string;
  criadoEm: string;
}
export type UsuarioPublico = Omit<Usuario, 'salt' | 'hash'>;

interface Sessao { usuarioId: string; expira: number }

const COOKIE = 'kora_sessao';
const DURACAO_MS = 30 * 24 * 3600 * 1000;

export class Auth {
  private usuariosPath: string;
  private sessoesPath: string;
  private falhas = new Map<string, { n: number; desde: number }>();

  constructor(dir: string) {
    this.usuariosPath = path.join(dir, 'usuarios.json');
    this.sessoesPath = path.join(dir, 'sessoes.json');
    fs.mkdirSync(dir, { recursive: true });
  }

  private ler<T>(p: string, vazio: T): T {
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : vazio;
  }
  private gravar(p: string, v: unknown): void {
    fs.writeFileSync(`${p}.tmp`, JSON.stringify(v));
    fs.renameSync(`${p}.tmp`, p);
  }

  usuarios(): Usuario[] { return this.ler<Usuario[]>(this.usuariosPath, []); }
  private sessoes(): Record<string, Sessao> { return this.ler<Record<string, Sessao>>(this.sessoesPath, {}); }

  static publico(u: Usuario): UsuarioPublico {
    const { salt: _s, hash: _h, ...resto } = u;
    return resto;
  }

  private static hashSenha(senha: string, salt: string): string {
    return crypto.scryptSync(senha, salt, 64).toString('hex');
  }

  static validarSenha(senha: string): void {
    if (typeof senha !== 'string' || senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  }

  criarUsuario(dados: { email: string; nome: string; senha: string; admin?: boolean }): UsuarioPublico {
    const email = String(dados.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
    if (!String(dados.nome ?? '').trim()) throw new Error('Informe o nome.');
    Auth.validarSenha(dados.senha);
    const lista = this.usuarios();
    if (lista.some((u) => u.email === email)) throw new Error('Já existe um usuário com esse e-mail.');
    const salt = crypto.randomBytes(16).toString('hex');
    const u: Usuario = {
      id: crypto.randomUUID(), email, nome: dados.nome.trim(), admin: !!dados.admin, ativo: true,
      salt, hash: Auth.hashSenha(dados.senha, salt), criadoEm: new Date().toISOString(),
    };
    this.gravar(this.usuariosPath, [...lista, u]);
    return Auth.publico(u);
  }

  alterarUsuario(id: string, patch: { nome?: string; admin?: boolean; ativo?: boolean; senha?: string }): UsuarioPublico {
    const lista = this.usuarios();
    const u = lista.find((x) => x.id === id);
    if (!u) throw new Error('Usuário não encontrado.');
    const novo = { ...u };
    if (patch.nome !== undefined) novo.nome = String(patch.nome).trim() || u.nome;
    if (patch.admin !== undefined) novo.admin = !!patch.admin;
    if (patch.ativo !== undefined) novo.ativo = !!patch.ativo;
    if (patch.senha !== undefined) {
      Auth.validarSenha(patch.senha);
      novo.salt = crypto.randomBytes(16).toString('hex');
      novo.hash = Auth.hashSenha(patch.senha, novo.salt);
    }
    const resultado = lista.map((x) => (x.id === id ? novo : x));
    if (!resultado.some((x) => x.admin && x.ativo)) throw new Error('Precisa ficar pelo menos um administrador ativo.');
    this.gravar(this.usuariosPath, resultado);
    // Desativar ou trocar a senha derruba as sessões abertas do usuário.
    if (patch.ativo === false || patch.senha !== undefined) this.encerrarSessoesDe(id);
    return Auth.publico(novo);
  }

  /** Primeiro administrador a partir de KORA_ADMIN_EMAIL / KORA_ADMIN_SENHA, se ainda não há usuários. */
  inicializar(): void {
    if (this.usuarios().length > 0) return;
    const email = process.env.KORA_ADMIN_EMAIL, senha = process.env.KORA_ADMIN_SENHA;
    if (!email || !senha) {
      console.warn('[auth] Nenhum usuário cadastrado. Defina KORA_ADMIN_EMAIL e KORA_ADMIN_SENHA para criar o primeiro administrador.');
      return;
    }
    this.criarUsuario({ email, senha, nome: process.env.KORA_ADMIN_NOME ?? email.split('@')[0], admin: true });
    console.log(`[auth] Administrador inicial criado: ${email}`);
  }

  private chaveFalha(req: IncomingMessage, email: string): string {
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
    return `${ip}|${email}`;
  }

  login(req: IncomingMessage, res: ServerResponse, email: string, senha: string): UsuarioPublico {
    email = String(email ?? '').trim().toLowerCase();
    const chave = this.chaveFalha(req, email);
    const f = this.falhas.get(chave);
    if (f && f.n >= 5 && Date.now() - f.desde < 15 * 60 * 1000) throw new Error('Muitas tentativas. Tente de novo em 15 minutos.');
    const u = this.usuarios().find((x) => x.email === email);
    const ok = !!u && u.ativo && crypto.timingSafeEqual(Buffer.from(Auth.hashSenha(String(senha ?? ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) {
      const atual = f && Date.now() - f.desde < 15 * 60 * 1000 ? f : { n: 0, desde: Date.now() };
      this.falhas.set(chave, { n: atual.n + 1, desde: atual.desde });
      throw new Error('E-mail ou senha incorretos.');
    }
    this.falhas.delete(chave);
    const token = crypto.randomBytes(32).toString('base64url');
    const sessoes = this.limpas();
    sessoes[Auth.hashToken(token)] = { usuarioId: u!.id, expira: Date.now() + DURACAO_MS };
    this.gravar(this.sessoesPath, sessoes);
    res.setHeader('Set-Cookie', Auth.cookie(req, token, DURACAO_MS / 1000));
    return Auth.publico(u!);
  }

  logout(req: IncomingMessage, res: ServerResponse): void {
    const token = Auth.lerCookie(req);
    if (token) {
      const sessoes = this.limpas();
      delete sessoes[Auth.hashToken(token)];
      this.gravar(this.sessoesPath, sessoes);
    }
    res.setHeader('Set-Cookie', Auth.cookie(req, '', 0));
  }

  usuarioDa(req: IncomingMessage): UsuarioPublico | null {
    const token = Auth.lerCookie(req);
    if (!token) return null;
    const s = this.sessoes()[Auth.hashToken(token)];
    if (!s || s.expira < Date.now()) return null;
    const u = this.usuarios().find((x) => x.id === s.usuarioId);
    return u && u.ativo ? Auth.publico(u) : null;
  }

  private encerrarSessoesDe(usuarioId: string): void {
    const sessoes = this.limpas();
    for (const [k, s] of Object.entries(sessoes)) if (s.usuarioId === usuarioId) delete sessoes[k];
    this.gravar(this.sessoesPath, sessoes);
  }

  private limpas(): Record<string, Sessao> {
    const agora = Date.now();
    return Object.fromEntries(Object.entries(this.sessoes()).filter(([, s]) => s.expira > agora));
  }

  private static hashToken(t: string): string { return crypto.createHash('sha256').update(t).digest('hex'); }

  private static lerCookie(req: IncomingMessage): string | null {
    for (const parte of String(req.headers.cookie ?? '').split(';')) {
      const [k, ...v] = parte.trim().split('=');
      if (k === COOKIE) return decodeURIComponent(v.join('='));
    }
    return null;
  }

  private static cookie(req: IncomingMessage, valor: string, maxAge: number): string {
    const https = req.headers['x-forwarded-proto'] === 'https';
    return `${COOKIE}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge)}${https ? '; Secure' : ''}`;
  }
}
