import { describe, it, expect } from 'vitest'
import {
  calcularDimensionamento,
  calcularCapex,
  calcularEconomiaAnual,
  calcularIndicadoresFinanceiros,
} from './engine'
import { DADOS_CLIENTE_PADRAO, ESPECIFICACOES_BESS_PADRAO, CAPEX_INPUTS_PADRAO } from './defaults'
import type { ModoOperacao } from '../types'

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
    modosOperacao: ['BACKUP'] as ModoOperacao[],
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
    modosOperacao: ['QUALIDADE_ENERGIA'] as ModoOperacao[],
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
      modosOperacao: ['BACKUP'] as ModoOperacao[],
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
      modosOperacao: ['BACKUP'] as ModoOperacao[],
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
      modosOperacao: ['QUALIDADE_ENERGIA'] as ModoOperacao[],
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
    const base = { ...DADOS_CLIENTE_PADRAO, modosOperacao: ['BACKUP'] as ModoOperacao[], horasBackup: 4 }
    const semLista = calcularDimensionamento(base, ESPECIFICACOES_BESS_PADRAO)
    const listaVazia = calcularDimensionamento({ ...base, cargasCriticas: [] }, ESPECIFICACOES_BESS_PADRAO)
    expect(listaVazia.energiaNecessariaDia).toBe(semLista.energiaNecessariaDia)
  })
})

