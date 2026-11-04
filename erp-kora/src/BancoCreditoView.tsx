import React, { useEffect, useState } from 'react';
import { api } from './api';
import { C, botao, cartao, inputStyle, tdL, tdStyle, thL, thStyle } from './estilo';
import { DATA, numeroBR, R, RKWH, RS } from './formato';
import { ROTULO_STATUS_CREDITO, resumoBanco, resumoPorDistribuidora, totalDe, type CreditoGerador, type DadosCredito, type StatusCredito } from './lib/bancoCredito';
import { DISTRIBUIDORAS } from './lib/engine';
import { useUsuario } from './Sessao';

type Form = { gerador: string; distribuidora: string; intermediador: string; volumeKWh: string; valorPropostoKWh: string; valorPedidoKWh: string; observacao: string };
const FORM_VAZIO: Form = { gerador: '', distribuidora: '', intermediador: '', volumeKWh: '', valorPropostoKWh: '', valorPedidoKWh: '', observacao: '' };

const texto = (n: number | null, d: number) => (n === null ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: d, useGrouping: false }));
const doCredito = (c: CreditoGerador): Form => ({
  gerador: c.gerador, distribuidora: c.distribuidora ?? '', intermediador: c.intermediador, volumeKWh: texto(c.volumeKWh, 0),
  valorPropostoKWh: texto(c.valorPropostoKWh, 4), valorPedidoKWh: texto(c.valorPedidoKWh, 4), observacao: c.observacao,
});
const paraDados = (f: Form): Partial<DadosCredito> => ({
  gerador: f.gerador, distribuidora: f.distribuidora, intermediador: f.intermediador, volumeKWh: numeroBR(f.volumeKWh) ?? 0,
  valorPropostoKWh: numeroBR(f.valorPropostoKWh), valorPedidoKWh: numeroBR(f.valorPedidoKWh), observacao: f.observacao,
});

const COR_STATUS: Record<StatusCredito, [string, string]> = {
  negociacao: [C.amber, C.amberC], fechado: [C.verde, C.verdeC], desistencia: [C.med, C.clar],
};
export const EtiquetaCredito = ({ s }: { s: StatusCredito }) => (
  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: COR_STATUS[s][0], background: COR_STATUS[s][1] }}>{ROTULO_STATUS_CREDITO[s]}</span>
);
const kwh = (n: number) => `${R(n)} kWh`;
const valorKWh = (n: number | null) => (n === null ? '—' : RKWH(n));

