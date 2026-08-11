import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { DadosCliente, EspecificacoesBess, CapexInputs, ModoOperacao } from './types'
import { calcularResultadoCompleto } from './lib/engine'
import { DADOS_CLIENTE_PADRAO, ESPECIFICACOES_BESS_PADRAO, CAPEX_INPUTS_PADRAO } from './lib/defaults'

const TABS = ['Dados do Cliente', 'Especificação BESS', 'CAPEX', 'Resultados'] as const
type Tab = (typeof TABS)[number]

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function fmtNum(v: number, casas = 0): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}
function fmtPct(v: number, casas = 1): string {
  return `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  step?: number
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <span style={{ color: '#5a5a55' }}>
        {label} {suffix ? <span style={{ color: '#999' }}>({suffix})</span> : null}
      </span>
      <input
        type="number"
        value={value}
        step={step ?? 'any'}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 }}
      />
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e2da', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#2c2c2a' }}>{title}</h3>
      {children}
    </div>
  )
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

export default function App() {
  const [tab, setTab] = useState<Tab>('Dados do Cliente')
  const [cliente, setCliente] = useState<DadosCliente>(DADOS_CLIENTE_PADRAO)
  const [bess, setBess] = useState<EspecificacoesBess>(ESPECIFICACOES_BESS_PADRAO)
  const [capexInputs, setCapexInputs] = useState<CapexInputs>(CAPEX_INPUTS_PADRAO)
  const [erro, setErro] = useState<string | null>(null)

  const resultado = useMemo(() => {
    try {
      setErro(null)
      return calcularResultadoCompleto(cliente, bess, capexInputs)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      return null
    }
  }, [cliente, bess, capexInputs])

  function set<K extends keyof DadosCliente>(key: K, value: DadosCliente[K]) {
    setCliente((c) => ({ ...c, [key]: value }))
  }
  function setBessField<K extends keyof EspecificacoesBess>(key: K, value: EspecificacoesBess[K]) {
    setBess((b) => ({ ...b, [key]: value }))
  }
  function setCapexField<K extends keyof CapexInputs>(key: K, value: CapexInputs[K]) {
    setCapexInputs((c) => ({ ...c, [key]: value }))
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Dimensionador BESS</h1>
        <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
          Dimensionamento técnico + análise financeira de sistemas de armazenamento de energia
          (time-shift, backup, peak-shaving). Valores padrão: caso Caterpillar Campo Largo / WEG.
        </p>
      </header>

      <nav style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e3e2da' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 14px',
              border: 'none',
              background: 'transparent',
              borderBottom: tab === t ? '2px solid #2a78d6' : '2px solid transparent',
              color: tab === t ? '#2a78d6' : '#666',
              fontWeight: tab === t ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      {erro && (
        <div style={{ background: '#fde8e8', border: '1px solid #f3b4b4', color: '#a33', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {erro}
        </div>
      )}

      {tab === 'Dados do Cliente' && (
        <>
          <Section title="Cliente e modalidade">
            <div style={grid}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                <span style={{ color: '#5a5a55' }}>Cliente</span>
                <input
                  value={cliente.nomeCliente}
                  onChange={(e) => set('nomeCliente', e.target.value)}
                  style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                <span style={{ color: '#5a5a55' }}>Modalidade tarifária</span>
                <input
                  value={cliente.modalidadeTarifaria}
                  onChange={(e) => set('modalidadeTarifaria', e.target.value)}
                  style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                <span style={{ color: '#5a5a55' }}>Modo de operação</span>
                <select
                  value={cliente.modoOperacao}
                  onChange={(e) => set('modoOperacao', e.target.value as ModoOperacao)}
                  style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 }}
                >
                  <option value="TIME-SHIFT">TIME-SHIFT</option>
                  <option value="BACKUP">BACKUP</option>
                  <option value="PEAK-SHAVING">PEAK-SHAVING</option>
                </select>
              </label>
            </div>
          </Section>

          <Section title="Consumo e demanda (fatura)">
            <div style={grid}>
              <NumberField label="Consumo médio ponta" suffix="kWh/mês" value={cliente.consumoMedioPontaKwh} onChange={(v) => set('consumoMedioPontaKwh', v)} />
              <NumberField label="Demanda máxima medida na ponta" suffix="kW" value={cliente.demandaMaximaPontaKw} onChange={(v) => set('demandaMaximaPontaKw', v)} />
              <NumberField label="Demanda contratada" suffix="kW" value={cliente.demandaContratadaKw} onChange={(v) => set('demandaContratadaKw', v)} />
              <NumberField label="Tarifa ponta (c/ ML)" suffix="R$/kWh" value={cliente.tarifaPontaComML} onChange={(v) => set('tarifaPontaComML', v)} step={0.0001} />
              <NumberField label="Tarifa fora ponta" suffix="R$/kWh" value={cliente.tarifaForaPonta} onChange={(v) => set('tarifaForaPonta', v)} step={0.0001} />
            </div>
          </Section>

          <Section title="Premissas operacionais e financeiras">
            <div style={grid}>
              <NumberField label="Horas de ponta por dia" suffix="h" value={cliente.horasPontaPorDia} onChange={(v) => set('horasPontaPorDia', v)} />
              <NumberField label="Dias úteis por mês" value={cliente.diasUteisPorMes} onChange={(v) => set('diasUteisPorMes', v)} />
              <NumberField label="Vida útil do projeto" suffix="anos" value={cliente.vidaUtilAnos} onChange={(v) => set('vidaUtilAnos', v)} />
              <NumberField label="Cobertura da ponta pelo BESS" suffix="0–1" value={cliente.coberturaPontaPercent} onChange={(v) => set('coberturaPontaPercent', v)} step={0.01} />
              <NumberField label="TMA" suffix="fração" value={cliente.tma} onChange={(v) => set('tma', v)} step={0.01} />
              <NumberField label="Inflação anual (tarifa)" suffix="fração" value={cliente.inflacaoAnualTarifa} onChange={(v) => set('inflacaoAnualTarifa', v)} step={0.01} />
              <NumberField label="IPCA (reajuste O&M)" suffix="fração" value={cliente.ipca} onChange={(v) => set('ipca', v)} step={0.01} />
            </div>
          </Section>

          {cliente.modoOperacao === 'BACKUP' && (
            <Section title="Parâmetros de BACKUP">
              <div style={grid}>
                <NumberField label="Horas de backup adicionais" suffix="h" value={cliente.horasBackup ?? 0} onChange={(v) => set('horasBackup', v)} />
                <NumberField label="Demanda média normal (fora ponta)" suffix="kW" value={cliente.demandaMediaNormalKw ?? 0} onChange={(v) => set('demandaMediaNormalKw', v)} />
                <NumberField label="Custo evitado de interrupção (opcional)" suffix="R$/ano" value={cliente.custoEvitadoInterrupcaoAnual ?? 0} onChange={(v) => set('custoEvitadoInterrupcaoAnual', v)} />
              </div>
              <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                O modo backup não gera economia por arbitragem tarifária — o valor dele é
                continuidade operacional. Informe um custo evitado de interrupção se quiser
                refletir isso no fluxo de caixa; senão a economia anual desse modo fica em zero.
              </p>
            </Section>
          )}

          {cliente.modoOperacao === 'PEAK-SHAVING' && (
            <Section title="Parâmetros de PEAK-SHAVING">
              <div style={grid}>
                <NumberField label="Limite de demanda a não ultrapassar" suffix="kW" value={cliente.limiteDemandaKw ?? 0} onChange={(v) => set('limiteDemandaKw', v)} />
                <NumberField label="Tarifa de demanda evitada" suffix="R$/kW/mês" value={cliente.tarifaDemandaUltrapassagem ?? 0} onChange={(v) => set('tarifaDemandaUltrapassagem', v)} step={0.01} />
              </div>
            </Section>
          )}
        </>
      )}

      {tab === 'Especificação BESS' && (
        <Section title="Unidade / rack do BESS">
          <div style={grid}>
            <NumberField label="Capacidade por rack" suffix="kWh" value={bess.capacidadePorRackKwh} onChange={(v) => setBessField('capacidadePorRackKwh', v)} />
            <NumberField label="Potência por rack" suffix="kW" value={bess.potenciaPorRackKw} onChange={(v) => setBessField('potenciaPorRackKw', v)} />
            <NumberField label="Profundidade de descarga (DoD)" suffix="0–1" value={bess.dod} onChange={(v) => setBessField('dod', v)} step={0.01} />
            <NumberField label="Eficiência RTE" suffix="0–1" value={bess.rte} onChange={(v) => setBessField('rte', v)} step={0.01} />
            <NumberField
              label="Override manual do nº de racks (opcional)"
              suffix="deixe 0 para automático"
              value={bess.racksAdotadoOverride ?? 0}
              onChange={(v) => setBessField('racksAdotadoOverride', v > 0 ? v : undefined)}
            />
          </div>
          {resultado && (
            <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
              Mínimo calculado: {resultado.dimensionamento.racksPorEnergia} rack(s) por energia,{' '}
              {resultado.dimensionamento.racksPorPotencia} por potência → adotado:{' '}
              <strong>{resultado.dimensionamento.racksAdotado}</strong>.
            </p>
          )}
        </Section>
      )}

      {tab === 'CAPEX' && (
        <Section title="Precificação (valores de NF / cotação do fornecedor)">
          <div style={grid}>
            <NumberField label="Valor total dos racks (NF distribuidor)" suffix="R$" value={capexInputs.valorTotalRacks} onChange={(v) => setCapexField('valorTotalRacks', v)} />
            <NumberField label="Frete" suffix="% do valor dos racks" value={capexInputs.fretePercent} onChange={(v) => setCapexField('fretePercent', v)} step={0.01} />
            <NumberField label="Instalação, materiais e projeto" suffix="% do valor dos racks" value={capexInputs.instalacaoPercent} onChange={(v) => setCapexField('instalacaoPercent', v)} step={0.01} />
            <NumberField label="Custos BRLUX" suffix="fração" value={capexInputs.custosBrluxPercent} onChange={(v) => setCapexField('custosBrluxPercent', v)} step={0.01} />
            <NumberField label="Comissão" suffix="fração do contrato" value={capexInputs.comissaoPercent} onChange={(v) => setCapexField('comissaoPercent', v)} step={0.01} />
            <NumberField label="Lucro" suffix="fração do contrato" value={capexInputs.lucroPercent} onChange={(v) => setCapexField('lucroPercent', v)} step={0.01} />
            <NumberField label="Impostos" suffix="fração da NF Kora" value={capexInputs.impostosPercent} onChange={(v) => setCapexField('impostosPercent', v)} step={0.01} />
            <NumberField label="O&M anual" suffix="% do CAPEX" value={capexInputs.omAnualPercent} onChange={(v) => setCapexField('omAnualPercent', v)} step={0.001} />
          </div>
        </Section>
      )}

      {tab === 'Resultados' && resultado && (
        <>
          <Section title="Dimensionamento">
            <div style={grid}>
              <Stat label="Energia necessária/dia" value={`${fmtNum(resultado.dimensionamento.energiaNecessariaDia)} kWh`} />
              <Stat label="Capacidade nominal mínima" value={`${fmtNum(resultado.dimensionamento.capacidadeNominalMinima)} kWh`} />
              <Stat label="Potência necessária" value={`${fmtNum(resultado.dimensionamento.potenciaNecessaria)} kW`} />
              <Stat label="Racks adotados" value={fmtNum(resultado.dimensionamento.racksAdotado)} />
              <Stat label="Capacidade instalada" value={`${fmtNum(resultado.dimensionamento.capacidadeInstalada)} kWh`} />
              <Stat label="Potência instalada" value={`${fmtNum(resultado.dimensionamento.potenciaInstalada)} kW`} />
              <Stat label="Autonomia ano 1" value={`${fmtNum(resultado.dimensionamento.autonomia1AnoH, 2)} h`} />
              <Stat label={`Autonomia ano ${cliente.vidaUtilAnos}`} value={`${fmtNum(resultado.dimensionamento.autonomiaUltimoAnoH, 2)} h`} />
              <Stat label="SoH ano 1" value={fmtPct(resultado.dimensionamento.sohApos1Ano)} />
              <Stat label={`SoH ano ${cliente.vidaUtilAnos}`} value={fmtPct(resultado.dimensionamento.sohFinalProjeto)} />
            </div>
          </Section>

          <Section title="CAPEX">
            <div style={grid}>
              <Stat label="Valor equipamentos + frete" value={fmtBRL(resultado.capex.valorEquipamentosFrete)} />
              <Stat label="Instalação/materiais/projeto" value={fmtBRL(resultado.capex.instalacao)} />
              <Stat label="NF Kora" value={fmtBRL(resultado.capex.nfKora)} />
              <Stat label="NF Distribuidores" value={fmtBRL(resultado.capex.nfDistribuidores)} />
              <Stat label="Preço de venda (CAPEX total)" value={fmtBRL(resultado.capex.capexTotal)} destaque />
              <Stat label="O&M anual" value={fmtBRL(resultado.capex.omAnual)} />
              <Stat label="Mensalidade O&M" value={fmtBRL(resultado.capex.mensalidadeOM)} />
            </div>
          </Section>

          <Section title="Indicadores financeiros">
            <div style={grid}>
              <Stat label="VPL" value={fmtBRL(resultado.indicadores.vpl)} destaque={resultado.indicadores.vpl > 0} />
              <Stat label="TIR" value={resultado.indicadores.tir !== null ? fmtPct(resultado.indicadores.tir, 2) : '—'} />
              <Stat label="Payback" value={resultado.indicadores.paybackAnos !== null ? `${fmtNum(resultado.indicadores.paybackAnos, 1)} anos` : 'não recupera'} />
              <Stat
                label="Viabilidade"
                value={resultado.indicadores.viavel ? 'VIÁVEL' : 'NÃO VIÁVEL'}
                destaque={resultado.indicadores.viavel}
                alerta={!resultado.indicadores.viavel}
              />
            </div>

            <div style={{ marginTop: 20, height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resultado.indicadores.fluxoCaixa}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="ano" tick={{ fontSize: 11 }} label={{ value: 'Ano', position: 'insideBottom', dy: 10, fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtBRL(v)} width={90} />
                  <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(l) => `Ano ${l}`} />
                  <Legend />
                  <ReferenceLine y={0} stroke="#999" />
                  <Bar dataKey="valor" name="Fluxo anual" fill="#2a78d6" />
                  <Bar dataKey="acumulado" name="Acumulado" fill="#8fbf5f" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Economia anual">
            <div style={{ height: 260, marginBottom: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={resultado.economiaAnual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtBRL(v)} width={90} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtPct(v, 0)} />
                  <Tooltip formatter={(v: number, name) => (name === 'SoH' ? fmtPct(v, 2) : fmtBRL(v))} labelFormatter={(l) => `Ano ${l}`} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="economiaAnualLiquida" name="Economia líquida" stroke="#2a78d6" dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="sohAno" name="SoH" stroke="#e0a020" dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Ano</th>
                    <th>SoH</th>
                    <th>Cap. útil/dia (kWh)</th>
                    <th>Delta tarifário (R$/kWh)</th>
                    <th>Economia bruta</th>
                    <th>O&amp;M</th>
                    <th>Economia líquida</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.economiaAnual.map((a) => (
                    <tr key={a.ano}>
                      <td>{a.ano}</td>
                      <td>{fmtPct(a.sohAno)}</td>
                      <td>{fmtNum(a.capacidadeUtilDia)}</td>
                      <td>{fmtNum(a.deltaTarifario, 3)}</td>
                      <td>{fmtBRL(a.economiaAnualBruta)}</td>
                      <td>{fmtBRL(a.omAno)}</td>
                      <td style={{ fontWeight: 600, color: a.economiaAnualLiquida >= 0 ? '#2a7a3a' : '#a33' }}>
                        {fmtBRL(a.economiaAnualLiquida)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, destaque, alerta }: { label: string; value: string; destaque?: boolean; alerta?: boolean }) {
  return (
    <div style={{ padding: 10, background: alerta ? '#fde8e8' : destaque ? '#eaf4e5' : '#f7f7f3', borderRadius: 6 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: alerta ? '#a33' : destaque ? '#2a7a3a' : '#2c2c2a' }}>{value}</div>
    </div>
  )
}
