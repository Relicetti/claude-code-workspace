import { describe, it, expect } from 'vitest'
import {
  calcularDimensionamento,
  calcularCapex,
  calcularEconomiaAnual,
  calcularIndicadoresFinanceiros,
} from './engine'
import { DADOS_CLIENTE_PADRAO, ESPECIFICACOES_BESS_PADRAO, CAPEX_INPUTS_PADRAO } from './defaults'

// A planilha de referência define racksAdotado=1 manualmente (célula digitada,
// não pela fórmula MAX(racksPorEnergia, racksPorPotencia) — que daria 2). Para
// validar economia/capex linha a linha contra a planilha, replicamos esse
// override manual aqui; o teste de calcularDimensionamento abaixo cobre o
// comportamento automático (sem override).
const BESS_COM_OVERRIDE_PLANILHA = { ...ESPECIFICACOES_BESS_PADRAO, racksAdotadoOverride: 1 }
import { lookupSoH } from './soh-curve'

// Valores de referência extraídos diretamente de Planilha_Dimensionamento_BESS.xlsx
// (caso Caterpillar Campo Largo / WEG, proposta RP0826000).

describe('lookupSoH', () => {
  it('interpola entre pontos da curva WEG (confere com valores colados em ECONOMIA_ANUAL)', () => {
    expect(lookupSoH(0)).toBeCloseTo(0.986, 4)
    expect(lookupSoH(264)).toBeCloseTo(0.9506312328767124, 4) // ano 1 do financeiro
    expect(lookupSoH(528)).toBeCloseTo(0.9260249315068494, 4) // ano 2
    expect(lookupSoH(7300)).toBeCloseTo(0.6549, 4)
    expect(lookupSoH(99999)).toBeCloseTo(0.6549, 4) // satura no fim da curva
  })
})

describe('calcularDimensionamento — caso Caterpillar (TIME-SHIFT)', () => {
  const dim = calcularDimensionamento(DADOS_CLIENTE_PADRAO, ESPECIFICACOES_BESS_PADRAO)

  it('bate com DIMENSIONAMENTO!B1:B4 da planilha', () => {
    expect(dim.energiaTotalPontaMes).toBe(67939) // B1
    expect(dim.energiaNecessariaDia).toBe(3089) // B2
    expect(dim.capacidadeNominalMinima).toBe(3427) // B3
    expect(dim.potenciaNecessaria).toBe(1279) // B4
  })

  it('ciclos por ano e totais do projeto batem com DADOS_CLIENTE!B17/B21', () => {
    expect(dim.ciclosPorAno).toBe(264)
    expect(dim.ciclosTotaisProjeto).toBe(5280)
  })

  it('sem override, o auto-sizing pede 2 racks (a planilha original usava 1, digitado à mão)', () => {
    expect(dim.racksPorEnergia).toBe(2) // ROUNDUP(3427/3343)
    expect(dim.racksPorPotencia).toBe(1) // ROUNDUP(1279/1500)
    expect(dim.racksAdotado).toBe(2)
  })

  it('com racksAdotadoOverride, reproduz a capacidade instalada da planilha (B13/B14)', () => {
    const dimOverride = calcularDimensionamento(DADOS_CLIENTE_PADRAO, {
      ...ESPECIFICACOES_BESS_PADRAO,
      racksAdotadoOverride: 1,
    })
    expect(dimOverride.capacidadeInstalada).toBe(3343) // B13
    expect(dimOverride.potenciaInstalada).toBe(1500) // B14
  })
})

describe('calcularCapex — caso Caterpillar', () => {
  const capex = calcularCapex(CAPEX_INPUTS_PADRAO)

  it('bate com DIMENSIONAMENTO!C26:C45 da planilha', () => {
    expect(capex.frete).toBeCloseTo(226302.6436, 2) // C27
    expect(capex.valorEquipamentosFrete).toBeCloseTo(5883868.7336, 2) // C28
    expect(capex.instalacao).toBeCloseTo(678907.9308, 2) // C30
    expect(capex.valorTotalMateriaisServicos).toBeCloseTo(6562776.6644, 2) // C31
    expect(capex.nfKora).toBeCloseTo(3412500.18, 1) // C40
    expect(capex.precoVenda).toBeCloseTo(9296368.91, 1) // C38
    expect(capex.capexTotal).toBeCloseTo(9296368.91, 1) // C32
    expect(capex.omAnual).toBeCloseTo(139445.53372304756, 1) // C44
    expect(capex.mensalidadeOM).toBeCloseTo(11620.461143587296, 2) // C45
  })
})

