import { useMemo, useState } from 'react'
import type { DadosCliente, EspecificacoesBess, ModoOperacao, CargaCritica, DimensionamentoResult } from './types'
import { calcularDimensionamento } from './lib/engine'
import { DADOS_CLIENTE_PADRAO, ESPECIFICACOES_BESS_PADRAO } from './lib/defaults'

// Fluxo em etapas (wizard): cada etapa só libera "Avançar" quando os campos que ela
// pede — dado o que já foi escolhido antes (grupo tarifário, funções do BESS) — estão
// preenchidos. Ver `stepChecks` mais abaixo.
const STEPS = ['Dados Cliente', 'Característica da Carga', 'Premissas BESS', 'Especificação BESS', 'Resultados'] as const
type StepLabel = (typeof STEPS)[number]

type Check = { label: string; ok: boolean }

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
    <label className="field">
      <span className="field__label">
        {label} {suffix ? <span className="unit">({suffix})</span> : null}
      </span>
      <input className="input" type="number" value={value} step={step ?? 'any'} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="card__title">{title}</h3>
      {children}
    </div>
  )
}

function arquivoParaBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve((leitor.result as string).split(',')[1] ?? '')
    leitor.onerror = () => reject(leitor.error)
    leitor.readAsDataURL(arquivo)
  })
}

