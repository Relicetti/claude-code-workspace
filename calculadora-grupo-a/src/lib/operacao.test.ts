import { describe, expect, it } from 'vitest';
import { calcular, IMPOSTOS_PADRAO } from './engine';
import { prazoPeloConsumo, simularOperacao } from './operacao';
import tarifasData from '../data/tarifas.json';
import type { DadosTarifarios, Entrada } from '../types';

// Mesmo recorte do engine.test: tarifas da planilha, sem o reajuste Copel de 24/06/2026, para
// os anos seguintes usarem a mesma tarifa e só a rampa/reajuste mudarem.
const todos = tarifasData as DadosTarifarios;
const dados: DadosTarifarios = {
  ...todos,
  tarifas: todos.tarifas.filter((t) => t.inicio < '2026-06-24'),
  fioB: todos.fioB.filter((f) => f.inicio < '2026-06-24'),
};

const entrada: Entrada = {
  distribuidora: 'Copel-DIS', ano: 2026, subgrupo: 'A4', modalidadeTarifaria: 'Verde',
  consumo: { Ponta: 30, 'Fora ponta': 1500 },
  ...IMPOSTOS_PADRAO,
  enquadramento: 'GD1', modalidadeGD: 'Geração Compartilhada', fonte: 'Solar',
  descontoPct: 0.1, desagioPct: 0.1,
};

describe('operação de crédito abatido mês a mês', () => {
  it('abatimento igual ao consumo: cada mês repete o cálculo da planilha', () => {
    const op = simularOperacao(entrada, dados, { creditoTotalKWh: 15300, prazoMeses: 10, mesInicio: '2026-01', reajusteAnualPct: 0 });
    expect(op.abatimentoMensalKWh).toBe(1530);
    expect(op.meses).toHaveLength(10);
    expect(op.meses[0].desconto).toBeCloseTo(83.56890100056944, 9);
    expect(op.meses[0].faturaGeracao).toBeCloseTo(532.8185989994305, 9);
    expect(op.meses[0].valorGerador).toBeCloseTo(479.5367390994874, 9);
    expect(op.meses[0].valorKora).toBeCloseTo(53.28185989994305, 9);
    expect(op.meses[9].saldoFinalKWh).toBe(0);
    expect(op.anos).toHaveLength(1);
    expect(op.total.kWh).toBeCloseTo(15300, 9);
    expect(op.total.valorGerador).toBeCloseTo(479.5367390994874 * 10, 6);
  });

  it('abatimento menor que o consumo: valores proporcionais ao kWh abatido', () => {
    const op = simularOperacao(entrada, dados, { creditoTotalKWh: 7650, prazoMeses: 10, mesInicio: '2026-01', reajusteAnualPct: 0 });
    expect(op.meses[0].kWh).toBe(765);
    expect(op.meses[0].valorGerador).toBeCloseTo(479.5367390994874 / 2, 9);
  });

  it('quebra por ano civil e aplica rampa do Fio B do ano (GD2)', () => {
    const gd2 = { ...entrada, enquadramento: 'GD2' as const };
    const op = simularOperacao(gd2, dados, { creditoTotalKWh: 1530 * 12, prazoMeses: 12, mesInicio: '2026-07', reajusteAnualPct: 0 });
    expect(op.anos.map((a) => [a.ano, a.meses])).toEqual([[2026, 6], [2027, 6]]);
    expect(op.meses[0].valorGerador).toBeCloseTo(calcular({ ...gd2, ano: 2026 }, dados).valorGerador, 9);
    expect(op.meses[6].valorGerador).toBeCloseTo(calcular({ ...gd2, ano: 2027 }, dados).valorGerador, 9);
    expect(op.meses[6].valorGerador).toBeLessThan(op.meses[0].valorGerador); // rampa 60% → 75%
    expect(op.total.valorGerador).toBeCloseTo(op.anos[0].valorGerador + op.anos[1].valorGerador, 9);
  });

  it('reajuste anual composto a partir do 2º ano', () => {
    const op = simularOperacao(entrada, dados, { creditoTotalKWh: 1530 * 24, prazoMeses: 24, mesInicio: '2026-01', reajusteAnualPct: 0.1 });
    expect(op.meses[12].faturaGeracao).toBeCloseTo(op.meses[0].faturaGeracao * 1.1, 9);
    expect(op.meses[12].desconto).toBeCloseTo(op.meses[0].desconto * 1.1, 9);
  });

  it('valor do dono do crédito fixado não reajusta — a Kora absorve', () => {
    const op = simularOperacao({ ...entrada, precoGeradorKWh: 0.3 }, dados,
      { creditoTotalKWh: 1530 * 24, prazoMeses: 24, mesInicio: '2026-01', reajusteAnualPct: 0.1 });
    expect(op.meses[0].valorGerador).toBeCloseTo(459, 9);
    expect(op.meses[12].valorGerador).toBeCloseTo(459, 9);
    expect(op.meses[12].valorKora).toBeCloseTo(op.meses[12].faturaGeracao - 459, 9);
  });

  it('comissão em % acompanha a fatura de geração reajustada', () => {
    const op = simularOperacao({ ...entrada, vendedorPct: 0.03 }, dados,
      { creditoTotalKWh: 1530 * 24, prazoMeses: 24, mesInicio: '2026-01', reajusteAnualPct: 0.1 });
    expect(op.meses[0].valorVendedor).toBeCloseTo(op.meses[0].faturaGeracao * 0.03, 9);
    expect(op.meses[12].valorVendedor).toBeCloseTo(op.meses[0].valorVendedor * 1.1, 9);
    expect(op.meses[12].valorKora).toBeCloseTo(op.meses[12].faturaGeracao - op.meses[12].valorGerador - op.meses[12].valorVendedor, 9);
  });

  it('não deixa abater mais do que o cliente consome', () => {
    expect(() => simularOperacao(entrada, dados, { creditoTotalKWh: 100000, prazoMeses: 12, mesInicio: '2026-01', reajusteAnualPct: 0 }))
      .toThrow(/Prazo mínimo: 66 meses/);
    expect(prazoPeloConsumo(100000, 1530)).toBe(66);
  });
});
