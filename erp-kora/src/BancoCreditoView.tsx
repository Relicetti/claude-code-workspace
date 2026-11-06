import React, { useEffect, useState } from 'react';
import { api } from './api';
import { C, botao, cartao, inputStyle, tdL, tdStyle, thL, thStyle } from './estilo';
import { DATA, numeroBR, R, RKWH, RS } from './formato';
import {
  ROTULO_MODALIDADE, ROTULO_PAGAMENTO, ROTULO_STATUS_CREDITO, SEM_MODALIDADE, filtrarItens, nomeItem, resumoBanco, resumoPorDistribuidora,
  totalDe, totalFechado, volumeTotal, type CreditoGerador, type DadosCredito, type FormaPagamento, type ItemCredito, type ModalidadeCredito, type StatusCredito,
} from './lib/bancoCredito';
import { DISTRIBUIDORAS } from './lib/engine';
import { useUsuario } from './Sessao';

type FormItem = { distribuidora: string; modalidade: ModalidadeCredito | ''; volumeKWh: string; valorPedidoKWh: string; valorPropostoKWh: string };
type Form = { gerador: string; contato: string; intermediador: string; formaPagamento: FormaPagamento | ''; itens: FormItem[]; observacao: string };
const ITEM_VAZIO: FormItem = { distribuidora: '', modalidade: '', volumeKWh: '', valorPedidoKWh: '', valorPropostoKWh: '' };
const FORM_VAZIO: Form = { gerador: '', contato: '', intermediador: '', formaPagamento: '', itens: [ITEM_VAZIO], observacao: '' };