describe('calcularEconomiaAnual — anos 1 a 3 (não afetados pelo bug do delta tarifário)', () => {
  const dim = calcularDimensionamento(DADOS_CLIENTE_PADRAO, BESS_COM_OVERRIDE_PLANILHA)
  const capex = calcularCapex(CAPEX_INPUTS_PADRAO)
  const economia = calcularEconomiaAnual(DADOS_CLIENTE_PADRAO, BESS_COM_OVERRIDE_PLANILHA, dim, capex)

  it('ano 1 (ECONOMIA_ANUAL linha ano=0) bate com O2/P2/Q2', () => {
    const a1 = economia[0]
    expect(a1.omAno).toBeCloseTo(139445.53372304756, 1) // P2
    expect(a1.economiaAnualBruta).toBeCloseTo(1024167.4408017973, 0) // O2
    expect(a1.economiaAnualLiquida).toBeCloseTo(884721.9070787497, 0) // Q2
  })

  it('ano 2 (linha ano=1) bate com O3/Q3', () => {
    const a2 = economia[1]
    expect(a2.economiaAnualBruta).toBeCloseTo(1041899.2288564283, -1)
    expect(a2.economiaAnualLiquida).toBeCloseTo(896192.5906692159, -1)
  })

  it('ano 3 (linha ano=2) bate com O4/Q4', () => {
    const a3 = economia[2]
    expect(a3.economiaAnualBruta).toBeCloseTo(1072173.1750154733, -1)
    expect(a3.economiaAnualLiquida).toBeCloseTo(919924.3087736551, -1)
  })

  it('a partir do ano 4, a economia CONTINUA POSITIVA (correção do bug do delta tarifário)', () => {
    // Na planilha original, o delta tarifário invertia de sinal a partir daqui
    // (O5 em diante ficava negativo). Com a correção, a economia se mantém
    // coerente com os anos anteriores.
    for (let i = 3; i < economia.length; i++) {
      expect(economia[i].economiaAnualBruta).toBeGreaterThan(0)
    }
  })

  it('gera vidaUtilAnos entradas', () => {
    expect(economia).toHaveLength(DADOS_CLIENTE_PADRAO.vidaUtilAnos)
  })
})

describe('calcularIndicadoresFinanceiros — caso Caterpillar corrigido', () => {
  const dim = calcularDimensionamento(DADOS_CLIENTE_PADRAO, BESS_COM_OVERRIDE_PLANILHA)
  const capex = calcularCapex(CAPEX_INPUTS_PADRAO)
  const economia = calcularEconomiaAnual(DADOS_CLIENTE_PADRAO, BESS_COM_OVERRIDE_PLANILHA, dim, capex)
  const indicadores = calcularIndicadoresFinanceiros(DADOS_CLIENTE_PADRAO, capex, economia)

  it('fluxo de caixa ano 0 é o CAPEX negativo', () => {
    expect(indicadores.fluxoCaixa[0].valor).toBeCloseTo(-9296368.91, 1)
  })

  it('gera vidaUtilAnos + 1 pontos de fluxo de caixa (ano 0 a vidaUtilAnos)', () => {
    expect(indicadores.fluxoCaixa).toHaveLength(DADOS_CLIENTE_PADRAO.vidaUtilAnos + 1)
  })

  it('com a correção, o projeto tem payback dentro da vida útil', () => {
    // Na planilha original (com o bug), o projeto nunca pagava o investimento.
    expect(indicadores.paybackAnos).not.toBeNull()
    expect(indicadores.paybackAnos!).toBeLessThan(DADOS_CLIENTE_PADRAO.vidaUtilAnos)
  })
})
