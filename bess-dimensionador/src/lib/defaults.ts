// Valores padrão — caso de referência Caterpillar Campo Largo / WEG (RP0826000),
// usado para validar o engine contra a planilha original.
import type { DadosCliente, EspecificacoesBess, CapexInputs } from '../types'

export const DADOS_CLIENTE_PADRAO: DadosCliente = {
  nomeCliente: 'Caterpillar Campo Largo',
  modalidadeTarifaria: 'A4 Verde',

  consumoMedioPontaKwh: 67939,
  demandaMaximaPontaKw: 1279,
  demandaContratadaKw: 1500,
  tarifaPontaComML: 1.46549,
  tarifaForaPonta: 0.14262,

  horasPontaPorDia: 3,
  diasUteisPorMes: 22,
  vidaUtilAnos: 20,
  modoOperacao: 'TIME-SHIFT',

  tma: 0.12,
  inflacaoAnualTarifa: 0.06,
  coberturaPontaPercent: 1,
  ipca: 0.0449,
}

export const ESPECIFICACOES_BESS_PADRAO: EspecificacoesBess = {
  capacidadePorRackKwh: 3343,
  potenciaPorRackKw: 1500,
  dod: 0.98,
  rte: 0.92,
}

export const CAPEX_INPUTS_PADRAO: CapexInputs = {
  valorTotalRacks: 5657566.09,
  fretePercent: 0.04,
  instalacaoPercent: 0.12,
  custosBrluxPercent: 0,
  comissaoPercent: 0,
  lucroPercent: 0.25,
  impostosPercent: 0.12,
  omAnualPercent: 0.015,
}