const texto = (n: number | null, d: number) => (n === null ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: d, useGrouping: false }));
const doItem = (i: ItemCredito): FormItem => ({
  distribuidora: i.distribuidora, modalidade: i.modalidade, volumeKWh: texto(i.volumeKWh, 0),
  valorPedidoKWh: texto(i.valorPedidoKWh, 4), valorPropostoKWh: texto(i.valorPropostoKWh, 4),
});
const doCredito = (c: CreditoGerador): Form => ({
  gerador: c.gerador, contato: c.contato ?? '', intermediador: c.intermediador, formaPagamento: c.formaPagamento ?? '',
  itens: c.itens.map(doItem), observacao: c.observacao,
});
const paraDados = (f: Form): Partial<DadosCredito> => ({
  gerador: f.gerador, contato: f.contato, intermediador: f.intermediador, formaPagamento: f.formaPagamento || undefined, observacao: f.observacao,
  itens: f.itens.map((i) => ({
    distribuidora: i.distribuidora, modalidade: i.modalidade, volumeKWh: numeroBR(i.volumeKWh) ?? 0,
    valorPedidoKWh: numeroBR(i.valorPedidoKWh), valorPropostoKWh: numeroBR(i.valorPropostoKWh),
  })),
});
const fechadosDe = (c: CreditoGerador) => c.itens.map((i) => texto(i.valorFechadoKWh ?? i.valorPropostoKWh, 4));
const rotuloMod = (m: ModalidadeCredito | '') => (m ? ROTULO_MODALIDADE[m] : <span style={{ color: C.verm }}>falta</span>);

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
  const [filtroMod, setFiltroMod] = useState('');
  /** null = fechado; 'novo' = cadastro; senão o id em edição. */
  const [aberto, setAberto] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [valoresFechados, setValoresFechados] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { api<CreditoGerador[]>('/api/creditos').then(setLista).catch((e) => setErro(e.message)); }, []);

  const atual = aberto && aberto !== 'novo' ? lista?.find((c) => c.id === aberto) ?? null : null;
  const abrir = (id: string | null) => {
    const c = id && id !== 'novo' ? lista?.find((x) => x.id === id) : null;
    setAberto(id); setMsg(null);
    setForm(c ? doCredito(c) : FORM_VAZIO);
    setValoresFechados(c ? fechadosDe(c) : []);
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (n: number, k: keyof FormItem, v: string) => setForm((f) => ({ ...f, itens: f.itens.map((i, j) => (j === n ? { ...i, [k]: v } : i)) }));
  const trocar = (c: CreditoGerador) => setLista((l) => (l ?? []).some((x) => x.id === c.id) ? (l ?? []).map((x) => (x.id === c.id ? c : x)) : [...(l ?? []), c]);

  async function executar(fn: () => Promise<void>) {
    setOcupado(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setOcupado(false); }
  }
  const salvar = () => executar(async () => {
    const dados = paraDados(form);
    if ((dados.itens ?? []).some((i) => [i.volumeKWh, i.valorPedidoKWh, i.valorPropostoKWh].some((n) => Number.isNaN(n)))) throw new Error('Confira os números (use vírgula para os centavos).');
    const c = aberto === 'novo'
      ? await api<CreditoGerador>('/api/creditos', { method: 'POST', json: dados })
      : await api<CreditoGerador>(`/api/creditos/${aberto}`, { method: 'PUT', json: dados });
    trocar(c);
    if (aberto === 'novo') abrir(null); else { setForm(doCredito(c)); setValoresFechados(fechadosDe(c)); setMsg('Salvo.'); }
  });
  const acao = (rota: 'fechar' | 'desistir' | 'reabrir', corpo: object = {}) => executar(async () => {
    const c = await api<CreditoGerador>(`/api/creditos/${aberto}/${rota}`, { method: 'POST', json: corpo });
    trocar(c); setForm(doCredito(c)); setValoresFechados(fechadosDe(c));
  });

  // Filtros de distribuidora/modalidade valem por item: o lote aparece só com os itens que batem.
  const filtrados = filtrarItens(lista ?? [], filtroDist, filtroMod);
  const visiveis = filtrados.filter((c) => filtro === 'todos' || c.status === filtro).sort((a, b) => b.id.localeCompare(a.id));
  // Status do banco por distribuidora e modalidade: crédito de uma não serve para cliente de outra, e GD I ≠ GD II.
  const porDist = resumoPorDistribuidora(lista ?? []);
  const geral = resumoBanco(lista ?? []);
  const doFiltro = filtroDist || filtroMod ? resumoBanco(filtrados) : geral;
  const tile = (rotulo: string, valor: string, cor: string = C.esc) => (
    <div style={{ background: C.clar, borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: C.med, textTransform: 'uppercase', letterSpacing: '.04em' }}>{rotulo}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: cor }}>{valor}</div>
    </div>
  );
  const distsUsadas = [...new Set((lista ?? []).flatMap((c) => c.itens.map((i) => i.distribuidora)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const temSemMod = (lista ?? []).some((c) => c.itens.some((i) => !i.modalidade));
  const codMod = (rotulo: string) => (rotulo === SEM_MODALIDADE ? SEM_MODALIDADE : (Object.keys(ROTULO_MODALIDADE) as ModalidadeCredito[]).find((m) => ROTULO_MODALIDADE[m] === rotulo) ?? '');
  const totalItem = (i: FormItem, s: string) => {
    const vol = numeroBR(i.volumeKWh), v = numeroBR(s);
    return vol && v ? RS(vol * v) : '';
  };
  const somaForm = (k: 'valorPedidoKWh' | 'valorPropostoKWh') => form.itens.reduce((s, i) => s + (numeroBR(i.volumeKWh) || 0) * (numeroBR(i[k]) || 0), 0);
  const volumeForm = form.itens.reduce((s, i) => s + (numeroBR(i.volumeKWh) || 0), 0);
  const filtroTexto = [filtroDist, filtroMod && (filtroMod === SEM_MODALIDADE ? SEM_MODALIDADE : ROTULO_MODALIDADE[filtroMod as ModalidadeCredito])].filter(Boolean).join(' · ');

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div style={cartao}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Banco de crédito</div>
            <div style={{ fontSize: 11, color: C.med }}>Lotes de crédito negociados com os geradores, separados por distribuidora e GD I / GD II. Valores em R$/kWh; o total é volume × valor.</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select value={filtroDist} onChange={(e) => setFiltroDist(e.target.value)} style={{ ...inputStyle, width: 'auto' }} title="Distribuidora">
              <option value="">Todas as distribuidoras</option>
              {distsUsadas.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filtroMod} onChange={(e) => setFiltroMod(e.target.value)} style={{ ...inputStyle, width: 'auto' }} title="Modalidade">
              <option value="">GD I e GD II</option>
              {(Object.keys(ROTULO_MODALIDADE) as ModalidadeCredito[]).map((m) => <option key={m} value={m}>Só {ROTULO_MODALIDADE[m]}</option>)}
              {temSemMod && <option value={SEM_MODALIDADE}>{SEM_MODALIDADE}</option>}
            </select>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="todos">Todas as situações</option>
              {(Object.keys(ROTULO_STATUS_CREDITO) as StatusCredito[]).map((s) => <option key={s} value={s}>{ROTULO_STATUS_CREDITO[s]}</option>)}
            </select>
            <button style={botao(C.azul)} onClick={() => abrir('novo')}>+ Novo crédito</button>
          </div>
        </div>
        {lista && (
          <>
            {filtroTexto && <div style={{ fontSize: 11, color: C.med, marginBottom: 6 }}>Totais de <b>{filtroTexto}</b></div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 14 }}>
              {tile('Em negociação', kwh(doFiltro.negociacaoKWh), C.amber)}
              {tile('Crédito fechado', kwh(doFiltro.fechadoKWh), C.verde)}
              {tile('Valor fechado (total)', RS(doFiltro.fechadoValor))}
              {tile('Preço médio fechado', valorKWh(doFiltro.fechadoMedioKWh))}
            </div>
          </>
        )}
        {temSemMod && (
          <div style={{ fontSize: 12, color: C.amber, background: C.amberC, borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
            Há lotes cadastrados antes da separação GD I / GD II. Abra cada um e escolha a modalidade dos itens marcados "falta".
          </div>
        )}
        {lista && lista.length > 0 && (
          <div style={{ background: C.clar, borderRadius: 8, padding: '10px 12px', marginBottom: 16, overflowX: 'auto' }}>
            <div style={{ fontSize: 11, color: C.med, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Status por distribuidora e modalidade · clique para filtrar</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thL}>Distribuidora</th><th style={thL}>Modalidade</th><th style={thStyle}>Lotes</th><th style={thStyle}>Em negociação</th><th style={thStyle}>Crédito fechado</th>
                <th style={thStyle}>Valor fechado</th><th style={thStyle}>Preço médio fechado</th>
              </tr></thead>
              <tbody>
                {porDist.map((d) => {
                  const mod = codMod(d.modalidade);
                  const sel = filtroDist === d.distribuidora && filtroMod === mod;
                  return (
                    <tr key={`${d.distribuidora}|${d.modalidade}`} onClick={() => { setFiltroDist(sel ? '' : d.distribuidora); setFiltroMod(sel ? '' : mod); }}
                      style={{ cursor: 'pointer', background: sel ? C.azulC : undefined }}>
                      <td style={{ ...tdL, fontWeight: 600 }}>{d.distribuidora}</td>
                      <td style={{ ...tdL, color: d.modalidade === SEM_MODALIDADE ? C.verm : undefined }}>{d.modalidade}</td>
                      <td style={tdStyle}>{d.lotes}</td>
                      <td style={{ ...tdStyle, color: d.negociacaoKWh ? C.amber : C.med }}>{kwh(d.negociacaoKWh)}</td>
                      <td style={{ ...tdStyle, color: d.fechadoKWh ? C.verde : C.med, fontWeight: 600 }}>{kwh(d.fechadoKWh)}</td>
                      <td style={tdStyle}>{RS(d.fechadoValor)}</td>
                      <td style={tdStyle}>{valorKWh(d.fechadoMedioKWh)}</td>
                    </tr>
                  );
                })}
                {porDist.length > 1 && (
                  <tr style={{ fontWeight: 700 }}>
                    <td style={tdL} colSpan={2}>Total</td>
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
                <th style={thL}>Nº</th><th style={thL}>Gerador</th><th style={thL}>Intermediador</th><th style={thL}>Pagamento</th>
                <th style={thL}>Distribuidora</th><th style={thL}>Modalidade</th><th style={thStyle}>Volume</th>
                <th style={thStyle}>Pedido</th><th style={thStyle}>Proposto</th><th style={thStyle}>Fechado</th><th style={thStyle}>Total fechado</th><th style={thL}>Situação</th>
              </tr></thead>
              <tbody>
                {visiveis.map((c) => {
                  const n = c.itens.length;
                  const fundo = aberto === c.id ? C.azulC : undefined;
                  const span = { rowSpan: n, style: { ...tdL, verticalAlign: 'top' as const } };
                  return c.itens.map((i, k) => (
                    <tr key={`${c.id}-${k}`} onClick={() => abrir(c.id)} style={{ cursor: 'pointer', background: fundo }} title="Abrir">
                      {k === 0 && <>
                        <td {...span} style={{ ...span.style, fontWeight: 600 }}>{c.id}</td>
                        <td {...span}>{c.gerador}{c.contato && <div style={{ fontSize: 11, color: C.med }}>{c.contato}</div>}</td>
                        <td {...span}>{c.intermediador || <span style={{ color: C.med }}>direto</span>}</td>
                        <td {...span}>{c.formaPagamento ? ROTULO_PAGAMENTO[c.formaPagamento] : <span style={{ color: C.verm }}>falta</span>}</td>
                      </>}
                      <td style={tdL}>{i.distribuidora || <span style={{ color: C.verm }}>falta</span>}</td>
                      <td style={tdL}>{rotuloMod(i.modalidade)}</td>
                      <td style={tdStyle}>{kwh(i.volumeKWh)}</td>
                      <td style={tdStyle}>{valorKWh(i.valorPedidoKWh)}</td>
                      <td style={tdStyle}>{valorKWh(i.valorPropostoKWh)}</td>
                      <td style={{ ...tdStyle, fontWeight: i.valorFechadoKWh ? 600 : 400 }}>{valorKWh(i.valorFechadoKWh)}</td>
                      <td style={tdStyle}>{c.status === 'fechado' ? RS(totalDe(i, i.valorFechadoKWh) ?? 0) : ''}</td>
                      {k === 0 && <td {...span}><EtiquetaCredito s={c.status} /></td>}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aberto && (
        <div style={cartao}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'center' }}>
              {atual ? <>{atual.id} · {atual.gerador}{atual.contato && <span style={{ fontSize: 12, fontWeight: 400, color: C.med }}>({atual.contato})</span>} <EtiquetaCredito s={atual.status} /></> : 'Novo crédito'}
            </div>
            <button style={botao()} onClick={() => abrir(null)}>Fechar</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Campo label="Empresa do gerador (dono do crédito)"><input style={inputStyle} value={form.gerador} onChange={(e) => set('gerador', e.target.value)} /></Campo>
            <Campo label="Contato (pessoa com quem falamos)"><input style={inputStyle} value={form.contato} onChange={(e) => set('contato', e.target.value)} /></Campo>
            <Campo label="Intermediador (vazio = direto)"><input style={inputStyle} value={form.intermediador} onChange={(e) => set('intermediador', e.target.value)} /></Campo>
            <Campo label="Forma de pagamento">
              <select style={inputStyle} value={form.formaPagamento} onChange={(e) => set('formaPagamento', e.target.value as Form['formaPagamento'])}>
                <option value="" disabled>Selecione</option>
                {(Object.keys(ROTULO_PAGAMENTO) as FormaPagamento[]).map((f) => <option key={f} value={f}>{ROTULO_PAGAMENTO[f]}</option>)}
              </select>
            </Campo>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 4px' }}>Créditos do gerador</div>
          <div style={{ fontSize: 11, color: C.med, marginBottom: 8 }}>Um item por distribuidora e modalidade (GD I e GD II têm preço e quantidade separados).</div>
          <datalist id="distribuidoras-credito">{DISTRIBUIDORAS.map((d) => <option key={d} value={d} />)}</datalist>
          <div style={{ display: 'grid', gap: 8 }}>
            {form.itens.map((i, n) => (
              <div key={n} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start', background: C.clar, borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ flex: '2 1 180px' }}><Campo label={`Distribuidora (item ${n + 1})`}>
                  <input style={inputStyle} list="distribuidoras-credito" placeholder="Digite para buscar" value={i.distribuidora} onChange={(e) => setItem(n, 'distribuidora', e.target.value)} />
                </Campo></div>
                <div style={{ flex: '1 1 110px' }}><Campo label="Modalidade">
                  <select style={{ ...inputStyle, borderColor: i.modalidade ? undefined : C.verm }} value={i.modalidade} onChange={(e) => setItem(n, 'modalidade', e.target.value)}>
                    <option value="" disabled>Selecione</option>
                    {(Object.keys(ROTULO_MODALIDADE) as ModalidadeCredito[]).map((m) => <option key={m} value={m}>{ROTULO_MODALIDADE[m]}</option>)}
                  </select>
                </Campo></div>
                <div style={{ flex: '1 1 120px' }}><Campo label="Volume (kWh)"><input style={inputStyle} inputMode="numeric" placeholder="500000" value={i.volumeKWh} onChange={(e) => setItem(n, 'volumeKWh', e.target.value)} /></Campo></div>
                <div style={{ flex: '1 1 150px' }}><Campo label="Pedido pelo gerador (R$/kWh)">
                  <input style={inputStyle} inputMode="decimal" placeholder="0,38" value={i.valorPedidoKWh} onChange={(e) => setItem(n, 'valorPedidoKWh', e.target.value)} />
                  <div style={{ fontSize: 10, color: C.med, marginTop: 2, minHeight: 12 }}>{totalItem(i, i.valorPedidoKWh)}</div>
                </Campo></div>
                <div style={{ flex: '1 1 150px' }}><Campo label="Proposto pela Kora (R$/kWh)">
                  <input style={inputStyle} inputMode="decimal" placeholder="0,30" value={i.valorPropostoKWh} onChange={(e) => setItem(n, 'valorPropostoKWh', e.target.value)} />
                  <div style={{ fontSize: 10, color: C.med, marginTop: 2, minHeight: 12 }}>{totalItem(i, i.valorPropostoKWh)}</div>
                </Campo></div>
                <button style={{ ...botao(), color: C.verm, marginTop: 17, flex: '0 0 auto' }} disabled={form.itens.length === 1} title="Tirar item"
                  onClick={() => set('itens', form.itens.filter((_, j) => j !== n))}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <button style={botao()} onClick={() => set('itens', [...form.itens, { ...ITEM_VAZIO, distribuidora: form.itens[form.itens.length - 1]?.distribuidora ?? '' }])}>+ Item (outra distribuidora ou modalidade)</button>
            {form.itens.length > 1 && (
              <span style={{ fontSize: 12, color: C.med }}>
                Total: <b>{kwh(volumeForm)}</b>{somaForm('valorPedidoKWh') > 0 && <> · pedido {RS(somaForm('valorPedidoKWh'))}</>}{somaForm('valorPropostoKWh') > 0 && <> · proposto {RS(somaForm('valorPropostoKWh'))}</>}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
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
                    Fechado em {DATA(atual.fechadoEm ?? atual.atualizadoEm)} · {kwh(volumeTotal(atual))} · total <b>{RS(totalFechado(atual))}</b>
                  </div>
                )}
                {atual.status !== 'desistencia' && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {atual.itens.map((i, n) => {
                      const v = numeroBR(valoresFechados[n] ?? '');
                      return (
                        <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <Campo label={`Valor fechado ${nomeItem(i)} (R$/kWh)`}>
                            <input style={{ ...inputStyle, width: 160 }} inputMode="decimal" placeholder="0,34" value={valoresFechados[n] ?? ''}
                              onChange={(e) => setValoresFechados((vs) => atual.itens.map((_, j) => (j === n ? e.target.value : vs[j] ?? '')))} />
                          </Campo>
                          <span style={{ fontSize: 12, color: C.med, paddingBottom: 9 }}>{kwh(i.volumeKWh)}{v ? ` = ${RS(i.volumeKWh * v)}` : ''}</span>
                        </div>
                      );
                    })}
                    <div>
                      <button style={botao(C.verde)} disabled={ocupado} onClick={() => {
                        const vs = atual.itens.map((_, n) => numeroBR(valoresFechados[n] ?? ''));
                        const falta = vs.findIndex((v) => !v || Number.isNaN(v));
                        if (falta >= 0) { setMsg(`Informe o valor fechado (R$/kWh) de ${nomeItem(atual.itens[falta])}.`); return; }
                        acao('fechar', { valoresFechadosKWh: vs });
                      }}>{atual.status === 'fechado' ? 'Corrigir valor fechado' : 'Fechar negociação'}</button>
                    </div>
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
