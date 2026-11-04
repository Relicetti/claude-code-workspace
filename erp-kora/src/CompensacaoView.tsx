import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { botao, C, cartao, inputStyle, tdL, tdStyle, thL, thStyle } from './estilo';
import { FaturaKora } from './FaturaKora';
import { R, RS } from './formato';
import type { Cliente } from './lib/clientes';
import { mesmaUC, type LeituraFatura } from './lib/faturaCopel';
import { mesBR, precoVigente, resumoControle, somarMeses, type FaturaKora as Fatura, type LancamentoMensal } from './lib/controle';

const data = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const hojeISO = () => new Date().toISOString().slice(0, 10);
const COR_FATURA = { emitida: [C.azul, C.azulC], paga: [C.verde, C.verdeC], cancelada: [C.med, C.clar], vencida: [C.verm, C.vermC] } as const;

export function estadoFatura(f: Fatura): keyof typeof COR_FATURA {
  return f.status === 'emitida' && f.vencimento < hojeISO() ? 'vencida' : f.status;
}
export function EtiquetaFatura({ f }: { f: Fatura }) {
  const e = estadoFatura(f);
  const [cor, fundo] = COR_FATURA[e];
  const boleto = f.cobranca && f.cobranca.status !== 'DELETED' && f.status === 'emitida'
    ? (f.cobranca.status === 'OVERDUE' ? ' · boleto vencido' : ' · boleto')
    : '';
  return <span style={{ padding: '2px 8px', borderRadius: 10, background: fundo, color: cor, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{e[0].toUpperCase() + e.slice(1)}{boleto}</span>;
}

/** Abre a impressão com o nome do arquivo PDF sugerido pelo título da página. */
export function imprimirComo(titulo: string) {
  const anterior = document.title;
  document.title = titulo;
  window.addEventListener('afterprint', () => { document.title = anterior; }, { once: true });
  window.print();
}

/** Fatura em tela cheia, pronta para imprimir/salvar em PDF. */
export function VerFatura({ f, c, onFechar }: { f: Fatura; c: Cliente; onFechar: () => void }) {
  const saldoApos = useMemo(() => {
    if (f.quitacaoSaldo || !c.base) return null;
    return resumoControle(c, new Date()).linhas.find((l) => l.mes === f.mes)?.saldoFinalKWh ?? null;
  }, [f, c]);
  // Na impressão só a fatura aparece (o app fica em #root, a fatura fora dele).
  useEffect(() => {
    document.body.classList.add('so-fatura');
    return () => document.body.classList.remove('so-fatura');
  }, []);
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#5f5e5a', overflowY: 'auto' }} className="folheto-fundo fatura-overlay">
      <div className="no-print" style={{ position: 'sticky', top: 0, display: 'flex', gap: 8, justifyContent: 'center', padding: 12, background: C.esc }}>
        <button style={botao(C.verde)} onClick={() => imprimirComo(`Fatura ${f.numero} - ${c.nome}`.replace(/[\\/:*?"<>|]/g, '-'))}>Imprimir / salvar PDF</button>
        <button style={botao()} onClick={onFechar}>Fechar</button>
      </div>
      <div style={{ padding: '16px 0 40px' }}><FaturaKora f={f} c={c} saldoAposKWh={saldoApos} /></div>
    </div>,
    document.body,
  );
}

type Executar = (nome: string, fn: () => Promise<Cliente | void>) => void;

export function CompensacaoBloco({ c, ocupado, executar, docUrl }: {
  c: Cliente; ocupado: string | null; executar: Executar; docUrl: (id: string, baixar?: boolean) => string;
}) {
  const r = useMemo(() => resumoControle(c, new Date()), [c]);
  const [vendo, setVendo] = useState<Fatura | null>(null);
  const [aberto, setAberto] = useState(false);
  const [asaas, setAsaas] = useState<{ configurado: boolean; producao: boolean } | null>(null);
  const [avisoBoleto, setAvisoBoleto] = useState<string | null>(null);
  useEffect(() => { api<{ asaas: { configurado: boolean; producao: boolean } }>('/api/config').then((r) => setAsaas(r.asaas)).catch(() => {}); }, []);
  const ultimoLancado = (c.lancamentos ?? []).map((l) => l.mes).sort().slice(-1)[0];
  const sugestaoMes = ultimoLancado ? somarMeses(ultimoLancado, 1) : (c.contrato.inicioInjecao || c.base?.operacao.mesInicio || new Date().toISOString().slice(0, 7));
  const vazio = { mes: sugestaoMes, uc: c.ucs[0]?.numero ?? '', compensadoKWh: '', saldoDebitadoKWh: '', saldoFaturaKWh: '', vencimento: '', valorDistribuidora: '', observacao: '' };
  const [form, setForm] = useState(vazio);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [leitura, setLeitura] = useState<LeituraFatura | null>(null);
  const [lendo, setLendo] = useState<string | null>(null);

  // Lê o PDF da distribuidora e preenche o formulário; o PDF fica para anexar ao salvar.
  const lerPdf = async (f: File) => {
    setArquivo(f); setLeitura(null); setLendo('Lendo a fatura…');
    try {
      const r = await api<LeituraFatura>('/api/ler-fatura', { method: 'POST', body: f, headers: { 'Content-Type': 'application/pdf' } });
      const uc = c.ucs.find((u) => mesmaUC(u.numero, r.uc));
      setLeitura(r);
      setForm((x) => ({
        ...x, mes: r.mes, uc: uc?.numero ?? x.uc, compensadoKWh: String(r.compensadoKWh), saldoDebitadoKWh: '',
        saldoFaturaKWh: r.saldoAcumuladoKWh !== null ? String(r.saldoAcumuladoKWh) : '', vencimento: r.vencimento, valorDistribuidora: String(r.total),
      }));
      setLendo(uc ? null : `Atenção: a fatura é da UC ${r.uc}, que não está no cadastro deste cliente.`);
    } catch (e) { setLendo((e as Error).message); }
  };
  const set = (k: keyof typeof vazio, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const id = c.id;
  const grupoA = c.ucs.some((u) => u.subgrupo.startsWith('A'));

  const salvarLancamento = () => executar('lancar', async () => {
    let faturaDistribuidoraId: string | null = null;
    if (arquivo) {
      const comAnexo = await api<Cliente>(`/api/clientes/${id}/documentos?tipo=fatura&nome=${encodeURIComponent(arquivo.name)}`,
        { method: 'POST', body: arquivo, headers: { 'Content-Type': arquivo.type || 'application/pdf' } });
      faturaDistribuidoraId = comAnexo.documentos[comAnexo.documentos.length - 1].id;
    }
    const novo = await api<Cliente>(`/api/clientes/${id}/lancamentos`, { method: 'POST', json: { ...form, faturaDistribuidoraId } });
    setForm({ ...vazio, mes: form.mes, uc: c.ucs.find((u) => !novo.lancamentos.some((l) => l.mes === form.mes && l.uc === u.numero))?.numero ?? form.uc });
    setArquivo(null); setLeitura(null); setLendo(null);
    return novo;
  });
  const editar = (l: LancamentoMensal) => {
    setForm({
      mes: l.mes, uc: l.uc, compensadoKWh: String(l.compensadoKWh), saldoDebitadoKWh: l.saldoDebitadoKWh !== l.compensadoKWh ? String(l.saldoDebitadoKWh) : '',
      saldoFaturaKWh: l.saldoFaturaKWh?.toString() ?? '', vencimento: l.vencimento, valorDistribuidora: l.valorDistribuidora?.toString() ?? '', observacao: l.observacao,
    });
    setAberto(true);
  };
  const remover = (l: LancamentoMensal) => {
    if (!window.confirm(`Remover o lançamento de ${mesBR(l.mes)} da UC ${l.uc}?`)) return;
    executar('rm-lanc', () => api<Cliente>(`/api/clientes/${id}/lancamentos/${l.id}`, { method: 'DELETE' }));
  };
  const emitir = (mes: string) => {
    const linha = r.linhas.find((l) => l.mes === mes)!;
    if (!window.confirm(`Emitir a fatura de ${mesBR(mes)}: ${R(linha.compensadoKWh)} kWh × R$ ${R(linha.precoKWh, 4)} = ${RS(linha.valor)}?`)) return;
    executar('emitir', async () => {
      const novo = await api<Cliente & { avisoBoleto?: string }>(`/api/clientes/${id}/faturas`, { method: 'POST', json: { mes } });
      setAvisoBoleto(novo.avisoBoleto ? `Fatura emitida, mas o boleto não foi gerado: ${novo.avisoBoleto}` : null);
      setVendo(novo.faturas.find((f) => f.mes === mes && f.status === 'emitida' && !f.quitacaoSaldo) ?? null);
      return novo;
    });
  };
  const gerarBoleto = (f: Fatura) => {
    const hoje = hojeISO();
    let vencimento: string | undefined;
    if (f.vencimento < hoje) {
      const d = new Date(); d.setDate(d.getDate() + 5);
      const r = window.prompt(`O vencimento da fatura (${data(f.vencimento)}) já passou. Vencimento do boleto (DD/MM/AAAA):`, data(d.toISOString()));
      if (!r) return;
      const [dd, mm, aa] = r.split('/');
      vencimento = `${aa}-${mm?.padStart(2, '0')}-${dd?.padStart(2, '0')}`;
    }
    setAvisoBoleto(null);
    executar('boleto', () => api<Cliente>(`/api/clientes/${id}/faturas/${f.numero}/boleto`, { method: 'POST', json: { vencimento } }));
  };
  const atualizarBoletos = () => executar('sync-boletos', () => api<Cliente>(`/api/clientes/${id}/boletos/atualizar`, { method: 'POST' }));
  const temBoletoAberto = (c.faturas ?? []).some((f) => f.status === 'emitida' && f.cobranca && f.cobranca.status !== 'DELETED');
  const acoesBoleto = (f: Fatura) => {
    if (f.status !== 'emitida' || !asaas?.configurado) return null;
    if (!f.cobranca || f.cobranca.status === 'DELETED') return <><button style={{ ...pequeno, background: C.azul, color: '#fff', border: 'none' }} disabled={!!ocupado} onClick={() => gerarBoleto(f)}>Gerar boleto</button>{' '}</>;
    return <>{f.cobranca.boletoUrl && <a href={f.cobranca.boletoUrl} target="_blank" rel="noreferrer" style={{ ...pequeno, textDecoration: 'none', color: C.esc, display: 'inline-block' }}>Boleto{f.cobranca.sandbox ? ' (teste)' : ''}</a>}{' '}</>;
  };

  const baixar = (f: Fatura) => {
    const dataPag = window.prompt(`Data do pagamento da ${f.numero} (DD/MM/AAAA):`, data(hojeISO()));
    if (!dataPag) return;
    const [d, m, a] = dataPag.split('/');
    const valor = window.prompt('Valor pago (R$):', f.total.toFixed(2).replace('.', ','));
    if (!valor) return;
    executar('baixa', () => api<Cliente>(`/api/clientes/${id}/faturas/${f.numero}/baixa`, {
      method: 'POST', json: { pagaEm: `${a}-${m?.padStart(2, '0')}-${d?.padStart(2, '0')}`, valorPago: Number(valor.replace(/\./g, '').replace(',', '.')) },
    }));
  };
  const cancelar = (f: Fatura) => {
    const motivo = window.prompt(`Motivo para cancelar a ${f.numero}:`);
    if (motivo === null) return;
    executar('cancelar-fat', () => api<Cliente>(`/api/clientes/${id}/faturas/${f.numero}/cancelar`, { method: 'POST', json: { motivo } }));
  };
  const quitacao = () => {
    const d = new Date(); d.setDate(d.getDate() + 10);
    const venc = window.prompt(`Fatura de quitação de ${R(r.saldoKWh)} kWh × R$ ${R(precoVigente(c, new Date().toISOString().slice(0, 7)), 4)}. Vencimento (DD/MM/AAAA):`, data(d.toISOString()));
    if (!venc) return;
    const motivo = window.prompt('Motivo (aparece na fatura):', 'Encerramento do prazo para utilização do saldo.') ?? '';
    const [dd, mm, aa] = venc.split('/');
    executar('quitacao', () => api<Cliente>(`/api/clientes/${id}/faturas/quitacao`, { method: 'POST', json: { vencimento: `${aa}-${mm}-${dd}`, motivo } }));
  };
  const reajuste = () => {
    const mes = window.prompt('Reajuste vale a partir de (MM/AAAA):');
    if (!mes) return;
    const [mm, aa] = mes.split('/');
    const novo = window.prompt(`Novo preço por kWh (hoje R$ ${R(precoVigente(c, `${aa}-${mm}`), 4)}):`);
    if (!novo) return;
    const motivo = window.prompt('Motivo (ex.: Reajuste Tarifário Anual Copel +X%):', '') ?? '';
    executar('reajuste', () => api<Cliente>(`/api/clientes/${id}/reajustes`, { method: 'POST', json: { aPartirDe: `${aa}-${mm.padStart(2, '0')}`, precoKWh: Number(novo.replace(',', '.')), motivo } }));
  };

  const kpi = (rotulo: string, valor: string, sub?: string, cor: string = C.esc) => (
    <div style={{ background: C.clar, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: C.med, textTransform: 'uppercase', letterSpacing: '.04em' }}>{rotulo}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: cor }}>{valor}</div>
      {sub && <div style={{ fontSize: 10, color: C.med }}>{sub}</div>}
    </div>
  );
  const pequeno: React.CSSProperties = { ...botao(), padding: '3px 8px', fontSize: 11 };
  const campo = (rotulo: string, el: React.ReactNode) => <label style={{ display: 'block' }}><div style={{ fontSize: 11, color: C.med, marginBottom: 3 }}>{rotulo}</div>{el}</label>;
  const linhasVisiveis = r.linhas.filter((l) => l.ucsLancadas > 0 || l.previstoKWh !== null);
  const quitacoes = (c.faturas ?? []).filter((f) => f.quitacaoSaldo);
  const prazoEstourado = r.fimPrazo !== null && new Date().toISOString().slice(0, 7) > r.fimPrazo;

  if (vendo) return <VerFatura f={vendo} c={c} onFechar={() => setVendo(null)} />;

  return (
    <section style={{ ...cartao, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Compensação e faturas</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {asaas?.configurado && temBoletoAberto && (
            <button style={botao()} onClick={atualizarBoletos} disabled={!!ocupado} title="Consulta no Asaas os boletos em aberto e dá baixa nos pagos">
              {ocupado === 'sync-boletos' ? 'Consultando…' : 'Atualizar pagamentos (Asaas)'}</button>
          )}
          <button style={botao()} onClick={reajuste} disabled={!!ocupado}>Reajuste de preço</button>
          {r.saldoKWh > 0 && quitacoes.every((f) => f.status === 'cancelada') && (r.linhas.some((l) => l.ucsLancadas) || prazoEstourado) && (
            <button style={{ ...botao(), color: prazoEstourado ? C.verm : C.esc }} onClick={quitacao} disabled={!!ocupado}
              title="Cobra os kWh que sobraram × preço vigente (Cláusula 9ª §3)">Quitação do saldo</button>
          )}
          <button style={botao(C.verde)} onClick={() => { setForm({ ...vazio }); setAberto(!aberto); }}>{aberto ? 'Fechar lançamento' : '+ Lançar mês'}</button>
        </div>
      </div>

      {avisoBoleto && <div style={{ fontSize: 12, background: C.vermC, color: C.verm, padding: '8px 12px', borderRadius: 6, marginBottom: 10 }}>{avisoBoleto}</div>}
      {asaas?.configurado && !asaas.producao && <div style={{ fontSize: 11, color: C.azul, marginBottom: 8 }}>Boletos no Asaas em modo teste (sandbox): não são cobranças de verdade.</div>}
      {!c.base && <div style={{ fontSize: 12, color: C.amber, marginBottom: 10 }}>Cliente sem proposta fechada: sem previsto nem crédito total para o saldo.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
        {kpi('Saldo de crédito', `${R(r.saldoKWh)} kWh`, `de ${R(r.creditoTotalKWh)} kWh`, r.saldoKWh < 0 ? C.verm : C.esc)}
        {kpi('Compensado', `${R(r.compensadoKWh)} kWh`, r.mediaMensalKWh ? `média ${R(r.mediaMensalKWh)} kWh/mês` : undefined)}
        {kpi('Prazo do saldo', r.fimPrazo ? `até ${mesBR(r.fimPrazo)}` : '—', r.mesesRestantes !== null ? `${r.mesesRestantes} meses restantes` : 'informe o início da injeção', prazoEstourado && r.saldoKWh > 0 ? C.verm : C.esc)}
        {kpi('Preço vigente', `R$ ${R(precoVigente(c, new Date().toISOString().slice(0, 7)), 4)}`, (c.contrato.reajustes ?? []).length ? `${c.contrato.reajustes!.length} reajuste(s)` : 'sem reajuste')}
        {kpi('Faturado', RS(r.faturado), `recebido ${RS(r.recebido)}`)}
        {kpi('Em aberto', RS(r.emAberto), r.vencido ? `vencido ${RS(r.vencido)}` : 'nada vencido', r.vencido ? C.verm : C.esc)}
      </div>

      {r.sobraProjetadaKWh > 1 && r.fimPrazo && (
        <div style={{ fontSize: 12, background: C.amberC, padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>
          No ritmo atual ({R(r.mediaMensalKWh)} kWh/mês) devem sobrar <b>{R(r.sobraProjetadaKWh)} kWh</b> em {mesBR(r.fimPrazo)} —
          cerca de {RS(r.sobraProjetadaKWh * precoVigente(c, r.fimPrazo))} a cobrar na quitação do saldo.
          {r.projecaoFim && ` Nesse ritmo o saldo acaba em ${mesBR(r.projecaoFim)}.`}
        </div>
      )}

      {aberto && (
        <div style={{ border: `1px solid ${C.bord}`, borderRadius: 8, padding: 12, marginBottom: 14, background: '#fcfcfa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Lançar a fatura da distribuidora</div>
            <label style={{ ...botao(C.azul), cursor: 'pointer' }} title="Lê UC, mês, kWh compensados, saldo, vencimento e total (faturas da Copel)">
              Ler fatura (PDF)
              <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) lerPdf(f); e.target.value = ''; }} />
            </label>
          </div>
          {lendo && <div style={{ fontSize: 12, background: C.amberC, padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>{lendo}</div>}
          {leitura && (
            <div style={{ fontSize: 12, background: C.verdeC, padding: '8px 10px', borderRadius: 6, marginBottom: 8 }}>
              <b>Lido da fatura {leitura.distribuidora}</b> · UC {leitura.uc} · {mesBR(leitura.mes)} · leitura {leitura.leituraAnterior ? `${data(leitura.leituraAnterior)} a ${data(leitura.leituraAtual!)}` : '—'}
              {' '}· consumo {leitura.consumoKWh !== null ? `${R(leitura.consumoKWh)} kWh` : '—'} · <b>compensado {R(leitura.compensadoKWh)} kWh</b>
              {leitura.compensadoPontaKWh > 0 && ` (ponta ${R(leitura.compensadoPontaKWh)}, fora ponta ${R(leitura.compensadoForaPontaKWh)})`}
              {leitura.saldoAcumuladoKWh !== null && ` · saldo acumulado ${R(leitura.saldoAcumuladoKWh)} kWh`} · total {RS(leitura.total)} · vence {data(leitura.vencimento)}
              {leitura.linhasCompensacao.length > 0 && <div style={{ fontSize: 11, color: C.med, marginTop: 4 }}>{leitura.linhasCompensacao.map((l) => `${l.descricao}: ${R(l.kWh)} kWh`).join(' · ')}</div>}
              {leitura.avisos.map((a) => <div key={a} style={{ color: C.amber, marginTop: 2 }}>{a}</div>)}
              <div style={{ fontSize: 11, color: C.med, marginTop: 4 }}>Confira os campos abaixo antes de salvar. O PDF será anexado.</div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {campo('Mês de referência', <input type="month" style={inputStyle} value={form.mes} onChange={(e) => set('mes', e.target.value)} />)}
            {campo('UC', <select style={inputStyle} value={form.uc} onChange={(e) => set('uc', e.target.value)}>{c.ucs.map((u) => <option key={u.numero} value={u.numero}>{u.numero}</option>)}</select>)}
            {campo('kWh compensados', <input type="number" style={inputStyle} value={form.compensadoKWh} onChange={(e) => set('compensadoKWh', e.target.value)} />)}
            {campo(grupoA ? 'Crédito debitado do saldo (kWh)' : 'Debitado do saldo (se diferente)',
              <input type="number" style={inputStyle} placeholder={form.compensadoKWh || 'igual ao compensado'} value={form.saldoDebitadoKWh} onChange={(e) => set('saldoDebitadoKWh', e.target.value)} />)}
            {campo('Saldo informado na fatura (kWh)', <input type="number" style={inputStyle} value={form.saldoFaturaKWh} onChange={(e) => set('saldoFaturaKWh', e.target.value)} />)}
            {campo('Vencimento da fatura', <input type="date" style={inputStyle} value={form.vencimento} onChange={(e) => set('vencimento', e.target.value)} />)}
            {campo('Valor da fatura da distribuidora (R$)', <input type="number" step="0.01" style={inputStyle} value={form.valorDistribuidora} onChange={(e) => set('valorDistribuidora', e.target.value)} />)}
            {campo('Fatura em PDF (anexo)', arquivo
              ? <div style={{ fontSize: 11, padding: '8px 0' }}>{arquivo.name} <button style={{ border: 'none', background: 'none', color: C.verm, cursor: 'pointer', fontSize: 11 }} onClick={() => { setArquivo(null); setLeitura(null); }}>tirar</button></div>
              : <input type="file" accept=".pdf,image/*" style={{ fontSize: 11 }} onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />)}
          </div>
          <div style={{ marginTop: 10 }}>{campo('Observação', <input style={inputStyle} value={form.observacao} onChange={(e) => set('observacao', e.target.value)} />)}</div>
          {grupoA && <div style={{ fontSize: 11, color: C.med, marginTop: 6 }}>Grupo A: a ponta compensada pelo fator gasta mais crédito do que os kWh cobrados — informe o que saiu do saldo (fora ponta + ponta × fator).</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={botao(C.verde)} disabled={!!ocupado || !form.compensadoKWh || !form.vencimento} onClick={salvarLancamento}>
              {ocupado === 'lancar' ? 'Salvando…' : 'Salvar lançamento'}
            </button>
            <span style={{ fontSize: 11, color: C.med, alignSelf: 'center' }}>
              Kora cobra {R(Number(form.compensadoKWh) || 0)} kWh × R$ {R(precoVigente(c, form.mes), 4)} = {RS((Number(form.compensadoKWh) || 0) * precoVigente(c, form.mes))}
            </span>
          </div>
        </div>
      )}

      {linhasVisiveis.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thL}>Mês</th><th style={thStyle}>Previsto (kWh)</th><th style={thStyle}>Compensado (kWh)</th><th style={thStyle}>Saldo após (kWh)</th>
              <th style={thStyle}>R$/kWh</th><th style={thStyle}>Valor Kora</th><th style={thL}>Fatura</th><th style={thStyle}></th>
            </tr></thead>
            <tbody>
              {linhasVisiveis.map((l) => {
                const lancs = (c.lancamentos ?? []).filter((x) => x.mes === l.mes);
                const completo = lancs.length > 0 && c.ucs.every((u) => lancs.some((x) => x.uc === u.numero));
                const desvio = l.previstoKWh && l.ucsLancadas ? l.compensadoKWh / l.previstoKWh - 1 : null;
                return (
                  <React.Fragment key={l.mes}>
                    <tr style={{ background: l.ucsLancadas ? '#fff' : '#fafaf7', color: l.ucsLancadas ? C.esc : C.med }}>
                      <td style={{ ...tdL, fontWeight: 600 }}>{mesBR(l.mes)}</td>
                      <td style={tdStyle}>{l.previstoKWh !== null ? R(l.previstoKWh) : '—'}</td>
                      <td style={tdStyle}>
                        {l.ucsLancadas ? R(l.compensadoKWh) : '—'}
                        {desvio !== null && Math.abs(desvio) >= 0.1 && <span style={{ color: desvio < 0 ? C.amber : C.azul, fontSize: 10 }}> ({desvio > 0 ? '+' : ''}{R(desvio * 100)}%)</span>}
                      </td>
                      <td style={tdStyle}>{l.ucsLancadas ? R(l.saldoFinalKWh) : ''}</td>
                      <td style={tdStyle}>{R(l.precoKWh, 4)}</td>
                      <td style={tdStyle}>{l.ucsLancadas ? RS(l.valor) : ''}</td>
                      <td style={tdL}>{l.fatura ? <><span style={{ fontSize: 11 }}>{l.fatura.numero}</span> <EtiquetaFatura f={l.fatura} /></> : ''}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        {l.fatura ? <>
                          {acoesBoleto(l.fatura)}
                          <button style={pequeno} onClick={() => setVendo(l.fatura)}>Ver / PDF</button>{' '}
                          {l.fatura.status === 'emitida' && <><button style={pequeno} onClick={() => baixar(l.fatura!)}>Baixar pgto</button>{' '}
                            <button style={{ ...pequeno, color: C.verm }} onClick={() => cancelar(l.fatura!)}>Cancelar</button></>}
                        </> : completo
                          ? <button style={{ ...pequeno, background: C.esc, color: '#fff', border: 'none' }} disabled={!!ocupado} onClick={() => emitir(l.mes)}>Emitir fatura</button>
                          : lancs.length > 0 && <span style={{ fontSize: 10, color: C.amber }}>falta UC</span>}
                      </td>
                    </tr>
                    {lancs.map((x) => (
                      <tr key={x.id} style={{ fontSize: 11 }}>
                        <td style={{ ...tdL, paddingLeft: 20, color: C.med, fontSize: 11 }}>UC {x.uc}</td>
                        <td style={{ ...tdL, color: C.med, fontSize: 11 }} colSpan={3}>
                          {R(x.compensadoKWh)} kWh{x.saldoDebitadoKWh !== x.compensadoKWh ? ` · debitado ${R(x.saldoDebitadoKWh)}` : ''}
                          {x.saldoFaturaKWh !== null ? ` · saldo na fatura ${R(x.saldoFaturaKWh)}` : ''} · vence {data(x.vencimento)}
                          {x.valorDistribuidora !== null ? ` · ${c.contrato.distribuidoraNome || 'distribuidora'} ${RS(x.valorDistribuidora)}` : ''}
                          {x.observacao ? ` · ${x.observacao}` : ''}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11 }} colSpan={4}>
                          {x.faturaDistribuidoraId && <><a href={docUrl(x.faturaDistribuidoraId)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.azul }}>fatura PDF</a>{' · '}</>}
                          {!l.fatura && <><button style={{ border: 'none', background: 'none', color: C.azul, fontSize: 11, cursor: 'pointer' }} onClick={() => editar(x)}>corrigir</button>
                            <button style={{ border: 'none', background: 'none', color: C.verm, fontSize: 11, cursor: 'pointer' }} onClick={() => remover(x)}>remover</button></>}
                          <span style={{ color: C.med }}> {x.criadoPor}</span>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {quitacoes.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {quitacoes.map((f) => (
            <div key={f.numero} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, padding: '6px 0' }}>
              <b>Quitação do saldo</b> {f.numero} · {R(f.itens[0].compensadoKWh)} kWh · {RS(f.total)} · vence {data(f.vencimento)} <EtiquetaFatura f={f} />
              {acoesBoleto(f)}
              <button style={pequeno} onClick={() => setVendo(f)}>Ver / PDF</button>
              {f.status === 'emitida' && <><button style={pequeno} onClick={() => baixar(f)}>Baixar pgto</button><button style={{ ...pequeno, color: C.verm }} onClick={() => cancelar(f)}>Cancelar</button></>}
            </div>
          ))}
        </div>
      )}
      {(c.contrato.reajustes ?? []).length > 0 && (
        <div style={{ fontSize: 11, color: C.med, marginTop: 10 }}>
          Reajustes: {c.contrato.reajustes!.map((x) => `R$ ${R(x.precoKWh, 4)} a partir de ${mesBR(x.aPartirDe)}${x.motivo ? ` (${x.motivo})` : ''}`).join(' · ')}
        </div>
      )}
    </section>
  );
}
