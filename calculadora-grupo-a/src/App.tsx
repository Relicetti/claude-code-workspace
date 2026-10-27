import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  calcular, descontoPadrao, DISTRIBUIDORAS, grupoDoSubgrupo, IMPOSTOS_PADRAO, modalidadesDoGrupo,
  postosDoGrupo, SUBGRUPOS,
} from './lib/engine';
import { FolhetoKora } from './FolhetoKora';
import { prazoPeloConsumo, simularOperacao, type ParametrosOperacao, type ResultadoOperacao } from './lib/operacao';
import type {
  DadosTarifarios, Enquadramento, Entrada, Fonte, Grupo, ModalidadeGD, ModalidadeTarifaria, Posto, Resultado,
} from './types';

// ── PALETA (mesma da calculadora-parceria) ───────────────────────────────────
const C = {
  azul: '#2a78d6', azulC: '#e6f1fb',
  verde: '#1baf7a', verdeC: '#eaf3de',
  amber: '#eda100', amberC: '#faeeda',
  verm: '#e34948', vermC: '#fcebeb',
  esc: '#2c2c2a', med: '#5f5e5a',
  clar: '#f4f3ed', bord: '#d3d1c7',
};

const R = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const RS = (n: number) => `R$ ${R(n, 2)}`;
const RKWH = (n: number) => `R$ ${R(n, 4)}/kWh`;
const PCT = (n: number) => (Number.isFinite(n) ? `${R(n * 100, 1)}%` : '—');
const DATA = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

const ROTULO_POSTO: Record<Posto, string> = { Ponta: 'Ponta', 'Fora ponta': 'Fora Ponta', 'Não se aplica': 'Consumo' };

const DEFAULT_DISTRIBUIDORA = DISTRIBUIDORAS.includes('Copel-DIS') ? 'Copel-DIS' : DISTRIBUIDORAS[0];
const DEFAULT_ENTRADA: Entrada = {
  distribuidora: DEFAULT_DISTRIBUIDORA,
  ano: new Date().getFullYear(),
  subgrupo: 'A4',
  modalidadeTarifaria: 'Verde',
  consumo: { Ponta: 2000, 'Fora ponta': 18000, 'Não se aplica': 20000 },
  ...IMPOSTOS_PADRAO,
  enquadramento: 'GD1',
  modalidadeGD: 'Geração Compartilhada',
  fonte: 'Solar',
  descontoPct: descontoPadrao(DEFAULT_DISTRIBUIDORA),
  desagioPct: 0.1,
  converterPostos: true,
};

const proximoMes = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const DEFAULT_OPERACAO: ParametrosOperacao = {
  creditoTotalKWh: 480000, prazoMeses: 24, mesInicio: proximoMes(), reajusteAnualPct: 0,
};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;

// ── COMPONENTES ──────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color = C.azul, bg = C.azulC, destaque = false }: {
  label: string; value: string; sub?: string; color?: string; bg?: string; destaque?: boolean;
}) {
  if (destaque) {
    return (
      <div style={{ background: color, borderRadius: 10, padding: '18px 20px', boxShadow: `0 6px 16px ${color}66` }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1.15 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', marginTop: 5 }}>{sub}</div>}
      </div>
    );
  }
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: C.med, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.med, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children, color = C.azul }: { title: string; children: React.ReactNode; color?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        background: color, color: '#fff', borderRadius: 6, padding: '6px 12px',
        fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12,
      }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: C.med, marginBottom: 4 }}>{label}</label>
      {children}
      {help && <div style={{ fontSize: 10, color: C.med, marginTop: 2 }}>{help}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.bord}`,
  fontSize: 13, background: '#fff', color: C.esc,
};

function Select<T extends string | number>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: readonly T[];
}) {
  return (
    <select style={inputStyle} value={value}
      onChange={(e) => onChange((typeof value === 'number' ? Number(e.target.value) : e.target.value) as T)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** Inteiro com separador de milhar (ex: 15.000). */
function KWhField({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  return (
    <input type="text" inputMode="numeric" style={inputStyle}
      value={value === undefined ? '' : value.toLocaleString('pt-BR')}
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '') || 0))} />
  );
}

function PercentField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input type="number" step="0.01" style={inputStyle}
      value={Number((value * 100).toFixed(6))}
      onChange={(e) => onChange(Number(e.target.value) / 100)} />
  );
}

function Duas({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;
}

/** Combobox em React puro — o <datalist> nativo não abre direito no Safari
 * (mesmo componente da calculadora-parceria). */
function ComboBox({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  const [aberto, setAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtradas = useMemo(() => {
    const termo = value.trim().toLowerCase();
    const lista = termo ? options.filter((o) => o.toLowerCase().includes(termo)) : options;
    return lista.slice(0, 30);
  }, [value, options]);

  useEffect(() => {
    const aoClicarFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        style={inputStyle} value={value}
        onChange={(e) => { onChange(e.target.value); setAberto(true); setIndiceAtivo(0); }}
        onFocus={(e) => { e.target.select(); setAberto(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setIndiceAtivo((i) => Math.min(i + 1, filtradas.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIndiceAtivo((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter') { if (aberto && filtradas[indiceAtivo]) { e.preventDefault(); onChange(filtradas[indiceAtivo]); setAberto(false); } }
          else if (e.key === 'Escape') { setAberto(false); }
        }}
      />
      {aberto && filtradas.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: `1px solid ${C.bord}`, borderRadius: 6, maxHeight: 240,
          overflowY: 'auto', boxShadow: '0 8px 20px rgba(0,0,0,0.12)', listStyle: 'none', padding: 4,
        }}>
          {filtradas.map((op, i) => (
            <li key={op}
              onMouseDown={(e) => { e.preventDefault(); onChange(op); setAberto(false); }}
              onMouseEnter={() => setIndiceAtivo(i)}
              style={{ padding: '6px 8px', borderRadius: 4, fontSize: 13, cursor: 'pointer', background: i === indiceAtivo ? C.azulC : 'transparent' }}>
              {op}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontSize: 11, color: C.med, fontWeight: 600, borderBottom: `1px solid ${C.bord}` };
const tdStyle: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontSize: 12, borderBottom: `1px solid ${C.clar}` };

function Linha({ label, value, forte }: { label: string; value: string; forte?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.clar}`, fontSize: 13, fontWeight: forte ? 700 : 400 }}>
      <span style={{ color: forte ? C.esc : C.med }}>{label}</span><span>{value}</span>
    </div>
  );
}

