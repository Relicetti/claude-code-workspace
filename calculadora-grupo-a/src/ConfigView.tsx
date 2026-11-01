import React, { useEffect, useState } from 'react';
import { api } from './api';
import { botao, C, cartao, inputStyle, tdL, thL } from './estilo';
import type { ConfigKora, PessoaAssinatura } from './lib/config';
import { useUsuario, type Usuario } from './Sessao';

const grade = (cols: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 10 });
const rotulo: React.CSSProperties = { fontSize: 11, color: C.med, marginBottom: 3, display: 'block' };

function Pessoa({ titulo, p, onChange, editavel }: { titulo: string; p: PessoaAssinatura; onChange: (p: PessoaAssinatura) => void; editavel: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{titulo}</div>
      <div style={grade(3)}>
        <label><span style={rotulo}>Nome</span><input disabled={!editavel} style={inputStyle} value={p.nome} onChange={(e) => onChange({ ...p, nome: e.target.value })} /></label>
        <label><span style={rotulo}>E-mail</span><input disabled={!editavel} type="email" style={inputStyle} value={p.email} onChange={(e) => onChange({ ...p, email: e.target.value })} /></label>
        <label><span style={rotulo}>Telefone</span><input disabled={!editavel} style={inputStyle} value={p.telefone} onChange={(e) => onChange({ ...p, telefone: e.target.value })} /></label>
      </div>
    </div>
  );
}

