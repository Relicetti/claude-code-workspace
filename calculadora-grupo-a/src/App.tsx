import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  calcular, descontoPadrao, DISTRIBUIDORAS, grupoDoSubgrupo, IMPOSTOS_PADRAO, modalidadesDoGrupo,
  postosDoGrupo, SUBGRUPOS,
} from './lib/engine';
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
const PCT = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—');
const DATA = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

const ROTULO_POSTO: Record<Posto, string> = { Ponta: 'Ponta', 'Fora ponta': 'Fora Ponta', 'Não se aplica': 'Consumo' };

const DEFAULT_DISTRIBUIDORA = DISTRIBUIDORAS.includes('Copel-DIS') ? 'Copel-DIS' : DISTRIBUIDORAS[0];
const DEFAULT_ENTRADA: Entrada = {
  distribuidora: DEFAULT_DISTRIBUIDORA,
  ano: new Date().getFullYear(),
  subgrupo: 'A4',
  modalidadeTarifaria: 'Verde',
  consumo: { Ponta: 30, 'Fora ponta': 1500, 'Não se aplica': 1000 },
  ...IMPOSTOS_PADRAO,
  enquadramento: 'GD1',
  modalidadeGD: 'Geração Compartilhada',
  fonte: 'Solar',
  descontoPct: descontoPadrao(DEFAULT_DISTRIBUIDORA),
  desagioPct: 0.1,
};

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
  const [entrada, setEntrada] = useState<Entrada>(DEFAULT_ENTRADA);

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
  const trocarDistribuidora = (d: string) => {
    setEntrada((e) => ({ ...e, distribuidora: d, ...(DISTRIBUIDORAS.includes(d) ? { descontoPct: descontoPadrao(d) } : {}) }));
  };

  const calculo = useMemo((): { r: Resultado } | { erro: string } | null => {
    if (!dados) return null;
    if (!DISTRIBUIDORAS.includes(entrada.distribuidora)) return { erro: 'Selecione uma distribuidora da lista.' };
    try { return { r: calcular(entrada, dados) }; } catch (e) { return { erro: (e as Error).message }; }
  }, [entrada, dados]);

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
            <Field label="Ano de referência" help="Usa a tarifa vigente mais recente até 31/12 do ano.">
              <Select value={entrada.ano} onChange={(v) => set('ano', v)} options={[2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]} />
            </Field>
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

          <Section title="3. Crédito GD (origem)" color={C.verde}>
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

          <Section title="4. Impostos" color={C.med}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Field label="ICMS (%)"><PercentField value={entrada.icms} onChange={(v) => set('icms', v)} /></Field>
              <Field label="PIS (%)"><PercentField value={entrada.pis} onChange={(v) => set('pis', v)} /></Field>
              <Field label="COFINS (%)"><PercentField value={entrada.cofins} onChange={(v) => set('cofins', v)} /></Field>
            </div>
            <div style={{ fontSize: 10, color: C.med, marginTop: -6 }}>Confira na fatura do cliente — variam por estado e por mês.</div>
          </Section>

          <Section title="5. Regras comerciais" color={C.amber}>
            <Duas>
              <Field label="Desconto ao cliente (%)"><PercentField value={entrada.descontoPct} onChange={(v) => set('descontoPct', v)} /></Field>
              <Field label="Deságio Alexandria (%)"><PercentField value={entrada.desagioPct} onChange={(v) => set('desagioPct', v)} /></Field>
            </Duas>
          </Section>
        </aside>

        <section>
          {erroDados && <Aviso>Não foi possível carregar as tarifas: {erroDados}</Aviso>}
          {!dados && !erroDados && <div style={{ color: C.med }}>Carregando tarifas…</div>}
          {calculo && 'erro' in calculo && <Aviso>{calculo.erro}</Aviso>}
          {calculo && 'r' in calculo && <Resultados r={calculo.r} entrada={entrada} />}
        </section>
      </main>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.vermC, color: C.verm, borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>{children}</div>;
}

function Resultados({ r, entrada }: { r: Resultado; entrada: Entrada }) {
  const sim = (b: boolean) => (b ? 'SIM' : 'NÃO');
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
        <KPICard destaque color={C.verde} label="Pago ao dono do crédito" value={RKWH(r.tarifaMediaGerador)} sub={`${RS(r.valorGerador)} / mês`} />
        <KPICard destaque color={C.azul} label="Fatura de geração (cliente)" value={RKWH(r.tarifaMediaGeracao)} sub={`${RS(r.faturaGeracao)} / mês`} />
        <KPICard destaque color={C.amber} label="Margem Alexandria" value={RS(r.valorAlexandria)} sub={`${PCT(entrada.desagioPct)} da fatura de geração`} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KPICard label="Fatura atual do cliente" value={RS(r.valorAtual)} sub={RKWH(r.tarifaMediaCliente)} />
        <KPICard label="Total com Alexandria" value={RS(r.valorTotalComAlexandria)} sub="distribuidora + geração" />
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
            <Linha label={`Alexandria (${PCT(entrada.desagioPct)})`} value={RS(r.valorAlexandria)} />
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
          </Section>
        </div>
      </div>
    </>
  );
}
