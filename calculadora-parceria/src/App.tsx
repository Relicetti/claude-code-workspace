import { useEffect, useMemo, useState } from 'react';
import {
  Sun, Calculator, Table2, FileText, AlertTriangle, Download, Upload, Printer, Database, RefreshCw, CheckCircle2, Search, ClipboardList,
  Users, LogOut, Trash2, Percent, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { calcularParceria, DISTRIBUIDORAS, descontoPadrao, resolverEstado, buscarImpostos, buscarIsencoes } from './lib/engine';
import { rodarLote, parseCsv, exportarCsv } from './lib/batchSimulation';
import {
  carregarDaAPI, atualizarTarifasAneel, getStatus, getTarifasB1, getComponentes, resolverDistribuidoraPorCodigo,
  type SyncStatus, type TarifaB1Row, type ComponenteRow,
} from './lib/tarifasStore';
import {
  listarPropostas, emitirProposta as emitirPropostaApi, obterProposta, apagarProposta as apagarPropostaApi,
  type PropostaEmitida, type PropostaSnapshot,
} from './lib/propostasStore';
import {
  login as loginApi, logout as logoutApi, obterUsuarioAtual, listarUsuarios as listarUsuariosApi,
  criarUsuario as criarUsuarioApi, alterarStatusUsuario as alterarStatusUsuarioApi, atualizarUsuario as atualizarUsuarioApi,
  type Usuario, type Perfil,
} from './lib/authStore';
import {
  carregarDaAPI as carregarImpostosDaAPI, getImpostoOverride, salvarOverride as salvarImpostoOverrideApi,
  removerOverride as removerImpostoOverrideApi,
} from './lib/impostosOverridesStore';
import {
  carregarDaAPI as carregarIsencoesDaAPI, getIsencaoOverride, salvarOverride as salvarIsencaoOverrideApi,
  removerOverride as removerIsencaoOverrideApi,
} from './lib/isencoesOverridesStore';
import type { ParceriaInput, Enquadramento, Fonte, Modalidade, BatchScenarioOutput } from './types';
import logoLex from './assets/lex-logo.png';

// ── PALETA ────────────────────────────────────────────────────────────────────
const C = {
  azul: '#2a78d6', azulC: '#e6f1fb',
  verde: '#1baf7a', verdeC: '#eaf3de',
  amber: '#eda100', amberC: '#faeeda',
  verm: '#e34948', vermC: '#fcebeb',
  esc: '#2c2c2a', med: '#5f5e5a',
  clar: '#f4f3ed', bord: '#d3d1c7',
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
const R = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const RM = (n: number) => `R$ ${R(n, 0)}`;
const RKWH = (n: number) => `R$ ${R(n, 4)}/kWh`;
const PCT = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—');

const DEFAULT_DISTRIBUIDORA = DISTRIBUIDORAS.includes('Copel-DIS') ? 'Copel-DIS' : (DISTRIBUIDORAS[0] ?? '');

const DEFAULT_INPUT: ParceriaInput = {
  distribuidora: DEFAULT_DISTRIBUIDORA,
  ano: new Date().getFullYear(),
  enquadramento: 'GD1',
  fonte: 'Solar',
  modalidade: 'Autoconsumo',
  potenciaConexaoMW: 1,
  potenciaInstaladaMWp: 1.3,
  desagioPct: 0.12,
  descontoClientePct: descontoPadrao(DEFAULT_DISTRIBUIDORA),
};

function KPICard({ label, value, sub, color = C.azul, bg = C.azulC, destaque = false }: {
  label: string; value: string; sub?: string; color?: string; bg?: string; destaque?: boolean;
}) {
  if (destaque) {
    return (
      <div style={{ background: color, borderRadius: 10, padding: '18px 20px', boxShadow: `0 6px 16px ${color}66` }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: '#fff', lineHeight: 1.15 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', marginTop: 5 }}>{sub}</div>}
      </div>
    );
  }
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: C.med, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.med, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children, color = C.azul }: { title: string; children: React.ReactNode; color?: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        background: color, color: '#fff', borderRadius: 6, padding: '6px 12px',
        fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
        marginBottom: 12,
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

function NumberField({ value, onChange, step = 'any', placeholder }: {
  value: number | undefined; onChange: (v: number | undefined) => void; step?: number | 'any'; placeholder?: string;
}) {
  return (
    <input
      type="number" step={step} style={inputStyle}
      value={value ?? ''} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );
}

/** Campo numérico inteiro exibido com separador de milhar (ex: 600.000). */
function FormattedNumberField({ value, onChange, placeholder }: {
  value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string;
}) {
  return (
    <input
      type="text" inputMode="numeric" style={inputStyle}
      value={value === undefined ? '' : value.toLocaleString('pt-BR')}
      placeholder={placeholder}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, '');
        onChange(digitos === '' ? undefined : Number(digitos));
      }}
    />
  );
}

function PercentField({ value, onChange, placeholder }: {
  value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string;
}) {
  return (
    <input
      type="number" step="0.1" style={inputStyle}
      value={value === undefined ? '' : Number((value * 100).toFixed(6))}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value) / 100)}
    />
  );
}

const TABS = [
  { id: 'calculadora', label: 'Calculadora', icon: Calculator, admOnly: false },
  { id: 'consulta', label: 'Consulta Tarifas', icon: Search, admOnly: false },
  { id: 'lote', label: 'Simulação em Lote', icon: Table2, admOnly: false },
  { id: 'relatorio', label: 'Proposta', icon: FileText, admOnly: false },
  { id: 'controle', label: 'Controle de Propostas', icon: ClipboardList, admOnly: false },
  { id: 'impostos', label: 'Impostos', icon: Percent, admOnly: true },
  { id: 'isencoes', label: 'Isenções', icon: ShieldCheck, admOnly: true },
  { id: 'usuarios', label: 'Usuários', icon: Users, admOnly: true },
] as const;

/** Nome da associação e cidade são sempre fixos — não são mais dados editáveis por proposta. */
const NOME_ASSOCIACAO = 'Associação de Usinas Alexandria II';
const CIDADE_PROPOSTA = 'Curitiba';

interface PropostaInfo {
  negociador: string;
  nomeUsina: string;
  vigenciaAnos: number;
  avisoPrevioDias: number;
  valorLocacaoImovel: number;
}

const DEFAULT_PROPOSTA: PropostaInfo = {
  negociador: '',
  nomeUsina: '',
  vigenciaAnos: 5,
  avisoPrevioDias: 90,
  valorLocacaoImovel: 1000,
};

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [autenticando, setAutenticando] = useState(true);

  useEffect(() => {
    obterUsuarioAtual().then(setUsuario).finally(() => setAutenticando(false));
  }, []);

  if (autenticando) return null;
  if (!usuario) return <LoginView onLogin={setUsuario} />;

  return <AppAutenticado usuario={usuario} onLogout={() => setUsuario(null)} onUsuarioAtualizado={setUsuario} />;
}

