// Detalhamento técnico da proposta (páginas depois do folheto), com a identidade visual do folheto
// Kora: topo com a foto, títulos em Arial Black marinho/ciano, tabelas com cabeçalho marinho e o mesmo rodapé.
// Só o que é do cliente: margem da Kora, gerador e vendedor não aparecem.
import type React from 'react';
import { CORPO, K, PRETO, RodapeKora, type DadosFolheto } from './FolhetoKora';
import { DATA, MES, PCT, R, ROTULO_POSTO, RS } from './formato';
import type { ParametrosOperacao, ResultadoOperacao } from './lib/operacao';
import type { Entrada, Resultado } from './types';
import topo from './assets/proposta/topo.jpg';
import logo from './assets/proposta/logo.png';

const thS: React.CSSProperties = { background: K.marinho, color: '#fff', fontWeight: 700, fontSize: '8.5pt', padding: '2mm 2.5mm', textAlign: 'right' };
const thE: React.CSSProperties = { ...thS, textAlign: 'left' };
const tdS: React.CSSProperties = { padding: '1.8mm 2.5mm', fontSize: '9.5pt', textAlign: 'right', borderBottom: `1px solid ${K.cinza}` };
const tdE: React.CSSProperties = { ...tdS, textAlign: 'left', fontWeight: 600 };
const totS: React.CSSProperties = { ...tdS, background: K.cinza, fontWeight: 700, borderBottom: 'none' };
const totE: React.CSSProperties = { ...totS, textAlign: 'left' };

function Secao({ titulo, destaque, children }: { titulo: string; destaque: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '7mm', breakInside: 'avoid' }}>
      <div style={{ borderLeft: `1.6mm solid ${K.marinho}`, borderRadius: '0.8mm', paddingLeft: '3.5mm', fontFamily: PRETO, fontSize: '14pt', lineHeight: 1.2, marginBottom: '3.5mm' }}>
        {titulo} <span style={{ color: K.ciano }}>{destaque}</span>
      </div>
      {children}
    </section>
  );
}

