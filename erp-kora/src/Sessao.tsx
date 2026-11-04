import React, { createContext, useContext, useEffect, useState } from 'react';
import App from './App';
import { api, SESSAO_EXPIRADA } from './api';
import { botao, C, inputStyle } from './estilo';

export interface Usuario { id: string; email: string; nome: string; admin: boolean; ativo: boolean }

const UsuarioCtx = createContext<{ usuario: Usuario; sair: () => void } | null>(null);
export const useUsuario = () => useContext(UsuarioCtx)!;

// As chamadas antigas usam fetch direto: qualquer 401 da API também derruba para o login.
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const res = await fetchOriginal(input, init);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  if (res.status === 401 && /\/api\//.test(url) && !/\/api\/(login|sessao)/.test(url)) window.dispatchEvent(new Event(SESSAO_EXPIRADA));
  return res;
};

export function Sessao() {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);

  useEffect(() => {
    api<{ usuario: Usuario }>('/api/sessao').then((r) => setUsuario(r.usuario)).catch(() => setUsuario(null));
    const cair = () => setUsuario(null);
    window.addEventListener(SESSAO_EXPIRADA, cair);
    return () => window.removeEventListener(SESSAO_EXPIRADA, cair);
  }, []);

  const sair = () => { fetch('/api/logout', { method: 'POST' }).finally(() => setUsuario(null)); };

  if (usuario === undefined) return <div style={{ padding: 40, color: C.med, fontSize: 13 }}>Carregando…</div>;
  if (!usuario) return <Login onEntrar={setUsuario} />;
  return <UsuarioCtx.Provider value={{ usuario, sair }}><App /></UsuarioCtx.Provider>;
}

function Login({ onEntrar }: { onEntrar: (u: Usuario) => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true); setErro(null);
    try { onEntrar(await api<Usuario>('/api/login', { method: 'POST', json: { email, senha } })); }
    catch (x) { setErro((x as Error).message); }
    finally { setEnviando(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form onSubmit={entrar} style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 360, boxShadow: '0 4px 20px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>ERP Kora</div>
        <div style={{ fontSize: 12, color: C.med, marginBottom: 20 }}>Entre com seu e-mail e senha.</div>
        <label style={{ fontSize: 12, color: C.med }}>E-mail</label>
        <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inputStyle, margin: '4px 0 12px' }} />
        <label style={{ fontSize: 12, color: C.med }}>Senha</label>
        <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} style={{ ...inputStyle, margin: '4px 0 16px' }} />
        {erro && <div style={{ color: C.verm, fontSize: 12, marginBottom: 12 }}>{erro}</div>}
        <button type="submit" disabled={enviando} style={{ ...botao(C.esc), width: '100%', padding: '10px 14px', opacity: enviando ? 0.6 : 1 }}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
