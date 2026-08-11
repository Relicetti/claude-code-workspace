// Engine de cálculo do Dimensionador BESS.
// Porta a lógica de Planilha_Dimensionamento_BESS.xlsx (abas DADOS_CLIENTE,
// DIMENSIONAMENTO, ECONOMIA_ANUAL, INDICADORES_FINANCEIROS).
//
// Duas correções deliberadas em relação à planilha original (decisão do dono
// do repo em 2026-08-10, ver conversa/CLAUDE.md do projeto):
//   1. Delta tarifário (ECONOMIA_ANUAL!coluna I) usava F-H nos anos 2 e 3 mas
//      virava G-H a partir do ano 4 — G é uma tarifa auxiliar sempre zerada,
//      o que invertia o sinal da economia a partir do 4º ano. Aqui usamos
//      sempre (tarifaPontaComML - tarifaForaPonta), reajustadas por inflação.
//   2. O modo PEAK-SHAVING usava DADOS_CLIENTE!#REF! (referência quebrada) para
//      o valor de tarifa de demanda. Aqui usamos `tarifaDemandaUltrapassagem`,
//      informado pelo usuário, reajustado pela mesma inflação anual de tarifa.
//
// A tabela de "opções de financiamento" (DIMENSIONAMENTO!E32:H39) foi
// deliberadamente OMITIDA: referencia um link externo quebrado
// ([1]ECONOMIA_ANUAL!O2, de um arquivo que não existe mais) e uma célula
// vazia (D32) — é resíduo de outra planilha, não uma regra de negócio válida.

import type {
  DadosCliente,
  EspecificacoesBess,
  CapexInputs,
  DimensionamentoResult,
  CapexResult,
  EconomiaAno,
  FluxoCaixaAno,
  IndicadoresFinanceiros,
  ResultadoCompleto,
} from '../types'
import { lookupSoH } from './soh-curve'

/** Excel ROUNDUP(valor, 0): arredonda para cima em módulo (sempre para longe de zero). */
function roundUp(valor: number): number {
  return valor >= 0 ? Math.ceil(valor) : Math.floor(valor)
}

// ---------------------------------------------------------------------------
// DIMENSIONAMENTO
// ---------------------------------------------------------------------------

export function calcularDimensionamento(
  cliente: DadosCliente,
  bess: EspecificacoesBess
): DimensionamentoResult {
  const { dod, rte, capacidadePorRackKwh, potenciaPorRackKw } = bess

  // B1: energia total na ponta a cobrir no mês, conforme % de cobertura desejado
  const energiaTotalPontaMes = cliente.consumoMedioPontaKwh * cliente.coberturaPontaPercent

  // B2: energia necessária por dia útil
  const energiaNecessariaDia = roundUp(energiaTotalPontaMes / cliente.diasUteisPorMes)

  // B17/B21 (DADOS_CLIENTE): ciclos por ano e ciclos totais do projeto
  const ciclosPorAno = cliente.diasUteisPorMes * 12
  const ciclosTotaisProjeto = ciclosPorAno * cliente.vidaUtilAnos

  // B24: SoH ao final da vida útil do projeto — usado para dimensionar
  // PEAK-SHAVING com folga suficiente para garantir a potência no fim de vida
  const sohFinalProjeto = lookupSoH(ciclosTotaisProjeto)

  // B3: capacidade nominal mínima. Em PEAK-SHAVING, divide também pelo SoH final
  // (garante que o sistema ainda atenda ao limite de demanda mesmo degradado).
  const capacidadeNominalMinima =
    cliente.modoOperacao === 'PEAK-SHAVING'
      ? roundUp(energiaNecessariaDia / (dod * rte * sohFinalProjeto))
      : roundUp(energiaNecessariaDia / (dod * rte))

  // B4: potência necessária — limite de demanda em peak-shaving, senão a demanda de ponta
  const potenciaNecessaria =
    cliente.modoOperacao === 'PEAK-SHAVING' && cliente.limiteDemandaKw
      ? cliente.demandaMaximaPontaKw - cliente.limiteDemandaKw
      : cliente.demandaMaximaPontaKw

  // B9/B10/B11: número de racks
  const racksPorEnergia = roundUp(capacidadeNominalMinima / capacidadePorRackKwh)
  const racksPorPotencia = roundUp(potenciaNecessaria / potenciaPorRackKw)
  const racksAdotado = bess.racksAdotadoOverride ?? Math.max(racksPorEnergia, racksPorPotencia)

  // B13/B14
  const capacidadeInstalada = racksAdotado * capacidadePorRackKwh
  const potenciaInstalada = racksAdotado * potenciaPorRackKw

  // B16: SoH após 1 ano de operação (ciclos = ciclosPorAno)
  const sohApos1Ano = lookupSoH(ciclosPorAno)

  // B17/B19: autonomia em horas no ano 1 e no último ano do projeto
  const autonomia1AnoH =
    ((capacidadeInstalada * sohApos1Ano * dod * rte) / energiaNecessariaDia) * cliente.horasPontaPorDia
  const autonomiaUltimoAnoH =
    ((capacidadeInstalada * sohFinalProjeto * dod * rte) / energiaNecessariaDia) * cliente.horasPontaPorDia

  return {
    energiaTotalPontaMes,
    energiaNecessariaDia,
    capacidadeNominalMinima,
    potenciaNecessaria,
    racksPorEnergia,
    racksPorPotencia,
    racksAdotado,
    capacidadeInstalada,
    potenciaInstalada,
    ciclosPorAno,
    ciclosTotaisProjeto,
    sohApos1Ano,
    sohFinalProjeto,
    autonomia1AnoH,
    autonomiaUltimoAnoH,
  }
}