function AppAutenticado({ usuario, onLogout, onUsuarioAtualizado }: {
  usuario: Usuario; onLogout: () => void; onUsuarioAtualizado: (u: Usuario) => void;
}) {
  const isAdm = usuario.perfil === 'adm';
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('calculadora');
  const [input, setInput] = useState<ParceriaInput>(DEFAULT_INPUT);
  const [proposta, setProposta] = useState<PropostaInfo>({ ...DEFAULT_PROPOSTA, negociador: usuario.nome });
  const [loteInputs, setLoteInputs] = useState<string>('');
  const [loteResultados, setLoteResultados] = useState<BatchScenarioOutput[]>([]);
  const [tarifasVersion, setTarifasVersion] = useState(0);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncEstado, setSyncEstado] = useState<'idle' | 'carregando' | 'ok' | 'erro'>('idle');
  const [syncErro, setSyncErro] = useState<string | null>(null);
  const [propostas, setPropostas] = useState<PropostaEmitida[]>([]);
  const [emissao, setEmissao] = useState<{ revisao: number; dataEmissao: string } | null>(null);
  const [emitindo, setEmitindo] = useState(false);
  const [erroEmissao, setErroEmissao] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<{ id: number; revisao: number; dataEmissao: string; snapshot: PropostaSnapshot } | null>(null);
  const [carregandoProposta, setCarregandoProposta] = useState(false);
  const [erroCarregarProposta, setErroCarregarProposta] = useState<string | null>(null);

  const [apagandoId, setApagandoId] = useState<number | null>(null);

  const apagarProposta = async (id: number, nomeUsina: string) => {
    if (!window.confirm(`Apagar a proposta emitida de "${nomeUsina}"? Essa ação não pode ser desfeita.`)) return;
    setApagandoId(id);
    try {
      await apagarPropostaApi(id);
      setPropostas(await listarPropostas());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setApagandoId(null);
    }
  };

  const abrirPropostaEmitida = async (id: number) => {
    setCarregandoProposta(true);
    setErroCarregarProposta(null);
    try {
      const p = await obterProposta(id);
      setVisualizando({ id: p.id, revisao: p.revisao, dataEmissao: p.dataEmissao, snapshot: p.snapshot });
      setTab('relatorio');
    } catch (e) {
      setErroCarregarProposta(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregandoProposta(false);
    }
  };

  useEffect(() => {
    carregarDaAPI().then(() => {
      setStatus(getStatus());
      setTarifasVersion((v) => v + 1);
    });
    carregarImpostosDaAPI().then(() => setTarifasVersion((v) => v + 1));
    carregarIsencoesDaAPI().then(() => setTarifasVersion((v) => v + 1));
    listarPropostas().then(setPropostas).catch(() => {});
  }, []);

  // Qualquer alteração no cenário ou nos dados da proposta invalida a emissão atual —
  // pra editar de novo é preciso emitir uma nova revisão (proposta já emitida é imutável).
  useEffect(() => {
    setEmissao(null);
  }, [input, proposta]);

  const emitirPropostaAgora = async () => {
    if (!resultado.ok) return;
    if (!proposta.nomeUsina.trim() || !proposta.negociador.trim()) {
      setErroEmissao('Preencha "Negociador" e "Nome da usina" antes de emitir.');
      return;
    }
    setEmitindo(true);
    setErroEmissao(null);
    try {
      const nova = await emitirPropostaApi({
        nomeUsina: proposta.nomeUsina.trim(),
        potenciaKwp: input.potenciaInstaladaMWp * 1000,
        valorTarifa: resultado.data.tGerador,
        negociador: proposta.negociador.trim(),
        snapshot: { input, proposta, resultado: resultado.data },
      });
      setEmissao({ revisao: nova.revisao, dataEmissao: nova.dataEmissao });
      setPropostas(await listarPropostas());
    } catch (e) {
      setErroEmissao(e instanceof Error ? e.message : String(e));
    } finally {
      setEmitindo(false);
    }
  };

  const sair = async () => {
    await logoutApi();
    onLogout();
  };

  const atualizarTarifas = async () => {
    setSyncEstado('carregando');
    setSyncErro(null);
    const r = await atualizarTarifasAneel();
    if (r.ok) {
      setStatus(getStatus());
      setTarifasVersion((v) => v + 1);
      setSyncEstado('ok');
    } else {
      setSyncEstado('erro');
      setSyncErro(r.error);
    }
  };

  const set = <K extends keyof ParceriaInput>(k: K, v: ParceriaInput[K]) => setInput((prev) => ({ ...prev, [k]: v }));

  const setDistribuidora = (distribuidora: string) => {
    setInput((prev) => ({ ...prev, distribuidora, descontoClientePct: descontoPadrao(distribuidora) }));
  };

  const resultado = useMemo(() => {
    try {
      return { ok: true as const, data: calcularParceria(input) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, tarifasVersion]);

  const geracaoMensalDefault = input.potenciaInstaladaMWp * 120000;

  const rodarLoteCsv = () => {
    const cenarios = parseCsv(loteInputs);
    setLoteResultados(rodarLote(cenarios));
  };

  const baixarCsv = () => {
    const blob = new Blob([exportarCsv(loteResultados)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'simulacao_parceria.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const importarArquivo = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setLoteInputs(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.esc, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sun size={22} color={C.amber} /> Calculadora de Parceria Solar
          </h1>
          <p style={{ fontSize: 12, color: C.med, marginTop: 2 }}>
            Economia comercial de geração distribuída — tarifa compensada, faturamento do gerador, desconto ao cliente e take rate.
          </p>
        </div>
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: C.med, whiteSpace: 'nowrap' }}>
          <span>{usuario.nome} <span style={{ color: C.med, fontSize: 10 }}>({usuario.perfil === 'adm' ? 'ADM' : 'Operador'})</span></span>
          <button onClick={sair} style={{ ...btnStyle, background: '#fff', border: `1px solid ${C.bord}`, padding: '5px 10px', fontSize: 12 }}>
            <LogOut size={13} style={{ marginRight: 5 }} /> Sair
          </button>
        </div>
      </header>

      {isAdm && (
        <div className="no-print" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: C.clar, border: `1px solid ${C.bord}`, borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.med }}>
            <Database size={14} />
            {status ? (
              <span>
                Tarifas ANEEL: {status.tarifasB1.rowCount} tarifas, {status.componentes.rowCount} componentes
                {status.tarifasB1.lastSyncedAt && (
                  <> — atualizado em {new Date(status.tarifasB1.lastSyncedAt).toLocaleString('pt-BR')}</>
                )}
              </span>
            ) : (
              <span>Carregando status das tarifas…</span>
            )}
            {syncEstado === 'ok' && <CheckCircle2 size={14} color={C.verde} />}
            {syncEstado === 'erro' && <span style={{ color: C.verm }}>Erro: {syncErro}</span>}
          </div>
          <button
            onClick={atualizarTarifas} disabled={syncEstado === 'carregando'}
            style={{ ...btnStyle, background: C.azul, color: '#fff', padding: '6px 12px', opacity: syncEstado === 'carregando' ? 0.7 : 1 }}
          >
            <RefreshCw size={13} style={{ marginRight: 6, animation: syncEstado === 'carregando' ? 'girar 1s linear infinite' : 'none' }} />
            {syncEstado === 'carregando' ? 'Atualizando (pode levar 1-2 min)…' : 'Atualizar tarifas (ANEEL)'}
          </button>
        </div>
      )}

      <nav className="no-print" style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: `1px solid ${C.bord}`, flexWrap: 'wrap' }}>
        {TABS.filter((t) => !t.admOnly || isAdm).map(({ id, label, icon: Icon }) => (
          <button
            key={id} onClick={() => setTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none',
              background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              color: tab === id ? C.azul : C.med,
              borderBottom: tab === id ? `2px solid ${C.azul}` : '2px solid transparent',
            }}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      {tab === 'calculadora' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <Section title="Gerador">
              <Field label="Distribuidora">
                <input
                  list="distribuidoras" style={inputStyle} value={input.distribuidora}
                  onChange={(e) => setDistribuidora(e.target.value)}
                />
                <datalist id="distribuidoras">
                  {DISTRIBUIDORAS.map((d) => <option key={d} value={d} />)}
                </datalist>
              </Field>
              <Field label="Ano do contrato">
                <NumberField value={input.ano} onChange={(v) => set('ano', v ?? new Date().getFullYear())} step={1} />
              </Field>
              <Field label="Enquadramento">
                <select style={inputStyle} value={input.enquadramento} onChange={(e) => set('enquadramento', e.target.value as Enquadramento)}>
                  <option value="GD1">GD1</option>
                  <option value="GD2">GD2</option>
                  <option value="GD3">GD3</option>
                </select>
              </Field>
              <Field label="Tipo de fonte">
                <select style={inputStyle} value={input.fonte} onChange={(e) => set('fonte', e.target.value as Fonte)}>
                  <option value="Solar">Solar</option>
                  <option value="Outras">Outras</option>
                </select>
              </Field>
              <Field label="Modalidade">
                <select style={inputStyle} value={input.modalidade} onChange={(e) => set('modalidade', e.target.value as Modalidade)}>
                  <option value="Autoconsumo">Autoconsumo</option>
                  <option value="Geração Compartilhada">Geração Compartilhada</option>
                </select>
              </Field>
            </Section>

            <Section title="Potência e Geração" color={C.verde}>
              <Field label="Potência de conexão (MWca)" help="Define a faixa ≤1 MW / >1 MW para isenções fiscais">
                <NumberField value={input.potenciaConexaoMW} onChange={(v) => set('potenciaConexaoMW', v ?? 0)} />
              </Field>
              <Field label="Potência instalada (MWp)">
                <NumberField value={input.potenciaInstaladaMWp} onChange={(v) => set('potenciaInstaladaMWp', v ?? 0)} />
              </Field>
              <Field label="Geração mensal estimada (kWh/mês)" help={`Padrão: ${R(geracaoMensalDefault)} (potência × 120.000)`}>
                <FormattedNumberField
                  value={input.geracaoMensalKWh} placeholder={R(geracaoMensalDefault)}
                  onChange={(v) => set('geracaoMensalKWh', v)}
                />
              </Field>
            </Section>

            <Section title="Regras Comerciais" color={C.amber}>
              <Field label="% Desconto ao cliente" help="Preenchido pela aba DESCONTO ao trocar a distribuidora — editável">
                <PercentField value={input.descontoClientePct} onChange={(v) => set('descontoClientePct', v)} />
              </Field>
              <Field label="Deságio (%)">
                <PercentField value={input.desagioPct} onChange={(v) => set('desagioPct', v ?? 0)} />
              </Field>
              <Field label="% Pescoço (meses de faturamento cheio)">
                <PercentField value={input.pescoco ?? 1} onChange={(v) => set('pescoco', v ?? 1)} />
              </Field>
            </Section>

            <Section title="Simulação de Fatura" color={C.med}>
              <Field label="Consumo médio dos clientes (kWh)" help="Padrão: 500">
                <NumberField value={input.consumoMedioClienteKWh} onChange={(v) => set('consumoMedioClienteKWh', v)} placeholder="500" />
              </Field>
              <Field label="Consumo mínimo faturável (kWh)" help="Padrão: 50">
                <NumberField value={input.consumoMinimoKWh} onChange={(v) => set('consumoMinimoKWh', v)} placeholder="50" />
              </Field>
            </Section>
          </div>

          {resultado.ok ? (
            <ResultadosView r={resultado.data} />
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: C.vermC, color: C.verm, padding: 16, borderRadius: 8 }}>
              <AlertTriangle size={18} /> {resultado.error}
            </div>
          )}
        </div>
      )}

      {tab === 'consulta' && <ConsultaTarifasView tarifasVersion={tarifasVersion} />}

      {tab === 'lote' && (
        <div>
          <Section title="Simulação em Lote (substitui a macro VBA)">
            <p style={{ fontSize: 12, color: C.med, marginBottom: 10 }}>
              Cole ou importe um CSV com o cabeçalho:{' '}
              <code style={{ fontSize: 11 }}>Concessionária,Ano,Deságio,Pot CA,Pot CC,Geração Mensal,Pescoço,Enquadramento,Fonte,Modalidade</code>
            </p>
            <textarea
              value={loteInputs} onChange={(e) => setLoteInputs(e.target.value)}
              rows={8} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }}
              placeholder="Concessionária,Ano,Deságio,Pot CA,Pot CC,Geração Mensal,Pescoço,Enquadramento,Fonte,Modalidade&#10;Cemig-D,2026,0.12,1,1.3,91562.14,1,GD1,Solar,Geração Compartilhada"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={rodarLoteCsv} style={{ ...btnStyle, background: C.azul, color: '#fff' }}>Rodar simulação</button>
              <label style={{ ...btnStyle, background: '#fff', border: `1px solid ${C.bord}`, cursor: 'pointer' }}>
                <Upload size={14} style={{ marginRight: 6 }} /> Importar CSV
                <input type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importarArquivo(e.target.files[0])} />
              </label>
              {loteResultados.length > 0 && (
                <button onClick={baixarCsv} style={{ ...btnStyle, background: '#fff', border: `1px solid ${C.bord}` }}>
                  <Download size={14} style={{ marginRight: 6 }} /> Exportar resultado
                </button>
              )}
            </div>
          </Section>

          {loteResultados.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.clar }}>
                    {['Concessionária', 'Enq.', 'Tarif. Comp.', '%Cliente', 'T_gerador', 'Fat_gerador', 'Take Rate', 'Erro'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.bord}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loteResultados.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.bord}` }}>
                      <td style={{ padding: '6px 8px' }}>{r.concessionaria}</td>
                      <td style={{ padding: '6px 8px' }}>{r.enquadramento}</td>
                      <td style={{ padding: '6px 8px' }}>{R(r.tarifComp, 3)}</td>
                      <td style={{ padding: '6px 8px' }}>{PCT(r.pctCliente)}</td>
                      <td style={{ padding: '6px 8px' }}>{R(r.tGerador, 3)}</td>
                      <td style={{ padding: '6px 8px' }}>{RM(r.fatGerador)}</td>
                      <td style={{ padding: '6px 8px' }}>{PCT(r.takeRate)}</td>
                      <td style={{ padding: '6px 8px', color: C.verm }}>{r.erro ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'relatorio' && visualizando && (
        <div>
          <div className="no-print" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            background: C.clar, border: `1px solid ${C.bord}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Visualizando REV{String(visualizando.revisao).padStart(2, '0')} de "{visualizando.snapshot.proposta.nomeUsina}" —
              emitida em {new Date(visualizando.dataEmissao).toLocaleDateString('pt-BR')} · somente leitura
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => window.print()} style={{ ...btnStyle, background: C.azul, color: '#fff' }}>
                <Printer size={14} style={{ marginRight: 6 }} /> Imprimir / Salvar PDF
              </button>
              <button onClick={() => setVisualizando(null)} style={{ ...btnStyle, background: '#fff', border: `1px solid ${C.bord}` }}>
                Voltar ao cenário atual
              </button>
            </div>
          </div>
          <RelatorioView
            input={visualizando.snapshot.input} r={visualizando.snapshot.resultado} proposta={visualizando.snapshot.proposta}
            emissao={{ revisao: visualizando.revisao, dataEmissao: visualizando.dataEmissao }}
          />
        </div>
      )}

      {tab === 'relatorio' && !visualizando && resultado.ok && (
        <div>
          <div className="no-print">
            <Section title="Dados da Proposta (não impressos aqui embaixo, aparecem no documento)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 16px' }}>
                <Field label="Negociador">
                  <input style={inputStyle} value={proposta.negociador} onChange={(e) => setProposta((p) => ({ ...p, negociador: e.target.value }))} />
                </Field>
                <Field label="Nome da usina / parceiro" help='Ex: "UFV Juan"'>
                  <input style={inputStyle} value={proposta.nomeUsina} onChange={(e) => setProposta((p) => ({ ...p, nomeUsina: e.target.value }))} />
                </Field>
                <Field label="Vigência (anos)">
                  <NumberField value={proposta.vigenciaAnos} step={1} onChange={(v) => setProposta((p) => ({ ...p, vigenciaAnos: v ?? 5 }))} />
                </Field>
                <Field label="Aviso prévio p/ rescisão (dias)">
                  <NumberField value={proposta.avisoPrevioDias} step={1} onChange={(v) => setProposta((p) => ({ ...p, avisoPrevioDias: v ?? 90 }))} />
                </Field>
                <Field label="Locação de imóvel (R$/mês)">
                  <NumberField value={proposta.valorLocacaoImovel} onChange={(v) => setProposta((p) => ({ ...p, valorLocacaoImovel: v ?? 1000 }))} />
                </Field>
              </div>
            </Section>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <button onClick={() => window.print()} style={{ ...btnStyle, background: C.azul, color: '#fff' }}>
                <Printer size={14} style={{ marginRight: 6 }} /> Imprimir / Salvar PDF
              </button>
              <button onClick={emitirPropostaAgora} disabled={emitindo} style={{ ...btnStyle, background: C.verde, color: '#fff', opacity: emitindo ? 0.7 : 1 }}>
                {emitindo ? 'Emitindo…' : emissao ? `Reemitir (gerará REV${String(emissao.revisao + 1).padStart(2, '0')})` : 'Emitir Proposta'}
              </button>
              {emissao && (
                <span style={{ fontSize: 12, color: C.verde, fontWeight: 600 }}>
                  <CheckCircle2 size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Emitida como REV{String(emissao.revisao).padStart(2, '0')}
                </span>
              )}
              {erroEmissao && <span style={{ fontSize: 12, color: C.verm }}>{erroEmissao}</span>}
            </div>
          </div>
          <RelatorioView input={input} r={resultado.data} proposta={proposta} emissao={emissao} />
        </div>
      )}

      {tab === 'controle' && (
        <Section title="Controle de Propostas Emitidas" color={C.med}>
          {erroCarregarProposta && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: C.vermC, color: C.verm, padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <AlertTriangle size={16} /> {erroCarregarProposta}
            </div>
          )}
          {propostas.length === 0 ? (
            <p style={{ fontSize: 12, color: C.med }}>Nenhuma proposta emitida ainda.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.clar }}>
                    {['UFV', 'Potência (kWp)', 'Tarifa (R$/kWh)', 'Revisão', 'Data', 'Negociador', ''].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.bord}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {propostas.map((p) => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.bord}` }}>
                      <td style={{ padding: '6px 8px' }}>{p.nomeUsina}</td>
                      <td style={{ padding: '6px 8px' }}>{R(p.potenciaKwp, 1)}</td>
                      <td style={{ padding: '6px 8px' }}>{R(p.valorTarifa, 3)}</td>
                      <td style={{ padding: '6px 8px' }}>REV{String(p.revisao).padStart(2, '0')}</td>
                      <td style={{ padding: '6px 8px' }}>{new Date(p.dataEmissao).toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '6px 8px' }}>{p.negociador}</td>
                      <td style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => abrirPropostaEmitida(p.id)} disabled={carregandoProposta}
                          style={{ ...btnStyle, background: C.azul, color: '#fff', padding: '4px 10px', fontSize: 11, opacity: carregandoProposta ? 0.7 : 1 }}
                        >
                          <Download size={12} style={{ marginRight: 4 }} /> Baixar
                        </button>
                        {isAdm && (
                          <button
                            onClick={() => apagarProposta(p.id, p.nomeUsina)} disabled={apagandoId === p.id}
                            style={{ ...btnStyle, background: C.vermC, color: C.verm, padding: '4px 10px', fontSize: 11, opacity: apagandoId === p.id ? 0.7 : 1 }}
                          >
                            <Trash2 size={12} style={{ marginRight: 4 }} /> Apagar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {tab === 'impostos' && isAdm && <ImpostosView onAtualizado={() => setTarifasVersion((v) => v + 1)} />}

      {tab === 'isencoes' && isAdm && <IsencoesView onAtualizado={() => setTarifasVersion((v) => v + 1)} />}

      {tab === 'usuarios' && isAdm && <UsuariosView usuarioAtual={usuario} onUsuarioAtualAtualizado={onUsuarioAtualizado} />}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, border: 'none',
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
};

function LoginView({ onLogin }: { onLogin: (u: Usuario) => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const u = await loginApi(email, senha);
      onLogin(u);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.clar }}>
      <form onSubmit={entrar} style={{ background: '#fff', borderRadius: 10, padding: '32px 36px', width: 340, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: C.esc, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Sun size={20} color={C.amber} /> Calculadora de Parceria
        </h1>
        <p style={{ fontSize: 12, color: C.med, marginBottom: 20 }}>Entre com seu e-mail e senha.</p>
        <Field label="E-mail">
          <input type="email" required autoFocus style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha">
          <input type="password" required style={inputStyle} value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Field>
        {erro && <div style={{ fontSize: 12, color: C.verm, marginBottom: 12 }}>{erro}</div>}
        <button type="submit" disabled={carregando} style={{ ...btnStyle, background: C.azul, color: '#fff', width: '100%', justifyContent: 'center', opacity: carregando ? 0.7 : 1 }}>
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function ImpostosView({ onAtualizado }: { onAtualizado: () => void }) {
  const [busca, setBusca] = useState('');
  const [edicoes, setEdicoes] = useState<Record<string, { icms: number; pisCofins: number }>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versaoOverrides, setVersaoOverrides] = useState(0);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return DISTRIBUIDORAS
      .filter((d) => !termo || d.toLowerCase().includes(termo))
      .map((distribuidora) => {
        let estado = '—';
        try { estado = resolverEstado(distribuidora); } catch { /* sem estado cadastrado */ }
        const override = getImpostoOverride(distribuidora);
        const padrao = estado !== '—' ? buscarImpostos(estado) : { icms: 0, pisCofins: 0 };
        const efetivo = override ? { icms: override.icms, pisCofins: override.pisCofins } : padrao;
        return { distribuidora, estado, temOverride: !!override, efetivo };
      });
  }, [busca, versaoOverrides]);

  const valorAtual = (l: (typeof linhas)[number]) => edicoes[l.distribuidora] ?? l.efetivo;

  const setCampo = (l: (typeof linhas)[number], campo: 'icms' | 'pisCofins', valorFracao: number | undefined) => {
    setEdicoes((prev) => {
      const atual = prev[l.distribuidora] ?? l.efetivo;
      return { ...prev, [l.distribuidora]: { ...atual, [campo]: valorFracao ?? 0 } };
    });
  };

  const salvar = async (l: (typeof linhas)[number]) => {
    const v = valorAtual(l);
    setSalvando(l.distribuidora);
    setErro(null);
    try {
      await salvarImpostoOverrideApi(l.distribuidora, v.icms, v.pisCofins);
      setEdicoes((prev) => { const { [l.distribuidora]: _descartado, ...resto } = prev; return resto; });
      setVersaoOverrides((x) => x + 1);
      onAtualizado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  };

  const restaurar = async (l: (typeof linhas)[number]) => {
    setSalvando(l.distribuidora);
    setErro(null);
    try {
      await removerImpostoOverrideApi(l.distribuidora);
      setEdicoes((prev) => { const { [l.distribuidora]: _descartado, ...resto } = prev; return resto; });
      setVersaoOverrides((x) => x + 1);
      onAtualizado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <div>
      <Section title="Impostos por Concessionária (ICMS / PIS-COFINS)" color={C.azul}>
        <p style={{ fontSize: 12, color: C.med, marginBottom: 12 }}>
          Por padrão, cada concessionária usa a alíquota do próprio estado. Editar aqui cria uma exceção só
          para essa concessionária — "Restaurar padrão" remove a exceção e volta a usar o valor do estado.
        </p>
        <div style={{ maxWidth: 320 }}>
          <Field label="Buscar concessionária">
            <input style={inputStyle} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="ex: Cemig, CPFL, COELBA…" />
          </Field>
        </div>
        {erro && <div style={{ fontSize: 12, color: C.verm, margin: '8px 0' }}>{erro}</div>}
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.clar }}>
                {['Concessionária', 'Estado', 'ICMS (%)', 'PIS/COFINS (%)', 'Origem', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.bord}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const v = valorAtual(l);
                const dirty = !!edicoes[l.distribuidora];
                return (
                  <tr key={l.distribuidora} style={{ borderBottom: `1px solid ${C.bord}` }}>
                    <td style={{ padding: '6px 8px' }}>{l.distribuidora}</td>
                    <td style={{ padding: '6px 8px' }}>{l.estado}</td>
                    <td style={{ padding: '6px 8px', maxWidth: 110 }}>
                      <PercentField value={v.icms} onChange={(val) => setCampo(l, 'icms', val)} />
                    </td>
                    <td style={{ padding: '6px 8px', maxWidth: 110 }}>
                      <PercentField value={v.pisCofins} onChange={(val) => setCampo(l, 'pisCofins', val)} />
                    </td>
                    <td style={{ padding: '6px 8px', color: l.temOverride ? C.amber : C.med }}>
                      {l.temOverride ? 'Personalizado' : 'Padrão do estado'}
                    </td>
                    <td style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
                      {dirty && (
                        <button
                          onClick={() => salvar(l)} disabled={salvando === l.distribuidora}
                          style={{ ...btnStyle, background: C.verde, color: '#fff', padding: '4px 10px', fontSize: 11, opacity: salvando === l.distribuidora ? 0.7 : 1 }}
                        >
                          Salvar
                        </button>
                      )}
                      {l.temOverride && (
                        <button
                          onClick={() => restaurar(l)} disabled={salvando === l.distribuidora}
                          style={{ ...btnStyle, background: '#fff', border: `1px solid ${C.bord}`, padding: '4px 10px', fontSize: 11, opacity: salvando === l.distribuidora ? 0.7 : 1 }}
                        >
                          <RotateCcw size={12} style={{ marginRight: 4 }} /> Restaurar padrão
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

type FlagsIsencao = { teIcms: boolean; tePisCofins: boolean; tusdIcms: boolean; tusdPisCofins: boolean };

function SimNaoField({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <select style={inputStyle} value={value ? 'sim' : 'nao'} onChange={(e) => onChange(e.target.value === 'sim')}>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  );
}

function IsencoesView({ onAtualizado }: { onAtualizado: () => void }) {
  const [modalidade, setModalidade] = useState<Modalidade>('Autoconsumo');
  const [busca, setBusca] = useState('');
  const [edicoes, setEdicoes] = useState<Record<string, FlagsIsencao>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versaoOverrides, setVersaoOverrides] = useState(0);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return DISTRIBUIDORAS
      .filter((d) => !termo || d.toLowerCase().includes(termo))
      .map((distribuidora) => {
        let estado = '—';
        try { estado = resolverEstado(distribuidora); } catch { /* sem estado cadastrado */ }
        const override = getIsencaoOverride(distribuidora, modalidade);
        let padrao: FlagsIsencao = { teIcms: false, tePisCofins: false, tusdIcms: false, tusdPisCofins: false };
        try { if (estado !== '—') padrao = buscarIsencoes(estado, modalidade, 'Solar', '≤1 MW'); } catch { /* sem regra cadastrada */ }
        const efetivo: FlagsIsencao = override
          ? { teIcms: override.teIcms, tePisCofins: override.tePisCofins, tusdIcms: override.tusdIcms, tusdPisCofins: override.tusdPisCofins }
          : padrao;
        return { distribuidora, estado, temOverride: !!override, efetivo };
      });
  }, [busca, versaoOverrides, modalidade]);

  const valorAtual = (l: (typeof linhas)[number]) => edicoes[l.distribuidora] ?? l.efetivo;

  const trocarModalidade = (m: Modalidade) => {
    setModalidade(m);
    setEdicoes({});
    setErro(null);
  };

  const setCampo = (l: (typeof linhas)[number], campo: keyof FlagsIsencao, valor: boolean) => {
    setEdicoes((prev) => {
      const atual = prev[l.distribuidora] ?? l.efetivo;
      return { ...prev, [l.distribuidora]: { ...atual, [campo]: valor } };
    });
  };

  const salvar = async (l: (typeof linhas)[number]) => {
    const v = valorAtual(l);
    setSalvando(l.distribuidora);
    setErro(null);
    try {
      await salvarIsencaoOverrideApi(l.distribuidora, modalidade, v);
      setEdicoes((prev) => { const { [l.distribuidora]: _descartado, ...resto } = prev; return resto; });
      setVersaoOverrides((x) => x + 1);
      onAtualizado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  };

  const restaurar = async (l: (typeof linhas)[number]) => {
    setSalvando(l.distribuidora);
    setErro(null);
    try {
      await removerIsencaoOverrideApi(l.distribuidora, modalidade);
      setEdicoes((prev) => { const { [l.distribuidora]: _descartado, ...resto } = prev; return resto; });
      setVersaoOverrides((x) => x + 1);
      onAtualizado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <div>
      <Section title="Isenções Fiscais por Concessionária (TE / TUSD × ICMS / PIS-COFINS)" color={C.azul}>
        <p style={{ fontSize: 12, color: C.med, marginBottom: 12 }}>
          Por padrão, cada concessionária usa as isenções da tabela do estado (≤1 MW) — a regra muda conforme a
          modalidade. Editar aqui cria uma exceção só para essa concessionária + modalidade — "Restaurar padrão"
          remove a exceção e volta a usar a regra do estado.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ minWidth: 220 }}>
            <Field label="Modalidade">
              <select style={inputStyle} value={modalidade} onChange={(e) => trocarModalidade(e.target.value as Modalidade)}>
                <option value="Autoconsumo">Autoconsumo</option>
                <option value="Geração Compartilhada">Geração Compartilhada</option>
              </select>
            </Field>
          </div>
          <div style={{ maxWidth: 320, flex: 1 }}>
            <Field label="Buscar concessionária">
              <input style={inputStyle} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="ex: Cemig, CPFL, COELBA…" />
            </Field>
          </div>
        </div>
        {erro && <div style={{ fontSize: 12, color: C.verm, margin: '8px 0' }}>{erro}</div>}
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.clar }}>
                {['Concessionária', 'Estado', 'Isenção TE ICMS', 'Isenção TE PIS/COFINS', 'Isenção TUSD ICMS', 'Isenção TUSD PIS/COFINS', 'Origem', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.bord}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const v = valorAtual(l);
                const dirty = !!edicoes[l.distribuidora];
                return (
                  <tr key={l.distribuidora} style={{ borderBottom: `1px solid ${C.bord}` }}>
                    <td style={{ padding: '6px 8px' }}>{l.distribuidora}</td>
                    <td style={{ padding: '6px 8px' }}>{l.estado}</td>
                    <td style={{ padding: '6px 8px', maxWidth: 100 }}>
                      <SimNaoField value={v.teIcms} onChange={(val) => setCampo(l, 'teIcms', val)} />
                    </td>
                    <td style={{ padding: '6px 8px', maxWidth: 100 }}>
                      <SimNaoField value={v.tePisCofins} onChange={(val) => setCampo(l, 'tePisCofins', val)} />
                    </td>
                    <td style={{ padding: '6px 8px', maxWidth: 100 }}>
                      <SimNaoField value={v.tusdIcms} onChange={(val) => setCampo(l, 'tusdIcms', val)} />
                    </td>
                    <td style={{ padding: '6px 8px', maxWidth: 100 }}>
                      <SimNaoField value={v.tusdPisCofins} onChange={(val) => setCampo(l, 'tusdPisCofins', val)} />
                    </td>
                    <td style={{ padding: '6px 8px', color: l.temOverride ? C.amber : C.med }}>
                      {l.temOverride ? 'Personalizado' : 'Padrão do estado'}
                    </td>
                    <td style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
                      {dirty && (
                        <button
                          onClick={() => salvar(l)} disabled={salvando === l.distribuidora}
                          style={{ ...btnStyle, background: C.verde, color: '#fff', padding: '4px 10px', fontSize: 11, opacity: salvando === l.distribuidora ? 0.7 : 1 }}
                        >
                          Salvar
                        </button>
                      )}
                      {l.temOverride && (
                        <button
                          onClick={() => restaurar(l)} disabled={salvando === l.distribuidora}
                          style={{ ...btnStyle, background: '#fff', border: `1px solid ${C.bord}`, padding: '4px 10px', fontSize: 11, opacity: salvando === l.distribuidora ? 0.7 : 1 }}
                        >
                          <RotateCcw size={12} style={{ marginRight: 4 }} /> Restaurar padrão
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function UsuariosView({ usuarioAtual, onUsuarioAtualAtualizado }: {
  usuarioAtual: Usuario; onUsuarioAtualAtualizado: (u: Usuario) => void;
}) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState<Perfil>('operador');
  const [criando, setCriando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: number; nome: string; email: string; perfil: Perfil; novaSenha: string } | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

  const carregar = () => {
    setCarregando(true);
    listarUsuariosApi().then(setUsuarios).catch((e) => setErro(e instanceof Error ? e.message : String(e))).finally(() => setCarregando(false));
  };

  useEffect(carregar, []);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCriando(true);
    setErroForm(null);
    try {
      await criarUsuarioApi({ nome, email, senha, perfil });
      setNome(''); setEmail(''); setSenha(''); setPerfil('operador');
      carregar();
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : String(err));
    } finally {
      setCriando(false);
    }
  };

  const alternarStatus = async (u: Usuario) => {
    await alterarStatusUsuarioApi(u.id, !u.ativo);
    carregar();
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    setSalvandoEdicao(true);
    setErroEdicao(null);
    try {
      await atualizarUsuarioApi(editando.id, {
        nome: editando.nome, email: editando.email, perfil: editando.perfil,
        ...(editando.novaSenha ? { senha: editando.novaSenha } : {}),
      });
      if (editando.id === usuarioAtual.id) {
        onUsuarioAtualAtualizado({ ...usuarioAtual, nome: editando.nome, email: editando.email, perfil: editando.perfil });
      }
      setEditando(null);
      carregar();
    } catch (err) {
      setErroEdicao(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvandoEdicao(false);
    }
  };

  return (
    <div>
      <Section title="Novo Usuário" color={C.azul}>
        <form onSubmit={criar} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0 16px', alignItems: 'end' }}>
          <Field label="Nome"><input required style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
          <Field label="E-mail"><input type="email" required style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Senha (mín. 6 caracteres)"><input type="text" required minLength={6} style={inputStyle} value={senha} onChange={(e) => setSenha(e.target.value)} /></Field>
          <Field label="Perfil">
            <select style={inputStyle} value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
              <option value="operador">Operador</option>
              <option value="adm">ADM</option>
            </select>
          </Field>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <button type="submit" disabled={criando} style={{ ...btnStyle, background: C.verde, color: '#fff', opacity: criando ? 0.7 : 1 }}>
              {criando ? 'Criando…' : 'Criar usuário'}
            </button>
            {erroForm && <span style={{ fontSize: 12, color: C.verm }}>{erroForm}</span>}
          </div>
        </form>
      </Section>

      <Section title="Usuários Cadastrados" color={C.med}>
        {erro && <div style={{ fontSize: 12, color: C.verm, marginBottom: 12 }}>{erro}</div>}
        {erroEdicao && <div style={{ fontSize: 12, color: C.verm, marginBottom: 12 }}>{erroEdicao}</div>}
        {carregando ? (
          <p style={{ fontSize: 12, color: C.med }}>Carregando…</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.clar }}>
                  {['Nome', 'E-mail', 'Perfil', 'Status', ''].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.bord}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const emEdicao = editando?.id === u.id;
                  if (emEdicao) {
                    return (
                      <tr key={u.id} style={{ borderBottom: `1px solid ${C.bord}` }}>
                        <td style={{ padding: '6px 8px' }}>
                          <input style={inputStyle} value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="email" style={inputStyle} value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <select style={inputStyle} value={editando.perfil} onChange={(e) => setEditando({ ...editando, perfil: e.target.value as Perfil })}>
                            <option value="operador">Operador</option>
                            <option value="adm">ADM</option>
                          </select>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text" placeholder="Nova senha (opcional)" minLength={6} style={inputStyle}
                            value={editando.novaSenha} onChange={(e) => setEditando({ ...editando, novaSenha: e.target.value })}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
                          <button
                            onClick={salvarEdicao} disabled={salvandoEdicao}
                            style={{ ...btnStyle, background: C.verde, color: '#fff', padding: '4px 10px', fontSize: 11, opacity: salvandoEdicao ? 0.7 : 1 }}
                          >
                            Salvar
                          </button>
                          <button
                            onClick={() => { setEditando(null); setErroEdicao(null); }}
                            style={{ ...btnStyle, background: '#fff', border: `1px solid ${C.bord}`, padding: '4px 10px', fontSize: 11 }}
                          >
                            Cancelar
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={u.id} style={{ borderBottom: `1px solid ${C.bord}` }}>
                      <td style={{ padding: '6px 8px' }}>{u.nome}</td>
                      <td style={{ padding: '6px 8px' }}>{u.email}</td>
                      <td style={{ padding: '6px 8px' }}>{u.perfil === 'adm' ? 'ADM' : 'Operador'}</td>
                      <td style={{ padding: '6px 8px', color: u.ativo ? C.verde : C.verm }}>{u.ativo ? 'Ativo' : 'Inativo'}</td>
                      <td style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => { setEditando({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, novaSenha: '' }); setErroEdicao(null); }}
                          style={{ ...btnStyle, background: C.azulC, color: C.azul, padding: '4px 10px', fontSize: 11 }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => alternarStatus(u)}
                          style={{ ...btnStyle, background: u.ativo ? C.vermC : C.verdeC, color: u.ativo ? C.verm : C.verde, padding: '4px 10px', fontSize: 11 }}
                        >
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

const norm = (s: string) => s.trim().toLowerCase();
const PAGINA = 100;

function ConsultaTarifasView({ tarifasVersion }: { tarifasVersion: number }) {
  const [dataset, setDataset] = useState<'b1' | 'componentes'>('b1');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(PAGINA);

  const resultado = useMemo(() => {
    const linhasB1 = getTarifasB1();
    const linhasComp = getComponentes();
    const termo = norm(busca);
    if (dataset === 'b1') {
      const filtradas = (termo
        ? linhasB1.filter((l) => norm(l.codigo).includes(termo) || norm(resolverDistribuidoraPorCodigo(l.codigo, 'b1') ?? '').includes(termo))
        : linhasB1
      ).slice().sort((a, b) => b.inicioVigencia.localeCompare(a.inicioVigencia));
      return { total: filtradas.length, linhas: filtradas.slice(0, limite) as (TarifaB1Row | ComponenteRow)[] };
    }
    const filtradas = (termo
      ? linhasComp.filter((l) => norm(l.codigo).includes(termo) || norm(resolverDistribuidoraPorCodigo(l.codigo, 'componentes') ?? '').includes(termo))
      : linhasComp
    ).slice().sort((a, b) => (b.inicioVigencia ?? '').localeCompare(a.inicioVigencia ?? ''));
    return { total: filtradas.length, linhas: filtradas.slice(0, limite) as (TarifaB1Row | ComponenteRow)[] };
  }, [dataset, busca, limite, tarifasVersion]);

  return (
    <div>
      <Section title="Consulta ao Banco de Tarifas">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ minWidth: 220 }}>
            <Field label="Dataset">
              <select
                style={inputStyle} value={dataset}
                onChange={(e) => { setDataset(e.target.value as 'b1' | 'componentes'); setLimite(PAGINA); }}
              >
                <option value="b1">Tarifas B1 (TE/TUSD)</option>
                <option value="componentes">Componentes (Fio B / Fio A)</option>
              </select>
            </Field>
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <Field label="Buscar por distribuidora ou código ANEEL">
              <input
                style={inputStyle} value={busca} placeholder="ex: Cemig, CPFL, COELBA…"
                onChange={(e) => { setBusca(e.target.value); setLimite(PAGINA); }}
              />
            </Field>
          </div>
        </div>
        <p style={{ fontSize: 12, color: C.med, marginBottom: 12 }}>
          {resultado.total} resultado(s){resultado.total > resultado.linhas.length && ` — mostrando os ${resultado.linhas.length} mais recentes`}
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.clar }}>
                {(dataset === 'b1'
                  ? ['Distribuidora', 'Código', 'Detalhe', 'Início Vig.', 'Fim Vig.', 'Resolução', 'TUSD (R$/MWh)', 'TE (R$/MWh)', 'Total (R$/MWh)']
                  : ['Distribuidora', 'Código', 'Início Vig.', 'Fim Vig.', 'Componente', 'Valor (R$/MWh)']
                ).map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.bord}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resultado.linhas.map((l, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.bord}` }}>
                  <td style={{ padding: '6px 8px' }}>{resolverDistribuidoraPorCodigo(l.codigo, dataset) ?? <span style={{ color: C.med }}>—</span>}</td>
                  <td style={{ padding: '6px 8px' }}>{l.codigo}</td>
                  {dataset === 'b1' && <td style={{ padding: '6px 8px' }}>{(l as TarifaB1Row).detalhe}</td>}
                  <td style={{ padding: '6px 8px' }}>{l.inicioVigencia}</td>
                  <td style={{ padding: '6px 8px' }}>{l.fimVigencia}</td>
                  {dataset === 'b1' ? (
                    <>
                      <td style={{ padding: '6px 8px', maxWidth: 260 }}>{(l as TarifaB1Row).resolucao}</td>
                      <td style={{ padding: '6px 8px' }}>{R((l as TarifaB1Row).tusd, 2)}</td>
                      <td style={{ padding: '6px 8px' }}>{R((l as TarifaB1Row).te, 2)}</td>
                      <td style={{ padding: '6px 8px' }}>{R((l as TarifaB1Row).total, 2)}</td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '6px 8px' }}>{(l as ComponenteRow).componente}</td>
                      <td style={{ padding: '6px 8px' }}>{R((l as ComponenteRow).valor, 2)}</td>
                    </>
                  )}
                </tr>
              ))}
              {resultado.linhas.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '12px 8px', color: C.med }}>Nenhum resultado para essa busca.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {resultado.total > resultado.linhas.length && (
          <button onClick={() => setLimite((v) => v + PAGINA)} style={{ ...btnStyle, background: '#fff', border: `1px solid ${C.bord}`, marginTop: 12 }}>
            Carregar mais
          </button>
        )}
      </Section>
    </div>
  );
}