export function ConfigView() {
  const { usuario } = useUsuario();
  const [cfg, setCfg] = useState<ConfigKora | null>(null);
  const [autentique, setAutentique] = useState<{ configurada: boolean; sandbox: boolean } | null>(null);
  const [modelos, setModelos] = useState<InfoModelos | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    api<ConfigKora & { autentique: { configurada: boolean; sandbox: boolean }; modelos: InfoModelos }>('/api/config')
      .then(({ autentique: a, modelos: m, ...c }) => { setCfg(c); setAutentique(a); setModelos(m); })
      .catch((e) => setMsg({ ok: false, texto: e.message }));
  }, []);

  const salvar = async () => {
    try { setCfg(await api<ConfigKora>('/api/config', { method: 'PUT', json: cfg })); setMsg({ ok: true, texto: 'Configurações salvas.' }); }
    catch (e) { setMsg({ ok: false, texto: (e as Error).message }); }
  };

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {msg && <div style={{ background: msg.ok ? C.verdeC : C.vermC, color: msg.ok ? C.esc : C.verm, padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{msg.texto}</div>}

      <section style={{ ...cartao, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Assinatura eletrônica (Autentique)</div>
        <div style={{ fontSize: 12, color: C.med, marginBottom: 14 }}>
          {autentique === null ? '…' : autentique.configurada
            ? <>Conectada à conta da Kora{autentique.sandbox ? <> — <b>modo teste (sandbox)</b>, sem validade jurídica</> : ''}.</>
            : <>Ainda não conectada: falta configurar o token da conta Autentique da Kora no servidor (<code>AUTENTIQUE_TOKEN</code>).</>}
        </div>
        {cfg && <>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Kora no texto dos documentos</div>
          <div style={{ ...grade(3), marginBottom: 10 }}>
            <label><span style={rotulo}>Contrato: sócio administrador que representa a Kora</span>
              <input disabled={!usuario.admin} style={inputStyle} value={cfg.representanteContrato.nome} onChange={(e) => setCfg({ ...cfg, representanteContrato: { ...cfg.representanteContrato, nome: e.target.value } })} /></label>
            <label><span style={rotulo}>CPF dele(a)</span>
              <input disabled={!usuario.admin} style={inputStyle} value={cfg.representanteContrato.cpf} onChange={(e) => setCfg({ ...cfg, representanteContrato: { ...cfg.representanteContrato, cpf: e.target.value } })} /></label>
          </div>
          <label style={{ display: 'block', marginBottom: 16 }}><span style={rotulo}>Procuração: texto depois de "neste ato representada por seus sócios" (nomes, nacionalidade, RG e CPF)</span>
            <textarea disabled={!usuario.admin} rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={cfg.sociosProcuracao}
              placeholder="NOME DO SÓCIO, brasileiro, inscrito no CPF sob nº …, e NOME DO SÓCIO, brasileiro, portador do RG nº … e inscrito no CPF sob nº …"
              onChange={(e) => setCfg({ ...cfg, sociosProcuracao: e.target.value })} /></label>
          <Pessoa titulo="Assina o contrato pela Kora" p={cfg.signatarioKora} editavel={usuario.admin} onChange={(p) => setCfg({ ...cfg, signatarioKora: p })} />
          <Pessoa titulo="Testemunha 1" p={cfg.testemunhas[0]} editavel={usuario.admin} onChange={(p) => setCfg({ ...cfg, testemunhas: [p, cfg.testemunhas[1]] })} />
          <Pessoa titulo="Testemunha 2" p={cfg.testemunhas[1]} editavel={usuario.admin} onChange={(p) => setCfg({ ...cfg, testemunhas: [cfg.testemunhas[0], p] })} />
          {usuario.admin ? <button onClick={salvar} style={botao(C.verde)}>Salvar</button> : <div style={{ fontSize: 11, color: C.med }}>Só administradores alteram.</div>}
        </>}
      </section>

      {modelos && <Modelos info={modelos} admin={usuario.admin} onInfo={setModelos} onMsg={setMsg} />}
      {usuario.admin && <Usuarios eu={usuario} onMsg={setMsg} />}
      <MinhaSenha onMsg={setMsg} />
    </main>
  );
}

function Usuarios({ eu, onMsg }: { eu: Usuario; onMsg: (m: { ok: boolean; texto: string }) => void }) {
  const [lista, setLista] = useState<Usuario[]>([]);
  const [novo, setNovo] = useState({ nome: '', email: '', senha: '', admin: false });
  const [editando, setEditando] = useState<{ id: string; nome: string; email: string } | null>(null);
  const salvarEdicao = async () => {
    if (!editando) return;
    try {
      await api(`/api/usuarios/${editando.id}`, { method: 'PUT', json: { nome: editando.nome, email: editando.email } });
      onMsg({ ok: true, texto: `Usuário atualizado: ${editando.nome} (${editando.email.trim().toLowerCase()}).` });
      setEditando(null);
      carregar();
    } catch (x) { onMsg({ ok: false, texto: (x as Error).message }); }
  };
  const carregar = () => { api<Usuario[]>('/api/usuarios').then(setLista).catch((e) => onMsg({ ok: false, texto: e.message })); };
  useEffect(carregar, []);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/usuarios', { method: 'POST', json: novo });
      onMsg({ ok: true, texto: `Usuário ${novo.email} criado. Passe a senha inicial para a pessoa e peça para ela trocar em "Minha senha".` });
      setNovo({ nome: '', email: '', senha: '', admin: false });
      carregar();
    } catch (x) { onMsg({ ok: false, texto: (x as Error).message }); }
  };
  const alterar = async (u: Usuario, patch: Partial<Usuario> & { senha?: string }) => {
    try { await api(`/api/usuarios/${u.id}`, { method: 'PUT', json: patch }); carregar(); }
    catch (x) { onMsg({ ok: false, texto: (x as Error).message }); }
  };
  const redefinir = (u: Usuario) => {
    const senha = window.prompt(`Nova senha para ${u.email} (mínimo 8 caracteres):`);
    if (senha) alterar(u, { senha }).then(() => onMsg({ ok: true, texto: `Senha de ${u.email} redefinida.` }));
  };
  const pequeno: React.CSSProperties = { ...botao(), padding: '4px 10px', fontSize: 11 };

  return (
    <section style={{ ...cartao, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Usuários</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead><tr><th style={thL}>Nome</th><th style={thL}>E-mail</th><th style={thL}>Perfil</th><th style={thL}>Situação</th><th style={thL}></th></tr></thead>
        <tbody>
          {lista.map((u) => (
            <tr key={u.id} style={{ opacity: u.ativo ? 1 : 0.5 }}>
              {editando?.id === u.id ? <>
                <td style={tdL}><input style={{ ...inputStyle, padding: '4px 8px' }} value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} /></td>
                <td style={tdL}><input type="email" style={{ ...inputStyle, padding: '4px 8px' }} value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} /></td>
              </> : <>
                <td style={tdL}>{u.nome}{u.id === eu.id ? ' (você)' : ''}</td>
                <td style={tdL}>{u.email}</td>
              </>}
              <td style={tdL}>{u.admin ? 'Administrador' : 'Usuário'}</td>
              <td style={tdL}>{u.ativo ? 'Ativo' : 'Desativado'}</td>
              <td style={{ ...tdL, whiteSpace: 'nowrap' }}>
                {editando?.id === u.id
                  ? <><button style={{ ...pequeno, background: C.verde, color: '#fff', border: 'none' }} onClick={salvarEdicao}>Salvar</button>{' '}
                      <button style={pequeno} onClick={() => setEditando(null)}>Cancelar</button>{' '}</>
                  : <><button style={pequeno} onClick={() => setEditando({ id: u.id, nome: u.nome, email: u.email })}>Editar</button>{' '}</>}
                {u.id !== eu.id && <>
                  <button style={pequeno} onClick={() => alterar(u, { admin: !u.admin })}>{u.admin ? 'Tirar admin' : 'Tornar admin'}</button>{' '}
                  <button style={pequeno} onClick={() => alterar(u, { ativo: !u.ativo })}>{u.ativo ? 'Desativar' : 'Reativar'}</button>{' '}
                </>}
                <button style={pequeno} onClick={() => redefinir(u)}>Redefinir senha</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={criar}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Novo usuário</div>
        <div style={{ ...grade(4), alignItems: 'end' }}>
          <label><span style={rotulo}>Nome</span><input required style={inputStyle} value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></label>
          <label><span style={rotulo}>E-mail</span><input required type="email" style={inputStyle} value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></label>
          <label><span style={rotulo}>Senha inicial (mín. 8)</span><input required minLength={8} style={inputStyle} value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} /></label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={novo.admin} onChange={(e) => setNovo({ ...novo, admin: e.target.checked })} /> Admin</label>
            <button type="submit" style={botao(C.verde)}>Criar</button>
          </div>
        </div>
      </form>
    </section>
  );
}

function MinhaSenha({ onMsg }: { onMsg: (m: { ok: boolean; texto: string }) => void }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const trocar = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api('/api/minha-senha', { method: 'POST', json: { atual, nova } }); setAtual(''); setNova(''); onMsg({ ok: true, texto: 'Senha trocada.' }); }
    catch (x) { onMsg({ ok: false, texto: (x as Error).message }); }
  };
  return (
    <form onSubmit={trocar} style={cartao}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Minha senha</div>
      <div style={{ ...grade(3), alignItems: 'end' }}>
        <label><span style={rotulo}>Senha atual</span><input required type="password" autoComplete="current-password" style={inputStyle} value={atual} onChange={(e) => setAtual(e.target.value)} /></label>
        <label><span style={rotulo}>Nova senha (mín. 8)</span><input required minLength={8} type="password" autoComplete="new-password" style={inputStyle} value={nova} onChange={(e) => setNova(e.target.value)} /></label>
        <div><button type="submit" style={botao(C.esc)}>Trocar senha</button></div>
      </div>
    </form>
  );
}