// ---------------------------------------------------------------------------
// CAPEX (precificação com margens "grossed-up", replica a resolução da
// planilha para o encadeamento circular C34↔C35↔C36↔C37↔C38↔C40)
// ---------------------------------------------------------------------------

export function calcularCapex(capexInputs: CapexInputs): CapexResult {
  const {
    valorTotalRacks,
    fretePercent,
    instalacaoPercent,
    custosBrluxPercent: b34,
    comissaoPercent: b35,
    lucroPercent: b36,
    impostosPercent: b37,
    omAnualPercent,
  } = capexInputs

  const frete = valorTotalRacks * fretePercent // C27
  const valorEquipamentosFrete = valorTotalRacks + frete // C28
  const instalacao = valorTotalRacks * instalacaoPercent // C30
  const valorTotalMateriaisServicos = instalacao + valorEquipamentosFrete // C31

  // Sistema circular original resolvido em forma fechada:
  //   nfKora (y) = C30 + custosBrlux + comissão + lucro + impostos
  //   precoVenda (x) = valorTotalMateriaisServicos + custosBrlux + comissão + lucro + impostos
  //   custosBrlux = b34 * (y - custosBrlux)              => custosBrlux = b34*y/(1+b34)
  //   comissão = b35 * x ; lucro = b36 * x ; impostos = b37 * y
  //   x - y = valorTotalMateriaisServicos - instalacao = valorEquipamentosFrete (constante)
  // Substituindo tudo em y:
  //   y * [1 - b34/(1+b34) - b35 - b36 - b37] = instalacao + (b35+b36) * valorEquipamentosFrete
  const denominador = 1 - b34 / (1 + b34) - b35 - b36 - b37
  if (denominador <= 0) {
    throw new Error(
      'Soma de comissão + lucro + impostos + custos BRLUX inviabiliza o cálculo de preço (denominador <= 0).'
    )
  }
  const nfKora = (instalacao + (b35 + b36) * valorEquipamentosFrete) / denominador
  const precoVenda = nfKora + valorEquipamentosFrete
  const custosBrlux = (b34 * nfKora) / (1 + b34)
  const comissao = b35 * precoVenda
  const lucro = b36 * precoVenda
  const impostos = b37 * nfKora

  const capexTotal = precoVenda // C32 = SUM(C28,C40) = valorEquipamentosFrete + nfKora = precoVenda
  const omAnual = capexTotal * omAnualPercent // C44
  const mensalidadeOM = omAnual / 12 // C45

  return {
    valorRacks: valorTotalRacks,
    frete,
    valorEquipamentosFrete,
    instalacao,
    valorTotalMateriaisServicos,
    custosBrlux,
    comissao,
    lucro,
    impostos,
    nfKora,
    nfDistribuidores: valorEquipamentosFrete, // C41 = C28
    precoVenda,
    capexTotal,
    omAnual,
    mensalidadeOM,
  }
}

