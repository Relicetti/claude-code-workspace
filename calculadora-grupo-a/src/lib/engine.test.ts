import { describe, expect, it } from 'vitest';
import { calcular, fioBRampaPct, IMPOSTOS_PADRAO, resolverAgenteAneel } from './engine';
import tarifasData from '../data/tarifas.json';
import type { DadosTarifarios, Entrada } from '../types';

const dadosAtuais = tarifasData as DadosTarifarios;
// A planilha foi montada antes do reajuste Copel de 24/06/2026 — recorta os dados nessa data
// pra reproduzir os valores dela.
const dadosPlanilha: DadosTarifarios = {
  ...dadosAtuais,
  tarifas: dadosAtuais.tarifas.filter((t) => t.inicio < '2026-06-24'),
  fioB: dadosAtuais.fioB.filter((f) => f.inicio < '2026-06-24'),
};

// Cenário exato da aba "Simulação" de Calculos_GD_GrupoA.xlsx.
const cenarioPlanilha: Entrada = {
  distribuidora: 'Copel-DIS', ano: 2026, subgrupo: 'A4', modalidadeTarifaria: 'Verde',
  consumo: { Ponta: 30, 'Fora ponta': 1500 },
  ...IMPOSTOS_PADRAO,
  enquadramento: 'GD1', modalidadeGD: 'Geração Compartilhada', fonte: 'Solar',
  descontoPct: 0.1, desagioPct: 0.1,
};

describe('cenário da planilha (Copel A4 Verde, GD1)', () => {
  const r = calcular(cenarioPlanilha, dadosPlanilha);
  const ponta = r.postos.find((p) => p.posto === 'Ponta')!;
  const foraPonta = r.postos.find((p) => p.posto === 'Fora ponta')!;

  it('tarifas ANEEL (C22:C25) e Fio B (F14)', () => {
    expect(foraPonta.te).toBe(257.51);
    expect(ponta.te).toBe(413.69);
    expect(foraPonta.tusd).toBe(120.91);
    expect(ponta.tusd).toBe(1211.56);
    expect(ponta.fioB).toBeCloseTo(840.584266598, 6);
    expect(ponta.fioBAplicado).toBe(0); // GD1 não paga Fio B
  });

  it('tarifa cliente com impostos (F10:F13)', () => {
    expect(foraPonta.teCheia).toBeCloseTo(349.12823015808453, 9);
    expect(ponta.teCheia).toBeCloseTo(560.8747525692128, 9);
    expect(foraPonta.tusdCheia).toBeCloseTo(163.92798069361967, 9);
    expect(ponta.tusdCheia).toBeCloseTo(1642.6150383687193, 9);
  });

  it('isenções e tarifa injetada (I9:I26)', () => {
    expect(r.estado).toBe('PR');
    expect(r.isencoes).toEqual({ teIcms: false, tePisCofins: false, tusdIcms: false, tusdPisCofins: false });
    expect(ponta.valorInjetado).toBeCloseTo(48.7575, 9);
    expect(foraPonta.valorInjetado).toBeCloseTo(567.63, 9);
    expect(r.valorInjetado).toBeCloseTo(616.3875, 9);
    expect(r.tarifaMediaInjetada).toBeCloseTo(0.4028676470588235, 12);
  });

  it('faturamento atual (F18:F23)', () => {
    expect(ponta.valorAtual).toBeCloseTo(66.10469372813796, 9);
    expect(foraPonta.valorAtual).toBeCloseTo(769.5843162775564, 9);
    expect(r.valorAtual).toBeCloseTo(835.6890100056943, 9);
    expect(r.tarifaMediaCliente).toBeCloseTo(0.5462019673239832, 12);
    expect(r.desconto).toBeCloseTo(83.56890100056944, 9);
  });

  it('resultado final (L4:L12)', () => {
    expect(r.valorCss).toBeCloseTo(219.30151000569433, 9);
    expect(r.faturaGeracao).toBeCloseTo(532.8185989994305, 9);
    expect(r.valorTotalComKora).toBeCloseTo(752.1201090051248, 9);
    expect(r.tarifaMediaGeracao).toBeCloseTo(0.3482474503264252, 12);
    expect(r.valorKora).toBeCloseTo(53.28185989994305, 9);
    expect(r.valorGerador).toBeCloseTo(479.5367390994874, 9);
    expect(r.tarifaMediaGerador).toBeCloseTo(0.31342270529378263, 12);
  });
});

describe('valor do dono do crédito informado direto', () => {
  it('fixa o R$/kWh do gerador e a Kora fica com o resto', () => {
    const r = calcular({ ...cenarioPlanilha, precoGeradorKWh: 0.30 }, dadosPlanilha);
    expect(r.valorGerador).toBeCloseTo(0.30 * 1530, 9);
    expect(r.tarifaMediaGerador).toBeCloseTo(0.30, 12);
    expect(r.valorKora).toBeCloseTo(532.8185989994305 - 459, 9);
    expect(r.desagioEfetivoPct).toBeCloseTo((532.8185989994305 - 459) / 532.8185989994305, 12);
    expect(r.faturaGeracao).toBeCloseTo(532.8185989994305, 9); // o cliente não muda
  });

  it('sem valor informado, o deságio efetivo é o digitado', () => {
    expect(calcular(cenarioPlanilha, dadosPlanilha).desagioEfetivoPct).toBeCloseTo(0.1, 12);
  });
});

