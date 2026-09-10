export type Perfil = 'adm' | 'operador';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
}

export async function login(email: string, senha: string): Promise<Usuario> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro ?? 'Falha ao entrar.');
  return data;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function obterUsuarioAtual(): Promise<Usuario | null> {
  const res = await fetch('/api/auth/me');
  if (!res.ok) return null;
  return res.json();
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const res = await fetch('/api/usuarios');
  if (!res.ok) throw new Error('Não foi possível carregar os usuários.');
  return res.json();
}

export async function criarUsuario(input: { nome: string; email: string; senha: string; perfil: Perfil }): Promise<Usuario> {
  const res = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro ?? 'Falha ao criar usuário.');
  return data;
}

export async function alterarStatusUsuario(id: number, ativo: boolean): Promise<void> {
  const res = await fetch(`/api/usuarios/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ativo }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.erro ?? 'Falha ao alterar usuário.');
  }
}

export async function atualizarUsuario(id: number, input: { nome: string; email: string; perfil: Perfil; senha?: string }): Promise<void> {
  const res = await fetch(`/api/usuarios/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.erro ?? 'Falha ao editar usuário.');
  }
}
