import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { botao, C, cartao, inputStyle, tdL, tdStyle, thL, thStyle } from './estilo';
import { DATA, PCT, R, RS } from './formato';
import {
  documentosObrigatorios, ETAPAS, formatarDocumento, pendencias, pendenciasContrato, ROTULO_DOCUMENTO, ROTULO_STATUS, soDigitos, UC_VAZIA,
  type Cadastro, type Cliente, type CondicoesContrato, type EnvioAssinatura, type StatusCliente, type TipoDocumento, type TipoPessoa,
  type UnidadeConsumidora,
} from './lib/clientes';
import { useUsuario } from './Sessao';
import { CompensacaoBloco } from './CompensacaoView';

const COR_STATUS: Record<StatusCliente, [string, string]> = {
  cadastro: [C.amber, C.amberC], contrato: [C.azul, C.azulC], assinado: [C.azul, C.azulC], titularidade: [C.azul, C.azulC],
  compensacao: [C.verde, C.verdeC], retorno: [C.med, C.clar], encerrado: [C.med, C.clar], cancelado: [C.verm, C.vermC],
};

function Etiqueta({ status }: { status: StatusCliente }) {
  const [cor, fundo] = COR_STATUS[status];
  return <span style={{ padding: '2px 8px', borderRadius: 10, background: fundo, color: cor, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{ROTULO_STATUS[status]}</span>;
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const tamanho = (b: number) => (b > 1024 * 1024 ? `${R(b / 1024 / 1024, 1)} MB` : `${R(b / 1024)} KB`);

// ── LISTA ────────────────────────────────────────────────────────────────────
export function ClientesView({ abrir, onAbrir }: { abrir: string | null; onAbrir: (id: string | null) => void }) {
  const [lista, setLista] = useState<Cliente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<StatusCliente | 'ativos' | 'todos'>('ativos');

  const carregar = () => { api<Cliente[]>('/api/clientes').then(setLista).catch((e) => setErro(e.message)); };
  useEffect(carregar, [abrir]);

  const novo = async () => {
    try { const c = await api<Cliente>('/api/clientes', { method: 'POST', json: {} }); onAbrir(c.id); }
    catch (e) { setErro((e as Error).message); }
  };

  if (abrir) return <ClienteDetalhe id={abrir} onVoltar={() => onAbrir(null)} />;

  const termo = busca.trim().toLowerCase();
  const visiveis = (lista ?? [])
    .filter((c) => filtro === 'todos' || (filtro === 'ativos' ? !['encerrado', 'cancelado'].includes(c.status) : c.status === filtro))
    .filter((c) => !termo || [c.id, c.nome, c.documento, c.proposta?.numero ?? '', ...c.ucs.map((u) => u.numero)].some((x) => x.toLowerCase().includes(termo)))
    .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));

  return (
    <main style={{ padding: 24 }}>
      <div style={cartao}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Clientes</div>
            <div style={{ fontSize: 11, color: C.med }}>Proposta fechada → cadastro e documentos → contrato e procuração → assinatura → troca de titularidade → compensação.</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="ativos">Em andamento</option>
              <option value="todos">Todos</option>
              {[...ETAPAS.map((e) => e.status), 'cancelado' as const].map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
            </select>
            <input placeholder="Buscar por nome, CNPJ/CPF, UC ou proposta" style={{ ...inputStyle, width: 280 }} value={busca} onChange={(e) => setBusca(e.target.value)} />
            <button onClick={novo} style={botao(C.verde)} title="Cliente sem proposta (o normal é fechar a proposta na aba Propostas)">+ Cliente avulso</button>
          </div>
        </div>
        {erro && <div style={{ color: C.verm, fontSize: 12 }}>{erro}</div>}
        {!lista && !erro && <div style={{ color: C.med, fontSize: 12 }}>Carregando…</div>}
        {lista && visiveis.length === 0 && (
          <div style={{ color: C.med, fontSize: 12, padding: '24px 0', textAlign: 'center' }}>
            {lista.length === 0 ? 'Nenhum cliente ainda. Na aba Propostas, use "Fechar" na proposta aceita pelo cliente.' : 'Nenhum cliente encontrado.'}
          </div>
        )}
        {visiveis.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thL}>Cliente</th><th style={thL}>CNPJ/CPF</th><th style={thL}>UCs</th><th style={thL}>Proposta</th>
                <th style={thStyle}>Crédito</th><th style={thL}>Etapa</th><th style={thL}>Pendências</th><th style={thStyle}>Atualizado</th>
              </tr></thead>
              <tbody>
                {visiveis.map((c) => {
                  const prox = ETAPAS[ETAPAS.findIndex((e) => e.status === c.status) + 1];
                  const falta = prox && c.status !== 'cancelado' ? pendencias(c, prox.status).length : 0;
                  return (
                    <tr key={c.id} onClick={() => onAbrir(c.id)} style={{ cursor: 'pointer' }}>
                      <td style={tdL}><div style={{ fontWeight: 600 }}>{c.nome || '(sem nome)'}</div><div style={{ fontSize: 10, color: C.med }}>{c.id}</div></td>
                      <td style={tdL}>{c.documento ? formatarDocumento(c.tipo, c.documento) : '—'}</td>
                      <td style={tdL}>{c.ucs.map((u) => u.numero).filter(Boolean).join(', ') || '—'}</td>
                      <td style={tdL}>{c.proposta ? `${c.proposta.numero} · Rev. ${String(c.proposta.revisao).padStart(2, '0')}` : '—'}</td>
                      <td style={tdStyle}>{c.base ? `${R(c.base.resumo.creditoKWh)} kWh` : '—'}</td>
                      <td style={tdL}><Etiqueta status={c.status} /></td>
                      <td style={{ ...tdL, color: falta ? C.amber : C.verde }}>{prox && c.status !== 'cancelado' ? (falta ? `${falta} para ${prox.rotulo}` : `Pronto p/ ${prox.rotulo}`) : '—'}</td>
                      <td style={tdStyle}>{quando(c.atualizadoEm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

// ── DETALHE ──────────────────────────────────────────────────────────────────
type Form = Cadastro & { contrato: CondicoesContrato };
const paraForm = (c: Cliente): Form => {
  const { id: _i, status: _s, criadoEm: _c, atualizadoEm: _a, proposta: _p, base: _b, documentos: _d, assinaturas: _as, historico: _h,
    lancamentos: _l, faturas: _f, asaasClienteId: _ac, ...form } = c;
  return form;
};

function Campo({ label, children, largura = 1 }: { label: string; children: React.ReactNode; largura?: number }) {
  return (
    <label style={{ display: 'block', gridColumn: `span ${largura}` }}>
      <div style={{ fontSize: 11, color: C.med, marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  );
}
const grade = (cols: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 10 });

function Bloco({ titulo, children, acoes }: { titulo: string; children: React.ReactNode; acoes?: React.ReactNode }) {
  return (
    <section style={{ ...cartao, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{titulo}</div>
        {acoes && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

function ClienteDetalhe({ id, onVoltar }: { id: string; onVoltar: () => void }) {
  const { usuario } = useUsuario();
  const [c, setC] = useState<Cliente | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [autentique, setAutentique] = useState<{ configurada: boolean; sandbox: boolean } | null>(null);

  const aplicar = (novo: Cliente) => { setC(novo); setForm(paraForm(novo)); };
  useEffect(() => {
    api<Cliente>(`/api/clientes/${id}`).then(aplicar).catch((e) => setErro(e.message));
    api<{ autentique: { configurada: boolean; sandbox: boolean } }>('/api/config').then((r) => setAutentique(r.autentique)).catch(() => {});
  }, [id]);

  const alterado = useMemo(() => !!c && !!form && JSON.stringify(paraForm(c)) !== JSON.stringify(form), [c, form]);

  /** Executa uma ação com aviso de erro; se `salvarAntes`, grava o formulário primeiro. */
  const acao = async (nome: string, fn: () => Promise<Cliente | void>, salvarAntes = false) => {
    setOcupado(nome); setErro(null); setAviso(null);
    try {
      if (salvarAntes && alterado) aplicar(await api<Cliente>(`/api/clientes/${id}`, { method: 'PUT', json: form }));
      const r = await fn();
      if (r) aplicar(r);
    } catch (e) { setErro((e as Error).message); window.scrollTo(0, 0); }
    finally { setOcupado(null); }
  };

  if (!c || !form) {
    return <main style={{ padding: 24 }}>{erro ? <div style={{ color: C.verm }}>{erro}</div> : <div style={{ color: C.med, fontSize: 12 }}>Carregando…</div>}</main>;
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setEnd = (k: keyof Form['endereco'], v: string) => setForm((f) => (f ? { ...f, endereco: { ...f.endereco, [k]: v } } : f));
  const setRep = (k: keyof Form['representante'], v: string) => setForm((f) => (f ? { ...f, representante: { ...f.representante, [k]: v } } : f));
  const setCont = (k: keyof Form['contatoFinanceiro'], v: string) => setForm((f) => (f ? { ...f, contatoFinanceiro: { ...f.contatoFinanceiro, [k]: v } } : f));
  const setCond = <K extends keyof CondicoesContrato>(k: K, v: CondicoesContrato[K]) => setForm((f) => (f ? { ...f, contrato: { ...f.contrato, [k]: v } } : f));
  const setUC = (i: number, k: keyof UnidadeConsumidora, v: string | number) =>
    setForm((f) => (f ? { ...f, ucs: f.ucs.map((u, j) => (j === i ? { ...u, [k]: v } : u)) } : f));

  const salvar = () => acao('salvar', () => api<Cliente>(`/api/clientes/${id}`, { method: 'PUT', json: form }));

  const buscarCnpj = () => acao('cnpj', async () => {
    const d = await api<{ nome: string; nomeFantasia: string; endereco: Form['endereco']; socios: { nome: string; qualificacao: string }[] }>(`/api/cnpj/${soDigitos(form.documento)}`);
    setForm((f) => f && ({
      ...f, nome: d.nome || f.nome, nomeFantasia: d.nomeFantasia || f.nomeFantasia, endereco: { ...f.endereco, ...d.endereco },
      representante: f.representante.nome || !d.socios[0] ? f.representante : { ...f.representante, nome: d.socios[0].nome, cargo: d.socios[0].qualificacao.toLowerCase() },
    }));
    setAviso(`Dados da Receita preenchidos${d.socios.length ? ` (sócios: ${d.socios.map((s) => s.nome).join(', ')})` : ''}. Confira e salve.`);
  });

  const mudarEtapa = (status: StatusCliente) => {
    const motivo = status === 'cancelado' || ETAPAS.findIndex((e) => e.status === status) < ETAPAS.findIndex((e) => e.status === c.status)
      ? window.prompt(`Motivo para ${status === 'cancelado' ? 'cancelar' : `voltar para "${ROTULO_STATUS[status]}"`}:`) : '';
    if (motivo === null) return;
    acao('status', () => api<Cliente>(`/api/clientes/${id}/status`, { method: 'POST', json: { status, motivo } }), true);
  };

  const enviarArquivo = (tipo: TipoDocumento, arquivo: File) => acao(`up-${tipo}`, () => api<Cliente>(
    `/api/clientes/${id}/documentos?tipo=${tipo}&nome=${encodeURIComponent(arquivo.name)}`,
    { method: 'POST', body: arquivo, headers: { 'Content-Type': arquivo.type || 'application/octet-stream' } },
  ));
  const apagarArquivo = (docId: string, nome: string) => {
    if (!window.confirm(`Remover "${nome}"?`)) return;
    acao('rm', () => api<Cliente>(`/api/clientes/${id}/documentos/${docId}`, { method: 'DELETE' }));
  };

  const iEtapa = ETAPAS.findIndex((e) => e.status === c.status);
  const proxima = c.status !== 'cancelado' ? ETAPAS[iEtapa + 1] : undefined;
  const anterior = c.status !== 'cancelado' && iEtapa > 0 ? ETAPAS[iEtapa - 1] : undefined;
  const faltaProxima = proxima ? pendencias({ ...c, ...form }, proxima.status) : [];
  const faltaContrato = pendenciasContrato({ ...c, ...form });
  const pj = form.tipo === 'PJ';
  const docUrl = (docId: string, baixar = false) => `/api/clientes/${id}/documentos/${docId}${baixar ? '?baixar' : ''}`;

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Barra fixa: voltar, nome, salvar */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 5, background: C.clar, padding: '8px 0 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => { if (!alterado || window.confirm('Sair sem salvar as alterações?')) onVoltar(); }} style={botao()}>← Clientes</button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{form.nome || '(sem nome)'} <Etiqueta status={c.status} /></div>
          <div style={{ fontSize: 11, color: C.med }}>
            {c.id}{c.proposta && ` · ${c.proposta.numero} Rev. ${String(c.proposta.revisao).padStart(2, '0')}`} · criado em {quando(c.criadoEm)}
          </div>
        </div>
        <button onClick={salvar} disabled={!alterado || !!ocupado} style={{ ...botao(C.verde), opacity: alterado ? 1 : 0.5 }}>
          {ocupado === 'salvar' ? 'Salvando…' : alterado ? 'Salvar alterações' : 'Salvo'}
        </button>
      </div>

      {erro && <div style={{ background: C.vermC, color: C.verm, padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{erro}</div>}
      {aviso && <div style={{ background: C.verdeC, color: C.esc, padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{aviso}</div>}

      {/* Etapas */}
      <Bloco titulo="Etapa">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
          {ETAPAS.map((e, i) => {
            const feito = c.status !== 'cancelado' && i < iEtapa, atual = e.status === c.status;
            return (
              <div key={e.status} title={e.descricao} style={{
                flex: '1 1 120px', padding: '8px 10px', borderRadius: 6, fontSize: 12, textAlign: 'center',
                background: atual ? C.esc : feito ? C.verdeC : C.clar, color: atual ? '#fff' : feito ? C.verde : C.med, fontWeight: atual ? 700 : 500,
              }}>{feito ? '✓ ' : ''}{e.rotulo}</div>
            );
          })}
        </div>
        {c.status === 'cancelado' && <div style={{ fontSize: 12, color: C.verm, marginBottom: 8 }}>Cliente cancelado.</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {proxima && (
            <button onClick={() => mudarEtapa(proxima.status)} disabled={faltaProxima.length > 0 || !!ocupado}
              style={{ ...botao(C.azul), opacity: faltaProxima.length ? 0.5 : 1 }}>Avançar para "{proxima.rotulo}"</button>
          )}
          {anterior && <button onClick={() => mudarEtapa(anterior.status)} disabled={!!ocupado} style={botao()}>Voltar para "{anterior.rotulo}"</button>}
          {c.status === 'cancelado'
            ? <button onClick={() => mudarEtapa('cadastro')} style={botao()}>Reabrir (volta ao cadastro)</button>
            : !['encerrado'].includes(c.status) && <button onClick={() => mudarEtapa('cancelado')} style={{ ...botao(), color: C.verm }}>Cancelar cliente</button>}
          {usuario.admin && ['cadastro', 'cancelado'].includes(c.status) && (
            <button style={{ ...botao(), color: C.verm, marginLeft: 'auto' }} onClick={() => {
              if (window.confirm(`Apagar ${c.id} (${c.nome}) e todos os documentos anexados? Não dá para desfazer.`)) {
                acao('apagar', async () => { await api(`/api/clientes/${id}`, { method: 'DELETE' }); onVoltar(); });
              }
            }}>Apagar cliente</button>
          )}
        </div>
        {proxima && faltaProxima.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: C.med }}>
            <b style={{ color: C.amber }}>Falta para "{proxima.rotulo}":</b>
            <ul style={{ margin: '4px 0 0 18px' }}>{faltaProxima.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
      </Bloco>

      {/* Cadastro */}
      <Bloco titulo="Dados do cliente">
        <div style={{ display: 'flex', gap: 4, background: C.clar, padding: 4, borderRadius: 8, width: 'fit-content', marginBottom: 12 }}>
          {(['PJ', 'PF'] as TipoPessoa[]).map((t) => (
            <button key={t} onClick={() => set('tipo', t)} style={{
              padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: 12, cursor: 'pointer',
              background: form.tipo === t ? C.esc : 'transparent', color: form.tipo === t ? '#fff' : C.med,
            }}>{t === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'}</button>
          ))}
        </div>
        <div style={grade(4)}>
          <Campo label={pj ? 'CNPJ' : 'CPF'}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={inputStyle} value={formatarDocumento(form.tipo, form.documento) || form.documento} onChange={(e) => set('documento', soDigitos(e.target.value))} />
              {pj && <button onClick={buscarCnpj} disabled={soDigitos(form.documento).length !== 14 || !!ocupado} style={{ ...botao(), padding: '6px 10px', whiteSpace: 'nowrap' }} title="Preenche razão social, endereço e sócios pela Receita">
                {ocupado === 'cnpj' ? '…' : 'Buscar'}</button>}
            </div>
          </Campo>
          <Campo label={pj ? 'Razão social' : 'Nome completo'} largura={2}><input style={inputStyle} value={form.nome} onChange={(e) => set('nome', e.target.value)} /></Campo>
          {pj
            ? <Campo label="Nome fantasia"><input style={inputStyle} value={form.nomeFantasia} onChange={(e) => set('nomeFantasia', e.target.value)} /></Campo>
            : <Campo label="Sexo (concordância no contrato)">
                <select style={inputStyle} value={form.sexo} onChange={(e) => set('sexo', e.target.value as 'M' | 'F')}><option value="M">Masculino</option><option value="F">Feminino</option></select>
              </Campo>}
          {!pj && <>
            <Campo label="Nacionalidade"><input style={inputStyle} value={form.nacionalidade} onChange={(e) => set('nacionalidade', e.target.value)} /></Campo>
            <Campo label="Naturalidade (cidade/UF)"><input style={inputStyle} placeholder="Curitiba/PR" value={form.naturalidade} onChange={(e) => set('naturalidade', e.target.value)} /></Campo>
            <Campo label="Data de nascimento"><input type="date" style={inputStyle} value={form.nascimento} onChange={(e) => set('nascimento', e.target.value)} /></Campo>
            <Campo label="RG / órgão emissor">
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={inputStyle} placeholder="7.584.104-3" value={form.rg} onChange={(e) => set('rg', e.target.value)} />
                <input style={{ ...inputStyle, width: 110 }} placeholder="SESP/PR" value={form.rgOrgao} onChange={(e) => set('rgOrgao', e.target.value)} />
              </div>
            </Campo>
          </>}
          {pj && <Campo label="Inscrição estadual"><input style={inputStyle} value={form.inscricaoEstadual} onChange={(e) => set('inscricaoEstadual', e.target.value)} /></Campo>}
          <Campo label="E-mail"><input type="email" style={inputStyle} value={form.email} onChange={(e) => set('email', e.target.value)} /></Campo>
          <Campo label="Telefone / celular"><input style={inputStyle} value={form.telefone} onChange={(e) => set('telefone', e.target.value)} /></Campo>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, margin: '16px 0 8px' }}>{pj ? 'Endereço da sede' : 'Endereço residencial'}</div>
        <div style={grade(6)}>
          <Campo label="CEP"><input style={inputStyle} value={form.endereco.cep} onChange={(e) => setEnd('cep', e.target.value)} /></Campo>
          <Campo label="Logradouro" largura={3}><input style={inputStyle} placeholder="Rua Bororos" value={form.endereco.logradouro} onChange={(e) => setEnd('logradouro', e.target.value)} /></Campo>
          <Campo label="Número"><input style={inputStyle} value={form.endereco.numero} onChange={(e) => setEnd('numero', e.target.value)} /></Campo>
          <Campo label="Complemento"><input style={inputStyle} value={form.endereco.complemento} onChange={(e) => setEnd('complemento', e.target.value)} /></Campo>
          <Campo label="Bairro" largura={2}><input style={inputStyle} value={form.endereco.bairro} onChange={(e) => setEnd('bairro', e.target.value)} /></Campo>
          <Campo label="Cidade" largura={3}><input style={inputStyle} value={form.endereco.cidade} onChange={(e) => setEnd('cidade', e.target.value)} /></Campo>
          <Campo label="UF"><input style={inputStyle} maxLength={2} value={form.endereco.uf} onChange={(e) => setEnd('uf', e.target.value.toUpperCase())} /></Campo>
        </div>

        {pj && <>
          <div style={{ fontSize: 12, fontWeight: 700, margin: '16px 0 8px' }}>Representante legal (assina o contrato e a procuração)</div>
          <div style={grade(4)}>
            <Campo label="Nome completo" largura={2}><input style={inputStyle} value={form.representante.nome} onChange={(e) => setRep('nome', e.target.value)} /></Campo>
            <Campo label="CPF"><input style={inputStyle} value={form.representante.cpf} onChange={(e) => setRep('cpf', e.target.value)} /></Campo>
            <Campo label="Cargo"><input style={inputStyle} placeholder="sócio administrador" value={form.representante.cargo} onChange={(e) => setRep('cargo', e.target.value)} /></Campo>
            <Campo label="E-mail (recebe para assinar)"><input type="email" style={inputStyle} value={form.representante.email} onChange={(e) => setRep('email', e.target.value)} /></Campo>
            <Campo label="Celular (WhatsApp)"><input style={inputStyle} value={form.representante.telefone} onChange={(e) => setRep('telefone', e.target.value)} /></Campo>
            <Campo label="Sexo (concordância)">
              <select style={inputStyle} value={form.representante.sexo} onChange={(e) => setRep('sexo', e.target.value)}><option value="M">Masculino</option><option value="F">Feminino</option></select>
            </Campo>
          </div>
        </>}

        <div style={{ fontSize: 12, fontWeight: 700, margin: '16px 0 8px' }}>Contato financeiro (cobrança)</div>
        <div style={grade(3)}>
          <Campo label="Nome"><input style={inputStyle} value={form.contatoFinanceiro.nome} onChange={(e) => setCont('nome', e.target.value)} /></Campo>
          <Campo label="E-mail"><input type="email" style={inputStyle} value={form.contatoFinanceiro.email} onChange={(e) => setCont('email', e.target.value)} /></Campo>
          <Campo label="Telefone"><input style={inputStyle} value={form.contatoFinanceiro.telefone} onChange={(e) => setCont('telefone', e.target.value)} /></Campo>
        </div>
        <div style={{ marginTop: 12 }}>
          <Campo label="Observações"><textarea rows={2} style={{ ...inputStyle, resize: 'vertical' }} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Campo>
        </div>
      </Bloco>

      {/* UCs */}
      <Bloco titulo="Unidades consumidoras" acoes={
        <button style={botao()} onClick={() => set('ucs', [...form.ucs, { ...UC_VAZIA, distribuidora: form.ucs[0]?.distribuidora ?? '', subgrupo: form.ucs[0]?.subgrupo ?? '', modalidade: form.ucs[0]?.modalidade ?? '' }])}>+ UC</button>
      }>
        {form.ucs.length === 0 && <div style={{ fontSize: 12, color: C.med }}>Nenhuma UC.</div>}
        {form.ucs.map((u, i) => (
          <div key={i} style={{ border: `1px solid ${C.bord}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={grade(6)}>
              <Campo label="Nº da UC"><input style={inputStyle} value={u.numero} onChange={(e) => setUC(i, 'numero', e.target.value)} /></Campo>
              <Campo label="Endereço da UC (como na fatura)" largura={3}><input style={inputStyle} value={u.endereco} onChange={(e) => setUC(i, 'endereco', e.target.value)} /></Campo>
              <Campo label="Crédito alocado (kWh/mês)"><input type="number" style={inputStyle} value={u.energiaKWhMes} onChange={(e) => setUC(i, 'energiaKWhMes', Number(e.target.value))} /></Campo>
              <Campo label="Distribuidora"><input style={inputStyle} value={u.distribuidora} onChange={(e) => setUC(i, 'distribuidora', e.target.value)} /></Campo>
              <Campo label="Grupo / classe" largura={2}><input style={inputStyle} placeholder="Grupo B – classe B3 Comercial" value={u.classificacao} onChange={(e) => setUC(i, 'classificacao', e.target.value)} /></Campo>
              <Campo label="Ligação"><input style={inputStyle} placeholder="trifásico 200A" value={u.ligacao} onChange={(e) => setUC(i, 'ligacao', e.target.value)} /></Campo>
              <Campo label="Consumo médio (kWh/mês)"><input type="number" style={inputStyle} value={u.consumoMedioKWh} onChange={(e) => setUC(i, 'consumoMedioKWh', Number(e.target.value))} /></Campo>
              <Campo label="Período do consumo médio"><input style={inputStyle} placeholder="jun/2026 a out/2026" value={u.periodoConsumo} onChange={(e) => setUC(i, 'periodoConsumo', e.target.value)} /></Campo>
              <Campo label="Titular atual (se não for o cliente)" largura={2}><input style={inputStyle} value={u.titular} onChange={(e) => setUC(i, 'titular', e.target.value)} /></Campo>
              <Campo label="CPF/CNPJ do titular" largura={2}><input style={inputStyle} placeholder="ex.: CPF 033.682.759-84" value={u.titularDocumento} onChange={(e) => setUC(i, 'titularDocumento', e.target.value)} /></Campo>
              <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                <button style={{ ...botao(), color: C.verm }} onClick={() => set('ucs', form.ucs.filter((_, j) => j !== i))}>Remover UC</button>
              </div>
            </div>
          </div>
        ))}
        {c.base && (
          <div style={{ fontSize: 11, color: C.med }}>
            Proposta: {R(c.base.resumo.creditoKWh)} kWh em {c.base.resumo.meses} meses = {R(c.base.op.abatimentoMensalKWh)} kWh/mês ·
            soma alocada nas UCs: {R(form.ucs.reduce((s, u) => s + (u.energiaKWhMes || 0), 0))} kWh/mês
          </div>
        )}
      </Bloco>

      {/* Condições */}
      <Bloco titulo="Condições do contrato">
        <div style={grade(4)}>
          <Campo label="Preço por kWh compensado (R$)"><input type="number" step="0.0001" style={inputStyle} value={form.contrato.precoKWh} onChange={(e) => setCond('precoKWh', Number(e.target.value))} /></Campo>
          <Campo label="Prazo máximo para usar o saldo (meses)"><input type="number" style={inputStyle} value={form.contrato.prazoSaldoMeses} onChange={(e) => setCond('prazoSaldoMeses', Number(e.target.value))} /></Campo>
          <Campo label="Distribuidora no texto"><input style={inputStyle} placeholder="Copel" value={form.contrato.distribuidoraNome} onChange={(e) => setCond('distribuidoraNome', e.target.value)} /></Campo>
          <Campo label="Razão social da distribuidora"><input style={inputStyle} placeholder="Copel Distribuição S.A." value={form.contrato.distribuidoraRazao} onChange={(e) => setCond('distribuidoraRazao', e.target.value)} /></Campo>
          <Campo label="Início da injeção do crédito (conta o prazo do saldo)">
            <input type="month" style={inputStyle} value={form.contrato.inicioInjecao ?? ''} placeholder={c.base?.operacao.mesInicio}
              onChange={(e) => setCond('inicioInjecao', e.target.value)} />
          </Campo>
        </div>
        {c.base && (
          <div style={{ fontSize: 11, color: C.med, marginTop: 8 }}>
            Da proposta: economia {PCT(c.base.resumo.economiaPct)} · valor especial {`R$ ${R(c.base.resumo.tarifaKora, 4)}/kWh`} ·
            crédito {R(c.base.resumo.creditoKWh)} kWh · prazo {c.base.operacao.prazoMeses} meses · início {c.base.operacao.mesInicio.split('-').reverse().join('/')} ·
            valor do contrato {RS(c.base.resumo.valorContrato)}
          </div>
        )}
      </Bloco>

      <DocumentosBloco c={c} ocupado={ocupado} onEnviar={enviarArquivo} onApagar={apagarArquivo} docUrl={docUrl} />

      <ContratosBloco c={c} falta={faltaContrato} alterado={alterado} ocupado={ocupado} autentique={autentique} docUrl={docUrl}
        gerar={(m) => acao(`gerar-${m}`, () => api<Cliente>(`/api/clientes/${id}/gerar/${m}`, { method: 'POST' }), true)}
        enviar={(m, whatsapp) => acao(`enviar-${m}`, () => api<Cliente>(`/api/clientes/${id}/assinaturas`, { method: 'POST', json: { documento: m, whatsapp } }), true)}
        atualizar={() => acao('sync', () => api<Cliente>(`/api/clientes/${id}/assinaturas/atualizar`, { method: 'POST' }))}
        cancelar={(e) => {
          if (window.confirm('Cancelar este envio no app? (Na Autentique o documento continua lá; cancele também por lá se precisar.)')) {
            acao('cancelar', () => api<Cliente>(`/api/clientes/${id}/assinaturas/${e.autentiqueId}/cancelar`, { method: 'POST' }));
          }
        }} />

      {(['titularidade', 'compensacao', 'retorno', 'encerrado'].includes(c.status) || (c.lancamentos ?? []).length > 0) ? (
        <CompensacaoBloco c={c} ocupado={ocupado} docUrl={docUrl} executar={(nome, fn) => acao(nome, fn)} />
      ) : (
        <Bloco titulo="Compensação e faturas">
          <div style={{ fontSize: 12, color: C.med }}>Liberado a partir da etapa "Troca de titularidade": aqui se lança, mês a mês, a fatura da distribuidora e se emite a fatura Kora.</div>
        </Bloco>
      )}

      <Bloco titulo="Histórico">
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {[...c.historico].reverse().map((h, i) => (
            <div key={i} style={{ fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${C.clar}`, display: 'flex', gap: 12 }}>
              <span style={{ color: C.med, whiteSpace: 'nowrap' }}>{quando(h.em)}</span>
              <span style={{ color: C.med, whiteSpace: 'nowrap', minWidth: 90 }}>{h.por}</span>
              <span>{h.texto}</span>
            </div>
          ))}
        </div>
      </Bloco>
    </main>
  );
}

// ── DOCUMENTOS ───────────────────────────────────────────────────────────────
function BotaoArquivo({ rotulo, onArquivo, desabilitado }: { rotulo: string; onArquivo: (f: File) => void; desabilitado?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onArquivo(f); e.target.value = ''; }} />
      <button disabled={desabilitado} onClick={() => ref.current?.click()} style={{ ...botao(), padding: '4px 10px', fontSize: 11 }}>{rotulo}</button>
    </>
  );
}

function DocumentosBloco({ c, ocupado, onEnviar, onApagar, docUrl }: {
  c: Cliente; ocupado: string | null; onEnviar: (t: TipoDocumento, f: File) => void; onApagar: (id: string, nome: string) => void;
  docUrl: (id: string, baixar?: boolean) => string;
}) {
  const [tipoOutro, setTipoOutro] = useState<TipoDocumento>('procuracao');
  const obrig = documentosObrigatorios(c.tipo);
  const link: React.CSSProperties = { ...botao(), padding: '4px 10px', fontSize: 11, textDecoration: 'none', color: C.esc, display: 'inline-block' };
  return (
    <Bloco titulo="Documentos" acoes={
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select value={tipoOutro} onChange={(e) => setTipoOutro(e.target.value as TipoDocumento)} style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 11 }}>
          {(Object.keys(ROTULO_DOCUMENTO) as TipoDocumento[]).filter((t) => !obrig.includes(t)).map((t) => <option key={t} value={t}>{ROTULO_DOCUMENTO[t]}</option>)}
        </select>
        <BotaoArquivo rotulo="Anexar" desabilitado={!!ocupado} onArquivo={(f) => onEnviar(tipoOutro, f)} />
      </div>
    }>
      <div style={{ fontSize: 11, color: C.med, marginBottom: 8 }}>Obrigatórios para sair do cadastro ({c.tipo === 'PJ' ? 'pessoa jurídica' : 'pessoa física'}):</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8, marginBottom: 14 }}>
        {obrig.map((t) => {
          const tem = c.documentos.some((d) => d.tipo === t);
          return (
            <div key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 6, background: tem ? C.verdeC : C.amberC }}>
              <span style={{ fontSize: 12 }}>{tem ? '✓' : '○'} {ROTULO_DOCUMENTO[t]}</span>
              <BotaoArquivo rotulo={ocupado === `up-${t}` ? 'Enviando…' : tem ? 'Outro' : 'Enviar'} desabilitado={!!ocupado} onArquivo={(f) => onEnviar(t, f)} />
            </div>
          );
        })}
      </div>
      {c.documentos.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={thL}>Tipo</th><th style={thL}>Arquivo</th><th style={thStyle}>Tamanho</th><th style={thL}>Enviado</th><th style={thStyle}></th></tr></thead>
            <tbody>
              {[...c.documentos].reverse().map((d) => (
                <tr key={d.id}>
                  <td style={tdL}>{ROTULO_DOCUMENTO[d.tipo]}</td>
                  <td style={{ ...tdL, wordBreak: 'break-all' }}>{d.nomeArquivo}</td>
                  <td style={tdStyle}>{tamanho(d.tamanho)}</td>
                  <td style={tdL}>{quando(d.enviadoEm)} · {d.enviadoPor}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <a href={docUrl(d.id)} target="_blank" rel="noreferrer" style={link}>Abrir</a>{' '}
                    <a href={docUrl(d.id, true)} style={link}>Baixar</a>{' '}
                    <button onClick={() => onApagar(d.id, d.nomeArquivo)} style={{ ...botao(), padding: '4px 10px', fontSize: 11, color: C.verm }}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bloco>
  );
}

// ── CONTRATO E ASSINATURA ────────────────────────────────────────────────────
const PAPEL: Record<string, string> = { cliente: 'Cliente', kora: 'Kora', testemunha: 'Testemunha' };

function ContratosBloco({ c, falta, alterado, ocupado, autentique, docUrl, gerar, enviar, atualizar, cancelar }: {
  c: Cliente; falta: string[]; alterado: boolean; ocupado: string | null; autentique: { configurada: boolean; sandbox: boolean } | null;
  docUrl: (id: string, baixar?: boolean) => string;
  gerar: (m: 'contrato' | 'procuracao') => void; enviar: (m: 'contrato' | 'procuracao', whatsapp: boolean) => void;
  atualizar: () => void; cancelar: (e: EnvioAssinatura) => void;
}) {
  const [whatsapp, setWhatsapp] = useState(false);
  const docs = { contrato: 'contrato_gerado', procuracao: 'procuracao_gerada' } as const;
  const assinados = { contrato: 'contrato_assinado', procuracao: 'procuracao' } as const;
  const link: React.CSSProperties = { ...botao(), padding: '4px 10px', fontSize: 11, textDecoration: 'none', color: C.esc, display: 'inline-block' };
  const pendentes = c.assinaturas.some((e) => !e.concluidoEm && !e.cancelado);

  return (
    <Bloco titulo="Contrato e procuração" acoes={pendentes && autentique?.configurada
      ? <button onClick={atualizar} disabled={!!ocupado} style={botao()}>{ocupado === 'sync' ? 'Consultando…' : 'Atualizar status das assinaturas'}</button> : undefined}>
      {falta.length > 0 && (
        <div style={{ fontSize: 12, color: C.med, marginBottom: 12 }}>
          <b style={{ color: C.amber }}>Para gerar, falta:</b>
          <ul style={{ margin: '4px 0 0 18px' }}>{falta.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      {autentique && !autentique.configurada && (
        <div style={{ fontSize: 12, background: C.amberC, padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>
          Assinatura eletrônica ainda não ligada (falta o token da Autentique da Kora). Dá para gerar e baixar os documentos; o envio para assinatura fica disponível quando o token for configurado.
        </div>
      )}
      {autentique?.sandbox && (
        <div style={{ fontSize: 12, background: C.azulC, padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>
          Autentique em <b>modo teste (sandbox)</b>: os envios não têm validade jurídica e não gastam crédito.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {(['contrato', 'procuracao'] as const).map((m) => {
          const gerado = [...c.documentos].reverse().find((d) => d.tipo === docs[m]);
          const assinado = [...c.documentos].reverse().find((d) => d.tipo === assinados[m]);
          const envios = c.assinaturas.filter((e) => e.documento === m);
          const aberto = envios.find((e) => !e.concluidoEm && !e.cancelado);
          return (
            <div key={m} style={{ border: `1px solid ${C.bord}`, borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{m === 'contrato' ? 'Contrato de Assessoria Energética' : 'Procuração (distribuidora)'}</div>
              <div style={{ fontSize: 11, color: C.med, marginBottom: 10 }}>
                {m === 'contrato' ? 'Assinam: cliente, Kora e 2 testemunhas.' : 'Assina: o cliente (outorgante).'}
                {assinado && <span style={{ color: C.verde, fontWeight: 600 }}> ✓ Assinado</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => gerar(m)} disabled={falta.length > 0 || !!ocupado || !!aberto} title={aberto ? 'Já enviado para assinatura' : alterado ? 'Salva as alterações e gera' : ''}
                  style={{ ...botao(C.azul), opacity: falta.length || aberto ? 0.5 : 1 }}>
                  {ocupado === `gerar-${m}` ? 'Gerando…' : gerado ? 'Gerar de novo' : 'Gerar'}
                </button>
                {gerado && <a href={docUrl(gerado.id, true)} style={link} title={`Gerado em ${quando(gerado.enviadoEm)}`}>Baixar .docx</a>}
                {assinado && <a href={docUrl(assinado.id)} target="_blank" rel="noreferrer" style={link}>PDF assinado</a>}
                {gerado && !aberto && !assinado && (
                  <button onClick={() => enviar(m, whatsapp)} disabled={!autentique?.configurada || !!ocupado} style={{ ...botao(C.verde), opacity: autentique?.configurada ? 1 : 0.5 }}>
                    {ocupado === `enviar-${m}` ? 'Enviando…' : 'Enviar para assinatura'}
                  </button>
                )}
              </div>
              {gerado && <div style={{ fontSize: 10, color: C.med, marginTop: 6 }}>Gerado em {quando(gerado.enviadoEm)} por {gerado.enviadoPor}. Confira o .docx antes de enviar.</div>}
              {envios.slice().reverse().map((e) => (
                <div key={e.autentiqueId} style={{ marginTop: 10, padding: 8, background: C.clar, borderRadius: 6, opacity: e.cancelado ? 0.6 : 1 }}>
                  <div style={{ fontSize: 11, color: C.med, marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span>Enviado {quando(e.enviadoEm)} por {e.enviadoPor}{e.sandbox ? ' · TESTE' : ''}{e.cancelado ? ' · cancelado' : e.concluidoEm ? ` · concluído ${quando(e.concluidoEm)}` : ' · aguardando'}</span>
                    {!e.concluidoEm && !e.cancelado && <button onClick={() => cancelar(e)} style={{ border: 'none', background: 'none', color: C.verm, fontSize: 11, cursor: 'pointer' }}>cancelar envio</button>}
                  </div>
                  {e.signatarios.map((s, i) => (
                    <div key={i} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{PAPEL[s.papel]}: {s.nome} <span style={{ color: C.med }}>({s.email || s.telefone})</span></span>
                      <span style={{ color: s.assinadoEm ? C.verde : s.recusadoEm ? C.verm : C.amber, whiteSpace: 'nowrap' }}>
                        {s.assinadoEm ? `✓ ${DATA(s.assinadoEm)}` : s.recusadoEm ? 'recusou' : 'pendente'}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 12 }}>
        <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
        Mandar o link de assinatura do cliente por WhatsApp (usa o celular {c.tipo === 'PJ' ? 'do representante' : 'do cliente'}); Kora e testemunhas recebem por e-mail.
      </label>
    </Bloco>
  );
}