function ResultadosView({ r }: { r: ReturnType<typeof calcularParceria> }) {
  return (
    <div>
      <Section title="Gerador" color={C.verde}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KPICard
            label="T_gerador" value={RKWH(r.tGerador)}
            sub={`${PCT(1 - r.tGerador / r.tarifaCompensada)} de deságio vs. T_compensada`}
            color={C.verde} destaque
          />
          <KPICard label="T_compensada" value={RKWH(r.tarifaCompensada)} color={C.verde} bg={C.verdeC} />
          <KPICard label="Faturamento Bruto Gerador" value={RM(r.faturamentoBrutoGerador)} sub="por mês" color={C.verde} bg={C.verdeC} />
          <KPICard
            label="Faturamento Anual" value={RM(r.faturamentoAnualGerador)}
            sub={`12 - ${R(r.pescoco, 1)} meses de pescoço`}
            color={C.verde} bg={C.verdeC}
          />
        </div>
      </Section>

      <Section title="Cliente" color={C.amber}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <KPICard label="Valor Injeção" value={RM(r.valorInjecao)} bg={C.amberC} color={C.amber} />
          <KPICard label="T_cliente_final" value={RKWH(r.tClienteFinal)} bg={C.amberC} color={C.amber} />
          <KPICard label="% Desconto Líquido" value={PCT(r.percentualDescontoLiquido)} bg={C.amberC} color={C.amber} />
        </div>
      </Section>

      <Section title="Alexandria" color={C.azul}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KPICard label="Faturamento Pescoço (R$)" value={RM(r.faturamento1Mes)} bg={C.azulC} color={C.azul} />
          <KPICard label="Recorrência Mensal (R$)" value={RM(r.recorrenciaMensal)} bg={C.azulC} color={C.azul} />
          <KPICard label="Faturamento 1º Ano (R$)" value={RM(r.faturamento1Ano)} bg={C.azulC} color={C.azul} />
          <KPICard label="TakeRate 1º Ano (R$)" value={PCT(r.takeRate1Ano)} bg={C.azulC} color={C.azul} />
        </div>
      </Section>

      <Section title="Detalhes Técnicos" color={C.med}>
        <SubGrupo titulo="Enquadramento">
          <DetailRow label="Estado" value={r.estado} />
          <DetailRow label="Faixa de potência" value={r.faixa} />
          <DetailRow label="Nº de clientes atendidos" value={R(r.numeroClientes, 1)} />
        </SubGrupo>

        <SubGrupo
          titulo="Tarifas ANEEL"
          extra={`Vigência: ${r.tarifaVigente.inicioVigencia} a ${r.tarifaVigente.fimVigencia}`}
        >
          <DetailRow label="Tarifa TE" value={RKWH(r.tarifaVigente.te)} />
          <DetailRow label="Tarifa TUSD" value={RKWH(r.tarifaVigente.tusd)} />
          <DetailRow label="Tarifa ANEEL (TE + TUSD)" value={RKWH(r.trfAneel)} />
          <DetailRow label="TUSD Fio B" value={RKWH(r.componentesTusd.fioB)} />
          <DetailRow label="% rampa Fio B" value={PCT(r.fioBRampaPct)} />
          <DetailRow label="Tarifa distribuidora (c/ tributos)" value={RKWH(r.trfDistribuidora)} />
        </SubGrupo>

        <SubGrupo titulo="Impostos e Isenções" ultimo>
          <DetailRow label="ICMS" value={PCT(r.icmsAliquota)} />
          <DetailRow label="Isenção TE ICMS" value={r.isencoes.teIcms ? 'Sim' : 'Não'} />
          <DetailRow label="Isenção TUSD ICMS" value={r.isencoes.tusdIcms ? 'Sim' : 'Não'} />
          <DetailRow label="PIS/COFINS" value={PCT(r.pisCofinsAliquota)} />
          <DetailRow label="Isenção TE PIS/COFINS" value={r.isencoes.tePisCofins ? 'Sim' : 'Não'} />
          <DetailRow label="Isenção TUSD PIS/COFINS" value={r.isencoes.tusdPisCofins ? 'Sim' : 'Não'} />
        </SubGrupo>
      </Section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.bord}` }}>
      <span style={{ color: C.med }}>{label}</span>
      <span style={{ fontWeight: 600, color: C.esc }}>{value}</span>
    </div>
  );
}

function SubGrupo({ titulo, extra, ultimo, colunas = 3, fontSize = 12, children }: {
  titulo: string; extra?: string; ultimo?: boolean; colunas?: number; fontSize?: number; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: ultimo ? 0 : 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.med, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {titulo}
        </div>
        {extra && <div style={{ fontSize: 11, fontWeight: 700, color: C.esc }}>{extra}</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colunas}, 1fr)`, gap: '4px 20px', fontSize }}>
        {children}
      </div>
    </div>
  );
}

