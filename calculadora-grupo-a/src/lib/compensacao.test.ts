import { describe, expect, it } from 'vitest';
import { compensar, fatorConversao } from './compensacao';
import { calcular, IMPOSTOS_PADRAO } from './engine';
import tarifasData from '../data/tarifas.json';
import type { DadosTarifarios, Entrada } from '../types';

// Casos do memorial "Conversão de créditos GD entre postos tarifários": UC 6/3663173-7, Energisa MT,
// A3a Verde, GD I, REH 3.440/2025.
const te2025 = { Ponta: 479.66, 'Fora ponta': 284.62 };

describe('conversão de crédito entre postos (memorial)', () => {
  it('fator EMT A3a Verde 2025 = 1,68526', () => {
    expect(fatorConversao(te2025, 'Fora ponta', 'Ponta')).toBeCloseTo(1.68526, 5);
    expect(fatorConversao(te2025, 'Ponta', 'Ponta')).toBe(1);
  });

  it('caso 1 — Out/25: saldo FP 902.712 → 806.962 impresso (Δ < 1 kWh)', () => {
    const c = compensar({ Ponta: 2767.80, 'Fora ponta': 91084.88 }, { 'Fora ponta': 902712 }, te2025);
    expect(c.compensado['Fora ponta']).toBeCloseTo(91084.88, 6);
    expect(c.compensado.Ponta).toBeCloseTo(2767.80, 6);
    expect(c.saldoFinal['Fora ponta']).toBeCloseTo(806962.65, 0);
    expect(Math.abs(c.saldoFinal['Fora ponta']! - 806962)).toBeLessThan(1);
  });

  it('casos negativos: sem fator ou com TUSD+TE não fecham o saldo', () => {
    const semFator = compensar({ Ponta: 2767.80, 'Fora ponta': 91084.88 }, { 'Fora ponta': 902712 }, { Ponta: 1, 'Fora ponta': 1 });
    expect(Math.abs(semFator.saldoFinal['Fora ponta']! - 806962)).toBeGreaterThan(1000);
  });

  it('saldo curto: fora ponta primeiro, ponta com o que sobra', () => {
    const c = compensar({ Ponta: 100, 'Fora ponta': 1000 }, { 'Fora ponta': 1100 }, te2025);
    expect(c.compensado['Fora ponta']).toBe(1000);
    expect(c.compensado.Ponta).toBeCloseTo(100 / (479.66 / 284.62), 9);
    expect(c.saldoFinal['Fora ponta']).toBeCloseTo(0, 9);
  });

  it('engine usa a TE de aplicação da ANEEL: 2025 → 1,68526; 2026 (RTA) → 1,71975', () => {
    const e: Entrada = {
      distribuidora: 'Energisa MT', ano: 2025, subgrupo: 'A3a', modalidadeTarifaria: 'Verde',
      consumo: { Ponta: 2767.80, 'Fora ponta': 91084.88 }, ...IMPOSTOS_PADRAO,
      enquadramento: 'GD1', modalidadeGD: 'Geração Compartilhada', fonte: 'Solar', descontoPct: 0.1, desagioPct: 0.1,
    };
    const dados = tarifasData as DadosTarifarios;
    const r25 = calcular(e, dados);
    expect(r25.fatorPonta).toBeCloseTo(1.68526, 5);
    expect(r25.saldoDebitadoKWh).toBeCloseTo(902712 - 806962.65, 0);
    expect(calcular({ ...e, ano: 2026 }, dados).fatorPonta).toBeCloseTo(1.71975, 5);
    // desligado: fator 1
    const off = calcular({ ...e, converterPostos: false }, dados);
    expect(off.fatorPonta).toBe(1);
    expect(off.saldoDebitadoKWh).toBeCloseTo(2767.80 + 91084.88, 6);
  });
});