// ── ATUALIZAÇÃO ANEEL ────────────────────────────────────────────────────────
function BotaoAtualizarAneel({ onConcluido }: { onConcluido: () => void }) {
  const [rodando, setRodando] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(async () => {
      const p = await fetch('/api/tarifas/progresso').then((r) => r.json());
      if (p.sincronizando) { setStatus(p.descricao ?? 'Atualizando…'); return; }
      setRodando(false);
      setStatus(p.erro ? `Falhou: ${p.erro}` : 'Tarifas atualizadas.');
      if (!p.erro) onConcluido();
    }, 1500);
    return () => clearInterval(t);
  }, [rodando, onConcluido]);

  const iniciar = async () => {
    const res = await fetch('/api/tarifas/atualizar', { method: 'POST' });
    if (res.status === 202 || res.status === 409) { setRodando(true); setStatus('Iniciando…'); }
    else setStatus('Não foi possível iniciar a atualização.');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {status && <span style={{ fontSize: 11, color: C.med, maxWidth: 320 }}>{status}</span>}
      <button onClick={iniciar} disabled={rodando} className="no-print"
        style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: rodando ? C.bord : C.azul, color: '#fff', fontSize: 12, fontWeight: 600, cursor: rodando ? 'default' : 'pointer' }}>
        {rodando ? 'Atualizando…' : 'Atualizar tarifas (ANEEL)'}
      </button>
    </div>
  );
}

// ── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [dados, setDados] = useState<DadosTarifarios | null>(null);
  const [erroDados, setErroDados] = useState<string | null>(null);
  const [entradaBase, setEntrada] = useState<Entrada>(DEFAULT_ENTRADA);
  const [operacao, setOperacao] = useState<ParametrosOperacao>(DEFAULT_OPERACAO);
  const [proposta, setProposta] = useState<DadosProposta>({ cliente: '', cnpj: '', uc: '', validadeDias: 15, observacao: OBS_PADRAO, detalhamento: false });
  const [verProposta, setVerProposta] = useState(false);
  // O ano das tarifas sai do mês de início da operação.
  const entrada = useMemo(() => ({ ...entradaBase, ano: Number(operacao.mesInicio.slice(0, 4)) }), [entradaBase, operacao.mesInicio]);
  const setOp = <K extends keyof ParametrosOperacao>(k: K, v: ParametrosOperacao[K]) => setOperacao((o) => ({ ...o, [k]: v }));

  const carregarDados = useMemo(() => () => {
    fetch('/api/dados').then((r) => r.json()).then(setDados).catch((e) => setErroDados(String(e)));
  }, []);
  useEffect(carregarDados, [carregarDados]);

  const set = <K extends keyof Entrada>(k: K, v: Entrada[K]) => setEntrada((e) => ({ ...e, [k]: v }));
  const grupo = grupoDoSubgrupo(entrada.subgrupo);

  const trocarGrupo = (g: Grupo) => {
    if (g === grupo) return;
    setEntrada((e) => ({ ...e, subgrupo: g === 'A' ? 'A4' : 'B3', modalidadeTarifaria: modalidadesDoGrupo(g)[0] }));
  };
  // Ao trocar para "valor do dono do crédito", começa do valor que o deságio atual dá — assim
  // o resultado não pula na hora da troca.
  const trocarModoRemuneracao = (modo: 'desagio' | 'preco') => {
    if (modo === 'desagio') { set('precoGeradorKWh', undefined); return; }
    if (entrada.precoGeradorKWh !== undefined) return;
    const atual = calculo && 'r' in calculo ? calculo.r.tarifaMediaGerador : 0;
    set('precoGeradorKWh', Number(atual.toFixed(4)));
  };
  // Mesma ideia para a comissão: a troca de unidade converte o valor atual, sem mudar o resultado.
  const trocarModoComissao = (modo: 'kwh' | 'pct') => {
    if ((modo === 'pct') === (entrada.vendedorPct !== undefined)) return;
    const r = calculo && 'r' in calculo ? calculo.r : undefined;
    if (modo === 'kwh') {
      setEntrada((e) => ({ ...e, vendedorPct: undefined, vendedorKWh: Number((r?.tarifaMediaVendedor ?? 0).toFixed(4)) }));
    } else {
      const pct = r && r.faturaGeracao !== 0 ? r.valorVendedor / r.faturaGeracao : 0;
      set('vendedorPct', Number(pct.toFixed(4)));
    }
  };
  const trocarDistribuidora = (d: string) => {
    setEntrada((e) => ({ ...e, distribuidora: d, ...(DISTRIBUIDORAS.includes(d) ? { descontoPct: descontoPadrao(d) } : {}) }));
  };

  const calculo = useMemo((): { r: Resultado } | { erro: string } | null => {
    if (!dados) return null;
    if (!DISTRIBUIDORAS.includes(entrada.distribuidora)) return { erro: 'Selecione uma distribuidora da lista.' };
    try { return { r: calcular(entrada, dados) }; } catch (e) { return { erro: (e as Error).message }; }
  }, [entrada, dados]);

  const simulacao = useMemo((): { op: ResultadoOperacao } | { erro: string } | null => {
    if (!dados || !calculo || 'erro' in calculo) return null;
    try { return { op: simularOperacao(entrada, dados, operacao) }; } catch (e) { return { erro: (e as Error).message }; }
  }, [entrada, dados, operacao, calculo]);
  const consumoMensal = postosDoGrupo(grupo).reduce((s, p) => s + (entrada.consumo[p] ?? 0), 0);
  const rCalc = calculo && 'r' in calculo ? calculo.r : undefined;
  const opCalc = simulacao && 'op' in simulacao ? simulacao.op : undefined;
  const converte = grupo === 'A' && entrada.converterPostos !== false;

  if (verProposta && calculo && 'r' in calculo && simulacao && 'op' in simulacao) {
    return (
      <PropostaView r={calculo.r} op={simulacao.op} p={operacao} entrada={entrada}
        dados={proposta} onDados={setProposta} onVoltar={() => setVerProposta(false)} />
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: '#fff', borderBottom: `1px solid ${C.bord}`, padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Calculadora GD — Grupo A e B</div>
          <div style={{ fontSize: 11, color: C.med }}>
            Venda de créditos de GD · tarifas ANEEL {dados?.atualizadoEm ? `atualizadas em ${DATA(dados.atualizadoEm)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <BotaoAtualizarAneel onConcluido={carregarDados} />
          <button onClick={() => { setVerProposta(true); window.scrollTo(0, 0); }} className="no-print"
            disabled={!(simulacao && 'op' in simulacao)} title={simulacao && 'op' in simulacao ? '' : 'Corrija a simulação para gerar a proposta'}
            style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: C.verde, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: simulacao && 'op' in simulacao ? 1 : 0.5 }}>
            Proposta ao cliente
          </button>
          <button onClick={() => window.print()} className="no-print"
            style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${C.bord}`, background: '#fff', fontSize: 12, cursor: 'pointer' }}>
            Imprimir / PDF
          </button>
        </div>
      </header>

      <main className="layout" style={{ padding: 24, display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 24, alignItems: 'start' }}>
        <aside style={{ background: '#fff', borderRadius: 10, padding: 18 }}>
          <Section title="1. Unidade consumidora">
            <Field label="Distribuidora">
              <ComboBox value={entrada.distribuidora} onChange={trocarDistribuidora} options={DISTRIBUIDORAS} />
            </Field>
            <Field label="Grupo tarifário">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {(['A', 'B'] as Grupo[]).map((g) => (
                  <button key={g} onClick={() => trocarGrupo(g)} style={{
                    padding: '8px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${g === grupo ? C.azul : C.bord}`, background: g === grupo ? C.azulC : '#fff', color: g === grupo ? C.azul : C.med,
                  }}>Grupo {g}</button>
                ))}
              </div>
            </Field>
            <Duas>
              <Field label="Subgrupo">
                <Select value={entrada.subgrupo} onChange={(v) => set('subgrupo', v)} options={SUBGRUPOS[grupo]} />
              </Field>
              <Field label="Modalidade tarifária">
                <Select value={entrada.modalidadeTarifaria} onChange={(v) => set('modalidadeTarifaria', v as ModalidadeTarifaria)} options={modalidadesDoGrupo(grupo)} />
              </Field>
            </Duas>
          </Section>

          <Section title="2. Consumo mensal (kWh)">
            <Duas>
              {postosDoGrupo(grupo).map((p) => (
                <Field key={p} label={ROTULO_POSTO[p]}>
                  <KWhField value={entrada.consumo[p]} onChange={(v) => set('consumo', { ...entrada.consumo, [p]: v })} />
                </Field>
              ))}
            </Duas>
          </Section>

          <Section title="3. Crédito comprado" color={C.verde}>
            <Field label="Total de crédito (kWh)">
              <KWhField value={operacao.creditoTotalKWh} onChange={(v) => setOp('creditoTotalKWh', v)} />
            </Field>
            <Duas>
              <Field label="Prazo de consumo (meses)">
                <input type="number" min="1" step="1" style={inputStyle} value={operacao.prazoMeses || ''}
                  onChange={(e) => setOp('prazoMeses', Number(e.target.value))} />
              </Field>
              <Field label="Início do abatimento">
                <input type="month" style={inputStyle} value={operacao.mesInicio}
                  onChange={(e) => e.target.value && setOp('mesInicio', e.target.value)} />
              </Field>
            </Duas>
            <div style={{ fontSize: 11, color: C.med, marginTop: -4, marginBottom: 12, lineHeight: 1.5 }}>
              Abatimento: <b>{R(operacao.prazoMeses > 0 ? operacao.creditoTotalKWh / operacao.prazoMeses : 0)} kWh/mês</b> de consumo
              {' '}· cliente consome {R(consumoMensal)} kWh/mês.{' '}
              {converte && opCalc && opCalc.meses.length < Math.round(operacao.prazoMeses) && (
                <>Com a conversão da ponta o crédito acaba em <b>{opCalc.meses.length} meses</b>.{' '}</>
              )}
              {consumoMensal > 0 && (
                <button className="no-print" onClick={() => setOp('prazoMeses', prazoPeloConsumo(operacao.creditoTotalKWh, consumoMensal))}
                  style={{ border: 'none', background: 'none', color: C.azul, cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}>
                  Usar prazo pelo consumo ({prazoPeloConsumo(operacao.creditoTotalKWh, consumoMensal)} meses)
                </button>
              )}
            </div>
            {grupo === 'A' && (
              <div style={{ background: C.clar, borderRadius: 6, padding: '8px 10px', marginBottom: 12, fontSize: 11, lineHeight: 1.5 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={entrada.converterPostos !== false}
                    onChange={(e) => set('converterPostos', e.target.checked)} />
                  Converter crédito Fora Ponta → Ponta
                </label>
                {rCalc && (
                  <div style={{ color: C.med, marginTop: 4 }}>
                    Fator TE Ponta ÷ TE Fora Ponta ({entrada.ano}):{' '}
                    <b style={{ color: C.esc }}>{R(rCalc.postos.find((l) => l.posto === 'Ponta')!.te / rCalc.postos.find((l) => l.posto === 'Fora ponta')!.te, 5)}</b>
                    {' '}({R(rCalc.postos.find((l) => l.posto === 'Ponta')!.te, 2)} ÷ {R(rCalc.postos.find((l) => l.posto === 'Fora ponta')!.te, 2)} R$/MWh)
                    {entrada.converterPostos !== false
                      ? <> — cada kWh na ponta gasta {R(rCalc.fatorPonta, 5)} kWh de crédito (o consumo todo gasta {R(rCalc.saldoDebitadoKWh)} kWh/mês). O valor do dono do crédito não muda; o crédito só acaba antes.</>
                      : <> — desligado: 1 kWh de crédito cobre 1 kWh na ponta.</>}
                  </div>
                )}
              </div>
            )}
            <Field label="Reajuste tarifário anual projetado (%)" help="Aplicado a partir do 2º ano. A tarifa ANEEL atual já entra no 1º ano.">
              <PercentField value={operacao.reajusteAnualPct} onChange={(v) => setOp('reajusteAnualPct', v)} />
            </Field>
          </Section>

          <Section title="4. Crédito GD (origem)" color={C.verde}>
            <Duas>
              <Field label="Enquadramento">
                <Select value={entrada.enquadramento} onChange={(v) => set('enquadramento', v as Enquadramento)} options={['GD1', 'GD2', 'GD3']} />
              </Field>
              <Field label="Fonte">
                <Select value={entrada.fonte} onChange={(v) => set('fonte', v as Fonte)} options={['Solar', 'Outras']} />
              </Field>
            </Duas>
            <Field label="Modalidade GD">
              <Select value={entrada.modalidadeGD} onChange={(v) => set('modalidadeGD', v as ModalidadeGD)} options={['Geração Compartilhada', 'Autoconsumo']} />
            </Field>
          </Section>

          <Section title="5. Impostos" color={C.med}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Field label="ICMS (%)"><PercentField value={entrada.icms} onChange={(v) => set('icms', v)} /></Field>
              <Field label="PIS (%)"><PercentField value={entrada.pis} onChange={(v) => set('pis', v)} /></Field>
              <Field label="COFINS (%)"><PercentField value={entrada.cofins} onChange={(v) => set('cofins', v)} /></Field>
            </div>
            <div style={{ fontSize: 10, color: C.med, marginTop: -6 }}>Confira na fatura do cliente — variam por estado e por mês.</div>
          </Section>

          <Section title="6. Regras comerciais" color={C.amber}>
            <Field label="Desconto ao cliente (%)"><PercentField value={entrada.descontoPct} onChange={(v) => set('descontoPct', v)} /></Field>
            <Field label="Definir a remuneração por">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {([['desagio', 'Deságio Kora (%)'], ['preco', 'Valor do dono do crédito']] as const).map(([modo, rotulo]) => {
                  const ativo = (modo === 'preco') === (entrada.precoGeradorKWh !== undefined);
                  return (
                    <button key={modo} onClick={() => trocarModoRemuneracao(modo)} style={{
                      padding: '7px 6px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${ativo ? C.amber : C.bord}`, background: ativo ? C.amberC : '#fff', color: ativo ? C.esc : C.med,
                    }}>{rotulo}</button>
                  );
                })}
              </div>
            </Field>
            {entrada.precoGeradorKWh === undefined ? (
              <Field label="Deságio Kora (%)" help="% da fatura de geração que fica com a Kora.">
                <PercentField value={entrada.desagioPct} onChange={(v) => set('desagioPct', v)} />
              </Field>
            ) : (
              <Field label="Valor pago ao dono do crédito (R$/kWh)" help="Por kWh compensado. A Kora fica com o que sobrar da fatura de geração.">
                <input type="number" step="0.0001" min="0" style={inputStyle} value={entrada.precoGeradorKWh}
                  onChange={(e) => set('precoGeradorKWh', Number(e.target.value))} />
              </Field>
            )}
            <Field label="Comissão do vendedor em">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {([['kwh', 'R$/kWh'], ['pct', '% da fatura de geração']] as const).map(([modo, rotulo]) => {
                  const ativo = (modo === 'pct') === (entrada.vendedorPct !== undefined);
                  return (
                    <button key={modo} onClick={() => trocarModoComissao(modo)} style={{
                      padding: '7px 6px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${ativo ? C.amber : C.bord}`, background: ativo ? C.amberC : '#fff', color: ativo ? C.esc : C.med,
                    }}>{rotulo}</button>
                  );
                })}
              </div>
            </Field>
            {entrada.vendedorPct === undefined ? (
              <Field label="Comissão do vendedor (R$/kWh)" help="Valor fixo por kWh compensado, tirado da parte da Kora.">
                <input type="number" step="0.0001" min="0" style={inputStyle} value={entrada.vendedorKWh ?? 0}
                  onChange={(e) => set('vendedorKWh', Number(e.target.value))} />
              </Field>
            ) : (
              <Field label="Comissão do vendedor (%)" help="% sobre o valor total da fatura de geração (o que o cliente paga pelos créditos), tirado da parte da Kora.">
                <PercentField value={entrada.vendedorPct} onChange={(v) => set('vendedorPct', v)} />
              </Field>
            )}
            {rCalc && rCalc.valorVendedor > 0 && (
              <div style={{ fontSize: 11, color: C.med, marginTop: -4, lineHeight: 1.5 }}>
                Vendedor: <b>{RS(rCalc.valorVendedor)}/mês</b> = {RKWH(rCalc.tarifaMediaVendedor)} ={' '}
                {PCT(rCalc.faturaGeracao !== 0 ? rCalc.valorVendedor / rCalc.faturaGeracao : 0)} da fatura de geração ({RS(rCalc.faturaGeracao)}/mês)
              </div>
            )}
          </Section>
        </aside>

        <section>
          {erroDados && <Aviso>Não foi possível carregar as tarifas: {erroDados}</Aviso>}
          {!dados && !erroDados && <div style={{ color: C.med }}>Carregando tarifas…</div>}
          {calculo && 'erro' in calculo && <Aviso>{calculo.erro}</Aviso>}
          {simulacao && 'erro' in simulacao && <div style={{ marginBottom: 16 }}><Aviso>{simulacao.erro}</Aviso></div>}
          {calculo && 'r' in calculo && <ComposicaoKWh r={calculo.r} />}
          {simulacao && 'op' in simulacao && <OperacaoView op={simulacao.op} p={operacao} />}
          {calculo && 'r' in calculo && <Resultados r={calculo.r} entrada={entrada} />}
        </section>
      </main>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.vermC, color: C.verm, borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>{children}</div>;
}

// As quatro partes do kWh que o cliente paga, lado a lado — o quadro que a equipe usa para explicar a operação.
function ComposicaoKWh({ r }: { r: Resultado }) {
  const partes = [
    { rotulo: 'Gerador (dono do crédito)', valor: r.tarifaMediaGerador, mes: r.valorGerador, cor: C.verde },
    { rotulo: 'Distribuidora — TUSD Fio B / não compensado', valor: r.tarifaMediaCss, mes: r.valorCss, cor: C.med },
    { rotulo: 'Kora — nosso', valor: r.tarifaMediaKora, mes: r.valorKora, cor: C.amber },
    { rotulo: 'Kora — vendedor', valor: r.tarifaMediaVendedor, mes: r.valorVendedor, cor: '#b07a00' },
  ];
  const total = r.tarifaMediaFinal;
  const receitaKora = r.tarifaMediaKora + r.tarifaMediaVendedor;
  const celula: React.CSSProperties = { padding: '9px 8px', borderBottom: `1px solid ${C.clar}`, fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' };
  const linha = (rotulo: React.ReactNode, valor: number, mes: number, cor?: string, recuo = false, forte = false) => (
    <tr>
      <td style={{ ...celula, textAlign: 'left', paddingLeft: recuo ? 26 : 8, fontWeight: forte ? 700 : 500, whiteSpace: 'normal' }}>
        {cor && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: cor, marginRight: 8 }} />}
        {rotulo}
      </td>
      <td style={{ ...celula, fontWeight: forte ? 700 : 600, color: valor < 0 ? C.verm : C.esc }}>{RKWH(valor)}</td>
      <td style={{ ...celula, color: C.med }}>{total > 0 ? PCT(valor / total) : '—'}</td>
      <td style={{ ...celula, color: C.med }}>{RS(mes)}</td>
    </tr>
  );
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: 18, marginBottom: 20, border: `2px solid ${C.azul}` }}>
      <Section title="Composição do kWh — quanto custa cada parte">
        <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
          {partes.filter((p) => p.valor > 0).map((p) => (
            <div key={p.rotulo} title={`${p.rotulo}: ${RKWH(p.valor)}`} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} />
          ))}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thL}>Parte</th><th style={thStyle}>R$/kWh</th><th style={thStyle}>% do kWh</th><th style={thStyle}>R$/mês</th>
            </tr></thead>
            <tbody>
              {linha('1. Gerador (dono do crédito)', r.tarifaMediaGerador, r.valorGerador, C.verde)}
              {linha('2. Distribuidora — TUSD Fio B / parcela não compensada', r.tarifaMediaCss, r.valorCss, C.med)}
              {linha('3. Kora — receita', receitaKora, r.valorKora + r.valorVendedor, undefined, false, true)}
              {linha('Nosso', r.tarifaMediaKora, r.valorKora, C.amber, true)}
              {linha('Vendedor', r.tarifaMediaVendedor, r.valorVendedor, '#b07a00', true)}
              <tr>
                <td style={{ ...celula, textAlign: 'left', fontWeight: 700, fontSize: 14, borderTop: `2px solid ${C.bord}`, borderBottom: 'none' }}>4. Custo final do kWh para o cliente</td>
                <td style={{ ...celula, fontWeight: 700, fontSize: 15, color: C.azul, borderTop: `2px solid ${C.bord}`, borderBottom: 'none' }}>{RKWH(total)}</td>
                <td style={{ ...celula, borderTop: `2px solid ${C.bord}`, borderBottom: 'none' }}>100%</td>
                <td style={{ ...celula, fontWeight: 700, borderTop: `2px solid ${C.bord}`, borderBottom: 'none' }}>{RS(r.valorTotalComKora)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: C.med, marginTop: 10 }}>
          Sem a Kora o cliente paga {RKWH(r.tarifaMediaCliente)} à distribuidora — economia de {RKWH(r.tarifaMediaCliente - total)} ({PCT(r.economiaClientePct)}).
          Valores médios do perfil de consumo do cliente.
        </div>
      </Section>
    </div>
  );
}