// ── Documento: Proposta de Parceria ──────────────────────────────────────────

const paginaStyle: React.CSSProperties = {
  background: '#fff', maxWidth: 780, margin: '0 auto 28px', padding: '48px 56px 32px',
  position: 'relative', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
  fontSize: 13, color: C.esc, lineHeight: 1.5,
};

function BarraGradiente() {
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, height: 6,
      background: 'linear-gradient(90deg, #e34948 0%, #eda100 33%, #2a78d6 66%, #6a4c93 100%)',
    }} />
  );
}

function LogoMarca() {
  return (
    <div style={{ position: 'absolute', top: 40, right: 56 }}>
      <img src={logoLex} alt="Lex by Alexandria" style={{ height: 40, width: 'auto', display: 'block' }} />
    </div>
  );
}

function TituloSecao({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontWeight: 700, fontSize: 13, margin: '20px 0 8px',
      borderTop: `1px solid ${C.bord}`, paddingTop: 16,
    }}>
      {children}
    </div>
  );
}

function LinhaAnexo({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: '6px 12px', border: `1px solid ${C.bord}`, fontWeight: 600 }}>{label}</td>
      <td style={{ padding: '6px 12px', border: `1px solid ${C.bord}`, textAlign: 'right' }}>{value}</td>
    </tr>
  );
}