type InfoModelos = Record<'contrato' | 'procuracao', { enviadoEm: string; tamanho: number } | null>;

function Modelos({ info, admin, onInfo, onMsg }: {
  info: InfoModelos; admin: boolean; onInfo: (i: InfoModelos) => void; onMsg: (m: { ok: boolean; texto: string }) => void;
}) {
  const enviar = async (m: 'contrato' | 'procuracao', f: File) => {
    try {
      const r = await api<{ campos: string[]; modelos: InfoModelos }>(`/api/modelos/${m}`, { method: 'PUT', body: f });
      onInfo(r.modelos);
      onMsg({ ok: true, texto: `Modelo de ${m === 'contrato' ? 'contrato' : 'procuração'} atualizado. Campos encontrados: ${r.campos.map((c) => `{${c}}`).join(' ') || 'nenhum'}.` });
    } catch (e) { onMsg({ ok: false, texto: (e as Error).message }); }
  };
  const pequeno: React.CSSProperties = { ...botao(), padding: '4px 10px', fontSize: 11, textDecoration: 'none', color: C.esc, display: 'inline-block' };
  return (
    <section style={{ ...cartao, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Modelos de documento</div>
      <div style={{ fontSize: 12, color: C.med, marginBottom: 12 }}>
        Arquivos Word da Kora com os campos entre chaves (ex.: <code>{'{nome}'}</code>, <code>{'{preco}'}</code>, <code>{'{#ucs}'}…{'{/ucs}'}</code>).
        Para mudar o texto: baixe, edite no Word mantendo os campos e envie de novo. Ficam só no servidor.
      </div>
      {(['contrato', 'procuracao'] as const).map((m) => (
        <div key={m} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${C.clar}` }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: 13 }}>
            <b>{m === 'contrato' ? 'Contrato de Assessoria Energética' : 'Procuração'}</b>{' '}
            <span style={{ fontSize: 11, color: info[m] ? C.verde : C.verm }}>
              {info[m] ? `enviado em ${new Date(info[m]!.enviadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'não enviado'}
            </span>
          </div>
          {info[m] && <a href={`/api/modelos/${m}`} style={pequeno}>Baixar</a>}
          {admin && (
            <label style={{ ...pequeno, cursor: 'pointer' }}>
              {info[m] ? 'Trocar' : 'Enviar'} .docx
              <input type="file" accept=".docx" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(m, f); e.target.value = ''; }} />
            </label>
          )}
        </div>
      ))}
    </section>
  );
}