function Resultados({ r, entrada }: { r: Resultado; entrada: Entrada }) {
  const sim = (b: boolean) => (b ? 'SIM' : 'NÃO');
  return (
    <>
      {r.valorKora < 0 && (
        <div style={{ marginBottom: 12 }}>
          <Aviso>O valor pago ao dono do crédito ({RKWH(r.tarifaMediaGerador)}) é maior que a fatura de geração ({RKWH(r.tarifaMediaGeracao)}): a Kora teria prejuízo de {RS(-r.valorKora)}/mês.</Aviso>
        </div>
      )}
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 4px' }}>Cálculo base — mês com o consumo todo compensado</h2>
      <div style={{ fontSize: 11, color: C.med, marginBottom: 12 }}>Valores por kWh que a operação acima aplica mês a mês (tarifa de {entrada.ano}).</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
        <KPICard destaque color={C.verde} label="Pago ao dono do crédito" value={RKWH(r.tarifaMediaGerador)} sub={`${RS(r.valorGerador)} / mês`} />
        <KPICard destaque color={C.azul} label="Fatura de geração (cliente)" value={RKWH(r.tarifaMediaGeracao)} sub={`${RS(r.faturaGeracao)} / mês`} />
        <KPICard destaque color={r.valorKora < 0 ? C.verm : C.amber} label="Margem Kora (nosso)" value={RS(r.valorKora)} sub={`${RKWH(r.tarifaMediaKora)} · vendedor ${RKWH(r.tarifaMediaVendedor)}`} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KPICard label="Fatura atual do cliente" value={RS(r.valorAtual)} sub={RKWH(r.tarifaMediaCliente)} />
        <KPICard label="Total com Kora" value={RS(r.valorTotalComKora)} sub="distribuidora + geração" />
        <KPICard label="Economia do cliente" value={RS(r.desconto)} sub={PCT(r.economiaClientePct)} color={C.verde} bg={C.verdeC} />
        <KPICard label="Residual à distribuidora" value={RS(r.valorCss)} sub="não compensável (CSS)" color={C.med} bg={C.clar} />
      </div>

      <div style={{ background: '#fff', borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <Section title="Tarifas por posto (R$/MWh)">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Posto</th>
                  <th style={thStyle}>kWh</th>
                  <th style={thStyle}>TE ANEEL</th>
                  <th style={thStyle}>TUSD ANEEL</th>
                  <th style={thStyle}>TE c/ impostos</th>
                  <th style={thStyle}>TUSD c/ impostos</th>
                  <th style={thStyle}>Fio B aplicado</th>
                  <th style={thStyle}>TE injetada</th>
                  <th style={thStyle}>TUSD injetada</th>
                  <th style={thStyle}>Valor atual</th>
                  <th style={thStyle}>Valor injetado</th>
                </tr>
              </thead>
              <tbody>
                {r.postos.map((p) => (
                  <tr key={p.posto}>
                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600 }}>{ROTULO_POSTO[p.posto]}</td>
                    <td style={tdStyle}>{R(p.kWh)}</td>
                    <td style={tdStyle}>{R(p.te, 2)}</td>
                    <td style={tdStyle}>{R(p.tusd, 2)}</td>
                    <td style={tdStyle}>{R(p.teCheia, 2)}</td>
                    <td style={tdStyle}>{R(p.tusdCheia, 2)}</td>
                    <td style={tdStyle}>{R(p.fioBAplicado, 2)}</td>
                    <td style={tdStyle}>{R(p.teInjetada, 2)}</td>
                    <td style={tdStyle}>{R(p.tusdInjetada, 2)}</td>
                    <td style={tdStyle}>{RS(p.valorAtual)}</td>
                    <td style={tdStyle}>{RS(p.valorInjetado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: C.med, marginTop: 8 }}>
            {r.agenteAneel} · vigência desde {DATA(r.postos[0].inicioVigencia)} · {r.postos[0].resolucao}
          </div>
        </Section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 18 }}>
          <Section title="Faturamento">
            <Linha label="Fatura atual (sem GD)" value={RS(r.valorAtual)} />
            <Linha label={`Desconto contratado (${PCT(entrada.descontoPct)})`} value={`− ${RS(r.desconto)}`} />
            <Linha label="Créditos injetados (valor)" value={RS(r.valorInjetado)} />
            <Linha label="Residual à distribuidora (CSS)" value={RS(r.valorCss)} />
            <Linha label="Fatura de geração" value={RS(r.faturaGeracao)} forte />
            <Linha label={`Kora + vendedor (${PCT(r.desagioEfetivoPct)})`} value={RS(r.valorKora + r.valorVendedor)} />
            <Linha label="Vendedor" value={RS(r.valorVendedor)} />
            <Linha label="Kora (nosso)" value={RS(r.valorKora)} />
            <Linha label="Dono do crédito" value={RS(r.valorGerador)} forte />
          </Section>
        </div>
        <div style={{ background: '#fff', borderRadius: 10, padding: 18 }}>
          <Section title="Premissas" color={C.med}>
            <Linha label="Estado" value={r.estado} />
            <Linha label="Isenção ICMS na TE" value={sim(r.isencoes.teIcms)} />
            <Linha label="Isenção PIS/COFINS na TE" value={sim(r.isencoes.tePisCofins)} />
            <Linha label="Isenção ICMS na TUSD" value={sim(r.isencoes.tusdIcms)} />
            <Linha label="Isenção PIS/COFINS na TUSD" value={sim(r.isencoes.tusdPisCofins)} />
            <Linha label="Rampa Fio B (GD2)" value={entrada.enquadramento === 'GD2' ? PCT(r.fioBRampaPct) : 'não se aplica'} />
            <Linha label="Tarifa média injetada" value={RKWH(r.tarifaMediaInjetada)} />
            {r.postos.length > 1 && (
              <Linha label="Fator Fora Ponta → Ponta" value={entrada.converterPostos !== false ? R(r.fatorPonta, 5) : 'desligado (1)'} />
            )}
            <Linha label="Crédito gasto no mês" value={`${R(r.saldoDebitadoKWh)} kWh`} />
          </Section>
        </div>
      </div>
    </>
  );
}

const thL: React.CSSProperties = { ...thStyle, textAlign: 'left' };
const tdL: React.CSSProperties = { ...tdStyle, textAlign: 'left' };

function OperacaoView({ op, p }: { op: ResultadoOperacao; p: ParametrosOperacao }) {
  const primeiro = op.meses[0];
  const primeiroAno = op.anos[0];
  const linhaTotal: React.CSSProperties = { ...tdStyle, fontWeight: 700, borderTop: `2px solid ${C.bord}` };
  return (
    <div style={{ marginBottom: 28 }}>
      {op.total.valorKora < 0 && (
        <div style={{ marginBottom: 12 }}><Aviso>Com esses parâmetros a Kora tem prejuízo de {RS(-op.total.valorKora)} na operação.</Aviso></div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
        <KPICard destaque color={C.verde} label="Desconto mensal ao cliente" value={RS(primeiro.desconto)} sub={`${RS(primeiroAno.desconto)} em ${primeiroAno.ano} · ${RS(op.total.desconto)} no total`} />
        <KPICard destaque color={C.azul} label="Renda mensal do gerador" value={RS(primeiro.valorGerador)} sub={`${RS(primeiroAno.valorGerador)} em ${primeiroAno.ano} · ${RS(op.total.valorGerador)} no total`} />
        <KPICard destaque color={op.total.valorKora < 0 ? C.verm : C.amber} label="Renda mensal Kora (nosso)" value={RS(primeiro.valorKora)} sub={`${RS(primeiroAno.valorKora)} em ${primeiroAno.ano} · ${RS(op.total.valorKora)} no total`} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KPICard label="Crédito total" value={`${R(p.creditoTotalKWh)} kWh`} sub={`${R(op.abatimentoMensalKWh)} kWh/mês`} color={C.esc} bg="#fff" />
        <KPICard label="Prazo" value={`${op.meses.length} meses`} sub={`${MES(op.meses[0].mes)} a ${MES(op.meses[op.meses.length - 1].mes)}`} color={C.esc} bg="#fff" />
        <KPICard label="Faturamento total (cliente → Kora)" value={RS(op.total.faturaGeracao)} sub="fatura de geração somada" color={C.esc} bg="#fff" />
      </div>

      <div style={{ background: '#fff', borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <Section title="Valores anuais" color={C.verde}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thL}>Ano</th><th style={thStyle}>Meses</th><th style={thStyle}>Crédito debitado (kWh)</th><th style={thStyle}>Consumo compensado (kWh)</th>
                <th style={thStyle}>Desconto cliente</th><th style={thStyle}>Fatura de geração</th>
                <th style={thStyle}>Gerador</th><th style={thStyle}>Vendedor</th><th style={thStyle}>Kora (nosso)</th>
              </tr></thead>
              <tbody>
                {op.anos.map((a) => (
                  <tr key={a.ano}>
                    <td style={{ ...tdL, fontWeight: 600 }}>{a.ano}</td><td style={tdStyle}>{a.meses}</td><td style={tdStyle}>{R(a.kWh)}</td><td style={tdStyle}>{R(a.compensadoKWh)}</td>
                    <td style={tdStyle}>{RS(a.desconto)}</td><td style={tdStyle}>{RS(a.faturaGeracao)}</td>
                    <td style={tdStyle}>{RS(a.valorGerador)}</td><td style={tdStyle}>{RS(a.valorVendedor)}</td><td style={tdStyle}>{RS(a.valorKora)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...linhaTotal, textAlign: 'left' }}>Total</td><td style={linhaTotal}>{op.total.meses}</td><td style={linhaTotal}>{R(op.total.kWh)}</td><td style={linhaTotal}>{R(op.total.compensadoKWh)}</td>
                  <td style={linhaTotal}>{RS(op.total.desconto)}</td><td style={linhaTotal}>{RS(op.total.faturaGeracao)}</td>
                  <td style={linhaTotal}>{RS(op.total.valorGerador)}</td><td style={linhaTotal}>{RS(op.total.valorVendedor)}</td><td style={linhaTotal}>{RS(op.total.valorKora)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.azul }}>Ver mês a mês ({op.meses.length} meses)</summary>
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thL}>Mês</th><th style={thStyle}>Crédito debitado (kWh)</th><th style={thStyle}>Consumo compensado (kWh)</th><th style={thStyle}>Saldo de crédito</th>
                <th style={thStyle}>Desconto cliente</th><th style={thStyle}>Fatura de geração</th>
                <th style={thStyle}>Gerador</th><th style={thStyle}>Vendedor</th><th style={thStyle}>Kora (nosso)</th>
              </tr></thead>
              <tbody>
                {op.meses.map((m) => (
                  <tr key={m.mes}>
                    <td style={tdL}>{MES(m.mes)}</td><td style={tdStyle}>{R(m.kWh)}</td><td style={tdStyle}>{R(m.compensadoKWh)}</td><td style={tdStyle}>{R(m.saldoFinalKWh)}</td>
                    <td style={tdStyle}>{RS(m.desconto)}</td><td style={tdStyle}>{RS(m.faturaGeracao)}</td>
                    <td style={tdStyle}>{RS(m.valorGerador)}</td><td style={tdStyle}>{RS(m.valorVendedor)}</td><td style={tdStyle}>{RS(m.valorKora)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}

// ── PROPOSTA COMERCIAL ───────────────────────────────────────────────────────
// Versão para o cliente final: só o que é dele (consumo, fatura sem/com Kora, economia, prazo,
// crédito e valor contratados). Margem da Kora, gerador e vendedor não aparecem.
// Página 1 é o folheto no molde do PPTX da Kora; o detalhamento técnico vem depois, opcional.

interface DadosProposta {
  cliente: string; cnpj: string; uc: string; validadeDias: number; observacao: string; detalhamento: boolean;
}

const OBS_PADRAO = 'Crédito será injetado total nas UCs.\nNecessário troca de titularidade das UCs para a Usina.';

function PropostaView({ r, op, p, entrada, dados, onDados, onVoltar }: {
  r: Resultado; op: ResultadoOperacao; p: ParametrosOperacao; entrada: Entrada;
  dados: DadosProposta; onDados: (d: DadosProposta) => void; onVoltar: () => void;
}) {
  const hoje = new Date();
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

  const box: React.CSSProperties = { border: `1px solid ${C.bord}`, borderRadius: 8, padding: 16, marginBottom: 18, breakInside: 'avoid' };
  const h2: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: C.verde, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 };
  const th: React.CSSProperties = { ...thStyle, background: C.clar };
  const thE: React.CSSProperties = { ...th, textAlign: 'left' };
  const campo: React.CSSProperties = { ...inputStyle, width: 'auto' };

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div className="no-print" style={{ background: C.clar, borderBottom: `1px solid ${C.bord}`, padding: '12px 24px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onVoltar} style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${C.bord}`, background: '#fff', fontSize: 12, cursor: 'pointer' }}>← Voltar à simulação</button>
        <input placeholder="Nome do cliente" style={{ ...campo, minWidth: 220 }} value={dados.cliente} onChange={(e) => onDados({ ...dados, cliente: e.target.value })} />
        <input placeholder="CNPJ" style={{ ...campo, minWidth: 160 }} value={dados.cnpj} onChange={(e) => onDados({ ...dados, cnpj: e.target.value })} />
        <input placeholder="Unidade consumidora (UC)" style={{ ...campo, minWidth: 180 }} value={dados.uc} onChange={(e) => onDados({ ...dados, uc: e.target.value })} />
        <textarea placeholder="Observação abaixo do volume" rows={2} style={{ ...campo, minWidth: 300, fontSize: 11, resize: 'vertical' }} value={dados.observacao}
          onChange={(e) => onDados({ ...dados, observacao: e.target.value })} />
        <label style={{ fontSize: 12, color: C.med, display: 'flex', gap: 6, alignItems: 'center' }}>
          Validade (dias)
          <input type="number" min="1" style={{ ...campo, width: 70 }} value={dados.validadeDias}
            onChange={(e) => onDados({ ...dados, validadeDias: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        <label style={{ fontSize: 12, color: C.med, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={dados.detalhamento} onChange={(e) => onDados({ ...dados, detalhamento: e.target.checked })} />
          Incluir detalhamento técnico
        </label>
        <button onClick={() => window.print()} style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 6, border: 'none', background: C.verde, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Imprimir / PDF
        </button>
      </div>

      <div style={{ background: '#d9d9d4', padding: '24px 0' }} className="folheto-fundo">
        <FolhetoKora r={r} op={op} creditoTotalKWh={p.creditoTotalKWh} enquadramento={entrada.enquadramento} dados={dados} />
      </div>

      {dados.detalhamento && <div className="proposta" style={{ maxWidth: 820, margin: '0 auto', padding: '32px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `3px solid ${C.verde}`, paddingBottom: 12, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.verde, letterSpacing: '-0.02em' }}>Kora</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Proposta comercial — créditos de energia</div>
            <div style={{ fontSize: 12, color: C.med, marginTop: 2 }}>Geração distribuída (REN ANEEL 1.000/2021 · Lei 14.300/2022)</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: C.med, lineHeight: 1.6 }}>
            Emitida em {dataBR(hoje)}<br />Válida até {dataBR(validade)}
          </div>
        </div>

        <div style={box}>
          <div style={h2}>Cliente</div>
          <Linha label="Cliente" value={dados.cliente || '—'} />
          <Linha label="Unidade consumidora" value={dados.uc || '—'} />
          <Linha label="Distribuidora" value={`${entrada.distribuidora} (${r.estado})`} />
          <Linha label="Grupo / subgrupo / modalidade" value={`Grupo ${grupoA ? 'A' : 'B'} · ${entrada.subgrupo} · ${entrada.modalidadeTarifaria}`} />
        </div>

        <div style={box}>
          <div style={h2}>Consumo e fatura atual (mensal)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thE}>Posto</th><th style={th}>Consumo (kWh/mês)</th><th style={th}>Tarifa c/ impostos (R$/kWh)</th><th style={th}>Valor (R$/mês)</th>
            </tr></thead>
            <tbody>
              {r.postos.map((l) => (
                <tr key={l.posto}>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600 }}>{ROTULO_POSTO[l.posto]}</td>
                  <td style={tdStyle}>{R(l.kWh)}</td>
                  <td style={tdStyle}>{R((l.teCheia + l.tusdCheia) / 1000, 4)}</td>
                  <td style={tdStyle}>{RS(l.valorAtual)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700, borderTop: `2px solid ${C.bord}` }}>Total</td>
                <td style={{ ...tdStyle, fontWeight: 700, borderTop: `2px solid ${C.bord}` }}>{R(r.consumoTotalKWh)}</td>
                <td style={{ ...tdStyle, fontWeight: 700, borderTop: `2px solid ${C.bord}` }}>{R(r.tarifaMediaCliente, 4)}</td>
                <td style={{ ...tdStyle, fontWeight: 700, borderTop: `2px solid ${C.bord}` }}>{RS(r.valorAtual)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={box}>
          <div style={h2}>Sua fatura sem e com a Kora (1º mês)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
            <KPICard label="Fatura sem Kora" value={RS(semKora)} sub="só distribuidora" color={C.esc} bg={C.clar} />
            <KPICard label="Fatura com Kora" value={RS(comKora)} sub={`${RS(distribuidora)} distribuidora + ${RS(kora)} Kora`} color={C.azul} bg={C.azulC} />
            <KPICard label="Economia mensal" value={RS(m1.desconto)} sub={`${PCT(semKora > 0 ? m1.desconto / semKora : 0)} da fatura atual`} color={C.verde} bg={C.verdeC} />
          </div>
          <Linha label="Fatura da distribuidora (com créditos compensados)" value={RS(distribuidora)} />
          <Linha label="Fatura Kora (créditos de energia)" value={RS(kora)} />
          <Linha label="Total com Kora" value={RS(comKora)} forte />
          <Linha label="Consumo compensado pelos créditos" value={`${R(m1.compensadoKWh)} de ${R(r.consumoTotalKWh)} kWh/mês`} />
          <Linha label="Desconto contratado sobre a energia compensada" value={PCT(entrada.descontoPct)} />
        </div>

        <div style={box}>
          <div style={h2}>Condições do contrato</div>
          <Linha label="Crédito de energia contratado" value={`${R(p.creditoTotalKWh)} kWh`} />
          <Linha label="Tempo de contrato" value={`${op.meses.length} meses (${MES(m1.mes)} a ${MES(ultimo.mes)})`} />
          <Linha label="Valor estimado do contrato (pago à Kora)" value={RS(op.total.faturaGeracao)} forte />
          <Linha label="Valor médio mensal" value={RS(op.total.faturaGeracao / op.meses.length)} />
          <Linha label="Economia estimada no contrato" value={RS(op.total.desconto)} forte />
          <Linha label="Reajuste tarifário anual considerado" value={PCT(p.reajusteAnualPct)} />
        </div>

        <div style={box}>
          <div style={h2}>Projeção por ano</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thE}>Ano</th><th style={th}>Meses</th><th style={th}>Consumo compensado (kWh)</th><th style={th}>Pago à Kora</th><th style={th}>Economia</th>
            </tr></thead>
            <tbody>
              {op.anos.map((a) => (
                <tr key={a.ano}>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600 }}>{a.ano}</td><td style={tdStyle}>{a.meses}</td>
                  <td style={tdStyle}>{R(a.compensadoKWh)}</td><td style={tdStyle}>{RS(a.faturaGeracao)}</td><td style={tdStyle}>{RS(a.desconto)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700, borderTop: `2px solid ${C.bord}` }}>Total</td>
                <td style={{ ...tdStyle, fontWeight: 700, borderTop: `2px solid ${C.bord}` }}>{op.total.meses}</td>
                <td style={{ ...tdStyle, fontWeight: 700, borderTop: `2px solid ${C.bord}` }}>{R(op.total.compensadoKWh)}</td>
                <td style={{ ...tdStyle, fontWeight: 700, borderTop: `2px solid ${C.bord}` }}>{RS(op.total.faturaGeracao)}</td>
                <td style={{ ...tdStyle, fontWeight: 700, borderTop: `2px solid ${C.bord}` }}>{RS(op.total.desconto)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ ...box, fontSize: 11, color: C.med, lineHeight: 1.6 }}>
          <div style={h2}>Premissas</div>
          <ul style={{ paddingLeft: 18 }}>
            <li>Tarifas homologadas pela ANEEL para {entrada.distribuidora} ({r.postos[0].resolucao.toLowerCase()}, vigência desde {DATA(r.postos[0].inicioVigencia)}), com ICMS {PCT(entrada.icms)} e PIS/COFINS {PCT(entrada.pis + entrada.cofins)}.</li>
            <li>Valores estimados de energia (TE + TUSD). Não incluem demanda contratada, bandeiras tarifárias, iluminação pública, multas e outros itens da fatura.</li>
            {converte && (
              <li>Os créditos compensam primeiro o consumo Fora Ponta. Na Ponta, conforme a REN ANEEL 1.000/2021, cada kWh consome {R(r.fatorPonta, 4)} kWh de crédito (relação entre as tarifas de energia Ponta e Fora Ponta).</li>
            )}
            <li>Projeção com reajuste tarifário de {PCT(p.reajusteAnualPct)} ao ano a partir do 2º ano; os valores reais seguem os reajustes homologados pela ANEEL.</li>
            <li>A distribuidora continua responsável pelo fornecimento; a fatura da distribuidora segue com a parcela não compensável.</li>
          </ul>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 56, fontSize: 12, textAlign: 'center', breakInside: 'avoid' }}>
          <div style={{ borderTop: `1px solid ${C.esc}`, paddingTop: 6 }}>Kora</div>
          <div style={{ borderTop: `1px solid ${C.esc}`, paddingTop: 6 }}>{dados.cliente || 'Cliente'}</div>
        </div>
      </div>}
    </div>
  );
}