function Linha({ label, value, forte }: { label: string; value: string; forte?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4mm', padding: '1.8mm 0', borderBottom: `1px solid ${K.cinza}`, fontSize: '10pt' }}>
      <span style={{ color: forte ? K.texto : '#444' }}>{label}</span>
      <span style={{ fontWeight: forte ? 700 : 600, color: forte ? K.marinho : K.texto, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Destaque({ label, value, sub, fundo, cor = '#fff' }: { label: string; value: string; sub: string; fundo: string; cor?: string }) {
  return (
    <div style={{ background: fundo, color: cor, borderRadius: '2mm', padding: '3.5mm 4mm' }}>
      <div style={{ fontSize: '8.5pt', opacity: 0.85 }}>{label}</div>
      <div style={{ fontFamily: PRETO, fontSize: '15pt', margin: '1mm 0' }}>{value}</div>
      <div style={{ fontSize: '8pt', opacity: 0.85 }}>{sub}</div>
    </div>
  );
}

export function DetalhamentoKora({ r, op, p, entrada, dados, identificacao, emitidaEm }: {
  r: Resultado; op: ResultadoOperacao; p: ParametrosOperacao; entrada: Entrada;
  dados: DadosFolheto & { validadeDias: number };
  identificacao?: string;
  /** Data da revisão salva; sem ela, hoje. */
  emitidaEm?: Date;
}) {
  const hoje = emitidaEm ?? new Date();
  const validade = new Date(hoje.getTime() + dados.validadeDias * 86400000);
  const dataBR = (d: Date) => d.toLocaleDateString('pt-BR');
  const grupoA = r.postos.length > 1;
  const converte = grupoA && entrada.converterPostos !== false;

  // 1º mês da operação: tarifa do ano de início, sem reajuste projetado.
  const m1 = op.meses[0];
  const semKora = r.valorAtual;
  const kora = m1.faturaGeracao;
  const distribuidora = semKora - m1.desconto - kora;
  const comKora = distribuidora + kora;
  const ultimo = op.meses[op.meses.length - 1];

  return (
    <div className="detalhamento" style={{ width: '210mm', margin: '0 auto', background: '#fff', color: K.texto, fontFamily: CORPO }}>
      <div className="detalhamento-corpo" style={{ padding: '12mm 14mm 4mm' }}>
        {/* Topo: faixa com a foto, como no folheto */}
        <div style={{ position: 'relative', height: '30mm', borderRadius: '2mm', overflow: 'hidden', marginBottom: '8mm', background: `linear-gradient(90deg, rgba(7,20,40,.92) 0%, rgba(7,20,40,.7) 55%, rgba(7,20,40,.15) 85%), url(${topo}) center 55% / cover` }}>
          <img src={logo} alt="Kora" style={{ position: 'absolute', right: '4mm', top: '2mm', width: '34mm' }} />
          <div style={{ position: 'absolute', left: '6mm', top: '5mm', right: '45mm', color: '#fff' }}>
            <div style={{ fontFamily: PRETO, fontSize: '17pt', lineHeight: 1.15 }}>Detalhamento <span style={{ color: K.ciano }}>técnico</span></div>
            <div style={{ fontSize: '9.5pt', marginTop: '1.5mm', lineHeight: 1.45 }}>
              <span style={{ color: K.ciano }}>Cliente:</span> <b>{dados.cliente || '—'}</b>{dados.cnpj && <> (CNPJ: {dados.cnpj})</>}<br />
              {identificacao && <><span style={{ color: K.ciano }}>Proposta</span> {identificacao} · </>}
              <span style={{ color: K.ciano }}>Emitida em</span> {dataBR(hoje)} · <span style={{ color: K.ciano }}>válida até</span> {dataBR(validade)}
            </div>
          </div>
        </div>

        <Secao titulo="Dados do" destaque="cliente">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '8mm' }}>
            <Linha label="Cliente" value={dados.cliente || '—'} />
            <Linha label="Unidade consumidora" value={dados.uc || '—'} />
            <Linha label="Distribuidora" value={`${entrada.distribuidora} (${r.estado})`} />
            <Linha label="Grupo / subgrupo / modalidade" value={`Grupo ${grupoA ? 'A' : 'B'} · ${entrada.subgrupo} · ${entrada.modalidadeTarifaria}`} />
          </div>
        </Secao>

        <Secao titulo="Consumo e" destaque="fatura atual (mensal)">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thE}>Posto</th><th style={thS}>Consumo (kWh/mês)</th><th style={thS}>Tarifa c/ impostos (R$/kWh)</th><th style={thS}>Valor (R$/mês)</th>
            </tr></thead>
            <tbody>
              {r.postos.map((l) => (
                <tr key={l.posto}>
                  <td style={tdE}>{ROTULO_POSTO[l.posto]}</td>
                  <td style={tdS}>{R(l.kWh)}</td>
                  <td style={tdS}>{R((l.teCheia + l.tusdCheia) / 1000, 4)}</td>
                  <td style={tdS}>{RS(l.valorAtual)}</td>
                </tr>
              ))}
              <tr>
                <td style={totE}>Total</td><td style={totS}>{R(r.consumoTotalKWh)}</td>
                <td style={totS}>{R(r.tarifaMediaCliente, 4)}</td><td style={totS}>{RS(r.valorAtual)}</td>
              </tr>
            </tbody>
          </table>
        </Secao>

        <Secao titulo="Sua fatura" destaque="sem e com a Kora (1º mês)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4mm', marginBottom: '4mm' }}>
            <Destaque label="Fatura sem Kora" value={RS(semKora)} sub="só distribuidora" fundo={K.cinza} cor={K.texto} />
            <Destaque label="Fatura com Kora" value={RS(comKora)} sub={`${RS(distribuidora)} distribuidora + ${RS(kora)} Kora`} fundo={K.marinho} />
            <Destaque label="Economia mensal" value={RS(m1.desconto)} sub={`${PCT(semKora > 0 ? m1.desconto / semKora : 0)} da fatura atual`} fundo={K.ciano} />
          </div>
          <Linha label="Fatura da distribuidora (com créditos compensados)" value={RS(distribuidora)} />
          <Linha label="Fatura Kora (créditos de energia)" value={RS(kora)} />
          <Linha label="Total com Kora" value={RS(comKora)} forte />
          <Linha label="Consumo compensado pelos créditos" value={`${R(m1.compensadoKWh)} de ${R(r.consumoTotalKWh)} kWh/mês`} />
          <Linha label="Desconto contratado sobre a energia compensada" value={PCT(r.economiaClientePct)} />
        </Secao>

        <Secao titulo="Condições do" destaque="contrato">
          <Linha label="Crédito de energia contratado" value={`${R(p.creditoTotalKWh)} kWh`} />
          <Linha label="Tempo de contrato" value={`${op.meses.length} meses (${MES(m1.mes)} a ${MES(ultimo.mes)})`} />
          <Linha label="Valor estimado do contrato (pago à Kora)" value={RS(op.total.faturaGeracao)} forte />
          <Linha label="Valor médio mensal" value={RS(op.total.faturaGeracao / op.meses.length)} />
          <Linha label="Economia estimada no contrato" value={RS(op.total.desconto)} forte />
          <Linha label="Reajuste tarifário anual considerado" value={PCT(p.reajusteAnualPct)} />
        </Secao>

        <Secao titulo="Projeção" destaque="por ano">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thE}>Ano</th><th style={thS}>Meses</th><th style={thS}>Consumo compensado (kWh)</th><th style={thS}>Pago à Kora</th><th style={thS}>Economia</th>
            </tr></thead>
            <tbody>
              {op.anos.map((a) => (
                <tr key={a.ano}>
                  <td style={tdE}>{a.ano}</td><td style={tdS}>{a.meses}</td>
                  <td style={tdS}>{R(a.compensadoKWh)}</td><td style={tdS}>{RS(a.faturaGeracao)}</td><td style={tdS}>{RS(a.desconto)}</td>
                </tr>
              ))}
              <tr>
                <td style={totE}>Total</td><td style={totS}>{op.total.meses}</td><td style={totS}>{R(op.total.compensadoKWh)}</td>
                <td style={totS}>{RS(op.total.faturaGeracao)}</td><td style={totS}>{RS(op.total.desconto)}</td>
              </tr>
            </tbody>
          </table>
        </Secao>

        <Secao titulo="Premissas" destaque="do estudo">
          <ul style={{ paddingLeft: '5mm', fontSize: '8.5pt', color: '#444', lineHeight: 1.6 }}>
            <li>Tarifas homologadas pela ANEEL para {entrada.distribuidora} ({r.postos[0].resolucao.toLowerCase()}, vigência desde {DATA(r.postos[0].inicioVigencia)}), com ICMS {PCT(entrada.icms)} e PIS/COFINS {PCT(entrada.pis + entrada.cofins)}.</li>
            <li>Valores estimados de energia (TE + TUSD). Não incluem demanda contratada, bandeiras tarifárias, iluminação pública, multas e outros itens da fatura.</li>
            {converte && (
              <li>Os créditos compensam primeiro o consumo Fora Ponta. Na Ponta, conforme a REN ANEEL 1.000/2021, cada kWh consome {R(r.fatorPonta, 4)} kWh de crédito (relação entre as tarifas de energia Ponta e Fora Ponta).</li>
            )}
            <li>Projeção com reajuste tarifário de {PCT(p.reajusteAnualPct)} ao ano a partir do 2º ano; os valores reais seguem os reajustes homologados pela ANEEL.</li>
            <li>A distribuidora continua responsável pelo fornecimento; a fatura da distribuidora segue com a parcela não compensável.</li>
            <li>Geração distribuída conforme REN ANEEL 1.000/2021 e Lei 14.300/2022.</li>
          </ul>
        </Secao>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12mm', margin: '14mm 0 8mm', fontSize: '9.5pt', textAlign: 'center', breakInside: 'avoid' }}>
          <div style={{ borderTop: `1px solid ${K.marinho}`, paddingTop: '1.5mm', fontWeight: 700, color: K.marinho }}>Kora</div>
          <div style={{ borderTop: `1px solid ${K.marinho}`, paddingTop: '1.5mm' }}>{dados.cliente || 'Cliente'}</div>
        </div>
      </div>
      <div style={{ breakInside: 'avoid' }}><RodapeKora /></div>
    </div>
  );
}
