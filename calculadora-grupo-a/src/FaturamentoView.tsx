import React, { useEffect, useState } from 'react';
import { api } from './api';
import { EtiquetaFatura, estadoFatura } from './CompensacaoView';
import { C, cartao, inputStyle, tdL, tdStyle, thL, thStyle } from './estilo';
import { RS } from './formato';
import { formatarDocumento, type TipoPessoa } from './lib/clientes';
import { mesBR, type FaturaKora } from './lib/controle';

type Linha = FaturaKora & { clienteId: string; cliente: string; documento: string; tipo: TipoPessoa };
const data = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function FaturamentoView({ onCliente }: { onCliente: (id: string) => void }) {
  const [lista, setLista] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'abertas' | 'vencidas' | 'pagas' | 'todas'>('abertas');
  const [mes, setMes] = useState('');
  useEffect(() => { api<Linha[]>('/api/faturas').then(setLista).catch((e) => setErro(e.message)); }, []);

  const visiveis = (lista ?? [])
    .filter((f) => (filtro === 'todas' ? true : filtro === 'abertas' ? f.status === 'emitida' : filtro === 'vencidas' ? estadoFatura(f) === 'vencida' : f.status === 'paga'))
    .filter((f) => !mes || f.mes === mes)
    .sort((a, b) => (filtro === 'pagas' ? b.numero.localeCompare(a.numero) : a.vencimento.localeCompare(b.vencimento)));
  const ativas = (lista ?? []).filter((f) => f.status !== 'cancelada');
  const soma = (fs: Linha[]) => fs.reduce((s, f) => s + f.total, 0);
  const tile = (rotulo: string, valor: string, cor: string = C.esc) => (
    <div style={{ background: C.clar, borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: C.med, textTransform: 'uppercase', letterSpacing: '.04em' }}>{rotulo}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: cor }}>{valor}</div>
    </div>
  );

  return (
    <main style={{ padding: 24 }}>
      <div style={cartao}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Faturamento</div>
            <div style={{ fontSize: 11, color: C.med }}>Faturas Kora de todos os clientes. As faturas são emitidas na ficha de cada cliente, em "Compensação e faturas".</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="abertas">Em aberto</option><option value="vencidas">Vencidas</option><option value="pagas">Pagas</option><option value="todas">Todas</option>
            </select>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ ...inputStyle, width: 'auto' }} title="Mês de referência" />
          </div>
        </div>
        {lista && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 14 }}>
            {tile('Em aberto', RS(soma(ativas.filter((f) => f.status === 'emitida'))))}
            {tile('Vencido', RS(soma(ativas.filter((f) => estadoFatura(f) === 'vencida'))), C.verm)}
            {tile('Recebido', RS(ativas.reduce((s, f) => s + (f.valorPago ?? 0), 0)), C.verde)}
            {tile('Faturado (total)', RS(soma(ativas)))}
          </div>
        )}
        {erro && <div style={{ color: C.verm, fontSize: 12 }}>{erro}</div>}
        {!lista && !erro && <div style={{ color: C.med, fontSize: 12 }}>Carregando…</div>}
        {lista && visiveis.length === 0 && <div style={{ color: C.med, fontSize: 12, padding: '24px 0', textAlign: 'center' }}>Nenhuma fatura.</div>}
        {visiveis.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thL}>Número</th><th style={thL}>Cliente</th><th style={thL}>Referência</th><th style={thStyle}>Emissão</th>
                <th style={thStyle}>Vencimento</th><th style={thStyle}>Valor</th><th style={thL}>Situação</th><th style={thStyle}>Pago</th>
              </tr></thead>
              <tbody>
                {visiveis.map((f) => (
                  <tr key={f.numero} onClick={() => onCliente(f.clienteId)} style={{ cursor: 'pointer' }} title="Abrir o cliente">
                    <td style={{ ...tdL, fontWeight: 600 }}>{f.numero}</td>
                    <td style={tdL}><div>{f.cliente}</div><div style={{ fontSize: 10, color: C.med }}>{formatarDocumento(f.tipo, f.documento)}</div></td>
                    <td style={tdL}>{f.quitacaoSaldo ? 'Quitação do saldo' : mesBR(f.mes)}</td>
                    <td style={tdStyle}>{data(f.emitidaEm)}</td>
                    <td style={tdStyle}>{data(f.vencimento)}</td>
                    <td style={tdStyle}>{RS(f.total)}</td>
                    <td style={tdL}><EtiquetaFatura f={f} /></td>
                    <td style={tdStyle}>{f.pagaEm ? `${data(f.pagaEm)} · ${RS(f.valorPago ?? 0)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