// ---------------------------------------------------------------------------
// ECONOMIA ANUAL
// ---------------------------------------------------------------------------

/**
 * Gera a projeção ano a ano (ECONOMIA_ANUAL). O índice de array `i` (0-based)
 * corresponde ao ano operacional `i+1`; os ciclos acumulados usados para o SoH
 * são os que o banco de baterias já tinha ANTES do início desse ano — mesma
 * convenção de deslocamento por 1 ano da planilha original (INDICADORES_FINANCEIROS!C4
 * usa ECONOMIA_ANUAL!Q2, a linha "ano=0"/bateria nova, como fluxo de caixa do ano 1).
 */
export function calcularEconomiaAnual(
  cliente: DadosCliente,
  bess: EspecificacoesBess,
  dim: DimensionamentoResult,
  capex: CapexResult
): EconomiaAno[] {
  const anos: EconomiaAno[] = []

  for (let i = 0; i < cliente.vidaUtilAnos; i++) {
    const ano = i + 1
    const ciclosAcumulados = i * dim.ciclosPorAno
    const sohAno = lookupSoH(ciclosAcumulados)

    // D: capacidade útil por dia com a degradação do ano
    const capacidadeUtilDia = dim.capacidadeInstalada * bess.dod * bess.rte * sohAno

    // F/H: tarifas reajustadas pela inflação anual de tarifa (DADOS_CLIENTE!B24)
    const fatorReajuste = Math.pow(1 + cliente.inflacaoAnualTarifa, i)
    const tarifaPontaAno = cliente.tarifaPontaComML * fatorReajuste
    const tarifaForaPontaAno = cliente.tarifaForaPonta * fatorReajuste

    // I: delta tarifário — CORRIGIDO para usar sempre tarifa ponta - tarifa fora ponta
    // (planilha original alternava para uma tarifa auxiliar zerada a partir do ano 4)
    const deltaTarifario = tarifaPontaAno - tarifaForaPontaAno

    // K/L/M
    const energiaNecessariaDia = dim.energiaNecessariaDia
    const energiaPerdaCargaDia = energiaNecessariaDia * (1 - bess.rte)
    const energiaComplementarDia = Math.max(energiaNecessariaDia - capacidadeUtilDia, 0)

    // O&M reajustado pelo IPCA (DADOS_CLIENTE!B26)
    const omAno = capex.omAnual * Math.pow(1 + cliente.ipca, i)

    let economiaAnualBruta: number
    if (cliente.modoOperacao === 'TIME-SHIFT') {
      // O = (K*I - L*H - M*F) * diasUteisPorMes * 12
      economiaAnualBruta =
        (energiaNecessariaDia * deltaTarifario -
          energiaPerdaCargaDia * tarifaForaPontaAno -
          energiaComplementarDia * tarifaPontaAno) *
        cliente.diasUteisPorMes *
        12
    } else if (cliente.modoOperacao === 'PEAK-SHAVING') {
      // CORRIGIDO: usa tarifaDemandaUltrapassagem informada pelo usuário em vez do
      // #REF! quebrado da planilha original. Economia = demanda evitada de
      // ultrapassagem * tarifa de demanda, menos custo da energia perdida no ciclo.
      const tarifaDemandaAno = (cliente.tarifaDemandaUltrapassagem ?? 0) * fatorReajuste
      economiaAnualBruta =
        (dim.potenciaNecessaria * tarifaDemandaAno - energiaPerdaCargaDia * tarifaForaPontaAno) * 12
    } else {
      // BACKUP: a planilha original não modela economia tarifária para este modo
      // (o valor do backup é continuidade operacional, não arbitragem de tarifa).
      // Only conta o custo evitado de interrupção informado pelo usuário, se houver.
      economiaAnualBruta = cliente.custoEvitadoInterrupcaoAnual ?? 0
    }

    const economiaAnualLiquida = economiaAnualBruta - omAno

    anos.push({
      ano,
      ciclosAcumulados,
      sohAno,
      capacidadeUtilDia,
      tarifaPontaAno,
      tarifaForaPontaAno,
      deltaTarifario,
      energiaNecessariaDia,
      energiaPerdaCargaDia,
      energiaComplementarDia,
      economiaAnualBruta,
      omAno,
      economiaAnualLiquida,
    })
  }

  return anos
}

