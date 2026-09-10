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

describe('calcularDimensionamento — modo BACKUP', () => {
  // Cliente rural: motivo do BESS é autonomia contra falha de atendimento da
  // distribuidora, não arbitragem tarifária. Demanda média normal ~988 kW e
  // demanda máxima medida 1279 kW replicam a relação (~23% de redução) citada
  // na spec do validador (docs/spec-validador-dimensionamento.md) para o caso
  // Caterpillar, usada aqui só como fixture numérica — não é o mesmo cenário
  // de negócio (lá é indústria/comercial, aqui é o caso rural de referência).
  const clienteBackupBase = {
    ...DADOS_CLIENTE_PADRAO,
    modoOperacao: 'BACKUP' as const,
    demandaMaximaPontaKw: 1279,
    demandaMediaNormalKw: 988,
    horasBackup: 4,
  }

  it('base DEMANDA_MEDIA_NORMAL: energia = horasBackup × demandaMediaNormalKw', () => {
    const dim = calcularDimensionamento(
      { ...clienteBackupBase, baseCalculoBackup: 'DEMANDA_MEDIA_NORMAL' },
      ESPECIFICACOES_BESS_PADRAO
    )
    expect(dim.energiaNecessariaDia).toBe(4 * 988) // 3952
    expect(dim.potenciaNecessaria).toBe(1279) // PCS dimensionado pelo pico, não pela média
  })

  it('base DEMANDA_MAXIMA: energia = horasBackup × demandaMaximaPontaKw (mais conservador)', () => {
    const dim = calcularDimensionamento(
      { ...clienteBackupBase, baseCalculoBackup: 'DEMANDA_MAXIMA' },
      ESPECIFICACOES_BESS_PADRAO
    )
    expect(dim.energiaNecessariaDia).toBe(4 * 1279) // 5116 — ~23% maior que a base realista
  })

  it('sem demandaMediaNormalKw informado, cai para demanda máxima mesmo pedindo a base média', () => {
    const { demandaMediaNormalKw, ...semMedia } = clienteBackupBase
    const dim = calcularDimensionamento(
      { ...semMedia, baseCalculoBackup: 'DEMANDA_MEDIA_NORMAL' },
      ESPECIFICACOES_BESS_PADRAO
    )
    expect(dim.energiaNecessariaDia).toBe(4 * 1279)
  })

  it('não depende de consumoMedioPontaKwh/coberturaPontaPercent (não é uma fração da ponta)', () => {
    const dim1 = calcularDimensionamento(
      { ...clienteBackupBase, baseCalculoBackup: 'DEMANDA_MEDIA_NORMAL', coberturaPontaPercent: 1 },
      ESPECIFICACOES_BESS_PADRAO
    )
    const dim2 = calcularDimensionamento(
      { ...clienteBackupBase, baseCalculoBackup: 'DEMANDA_MEDIA_NORMAL', coberturaPontaPercent: 0.1 },
      ESPECIFICACOES_BESS_PADRAO
    )
    expect(dim1.energiaNecessariaDia).toBe(dim2.energiaNecessariaDia)
  })
})

describe('calcularDimensionamento — modo QUALIDADE_ENERGIA', () => {
  // Ride-through de afundamento de tensão/microinterrupção da Copel: dura segundos, não
  // horas. Ex: proteger 200 kW de carga crítica (motores de irrigação/ordenha) por um
  // evento de 10 segundos.
  const clienteQE = {
    ...DADOS_CLIENTE_PADRAO,
    modoOperacao: 'QUALIDADE_ENERGIA' as const,
    demandaMaximaPontaKw: 300,
    potenciaCriticaKw: 200,
    duracaoEventoSegundos: 10,
    eventosPorMes: 15,
  }

  it('energia = potenciaCriticaKw × duração do evento em horas (sem arredondar pra cima)', () => {
    const dim = calcularDimensionamento(clienteQE, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.energiaNecessariaDia).toBeCloseTo((200 * 10) / 3600, 6) // ≈0.5556 kWh
    expect(dim.potenciaNecessaria).toBe(200) // potência crítica, não a demanda máxima da UC
  })

  it('sem potenciaCriticaKw informado, cai para demandaMaximaPontaKw', () => {
    const { potenciaCriticaKw, ...semPotenciaCritica } = clienteQE
    const dim = calcularDimensionamento(semPotenciaCritica, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.energiaNecessariaDia).toBeCloseTo((300 * 10) / 3600, 6)
    expect(dim.potenciaNecessaria).toBe(300)
  })

  it('ciclosPorAno usa eventosPorMes × 12 quando informado (não diasUteisPorMes)', () => {
    const dim = calcularDimensionamento(clienteQE, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.ciclosPorAno).toBe(15 * 12)
  })

  it('sem eventosPorMes, cai para a estimativa genérica de diasUteisPorMes × 12', () => {
    const { eventosPorMes, ...semEventos } = clienteQE
    const dim = calcularDimensionamento(semEventos, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.ciclosPorAno).toBe(DADOS_CLIENTE_PADRAO.diasUteisPorMes * 12)
  })

  it('autonomia é medida em horas de potência crítica, não em múltiplos de horasPontaPorDia', () => {
    const bess = { ...ESPECIFICACOES_BESS_PADRAO, racksAdotadoOverride: 1 }
    const dim = calcularDimensionamento(clienteQE, bess)
    const esperado = (dim.capacidadeInstalada * dim.sohApos1Ano * bess.dod * bess.rte) / 200
    expect(dim.autonomia1AnoH).toBeCloseTo(esperado, 6)
  })
})