function RelatorioView({ input, r, proposta, emissao }: {
  input: ParceriaInput; r: ReturnType<typeof calcularParceria>; proposta: PropostaInfo;
  emissao: { revisao: number; dataEmissao: string } | null;
}) {
  const nomeUsina = proposta.nomeUsina.trim() || '[Nome da usina]';
  const negociador = proposta.negociador.trim() || '[Negociador]';
  const dataDocumento = emissao ? new Date(emissao.dataEmissao) : new Date();
  const dataFormatada = dataDocumento.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const revisaoLabel = emissao ? `REV${String(emissao.revisao).padStart(2, '0')}` : 'RASCUNHO — não emitida';
  const multaConfidencialidade = 500000 * input.potenciaConexaoMW;

  return (
    <div>
      {/* PÁGINA 1 */}
      <div className="pagina-proposta" style={paginaStyle}>
        <LogoMarca />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.amber, textAlign: 'center', marginBottom: 4 }}>
          PROPOSTA DE PARCERIA
        </h1>
        <p style={{ textAlign: 'center', fontSize: 11, color: emissao ? C.verde : C.med, fontWeight: 700, marginBottom: 24 }}>
          {revisaoLabel} — {dataFormatada}
        </p>

        <p style={{ fontWeight: 700, marginBottom: 4 }}>Partes:</p>
        <p>{NOME_ASSOCIACAO}</p>
        <p>Alexandria Tecnologia e Desenvolvimento S.A.</p>
        <p>Parceiro {nomeUsina}</p>

        <TituloSecao>CONDIÇÕES COMERCIAIS</TituloSecao>
        <div style={{ fontSize: 10, color: C.med, marginBottom: 4 }}>Anexo I</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>
          <thead>
            <tr>
              <th colSpan={2} style={{ padding: '8px 12px', border: `1px solid ${C.bord}`, background: C.clar, textAlign: 'center' }}>
                {nomeUsina}
              </th>
            </tr>
          </thead>
          <tbody>
            <LinhaAnexo label="Concessionária" value={input.distribuidora} />
            <LinhaAnexo label="Potência CA (MW)" value={R(input.potenciaConexaoMW, 3)} />
            <LinhaAnexo label="Potência CC (MWp)" value={R(input.potenciaInstaladaMWp, 3)} />
            <LinhaAnexo label="Tipo de conexão" value={input.enquadramento} />
            <LinhaAnexo label="Geração estimada mensal (kWh)" value={R(r.geracaoMensalKWh)} />
            <LinhaAnexo label="Percentual Alexandria" value={PCT(input.desagioPct)} />
            <LinhaAnexo label="Porcentagem da primeira geração Alexandria" value={PCT(r.pescoco)} />
            <LinhaAnexo label="Desconto para o cliente final" value={PCT(r.descontoClientePct)} />
            <LinhaAnexo label="Valor aproximado de R$/kWh" value={R(r.tGerador, 3)} />
          </tbody>
        </table>

        <TituloSecao>Objeto</TituloSecao>
        <p>
          Parceria para compensação de créditos de energia elétrica gerados por usina fotovoltaica (UFV) no
          Sistema de Compensação de Energia Elétrica (SCEE). Alexandria gerencia a UG e rateia créditos entre
          consumidores associados à Associação.
        </p>

        <TituloSecao>Estrutura do Projeto</TituloSecao>
        <p>Modalidade: <b>{input.modalidade}</b>.</p>
        <p>Consumidores aderem via <b>Termo de Associação</b> e procuração.</p>
        <p>Fluxo de compensação de crédito: Parceiro → créditos → Associação → consumidores.</p>

        <TituloSecao>Prazo</TituloSecao>
        <p><b>Vigência:</b> {proposta.vigenciaAnos} anos, renovável por termo aditivo.</p>
        <p><b>Aviso prévio para rescisão imotivada:</b> {proposta.avisoPrevioDias} dias.</p>

        <TituloSecao>Detalhes Técnicos</TituloSecao>
        <SubGrupo titulo="Enquadramento" colunas={2} fontSize={11}>
          <DetailRow label="Estado" value={r.estado} />
          <DetailRow label="Faixa de potência" value={r.faixa} />
        </SubGrupo>
        <SubGrupo titulo="Tarifas ANEEL" extra={`Vigência: ${r.tarifaVigente.inicioVigencia} a ${r.tarifaVigente.fimVigencia}`} colunas={2} fontSize={11}>
          <DetailRow label="Tarifa TE" value={RKWH(r.tarifaVigente.te)} />
          <DetailRow label="Tarifa TUSD" value={RKWH(r.tarifaVigente.tusd)} />
          <DetailRow label="Tarifa ANEEL (TE + TUSD)" value={RKWH(r.trfAneel)} />
          <DetailRow label="TUSD Fio B" value={RKWH(r.componentesTusd.fioB)} />
          <DetailRow label="% rampa Fio B" value={PCT(r.fioBRampaPct)} />
          <DetailRow label="Tarifa distribuidora (c/ tributos)" value={RKWH(r.trfDistribuidora)} />
        </SubGrupo>
        <SubGrupo titulo="Impostos e Isenções" colunas={2} fontSize={11} ultimo>
          <DetailRow label="ICMS" value={PCT(r.icmsAliquota)} />
          <DetailRow label="Isenção TE ICMS" value={r.isencoes.teIcms ? 'Sim' : 'Não'} />
          <DetailRow label="Isenção TUSD ICMS" value={r.isencoes.tusdIcms ? 'Sim' : 'Não'} />
          <DetailRow label="PIS/COFINS" value={PCT(r.pisCofinsAliquota)} />
          <DetailRow label="Isenção TE PIS/COFINS" value={r.isencoes.tePisCofins ? 'Sim' : 'Não'} />
          <DetailRow label="Isenção TUSD PIS/COFINS" value={r.isencoes.tusdPisCofins ? 'Sim' : 'Não'} />
        </SubGrupo>
        <BarraGradiente />
      </div>

      {/* PÁGINA 2 */}
      <div className="pagina-proposta" style={paginaStyle}>
        <LogoMarca />
        <TituloSecao>Fórmula de Pagamento</TituloSecao>

        <p style={{ fontWeight: 700 }}>Obrigações Comerciais da Alexandria</p>
        <p><b>Envio das faturas:</b> Alexandria envia faturas das Distribuidoras Locais e da Associação aos consumidores.</p>
        <p><b>Demonstrativo de Energia Compensada:</b> informações disponibilizadas através do portal da Alexandria (Painel do Gerador).</p>
        <p><b>Cobrança de inadimplentes:</b> responsabilidade integral da Alexandria.</p>
        <p><b>Pós-vendas:</b> comunicação contínua com consumidor desde assinatura até início da compensação.</p>

        <TituloSecao>Condição Precedente à Remuneração</TituloSecao>

        <p style={{ fontWeight: 700, marginTop: 12 }}>Remuneração da Alexandria</p>
        <p><b>Remuneração Inicial:</b> 100% sobre o Valor Integral da Primeira Fatura da Associação.</p>
        <p><b>Remuneração Recorrente:</b> percentual sobre faturas pagas pelo consumidor.</p>
        <p style={{ fontStyle: 'italic', background: C.clar, padding: '8px 12px', borderRadius: 6 }}>
          Cálculo: [(Tarifa Compensável − Tarifa Distribuidora × Desconto %) × Volume de Energia Gerada × % Efetivamente Compensado]
        </p>

        <p style={{ fontWeight: 700, marginTop: 12 }}>Remuneração do Parceiro</p>
        <p>Locação de imóvel + Locação de equipamento por produtividade variável:</p>
        <p>Locação de imóvel: {RM(proposta.valorLocacaoImovel)} mensais referente contrato de locação;</p>
        <p style={{ fontStyle: 'italic', background: C.clar, padding: '8px 12px', borderRadius: 6 }}>
          Locação de equipamento por produtividade variável: [(Tarifa Compensável − Tarifa Distribuidora × Desconto %) ×
          Volume de Energia Gerada × % Efetivamente Compensado, no período de apuração] − percentual recorrente
          Alexandria − Locação de Imóvel − Fatura da Usina.
        </p>

        <TituloSecao>Marcos de Pagamento</TituloSecao>
        <p><b>Remuneração Inicial:</b> paga na primeira fatura ou complementada na segunda, ou seja, até completar 100% da geração da usina.</p>
        <p><b>Remuneração Recorrente:</b> mensal, após o segundo pagamento do consumidor.</p>
        <BarraGradiente />
      </div>

      {/* PÁGINA 3 */}
      <div className="pagina-proposta" style={paginaStyle}>
        <LogoMarca />
        <TituloSecao>Inadimplência</TituloSecao>
        <p>Alexandria não recebe remuneração recorrente do cliente inadimplente até quitação.</p>
        <p>UCs inadimplentes podem ser excluídas do projeto.</p>

        <TituloSecao>Vigência da Remuneração</TituloSecao>
        <p>Alexandria recebe enquanto houver parceria ativa.</p>
        <p style={{ fontWeight: 700, marginTop: 8 }}>Parceiro:</p>
        <p>Locação do imóvel: {RM(proposta.valorLocacaoImovel)}/mês.</p>
        <p>Locação dos equipamentos: remuneração variável baseada na energia compensada, descontados custos e fee Alexandria.</p>

        <TituloSecao>Rescisão</TituloSecao>
        <p><b>Motivada imediata:</b> inadimplemento superior a 15 dias da data combinada para repasse, perda de
          enquadramento regulatório, impossibilidade de troca de titularidade, falência.</p>
        <p><b>Imotivada sem multa:</b> aviso prévio de {proposta.avisoPrevioDias} dias.</p>
        <p style={{ fontWeight: 700, marginTop: 8 }}>Consequências:</p>
        <p>Quitação de valores vencidos/vincendos.</p>
        <p>Realocação das UCs pela Alexandria.</p>
        <p>Proibição de inclusão de novas UCs após aviso de rescisão.</p>

        <TituloSecao>Inadimplência</TituloSecao>
        <p>Associação assume risco de inadimplência, sem repasse ao Parceiro.</p>

        <TituloSecao>Vacância</TituloSecao>
        <p>Inclusão de novas UCs depende de disponibilidade de energia e UFV.</p>
        <p>Exclusão ocorre por inadimplência ou descumprimento das regras contratuais.</p>
        <p>Alexandria deve realocar UCs em caso de saída ou rescisão.</p>
        <BarraGradiente />
      </div>

      {/* PÁGINA 4 */}
      <div className="pagina-proposta" style={paginaStyle}>
        <LogoMarca />
        <TituloSecao>Obrigações Comerciais</TituloSecao>
        <p><b>Parceiro:</b> O&M da usina, custos operacionais, segurança patrimonial e etc.</p>
        <p><b>Alexandria:</b> captação de consumidores, gestão financeira, cobrança de inadimplentes, envio de faturas.</p>

        <TituloSecao>Cláusulas Sensíveis</TituloSecao>
        <p><b>Confidencialidade:</b> multa de R$ 500.000,00 por MWca por violação ({RM(multaConfidencialidade)} = R$500.000,00 × {R(input.potenciaConexaoMW, 3)} MWca).</p>
        <p><b>LGPD:</b> Alexandria/Associação como controladoras; Parceiro como operador.</p>
        <p><b>Anticorrupção:</b> observância à Lei 12.846/2013.</p>
        <p><b>Créditos de Carbono:</b> titularidade exclusiva do Parceiro.</p>

        <TituloSecao>Anexos do contrato</TituloSecao>
        <p><b>Anexo I:</b> Proposta Comercial (potência, geração estimada, desconto ao cliente).</p>
        <p><b>Anexo II:</b> Condições de remuneração e cálculo das faturas.</p>
        <p><b>Anexo III:</b> Contrato de locação (imóvel + UG).</p>

        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <p>{CIDADE_PROPOSTA}, {dataFormatada}</p>
          <p style={{ marginTop: 24 }}>{negociador}</p>
        </div>
        <BarraGradiente />
      </div>
    </div>
  );
}