export default function App() {
  const [stepIndex, setStepIndex] = useState(0)
  const [cliente, setCliente] = useState<DadosCliente>(DADOS_CLIENTE_PADRAO)
  const [bess, setBess] = useState<EspecificacoesBess>(ESPECIFICACOES_BESS_PADRAO)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarRelatorio, setMostrarRelatorio] = useState(false)
  const [extraindoFatura, setExtraindoFatura] = useState(false)
  const [erroExtracaoFatura, setErroExtracaoFatura] = useState<string | null>(null)

  // Só o dimensionamento técnico — sem CAPEX nem indicadores financeiros (decisão do dono
  // do repo: essa ferramenta é a base técnica pro financiamento, não a análise financeira).
  const dimensionamento = useMemo(() => {
    try {
      setErro(null)
      return calcularDimensionamento(cliente, bess)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      return null
    }
  }, [cliente, bess])

  function set<K extends keyof DadosCliente>(key: K, value: DadosCliente[K]) {
    setCliente((c) => ({ ...c, [key]: value }))
  }
  // Checkbox: o cliente pode marcar mais de uma função ao mesmo tempo (ex: BACKUP +
  // QUALIDADE_ENERGIA no mesmo BESS) — ver a lógica de combinação em engine.ts.
  function toggleModo(modo: ModoOperacao) {
    setCliente((c) => ({
      ...c,
      modosOperacao: c.modosOperacao.includes(modo)
        ? c.modosOperacao.filter((m) => m !== modo)
        : [...c.modosOperacao, modo],
    }))
  }
  // Extração automática (IA) dos dados da fatura da COPEL — só funciona rodando localmente
  // (npm run dev / npm run start), já que depende do backend em server/. Os valores voltam
  // sempre editáveis: a extração é conveniência, nunca fonte de verdade (mesma regra de
  // IA-como-fallback usada em tarifas/ e usinas/ia.py no monorepo).
  async function extrairFatura(arquivo: File) {
    setExtraindoFatura(true)
    setErroExtracaoFatura(null)
    try {
      const pdfBase64 = await arquivoParaBase64(arquivo)
      const resposta = await fetch('/api/extrair-fatura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64 }),
      })
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}))
        throw new Error(corpo.error || 'Falha ao extrair dados da fatura.')
      }
      const dados = await resposta.json()
      setCliente((c) => ({
        ...c,
        nomeCliente: dados.nomeCliente || c.nomeCliente,
        unidadeConsumidora: dados.unidadeConsumidora || c.unidadeConsumidora,
        consumoMedioPontaKwh: dados.consumoMedioPontaKwh || c.consumoMedioPontaKwh,
        grupoTarifario: dados.grupoTarifario || c.grupoTarifario,
        endereco: dados.endereco || c.endereco,
        cep: dados.cep || c.cep,
      }))
    } catch (err) {
      setErroExtracaoFatura(
        err instanceof Error
          ? `${err.message} Preencha os dados manualmente, ou tente novamente rodando o app localmente (a extração não funciona nesta versão publicada).`
          : 'Falha ao extrair dados da fatura. Preencha manualmente.'
      )
    } finally {
      setExtraindoFatura(false)
    }
  }

  const usaBackup = cliente.modosOperacao.includes('BACKUP')
  const usaQualidadeEnergia = cliente.modosOperacao.includes('QUALIDADE_ENERGIA')
  // TIME-SHIFT/PEAK-SHAVING são as únicas funções que usam consumo/cobertura da ponta
  // (energiaCiclagem em engine.ts) — sem nenhuma das duas marcadas, esses campos não
  // entram em cálculo nenhum e não devem ser pedidos.
  const usaCiclagem = cliente.modosOperacao.includes('TIME-SHIFT') || cliente.modosOperacao.includes('PEAK-SHAVING')
  function addCargaCritica() {
    setCliente((c) => ({
      ...c,
      cargasCriticas: [...(c.cargasCriticas ?? []), { nome: '', potenciaKw: 0 }],
    }))
  }
  function updateCargaCritica(index: number, campo: keyof CargaCritica, valor: string | number) {
    setCliente((c) => ({
      ...c,
      cargasCriticas: (c.cargasCriticas ?? []).map((carga, i) => (i === index ? { ...carga, [campo]: valor } : carga)),
    }))
  }
  function removeCargaCritica(index: number) {
    setCliente((c) => ({ ...c, cargasCriticas: (c.cargasCriticas ?? []).filter((_, i) => i !== index) }))
  }
  function setBessField<K extends keyof EspecificacoesBess>(key: K, value: EspecificacoesBess[K]) {
    setBess((b) => ({ ...b, [key]: value }))
  }
  const usaPeakShaving = cliente.modosOperacao.includes('PEAK-SHAVING')

  // O que cada etapa exige pra liberar "Avançar" — depende do que já foi escolhido antes
  // (grupo tarifário, funções do BESS). Um único modo marcado reduz isso ao mínimo (nome
  // do cliente, demanda/potência, dias úteis e vida útil); mais funções marcadas somam
  // mais exigências, uma por parâmetro que aquela função realmente usa no cálculo.
  const stepChecks: Check[][] = [
    [{ label: 'Nome do cliente', ok: cliente.nomeCliente.trim().length > 0 }],
    [
      { label: 'Ao menos uma função do BESS marcada', ok: cliente.modosOperacao.length > 0 },
      { label: 'Demanda máxima/potência estimada', ok: cliente.demandaMaximaPontaKw > 0 },
      ...(usaCiclagem ? [{ label: 'Consumo médio', ok: cliente.consumoMedioPontaKwh > 0 }] : []),
    ],
    [
      { label: 'Dias úteis por mês', ok: cliente.diasUteisPorMes > 0 },
      { label: 'Vida útil do projeto', ok: cliente.vidaUtilAnos > 0 },
      ...(usaCiclagem
        ? [
            { label: 'Horas de ponta por dia', ok: cliente.horasPontaPorDia > 0 },
            { label: 'Cobertura da ponta pelo BESS', ok: cliente.coberturaPontaPercent > 0 },
          ]
        : []),
      ...(usaBackup
        ? [
            { label: 'Horas de backup a garantir', ok: (cliente.horasBackup ?? 0) > 0 },
            ...((cliente.baseCalculoBackup ?? 'DEMANDA_MEDIA_NORMAL') === 'DEMANDA_MEDIA_NORMAL'
              ? [{ label: 'Demanda média normal', ok: (cliente.demandaMediaNormalKw ?? 0) > 0 }]
              : []),
          ]
        : []),
      ...(usaQualidadeEnergia
        ? [{ label: 'Duração do evento (QUALIDADE DE ENERGIA)', ok: (cliente.duracaoEventoSegundos ?? 0) > 0 }]
        : []),
      ...(usaPeakShaving ? [{ label: 'Limite de demanda (PEAK-SHAVING)', ok: (cliente.limiteDemandaKw ?? 0) > 0 }] : []),
    ],
    [
      { label: 'Capacidade por rack', ok: bess.capacidadePorRackKwh > 0 },
      { label: 'Potência por rack', ok: bess.potenciaPorRackKw > 0 },
      { label: 'Profundidade de descarga (DoD)', ok: bess.dod > 0 },
      { label: 'Eficiência RTE', ok: bess.rte > 0 },
    ],
    [],
  ]
  const faltando = stepChecks[stepIndex].filter((c) => !c.ok).map((c) => c.label)
  const podeAvancar = faltando.length === 0
  const ultimaEtapa = stepIndex === STEPS.length - 1

  function avancar() {
    if (podeAvancar && !ultimaEtapa) setStepIndex((i) => i + 1)
  }
  function voltar() {
    if (stepIndex > 0) setStepIndex((i) => i - 1)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Dimensionador BESS</h1>
      </header>

      <div className="stepper">
        {STEPS.map((label, i) => (
          <div key={label} className={`stepper__item${i < stepIndex ? ' is-done' : ''}${i === stepIndex ? ' is-current' : ''}`}>
            <button
              type="button"
              className="stepper__dot"
              onClick={() => i < stepIndex && setStepIndex(i)}
              disabled={i >= stepIndex}
              aria-current={i === stepIndex ? 'step' : undefined}
            >
              {i < stepIndex ? '✓' : i + 1}
            </button>
            <span className="stepper__label">{label}</span>
            {i < STEPS.length - 1 && <span className={`stepper__connector${i < stepIndex ? ' is-done' : ''}`} />}
          </div>
        ))}
      </div>

      {erro && <div className="error-banner">{erro}</div>}

      {mostrarRelatorio && dimensionamento ? (
        <>
          <RelatorioTecnico cliente={cliente} bess={bess} dimensionamento={dimensionamento} usaBackup={usaBackup} usaQualidadeEnergia={usaQualidadeEnergia} />
          <div className="step-nav no-print">
            <button className="btn btn--outline" onClick={() => setMostrarRelatorio(false)}>
              ← Voltar aos resultados
            </button>
          </div>
        </>
      ) : (
        <>
          {stepIndex === 0 && (
            <>
              <Section title="Fatura (COPEL)">
                <label className="field">
                  <span className="field__label">
                    Upload da fatura em PDF <span className="unit">(opcional — extrai nome, UC, consumo, grupo e endereço)</span>
                  </span>
                  <input
                    className="input"
                    type="file"
                    accept="application/pdf"
                    disabled={extraindoFatura}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0]
                      if (arquivo) extrairFatura(arquivo)
                      e.target.value = ''
                    }}
                  />
                </label>
                {extraindoFatura && <p className="note">Extraindo dados da fatura…</p>}
                {erroExtracaoFatura && <p className="note note--warn">{erroExtracaoFatura}</p>}
              </Section>

              <Section title="Cliente e modalidade">
                <div className="field-grid">
                  <label className="field">
                    <span className="field__label">Cliente</span>
                    <input className="input" value={cliente.nomeCliente} onChange={(e) => set('nomeCliente', e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field__label">Grupo tarifário</span>
                    <select className="input" value={cliente.grupoTarifario} onChange={(e) => set('grupoTarifario', e.target.value as DadosCliente['grupoTarifario'])}>
                      <option value="A">Grupo A (alta tensão — demanda em kW)</option>
                      <option value="B">Grupo B (baixa tensão — só kWh, sem demanda medida)</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">Unidade consumidora (UC)</span>
                    <input className="input" value={cliente.unidadeConsumidora ?? ''} onChange={(e) => set('unidadeConsumidora', e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field__label">Endereço</span>
                    <input className="input" value={cliente.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field__label">CEP</span>
                    <input className="input" value={cliente.cep ?? ''} onChange={(e) => set('cep', e.target.value)} />
                  </label>
                </div>
              </Section>

              <Section title="Representante">
                <div className="field-grid">
                  <label className="field">
                    <span className="field__label">Nome do representante</span>
                    <input className="input" value={cliente.nomeRepresentante ?? ''} onChange={(e) => set('nomeRepresentante', e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field__label">Telefone</span>
                    <input className="input" value={cliente.telefoneRepresentante ?? ''} onChange={(e) => set('telefoneRepresentante', e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field__label">Email</span>
                    <input className="input" type="email" value={cliente.emailRepresentante ?? ''} onChange={(e) => set('emailRepresentante', e.target.value)} />
                  </label>
                </div>
              </Section>
            </>
          )}

          {stepIndex === 1 && (
            <>
              <Section title="Funções do BESS">
                <span className="field__label">
                  Marque quantas se aplicarem <span className="unit">(o mesmo BESS pode atender mais de uma)</span>
                </span>
                <div className="chip-group">
                  {(
                    [
                      ['TIME-SHIFT', 'TIME-SHIFT'],
                      ['BACKUP', 'BACKUP'],
                      ['PEAK-SHAVING', 'PEAK-SHAVING'],
                      ['QUALIDADE_ENERGIA', 'QUALIDADE DE ENERGIA'],
                    ] as [ModoOperacao, string][]
                  ).map(([modo, label]) => (
                    <label key={modo} className="chip">
                      <input type="checkbox" checked={cliente.modosOperacao.includes(modo)} onChange={() => toggleModo(modo)} />
                      {label}
                    </label>
                  ))}
                </div>
              </Section>

              <Section title="Consumo e demanda (fatura)">
                {cliente.grupoTarifario === 'A' ? (
                  <div className="field-grid">
                    {usaCiclagem && (
                      <NumberField label="Consumo médio ponta" suffix="kWh/mês" value={cliente.consumoMedioPontaKwh} onChange={(v) => set('consumoMedioPontaKwh', v)} />
                    )}
                    <NumberField label="Demanda máxima medida na ponta" suffix="kW" value={cliente.demandaMaximaPontaKw} onChange={(v) => set('demandaMaximaPontaKw', v)} />
                  </div>
                ) : (
                  <div className="field-grid">
                    {usaCiclagem && (
                      <NumberField label="Consumo médio mensal" suffix="kWh/mês" value={cliente.consumoMedioPontaKwh} onChange={(v) => set('consumoMedioPontaKwh', v)} />
                    )}
                    <NumberField
                      label="Potência total estimada da propriedade (sem medição de demanda)"
                      suffix="kW"
                      value={cliente.demandaMaximaPontaKw}
                      onChange={(v) => set('demandaMaximaPontaKw', v)}
                    />
                  </div>
                )}
              </Section>

              {(usaBackup || usaQualidadeEnergia) && (
                <Section title="Cargas críticas (opcional)">
                  {(cliente.cargasCriticas ?? []).map((carga, i) => (
                    <div key={i} className="carga-row">
                      <input
                        className="input"
                        placeholder="Ex: motor de irrigação"
                        value={carga.nome}
                        onChange={(e) => updateCargaCritica(i, 'nome', e.target.value)}
                      />
                      <input
                        className="input input--kw"
                        type="number"
                        placeholder="kW"
                        value={carga.potenciaKw}
                        onChange={(e) => updateCargaCritica(i, 'potenciaKw', Number(e.target.value))}
                      />
                      <button className="btn btn--text" onClick={() => removeCargaCritica(i)}>
                        remover
                      </button>
                    </div>
                  ))}
                  <button className="btn btn--outline" onClick={addCargaCritica}>
                    + Adicionar carga
                  </button>
                  <p className="note">
                    Total: <strong>{fmtNum((cliente.cargasCriticas ?? []).reduce((s, c) => s + c.potenciaKw, 0))} kW</strong>
                  </p>
                </Section>
              )}
            </>
          )}

          {stepIndex === 2 && (
            <>
              <Section title="Premissas operacionais">
                <div className="field-grid">
                  {usaCiclagem && (
                    <NumberField label="Horas de ponta por dia" suffix="h" value={cliente.horasPontaPorDia} onChange={(v) => set('horasPontaPorDia', v)} />
                  )}
                  <NumberField label="Dias úteis por mês" value={cliente.diasUteisPorMes} onChange={(v) => set('diasUteisPorMes', v)} />
                  <NumberField label="Vida útil do projeto" suffix="anos" value={cliente.vidaUtilAnos} onChange={(v) => set('vidaUtilAnos', v)} />
                  {usaCiclagem && (
                    <NumberField label="Cobertura da ponta pelo BESS" suffix="0–1" value={cliente.coberturaPontaPercent} onChange={(v) => set('coberturaPontaPercent', v)} step={0.01} />
                  )}
                </div>
              </Section>

              {usaBackup && (
                <Section title="Parâmetros de BACKUP">
                  <div className="field-grid">
                    <NumberField label="Horas de backup a garantir" suffix="h" value={cliente.horasBackup ?? 0} onChange={(v) => set('horasBackup', v)} />
                    <label className="field">
                      <span className="field__label">Base de cálculo da energia de backup</span>
                      <select
                        className="input"
                        value={cliente.baseCalculoBackup ?? 'DEMANDA_MEDIA_NORMAL'}
                        onChange={(e) => set('baseCalculoBackup', e.target.value as DadosCliente['baseCalculoBackup'])}
                      >
                        <option value="DEMANDA_MEDIA_NORMAL">Demanda média normal (realista)</option>
                        <option value="DEMANDA_MAXIMA">Demanda máxima medida (conservador)</option>
                      </select>
                    </label>
                    {(cliente.baseCalculoBackup ?? 'DEMANDA_MEDIA_NORMAL') === 'DEMANDA_MEDIA_NORMAL' && (
                      <NumberField label="Demanda média normal (fora ponta)" suffix="kW" value={cliente.demandaMediaNormalKw ?? 0} onChange={(v) => set('demandaMediaNormalKw', v)} />
                    )}
                  </div>
                </Section>
              )}

              {usaQualidadeEnergia && (
                <Section title="Parâmetros de QUALIDADE DE ENERGIA">
                  <div className="field-grid">
                    <NumberField
                      label="Potência crítica a proteger (deixe 0 p/ usar a demanda máxima)"
                      suffix="kW"
                      value={cliente.potenciaCriticaKw ?? 0}
                      onChange={(v) => set('potenciaCriticaKw', v > 0 ? v : undefined)}
                    />
                    <NumberField label="Duração do evento a suportar" suffix="segundos" value={cliente.duracaoEventoSegundos ?? 0} onChange={(v) => set('duracaoEventoSegundos', v)} />
                    <NumberField label="Eventos por mês (opcional, p/ estimativa de ciclos)" value={cliente.eventosPorMes ?? 0} onChange={(v) => set('eventosPorMes', v > 0 ? v : undefined)} />
                  </div>
                </Section>
              )}

              {usaPeakShaving && (
                <Section title="Parâmetros de PEAK-SHAVING">
                  <div className="field-grid">
                    <NumberField label="Limite de demanda a não ultrapassar" suffix="kW" value={cliente.limiteDemandaKw ?? 0} onChange={(v) => set('limiteDemandaKw', v)} />
                  </div>
                </Section>
              )}
            </>
          )}

          {stepIndex === 3 && (
            <Section title="Unidade / rack do BESS">
              <div className="field-grid">
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
              {dimensionamento && (
                <p className="note">
                  Mínimo calculado: {dimensionamento.racksPorEnergia} rack(s) por energia,{' '}
                  {dimensionamento.racksPorPotencia} por potência → adotado:{' '}
                  <strong>{dimensionamento.racksAdotado}</strong>.
                </p>
              )}
            </Section>
          )}

          {stepIndex === 4 && dimensionamento && (
            <Section title="Dimensionamento">
              <div className="stat-grid">
                <Stat label="Energia necessária/dia" value={`${fmtNum(dimensionamento.energiaNecessariaDia)} kWh`} />
                <Stat label="Capacidade nominal mínima" value={`${fmtNum(dimensionamento.capacidadeNominalMinima)} kWh`} />
                <Stat label="Potência necessária" value={`${fmtNum(dimensionamento.potenciaNecessaria)} kW`} />
                <Stat label="Racks adotados" value={fmtNum(dimensionamento.racksAdotado)} />
                <Stat label="Capacidade instalada" value={`${fmtNum(dimensionamento.capacidadeInstalada)} kWh`} />
                <Stat label="Potência instalada" value={`${fmtNum(dimensionamento.potenciaInstalada)} kW`} />
                <Stat label="Autonomia ano 1" value={`${fmtNum(dimensionamento.autonomia1AnoH, 2)} h`} />
                <Stat label={`Autonomia ano ${cliente.vidaUtilAnos}`} value={`${fmtNum(dimensionamento.autonomiaUltimoAnoH, 2)} h`} />
                <Stat label="SoH ano 1" value={fmtPct(dimensionamento.sohApos1Ano)} />
                <Stat label={`SoH ano ${cliente.vidaUtilAnos}`} value={fmtPct(dimensionamento.sohFinalProjeto)} />
              </div>
            </Section>
          )}

          <div className="step-nav">
            <button className="btn btn--outline" onClick={voltar} disabled={stepIndex === 0}>
              ← Voltar
            </button>
            {!podeAvancar && !ultimaEtapa && <p className="step-nav__missing">Preencha: {faltando.join(', ')}</p>}
            {!ultimaEtapa ? (
              <button className="btn btn--primary" onClick={avancar} disabled={!podeAvancar}>
                Avançar →
              </button>
            ) : (
              dimensionamento && (
                <button className="btn btn--outline" onClick={() => setMostrarRelatorio(true)}>
                  Ver Relatório Técnico
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Relatório técnico de dimensionamento — só a parte de engenharia (requisitos + resultado
// do dimensionamento), sem CAPEX nem indicadores financeiros. Pensado pra ser anexado a um
// pedido de financiamento como a base técnica que justifica o sistema, não a proposta
// comercial. #relatorio-tecnico + a regra @media print em index.css fazem o "imprimir"
// mostrar só este conteúdo, escondendo abas/navegação (classe .no-print). A classe .report
// fixa cores claras explícitas (não segue o tema escuro) — é pensada pra ser impressa em
// papel, não pra ser lida na tela do jeito que o resto do app é.
function RelatorioTecnico({
  cliente,
  bess,
  dimensionamento: dim,
  usaBackup,
  usaQualidadeEnergia,
}: {
  cliente: DadosCliente
  bess: EspecificacoesBess
  dimensionamento: DimensionamentoResult
  usaBackup: boolean
  usaQualidadeEnergia: boolean
}) {
  const cargasCriticas = cliente.cargasCriticas ?? []
  const somaCargasCriticas = cargasCriticas.reduce((s, c) => s + c.potenciaKw, 0)

  // O cliente pode marcar mais de uma função (checkbox) — lista um objetivo por função
  // ativa, não é mais um "senão" único de modo exclusivo.
  const objetivos: string[] = []
  if (usaBackup) {
    objetivos.push(
      `Garantir ${fmtNum(cliente.horasBackup ?? 0, 1)} hora(s) de autonomia às cargas críticas em caso de falta de energia prolongada da distribuidora.`
    )
  }
  if (usaQualidadeEnergia) {
    objetivos.push(
      `Suportar afundamentos de tensão/microinterrupções de até ${fmtNum(cliente.duracaoEventoSegundos ?? 0, 0)} segundo(s) sem desarme das cargas sensíveis (ride-through), evitando parada ou dano de equipamento por instabilidade da rede.`
    )
  }
  if (cliente.modosOperacao.includes('TIME-SHIFT')) {
    objetivos.push('Deslocar consumo do horário de ponta para o horário fora de ponta, reduzindo custo de energia por arbitragem tarifária.')
  }
  if (cliente.modosOperacao.includes('PEAK-SHAVING')) {
    objetivos.push('Limitar a demanda contratada evitando ultrapassagem, reduzindo custo de demanda.')
  }

  return (
    <div id="relatorio-tecnico" className="report">
      <div className="no-print report__print-bar">
        <button className="btn btn--primary" onClick={() => window.print()}>
          Imprimir / salvar como PDF
        </button>
      </div>

      <h1>Relatório Técnico de Dimensionamento — Sistema BESS</h1>
      <p className="report__meta">
        Cliente: <strong>{cliente.nomeCliente}</strong> — Grupo tarifário: {cliente.grupoTarifario}
        {cliente.unidadeConsumidora ? <> — UC: {cliente.unidadeConsumidora}</> : null}
      </p>
      {(cliente.endereco || cliente.cep) && (
        <p className="report__meta">
          {cliente.endereco}
          {cliente.endereco && cliente.cep ? ' — ' : ''}
          {cliente.cep ? `CEP ${cliente.cep}` : ''}
        </p>
      )}
      {(cliente.nomeRepresentante || cliente.telefoneRepresentante || cliente.emailRepresentante) && (
        <p className="report__meta">
          Representante: {cliente.nomeRepresentante}
          {cliente.telefoneRepresentante ? ` — ${cliente.telefoneRepresentante}` : ''}
          {cliente.emailRepresentante ? ` — ${cliente.emailRepresentante}` : ''}
        </p>
      )}
      <p className="report__meta">Emitido em {new Date().toLocaleDateString('pt-BR')}</p>

      <h2>1. Objetivo do sistema</h2>
      {objetivos.map((texto, i) => (
        <p key={i}>{texto}</p>
      ))}

      <h2>2. Cargas críticas consideradas</h2>
      {cargasCriticas.length > 0 ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Carga</th>
                <th>Potência (kW)</th>
              </tr>
            </thead>
            <tbody>
              {cargasCriticas.map((c, i) => (
                <tr key={i}>
                  <td>{c.nome || '(sem nome)'}</td>
                  <td>{fmtNum(c.potenciaKw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 10, fontWeight: 600 }}>Total: {fmtNum(somaCargasCriticas)} kW</p>
        </>
      ) : (
        <p>
          Não detalhadas item a item — o dimensionamento usa o valor agregado de demanda
          máxima/potência crítica informado ({fmtNum(dim.potenciaNecessaria)} kW).
        </p>
      )}

      <h2>3. Premissas de dimensionamento</h2>
      <table>
        <tbody>
          {usaBackup && (
            <>
              <tr>
                <td>Horas de backup a garantir</td>
                <td>{fmtNum(cliente.horasBackup ?? 0, 1)} h</td>
              </tr>
              <tr>
                <td>Base de cálculo da energia de backup</td>
                <td>
                  {cliente.baseCalculoBackup === 'DEMANDA_MEDIA_NORMAL'
                    ? 'Demanda média normal (realista)'
                    : 'Demanda máxima medida (conservador)'}
                </td>
              </tr>
            </>
          )}
          {usaQualidadeEnergia && (
            <tr>
              <td>Duração do evento a suportar</td>
              <td>{fmtNum(cliente.duracaoEventoSegundos ?? 0, 0)} s</td>
            </tr>
          )}
          <tr>
            <td>Profundidade de descarga (DoD)</td>
            <td>{fmtPct(bess.dod)}</td>
          </tr>
          <tr>
            <td>Eficiência round-trip (RTE)</td>
            <td>{fmtPct(bess.rte)}</td>
          </tr>
          <tr>
            <td>Vida útil do projeto</td>
            <td>{cliente.vidaUtilAnos} anos</td>
          </tr>
        </tbody>
      </table>

      <h2>4. Resultado do dimensionamento</h2>
      <table>
        <tbody>
          <tr>
            <td>Energia necessária</td>
            <td>{fmtNum(dim.energiaNecessariaDia, 2)} kWh</td>
          </tr>
          <tr>
            <td>Capacidade nominal mínima</td>
            <td>{fmtNum(dim.capacidadeNominalMinima)} kWh</td>
          </tr>
          <tr>
            <td>Potência necessária</td>
            <td>{fmtNum(dim.potenciaNecessaria)} kW</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>Racks/containers adotados</td>
            <td style={{ fontWeight: 600 }}>{dim.racksAdotado}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>Capacidade instalada</td>
            <td style={{ fontWeight: 600 }}>{fmtNum(dim.capacidadeInstalada)} kWh</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>Potência instalada</td>
            <td style={{ fontWeight: 600 }}>{fmtNum(dim.potenciaInstalada)} kW</td>
          </tr>
          <tr>
            <td>Autonomia no ano 1</td>
            <td>{fmtNum(dim.autonomia1AnoH, 2)} h</td>
          </tr>
          <tr>
            <td>Autonomia no ano {cliente.vidaUtilAnos} (fim de vida útil)</td>
            <td>{fmtNum(dim.autonomiaUltimoAnoH, 2)} h</td>
          </tr>
          <tr>
            <td>SoH (estado de saúde da bateria) no ano 1</td>
            <td>{fmtPct(dim.sohApos1Ano)}</td>
          </tr>
          <tr>
            <td>SoH no ano {cliente.vidaUtilAnos}</td>
            <td>{fmtPct(dim.sohFinalProjeto)}</td>
          </tr>
        </tbody>
      </table>

      <p className="report__footnote">
        Relatório técnico gerado pelo Dimensionador BESS. Considera degradação de capacidade
        ao longo da vida útil (curva de SoH por ciclos), garantindo que a autonomia informada
        no fim de vida útil ainda atenda ao requisito operacional. Não inclui CAPEX ou análise
        financeira — apenas a base técnica de dimensionamento.
      </p>
    </div>
  )
}

function Stat({ label, value, destaque, alerta }: { label: string; value: string; destaque?: boolean; alerta?: boolean }) {
  const modifier = alerta ? ' stat--danger' : destaque ? ' stat--success' : ''
  return (
    <div className={`stat${modifier}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
    </div>
  )
}