function Campo({ label, children, largura = 1 }: { label: string; children: React.ReactNode; largura?: number }) {
  return (
    <label style={{ display: 'block', gridColumn: `span ${largura}` }}>
      <div style={{ fontSize: 11, color: C.med, marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  );
}

export function BancoCreditoView() {
  const { usuario } = useUsuario();
  const [lista, setLista] = useState<CreditoGerador[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<StatusCredito | 'todos'>('todos');
  const [filtroDist, setFiltroDist] = useState('');
  /** null = fechado; 'novo' = cadastro; senão o id em edição. */
  const [aberto, setAberto] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [valorFechado, setValorFechado] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { api<CreditoGerador[]>('/api/creditos').then(setLista).catch((e) => setErro(e.message)); }, []);

  const atual = aberto && aberto !== 'novo' ? lista?.find((c) => c.id === aberto) ?? null : null;
  const abrir = (id: string | null) => {
    const c = id && id !== 'novo' ? lista?.find((x) => x.id === id) : null;
    setAberto(id); setMsg(null);
    setForm(c ? doCredito(c) : FORM_VAZIO);
    setValorFechado(c?.valorFechadoKWh ? texto(c.valorFechadoKWh, 4) : c?.valorPropostoKWh ? texto(c.valorPropostoKWh, 4) : '');
  };
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const trocar = (c: CreditoGerador) => setLista((l) => (l ?? []).some((x) => x.id === c.id) ? (l ?? []).map((x) => (x.id === c.id ? c : x)) : [...(l ?? []), c]);

  async function executar(fn: () => Promise<void>) {
    setOcupado(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setOcupado(false); }
  }
  const salvar = () => executar(async () => {
    const dados = paraDados(form);
    if ([dados.volumeKWh, dados.valorPedidoKWh, dados.valorPropostoKWh].some((n) => Number.isNaN(n))) throw new Error('Confira os números (use vírgula para os centavos).');
    const c = aberto === 'novo'
      ? await api<CreditoGerador>('/api/creditos', { method: 'POST', json: dados })
      : await api<CreditoGerador>(`/api/creditos/${aberto}`, { method: 'PUT', json: dados });
    trocar(c);
    if (aberto === 'novo') abrir(null); else { setForm(doCredito(c)); setMsg('Salvo.'); }
  });
  const acao = (rota: 'fechar' | 'desistir' | 'reabrir', corpo: object = {}) => executar(async () => {
    const c = await api<CreditoGerador>(`/api/creditos/${aberto}/${rota}`, { method: 'POST', json: corpo });
    trocar(c); setForm(doCredito(c));
  });

  const daDist = (lista ?? []).filter((c) => !filtroDist || c.distribuidora === filtroDist);
  const visiveis = daDist.filter((c) => filtro === 'todos' || c.status === filtro).sort((a, b) => b.id.localeCompare(a.id));
  // Status do banco por distribuidora: crédito de uma não serve para cliente de outra.
  const porDist = resumoPorDistribuidora(lista ?? []);
  const geral = resumoBanco(lista ?? []);
  const distsUsadas = [...new Set((lista ?? []).map((c) => c.distribuidora).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const volumeForm = numeroBR(form.volumeKWh);
  const totalForm = (s: string) => {
    const v = numeroBR(s);
    return volumeForm && v ? RS(volumeForm * v) : '';
  };

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div style={cartao}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Banco de crédito</div>
            <div style={{ fontSize: 11, color: C.med }}>Lotes de crédito negociados com os geradores. Valores em R$/kWh; o total é volume × valor.</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select value={filtroDist} onChange={(e) => setFiltroDist(e.target.value)} style={{ ...inputStyle, width: 'auto' }} title="Distribuidora">
              <option value="">Todas as distribuidoras</option>
              {distsUsadas.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="todos">Todas as situações</option>
              {(Object.keys(ROTULO_STATUS_CREDITO) as StatusCredito[]).map((s) => <option key={s} value={s}>{ROTULO_STATUS_CREDITO[s]}</option>)}
            </select>
            <button style={botao(C.azul)} onClick={() => abrir('novo')}>+ Novo crédito</button>
          </div>
        </div>
        {lista && lista.length > 0 && (
          <div style={{ background: C.clar, borderRadius: 8, padding: '10px 12px', marginBottom: 16, overflowX: 'auto' }}>
            <div style={{ fontSize: 11, color: C.med, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Status por distribuidora · clique para filtrar</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thL}>Distribuidora</th><th style={thStyle}>Lotes</th><th style={thStyle}>Em negociação</th><th style={thStyle}>Crédito fechado</th>
                <th style={thStyle}>Valor fechado</th><th style={thStyle}>Preço médio fechado</th>
              </tr></thead>
              <tbody>
                {porDist.map((d) => {
                  const sel = filtroDist === d.distribuidora;
                  return (
                    <tr key={d.distribuidora} onClick={() => setFiltroDist(sel ? '' : d.distribuidora)} style={{ cursor: 'pointer', background: sel ? C.azulC : undefined }}>
                      <td style={{ ...tdL, fontWeight: 600 }}>{d.distribuidora}</td>
                      <td style={tdStyle}>{(lista ?? []).filter((c) => (c.distribuidora || 'Sem distribuidora') === d.distribuidora).length}</td>
                      <td style={{ ...tdStyle, color: d.negociacaoKWh ? C.amber : C.med }}>{kwh(d.negociacaoKWh)}</td>
                      <td style={{ ...tdStyle, color: d.fechadoKWh ? C.verde : C.med, fontWeight: 600 }}>{kwh(d.fechadoKWh)}</td>
                      <td style={tdStyle}>{RS(d.fechadoValor)}</td>
                      <td style={tdStyle}>{valorKWh(d.fechadoMedioKWh)}</td>
                    </tr>
                  );
                })}
                {porDist.length > 1 && (
                  <tr style={{ fontWeight: 700 }}>
                    <td style={tdL}>Total</td>
                    <td style={tdStyle}>{lista.length}</td>
                    <td style={tdStyle}>{kwh(geral.negociacaoKWh)}</td>
                    <td style={tdStyle}>{kwh(geral.fechadoKWh)}</td>
                    <td style={tdStyle}>{RS(geral.fechadoValor)}</td>
                    <td style={tdStyle}>{valorKWh(geral.fechadoMedioKWh)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {erro && <div style={{ color: C.verm, fontSize: 12 }}>{erro}</div>}
        {!lista && !erro && <div style={{ color: C.med, fontSize: 12 }}>Carregando…</div>}
        {lista && visiveis.length === 0 && <div style={{ color: C.med, fontSize: 12, padding: '24px 0', textAlign: 'center' }}>Nenhum crédito cadastrado. Use "+ Novo crédito".</div>}
        {visiveis.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thL}>Nº</th><th style={thL}>Gerador</th><th style={thL}>Distribuidora</th><th style={thL}>Intermediador</th><th style={thStyle}>Volume</th>
                <th style={thStyle}>Pedido</th><th style={thStyle}>Proposto</th><th style={thStyle}>Fechado</th><th style={thStyle}>Total fechado</th><th style={thL}>Situação</th>
              </tr></thead>
              <tbody>
                {visiveis.map((c) => (
                  <tr key={c.id} onClick={() => abrir(c.id)} style={{ cursor: 'pointer', background: aberto === c.id ? C.azulC : undefined }} title="Abrir">
                    <td style={{ ...tdL, fontWeight: 600 }}>{c.id}</td>
                    <td style={tdL}>{c.gerador}</td>
                    <td style={tdL}>{c.distribuidora || <span style={{ color: C.verm }}>falta</span>}</td>
                    <td style={tdL}>{c.intermediador || <span style={{ color: C.med }}>direto</span>}</td>
                    <td style={tdStyle}>{kwh(c.volumeKWh)}</td>
                    <td style={tdStyle}>{valorKWh(c.valorPedidoKWh)}</td>
                    <td style={tdStyle}>{valorKWh(c.valorPropostoKWh)}</td>
                    <td style={{ ...tdStyle, fontWeight: c.valorFechadoKWh ? 600 : 400 }}>{valorKWh(c.valorFechadoKWh)}</td>
                    <td style={tdStyle}>{c.status === 'fechado' ? RS(totalDe(c, c.valorFechadoKWh) ?? 0) : ''}</td>
                    <td style={tdL}><EtiquetaCredito s={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aberto && (
        <div style={cartao}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'center' }}>
              {atual ? <>{atual.id} · {atual.gerador}{atual.distribuidora && <span style={{ fontSize: 12, fontWeight: 400, color: C.med }}>({atual.distribuidora})</span>} <EtiquetaCredito s={atual.status} /></> : 'Novo crédito'}
            </div>
            <button style={botao()} onClick={() => abrir(null)}>Fechar</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Campo label="Gerador (dono do crédito)"><input style={inputStyle} value={form.gerador} onChange={(e) => set('gerador', e.target.value)} /></Campo>
            <Campo label="Distribuidora">
              <input style={inputStyle} list="distribuidoras-credito" placeholder="Digite para buscar" value={form.distribuidora} onChange={(e) => set('distribuidora', e.target.value)} />
              <datalist id="distribuidoras-credito">{DISTRIBUIDORAS.map((d) => <option key={d} value={d} />)}</datalist>
            </Campo>
            <Campo label="Intermediador (vazio = direto)"><input style={inputStyle} value={form.intermediador} onChange={(e) => set('intermediador', e.target.value)} /></Campo>
            <Campo label="Volume de crédito (kWh)"><input style={inputStyle} inputMode="numeric" placeholder="500000" value={form.volumeKWh} onChange={(e) => set('volumeKWh', e.target.value)} /></Campo>
            <Campo label="Valor pedido pelo gerador (R$/kWh)">
              <input style={inputStyle} inputMode="decimal" placeholder="0,38" value={form.valorPedidoKWh} onChange={(e) => set('valorPedidoKWh', e.target.value)} />
              <div style={{ fontSize: 10, color: C.med, marginTop: 2 }}>{totalForm(form.valorPedidoKWh)}</div>
            </Campo>
            <Campo label="Valor proposto pela Kora (R$/kWh)">
              <input style={inputStyle} inputMode="decimal" placeholder="0,30" value={form.valorPropostoKWh} onChange={(e) => set('valorPropostoKWh', e.target.value)} />
              <div style={{ fontSize: 10, color: C.med, marginTop: 2 }}>{totalForm(form.valorPropostoKWh)}</div>
            </Campo>
            <Campo label="Observação" largura={2}><input style={inputStyle} value={form.observacao} onChange={(e) => set('observacao', e.target.value)} /></Campo>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={botao(C.azul)} disabled={ocupado} onClick={salvar}>{aberto === 'novo' ? 'Cadastrar' : 'Salvar alterações'}</button>
            {msg && <span style={{ fontSize: 12, color: msg === 'Salvo.' ? C.verde : C.verm }}>{msg}</span>}
          </div>

          {atual && (
            <>
              <div style={{ borderTop: `1px solid ${C.bord}`, marginTop: 16, paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Fechamento</div>
                {atual.status === 'fechado' && (
                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    Fechado em {DATA(atual.fechadoEm ?? atual.atualizadoEm)} a <b>{valorKWh(atual.valorFechadoKWh)}</b> · total <b>{RS(totalDe(atual, atual.valorFechadoKWh) ?? 0)}</b>
                  </div>
                )}
                {atual.status !== 'desistencia' && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <Campo label="Valor fechado (R$/kWh)">
                      <input style={{ ...inputStyle, width: 160 }} inputMode="decimal" placeholder="0,34" value={valorFechado} onChange={(e) => setValorFechado(e.target.value)} />
                    </Campo>
                    <span style={{ fontSize: 12, color: C.med, paddingBottom: 9 }}>{(() => { const v = numeroBR(valorFechado); return v ? `= ${RS(atual.volumeKWh * v)}` : ''; })()}</span>
                    <button style={botao(C.verde)} disabled={ocupado} onClick={() => {
                      const v = numeroBR(valorFechado);
                      if (!v || Number.isNaN(v)) { setMsg('Informe o valor fechado (R$/kWh).'); return; }
                      acao('fechar', { valorFechadoKWh: v });
                    }}>{atual.status === 'fechado' ? 'Corrigir valor fechado' : 'Fechar negociação'}</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  {atual.status === 'negociacao' && (
                    <button style={botao()} disabled={ocupado} onClick={() => {
                      const motivo = window.prompt('Por que não fechou? (opcional)');
                      if (motivo !== null) acao('desistir', { motivo });
                    }}>Não fechou</button>
                  )}
                  {atual.status !== 'negociacao' && <button style={botao()} disabled={ocupado} onClick={() => acao('reabrir')}>Reabrir negociação</button>}
                  {usuario?.admin && (
                    <button style={{ ...botao(), color: C.verm }} disabled={ocupado} onClick={() => {
                      if (!window.confirm(`Apagar ${atual.id} (${atual.gerador})? Não dá para desfazer.`)) return;
                      executar(async () => {
                        await api(`/api/creditos/${atual.id}`, { method: 'DELETE' });
                        setLista((l) => (l ?? []).filter((x) => x.id !== atual.id)); abrir(null);
                      });
                    }}>Apagar</button>
                  )}
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${C.bord}`, marginTop: 16, paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Histórico</div>
                {[...atual.historico].reverse().map((h, i) => (
                  <div key={i} style={{ fontSize: 12, padding: '3px 0' }}><span style={{ color: C.med }}>{DATA(h.em)} · {h.por}</span> — {h.texto}</div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