describe('calcularDimensionamento — modo combinado BACKUP_E_QUALIDADE_ENERGIA', () => {
  const clienteCombinado = {
    ...DADOS_CLIENTE_PADRAO,
    modosOperacao: ['BACKUP', 'QUALIDADE_ENERGIA'] as ModoOperacao[],
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

describe('calcularDimensionamento — checkbox genérico (mais de dois modos ao mesmo tempo)', () => {
  // BACKUP_E_QUALIDADE_ENERGIA era um valor de enum especial; agora modosOperacao é uma
  // lista e qualquer combinação é válida — inclusive combos com TIME-SHIFT/PEAK-SHAVING
  // que antes não existiam. Estes testes cobrem a regra geral: energia = reserva (BACKUP
  // domina sobre QUALIDADE_ENERGIA) + ciclagem (TIME-SHIFT/PEAK-SHAVING, sem dobrar
  // contagem entre os dois); potência = máximo entre as exigências de todos os modos ativos.
  const base = {
    ...DADOS_CLIENTE_PADRAO,
    consumoMedioPontaKwh: 6600, // energiaTotalPontaMes/diasUteisPorMes (22) = 300 kWh/dia de ciclagem
    demandaMaximaPontaKw: 500,
    horasBackup: 4,
    baseCalculoBackup: 'DEMANDA_MAXIMA' as const,
  }

  it('BACKUP sozinho: energia = só a reserva (sem ciclagem)', () => {
    const dim = calcularDimensionamento({ ...base, modosOperacao: ['BACKUP'] }, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.energiaNecessariaDia).toBe(4 * 500) // 2000, sem soma de ciclagem
  })

  it('TIME-SHIFT sozinho: energia = só a ciclagem (sem reserva)', () => {
    const dim = calcularDimensionamento({ ...base, modosOperacao: ['TIME-SHIFT'] }, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.energiaNecessariaDia).toBe(300) // 6600/22, sem soma de reserva
  })

  it('BACKUP + TIME-SHIFT: energia = reserva + ciclagem somadas', () => {
    const dim = calcularDimensionamento(
      { ...base, modosOperacao: ['BACKUP', 'TIME-SHIFT'] },
      ESPECIFICACOES_BESS_PADRAO
    )
    expect(dim.energiaNecessariaDia).toBe(4 * 500 + 300) // 2300
  })

  it('TIME-SHIFT + PEAK-SHAVING: usa o maior dos dois, não a soma (mesma capacidade cíclica)', () => {
    const dim = calcularDimensionamento(
      { ...base, modosOperacao: ['TIME-SHIFT', 'PEAK-SHAVING'], limiteDemandaKw: 100 },
      ESPECIFICACOES_BESS_PADRAO
    )
    // energiaCiclagem é a mesma fórmula pros dois (300), não 600
    expect(dim.energiaNecessariaDia).toBe(300)
  })

  it('potência necessária é o máximo entre todos os modos ativos', () => {
    const dim = calcularDimensionamento(
      { ...base, modosOperacao: ['BACKUP', 'PEAK-SHAVING'], limiteDemandaKw: 450 }, // peak-shaving pede só 50 kW
      ESPECIFICACOES_BESS_PADRAO
    )
    expect(dim.potenciaNecessaria).toBe(500) // backup (500) > peak-shaving (500-450=50)
  })

  it('nenhum modo marcado: energia zerada, não quebra o cálculo', () => {
    const dim = calcularDimensionamento({ ...base, modosOperacao: [] }, ESPECIFICACOES_BESS_PADRAO)
    expect(dim.energiaNecessariaDia).toBe(0)
    expect(Number.isFinite(dim.capacidadeNominalMinima)).toBe(true)
  })
})

describe('calcularDimensionamento — autonomia e capacidade corretas em combos mistos (reserva + ciclagem)', () => {
  // Motivação: com BACKUP/QUALIDADE_ENERGIA (reserva) e TIME-SHIFT/PEAK-SHAVING (ciclagem)
  // marcados juntos, parte da capacidade instalada é disputada pelos dois usos. Contar a
  // capacidade inteira como se estivesse sempre livre pro backup (comportamento inicial do
  // checkbox) era otimista demais — ver conversa com o dono do repo. Estes testes travam a
  // correção: autonomia usa só a fração de capacidade proporcional à reserva, e a folga de
  // fim de vida (SoH) do PEAK-SHAVING pesa só na parcela de ciclagem.
  const clienteMisto = {
    ...DADOS_CLIENTE_PADRAO,
    consumoMedioPontaKwh: 6600, // 300 kWh/dia de ciclagem (diasUteisPorMes=22)
    demandaMaximaPontaKw: 500,
    horasBackup: 4,
    baseCalculoBackup: 'DEMANDA_MAXIMA' as const,
  }

  it('BACKUP+TIME-SHIFT: autonomia usa só a fração de reserva da capacidade instalada, não a instalada inteira', () => {
    const bess = { ...ESPECIFICACOES_BESS_PADRAO, racksAdotadoOverride: 1 }
    const dimMisto = calcularDimensionamento({ ...clienteMisto, modosOperacao: ['BACKUP', 'TIME-SHIFT'] }, bess)
    const dimSoBackup = calcularDimensionamento({ ...clienteMisto, modosOperacao: ['BACKUP'] }, bess)

    // energiaReserva = 4×500 = 2000; energiaCiclagem = 300; fração de reserva = 2000/2300
    const fracaoReserva = 2000 / 2300
    const capacidadeReservaEsperada = fracaoReserva * dimMisto.capacidadeInstalada
    const autonomiaEsperada = (capacidadeReservaEsperada * dimMisto.sohApos1Ano * bess.dod * bess.rte) / 500
    expect(dimMisto.autonomia1AnoH).toBeCloseTo(autonomiaEsperada, 6)

    // estritamente menor que se toda a capacidade instalada contasse como reserva (o que
    // seria otimista demais com o BESS também ocupado em ciclagem diária)
    expect(dimMisto.autonomia1AnoH).toBeLessThan(
      (dimMisto.capacidadeInstalada * dimMisto.sohApos1Ano * bess.dod * bess.rte) / 500
    )

    // BACKUP sozinho, mesma capacidadeInstalada (mesmo override) — sem ciclagem disputando
    // o mesmo BESS, usa a capacidade inteira como reserva, então tem mais autonomia
    expect(dimSoBackup.autonomia1AnoH).toBeGreaterThan(dimMisto.autonomia1AnoH)
  })

  it('BACKUP+PEAK-SHAVING: a folga de fim de vida (SoH) pesa só na parcela de ciclagem, não na reserva', () => {
    const cliente = {
      ...clienteMisto,
      modosOperacao: ['BACKUP', 'PEAK-SHAVING'] as ModoOperacao[],
      limiteDemandaKw: 400,
    }
    const dim = calcularDimensionamento(cliente, ESPECIFICACOES_BESS_PADRAO)

    const energiaReserva = 4 * 500 // 2000
    const energiaCiclagem = 300
    const sohFinal = dim.sohFinalProjeto
    const esperado = Math.ceil((energiaReserva + energiaCiclagem / sohFinal) / (0.98 * 0.92))
    expect(dim.capacidadeNominalMinima).toBe(esperado)

    // se a folga inflasse a reserva também (comportamento anterior), o mínimo seria maior
    const comportamentoAnterior = Math.ceil((energiaReserva + energiaCiclagem) / (0.98 * 0.92 * sohFinal))
    expect(dim.capacidadeNominalMinima).toBeLessThan(comportamentoAnterior)
  })

  it('com um único modo de reserva marcado (sem ciclagem), a fração de reserva é 1 — sem mudança de comportamento', () => {
    const dim = calcularDimensionamento({ ...clienteMisto, modosOperacao: ['BACKUP'] }, ESPECIFICACOES_BESS_PADRAO)
    const autonomiaSemFracao =
      (dim.capacidadeInstalada * dim.sohApos1Ano * ESPECIFICACOES_BESS_PADRAO.dod * ESPECIFICACOES_BESS_PADRAO.rte) /
      500
    expect(dim.autonomia1AnoH).toBeCloseTo(autonomiaSemFracao, 6)
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