// ---------------------------------------------------------------------------
// INDICADORES FINANCEIROS
// ---------------------------------------------------------------------------

function vpl(taxa: number, fluxos: number[]): number {
  // fluxos[0] é o investimento (ano 0), descontado normalmente (fator 1);
  // os demais são descontados a partir do período 1 — mesma convenção do NPV do Excel
  // (NPV nativo do Excel só desconta a partir do período 1; o CF0 é somado fora dele).
  let soma = fluxos[0]
  for (let t = 1; t < fluxos.length; t++) {
    soma += fluxos[t] / Math.pow(1 + taxa, t)
  }
  return soma
}

/** TIR via bisseção sobre o VPL — robusto o bastante para fluxos com um único sinal de troca. */
function tir(fluxos: number[]): number | null {
  const npvAt = (r: number) => vpl(r, fluxos)

  let lo = -0.99
  let hi = 10
  const npvLo = npvAt(lo)
  const npvHi = npvAt(hi)
  if (Number.isNaN(npvLo) || Number.isNaN(npvHi) || npvLo * npvHi > 0) {
    return null // sem raiz no intervalo — fluxo sempre positivo ou sempre negativo
  }

  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2
    const npvMid = npvAt(mid)
    if (Math.abs(npvMid) < 1e-6) return mid
    if (npvLo * npvMid < 0) {
      hi = mid
    } else {
      lo = mid
    }
  }
  return (lo + hi) / 2
}

function calcularPayback(fluxoCaixa: FluxoCaixaAno[]): number | null {
  for (let i = 1; i < fluxoCaixa.length; i++) {
    const anterior = fluxoCaixa[i - 1]
    const atual = fluxoCaixa[i]
    if (anterior.acumulado < 0 && atual.acumulado >= 0) {
      // interpolação linear dentro do ano em que o acumulado cruza zero
      const fracaoAno = Math.abs(anterior.acumulado) / (atual.acumulado - anterior.acumulado)
      return anterior.ano + fracaoAno
    }
  }
  return null // não recupera o investimento dentro da vida útil do projeto
}

export function calcularIndicadoresFinanceiros(
  cliente: DadosCliente,
  capex: CapexResult,
  economiaAnual: EconomiaAno[]
): IndicadoresFinanceiros {
  const fluxoCaixa: FluxoCaixaAno[] = []
  let acumulado = -capex.capexTotal
  fluxoCaixa.push({ ano: 0, valor: -capex.capexTotal, acumulado })

  for (const eco of economiaAnual) {
    acumulado += eco.economiaAnualLiquida
    fluxoCaixa.push({ ano: eco.ano, valor: eco.economiaAnualLiquida, acumulado })
  }

  const valores = fluxoCaixa.map((f) => f.valor)
  const vplResultado = vpl(cliente.tma, valores)
  const tirResultado = tir(valores)
  const paybackAnos = calcularPayback(fluxoCaixa)

  const viavel = vplResultado > 0 && tirResultado !== null && tirResultado > cliente.tma

  return {
    fluxoCaixa,
    vpl: vplResultado,
    tir: tirResultado,
    paybackAnos,
    viavel,
  }
}

// ---------------------------------------------------------------------------
// ORQUESTRADOR
// ---------------------------------------------------------------------------

export function calcularResultadoCompleto(
  cliente: DadosCliente,
  bess: EspecificacoesBess,
  capexInputs: CapexInputs
): ResultadoCompleto {
  const dimensionamento = calcularDimensionamento(cliente, bess)
  const capex = calcularCapex(capexInputs)
  const economiaAnual = calcularEconomiaAnual(cliente, bess, dimensionamento, capex)
  const indicadores = calcularIndicadoresFinanceiros(cliente, capex, economiaAnual)

  return { dimensionamento, capex, economiaAnual, indicadores }
}
