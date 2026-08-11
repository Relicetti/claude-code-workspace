// Tipos do Dimensionador BESS.
// Nomenclatura e comentários referenciam as células da planilha original
// (Planilha_Dimensionamento_BESS.xlsx) para facilitar auditoria cruzada.

export type ModoOperacao = 'TIME-SHIFT' | 'BACKUP' | 'PEAK-SHAVING'

export type BaseCalculoBackup = 'DEMANDA_MAXIMA' | 'DEMANDA_MEDIA_NORMAL'

export interface DadosCliente {
  nomeCliente: string
  modalidadeTarifaria: string // informativo (ex: "A4 Verde")

  // aba DADOS_CLIENTE
  consumoMedioPontaKwh: number // B4 — consumo médio mensal na ponta (dias úteis)
  demandaMaximaPontaKw: number // B5 — demanda máxima medida na ponta
  demandaContratadaKw: number // B6
  tarifaPontaComML: number // B8 — R$/kWh, tarifa ponta já com margem de lucro/impostos embutidos
  tarifaForaPonta: number // B9 — R$/kWh

  horasPontaPorDia: number // B14
  diasUteisPorMes: number // B15
  vidaUtilAnos: number // B18
  modoOperacao: ModoOperacao // B19

  tma: number // B23 — taxa mínima de atratividade (fração, ex 0.12)
  inflacaoAnualTarifa: number // B24 — reajuste anual de tarifa
  coberturaPontaPercent: number // B25 — % da energia de ponta que o BESS deve cobrir (0–1)
  ipca: number // B26 — reajuste anual do O&M

  // modo BACKUP
  horasBackup?: number
  baseCalculoBackup?: BaseCalculoBackup
  demandaMediaNormalKw?: number // necessário quando base = DEMANDA_MEDIA_NORMAL
  custoEvitadoInterrupcaoAnual?: number // R$/ano, opcional — valor de continuidade não coberto por tarifa

  // modo PEAK-SHAVING
  limiteDemandaKw?: number
  tarifaDemandaUltrapassagem?: number // R$/kW/mês evitado
}

export interface EspecificacoesBess {
  capacidadePorRackKwh: number // DIMENSIONAMENTO!B6
  potenciaPorRackKw: number // DIMENSIONAMENTO!B7
  dod: number // DIMENSIONAMENTO!B22 (ex 0.98)
  rte: number // DIMENSIONAMENTO!B23 (ex 0.92)
  // Override manual do nº de racks adotado (DIMENSIONAMENTO!B11 na planilha original
  // era digitado à mão, não calculado — útil quando o container é uma unidade
  // indivisível e o projetista aceita uma pequena folga negativa ou positiva
  // em relação ao mínimo calculado). Se omitido, usa MAX(racksPorEnergia, racksPorPotencia).
  racksAdotadoOverride?: number
}

export interface CapexInputs {
  valorTotalRacks: number // DIMENSIONAMENTO!C26 — valor de NF dos racks (cotação do fornecedor)
  fretePercent: number // B27
  instalacaoPercent: number // B30 — % sobre valorTotalRacks
  custosBrluxPercent: number // B34
  comissaoPercent: number // B35
  lucroPercent: number // B36
  impostosPercent: number // B37
  omAnualPercent: number // B44 — % do CAPEX total, custo anual de O&M
}

export interface SohPonto {
  ano: number
  ciclos: number
  sohFrac: number
}

export interface DimensionamentoResult {
  energiaTotalPontaMes: number // B1
  energiaNecessariaDia: number // B2
  capacidadeNominalMinima: number // B3
  potenciaNecessaria: number // B4

  racksPorEnergia: number
  racksPorPotencia: number
  racksAdotado: number
  capacidadeInstalada: number // B13
  potenciaInstalada: number // B14

  ciclosPorAno: number // DADOS_CLIENTE!B17
  ciclosTotaisProjeto: number // B21
  sohApos1Ano: number // B16
  sohFinalProjeto: number // B24
  autonomia1AnoH: number // B17 (DIMENSIONAMENTO)
  autonomiaUltimoAnoH: number // B19 (DIMENSIONAMENTO)
}

export interface CapexResult {
  valorRacks: number
  frete: number
  valorEquipamentosFrete: number // C28
  instalacao: number // C30
  valorTotalMateriaisServicos: number // C31
  custosBrlux: number // C34
  comissao: number // C35
  lucro: number // C36
  impostos: number // C37
  nfKora: number // C40
  nfDistribuidores: number // C41
  precoVenda: number // C38
  capexTotal: number // C32
  omAnual: number // C44
  mensalidadeOM: number // C45
}

export interface EconomiaAno {
  ano: number // ano operacional (1..vidaUtilAnos)
  ciclosAcumulados: number
  sohAno: number
  capacidadeUtilDia: number
  tarifaPontaAno: number
  tarifaForaPontaAno: number
  deltaTarifario: number
  energiaNecessariaDia: number
  energiaPerdaCargaDia: number
  energiaComplementarDia: number
  economiaAnualBruta: number
  omAno: number
  economiaAnualLiquida: number
}

export interface FluxoCaixaAno {
  ano: number
  valor: number
  acumulado: number
}

export interface IndicadoresFinanceiros {
  fluxoCaixa: FluxoCaixaAno[]
  vpl: number
  tir: number | null // null quando não converge (sem raiz real / fluxo sempre negativo)
  paybackAnos: number | null
  viavel: boolean
}

export interface ResultadoCompleto {
  dimensionamento: DimensionamentoResult
  capex: CapexResult
  economiaAnual: EconomiaAno[]
  indicadores: IndicadoresFinanceiros
}