describe('comissão do vendedor em % da fatura de geração', () => {
  const r = calcular({ ...cenarioPlanilha, vendedorKWh: 0.02, vendedorPct: 0.03 }, dadosPlanilha);

  it('% substitui o R$/kWh e sai da parte da Kora', () => {
    expect(r.valorVendedor).toBeCloseTo(0.03 * 532.8185989994305, 9);
    expect(r.valorKora).toBeCloseTo(53.28185989994305 - 0.03 * 532.8185989994305, 9);
    expect(r.valorGerador).toBeCloseTo(479.5367390994874, 9);
  });
});

describe('composição do kWh com comissão do vendedor', () => {
  const r = calcular({ ...cenarioPlanilha, vendedorKWh: 0.02 }, dadosPlanilha);

  it('vendedor leva R$/kWh fixo da parte da Kora', () => {
    expect(r.tarifaMediaVendedor).toBeCloseTo(0.02, 12);
    expect(r.valorVendedor).toBeCloseTo(0.02 * 1530, 9);
    expect(r.valorKora).toBeCloseTo(53.28185989994305 - 0.02 * 1530, 9);
    expect(r.valorGerador).toBeCloseTo(479.5367390994874, 9); // gerador não muda
    expect(r.desagioEfetivoPct).toBeCloseTo(0.1, 12);          // Kora + vendedor
  });

  it('distribuidora + gerador + Kora + vendedor = custo final do kWh', () => {
    const soma = r.tarifaMediaCss + r.tarifaMediaGerador + r.tarifaMediaKora + r.tarifaMediaVendedor;
    expect(soma).toBeCloseTo(r.tarifaMediaFinal, 12);
    expect(r.tarifaMediaFinal).toBeCloseTo(752.1201090051248 / 1530, 12);
    expect(r.tarifaMediaFinal).toBeCloseTo(r.tarifaMediaCliente * (1 - cenarioPlanilha.descontoPct), 12);
  });
});

describe('GD2 desconta Fio B da rampa (Simulação!I19:I20)', () => {
  it('60% do Fio B em 2026 sai da TUSD Ponta injetada', () => {
    const r = calcular({ ...cenarioPlanilha, enquadramento: 'GD2' }, dadosPlanilha);
    const ponta = r.postos.find((p) => p.posto === 'Ponta')!;
    expect(r.fioBRampaPct).toBe(0.6);
    expect(ponta.fioBAplicado).toBeCloseTo(840.584266598 * 0.6, 9);
    expect(ponta.valorInjetado).toBeCloseTo((30 * (413.69 + 1211.56 - 840.584266598 * 0.6)) / 1000, 9);
  });

  it('rampa da Lei 14.300', () => {
    expect([2023, 2024, 2025, 2026, 2027, 2028, 2029, 2035].map(fioBRampaPct))
      .toEqual([0.15, 0.30, 0.45, 0.60, 0.75, 0.90, 1, 1]);
  });
});

describe('ano de referência pega a vigência mais recente até 31/12', () => {
  it('2026 com dados atuais já usa o reajuste Copel de 24/06/2026', () => {
    const r = calcular(cenarioPlanilha, dadosAtuais);
    expect(r.postos.find((p) => p.posto === 'Fora ponta')!.inicioVigencia).toBe('2026-06-24');
  });
  it('2025 usa a tarifa de 24/06/2025', () => {
    const r = calcular({ ...cenarioPlanilha, ano: 2025 }, dadosAtuais);
    expect(r.postos[0].inicioVigencia).toBe('2025-06-24');
  });
});

describe('Grupo B (tarifa monômia)', () => {
  it('B3 Copel: um único posto, mesma mecânica', () => {
    const r = calcular({
      ...cenarioPlanilha, subgrupo: 'B3', modalidadeTarifaria: 'Convencional',
      consumo: { 'Não se aplica': 1000 }, enquadramento: 'GD2',
    }, dadosPlanilha);
    expect(r.postos).toHaveLength(1);
    const p = r.postos[0];
    expect(p.te).toBe(275.75);
    expect(p.tusd).toBe(366.67);
    expect(p.fioBAplicado).toBeCloseTo(159.13630272 * 0.6, 9);
    expect(r.valorAtual).toBeCloseTo((1000 * (275.75 + 366.67)) / (1 - 0.24) / (1 - 0.0295) / 1000, 9);
    expect(r.faturaGeracao).toBeCloseTo(r.valorInjetado - r.desconto, 9);
  });
});

describe('equivalência de distribuidoras', () => {
  it('cai no nome alternativo quando a ANEEL renomeou o agente', () => {
    expect(resolverAgenteAneel('Amazonas Energia', dadosAtuais)).toBe('Âmbar Amazonas');
    expect(resolverAgenteAneel('Roraima Energia', dadosAtuais)).toBe('ÂMBAR ENERGIA RR');
    expect(resolverAgenteAneel('Copel-DIS', dadosAtuais)).toBe('COPEL-DIS');
  });
  it('erro claro quando não há tarifa', () => {
    expect(() => calcular({ ...cenarioPlanilha, subgrupo: 'A1', modalidadeTarifaria: 'Verde' }, dadosAtuais))
      .toThrow(/Sem tarifa ANEEL/);
  });
});