describe('calcularDimensionamento — lista de cargas críticas', () => {
  const cargas = [
    { nome: 'Motor de irrigação', potenciaKw: 120 },
    { nome: 'Ordenha', potenciaKw: 45 },
    { nome: 'Câmara fria', potenciaKw: 35 },
  ] // soma = 200 kW

  it('BACKUP: soma das cargas críticas substitui demandaMaximaPontaKw (base DEMANDA_MAXIMA)', () => {
    const cliente = {
      ...DADOS_CLIENTE_PADRAO,
      modoOperacao: 'BACKUP' as const,
      demandaMaximaPontaKw: 1279, // deve ser ignorado quando há cargasCriticas
      horasBackup: 4,
      baseCalculoBackup: 'DEMANDA_MAXIMA' as const,
      cargasCriticas: cargas,
    }
    const dim = calcularDimensionamento(cliente, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.energiaNecessariaDia).toBe(4 * 200)
    expect(dim.potenciaNecessaria).toBe(200)
  })

  it('BACKUP: sem cargasCriticas, comportamento não muda (usa demandaMaximaPontaKw)', () => {
    const cliente = {
      ...DADOS_CLIENTE_PADRAO,
      modoOperacao: 'BACKUP' as const,
      demandaMaximaPontaKw: 1279,
      horasBackup: 4,
      baseCalculoBackup: 'DEMANDA_MAXIMA' as const,
    }
    const dim = calcularDimensionamento(cliente, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.energiaNecessariaDia).toBe(4 * 1279)
  })

  it('QUALIDADE_ENERGIA: soma das cargas críticas tem prioridade sobre potenciaCriticaKw e demandaMaximaPontaKw', () => {
    const cliente = {
      ...DADOS_CLIENTE_PADRAO,
      modoOperacao: 'QUALIDADE_ENERGIA' as const,
      demandaMaximaPontaKw: 300,
      potenciaCriticaKw: 250, // deve ser ignorado quando há cargasCriticas
      duracaoEventoSegundos: 10,
      cargasCriticas: cargas,
    }
    const dim = calcularDimensionamento(cliente, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.potenciaNecessaria).toBe(200)
    expect(dim.energiaNecessariaDia).toBeCloseTo((200 * 10) / 3600, 6)
  })

  it('lista vazia é tratada igual a lista omitida', () => {
    const base = { ...DADOS_CLIENTE_PADRAO, modoOperacao: 'BACKUP' as const, horasBackup: 4 }
    const semLista = calcularDimensionamento(base, ESPECIFICACOES_BESS_PADRAO)
    const listaVazia = calcularDimensionamento({ ...base, cargasCriticas: [] }, ESPECIFICACOES_BESS_PADRAO)
    expect(listaVazia.energiaNecessariaDia).toBe(semLista.energiaNecessariaDia)
  })
})

describe('calcularDimensionamento — modo combinado BACKUP_E_QUALIDADE_ENERGIA', () => {
  const clienteCombinado = {
    ...DADOS_CLIENTE_PADRAO,
    modoOperacao: 'BACKUP_E_QUALIDADE_ENERGIA' as const,
    demandaMaximaPontaKw: 300, // carga total da propriedade (base do backup)
    horasBackup: 4,
    baseCalculoBackup: 'DEMANDA_MAXIMA' as const,
    potenciaCriticaKw: 120, // só as cargas mais sensíveis (base da qualidade de energia)
    duracaoEventoSegundos: 10,
  }

  it('energia é dominada pelo backup (horas), não pela energia desprezível do evento de qualidade', () => {
    const dim = calcularDimensionamento(clienteCombinado, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.energiaNecessariaDia).toBe(4 * 300) // igual ao BACKUP isolado com a mesma base
  })

  it('potência necessária é o maior entre a carga de backup e a carga crítica de qualidade', () => {
    // aqui backup (300 kW) > qualidade de energia (120 kW)
    const dim = calcularDimensionamento(clienteCombinado, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.potenciaNecessaria).toBe(300)
  })

  it('quando a carga crítica de qualidade é maior que a de backup, a potência acompanha ela', () => {
    const dim = calcularDimensionamento(
      { ...clienteCombinado, potenciaCriticaKw: 450 },
      ESPECIFICACOES_BESS_PADRAO
    )
    expect(dim.potenciaNecessaria).toBe(450)
  })

  it('autonomia é medida contra a potência de referência do backup (a função dominante)', () => {
    const bess = { ...ESPECIFICACOES_BESS_PADRAO, racksAdotadoOverride: 1 }
    const dim = calcularDimensionamento(clienteCombinado, bess)
    const esperado = (dim.capacidadeInstalada * dim.sohApos1Ano * bess.dod * bess.rte) / 300
    expect(dim.autonomia1AnoH).toBeCloseTo(esperado, 6)
  })

  it('com cargasCriticas preenchida, a mesma soma alimenta os dois lados do máximo', () => {
    const dim = calcularDimensionamento(
      {
        ...clienteCombinado,
        cargasCriticas: [
          { nome: 'Irrigação', potenciaKw: 150 },
          { nome: 'Ordenha', potenciaKw: 50 },
        ], // soma = 200, substitui tanto demandaMaximaPontaKw quanto potenciaCriticaKw
      },
      ESPECIFICACOES_BESS_PADRAO
    )
    expect(dim.potenciaNecessaria).toBe(200)
    expect(dim.energiaNecessariaDia).toBe(4 * 200)
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
