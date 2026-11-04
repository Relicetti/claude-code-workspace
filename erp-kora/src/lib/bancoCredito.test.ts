import { describe, expect, it } from 'vitest';
import { desistirCredito, editarCredito, fecharCredito, novoCredito, proximoId, reabrirCredito, resumoBanco, totalDe } from './bancoCredito';

const agora = new Date('2026-11-04T12:00:00Z');
const base = { gerador: 'Usina Sol Ltda', intermediador: 'João', volumeKWh: 500000, valorPropostoKWh: 0.3, valorPedidoKWh: 0.38, observacao: '' };

describe('banco de crédito', () => {
  it('numera em sequência', () => {
    expect(proximoId([])).toBe('CRD-001');
    expect(proximoId(['CRD-001', 'CRD-007'])).toBe('CRD-008');
  });

  it('cadastra em negociação e valida os campos', () => {
    const c = novoCredito([], { ...base, gerador: '  Usina Sol Ltda ' }, agora, 'Ana');
    expect(c).toMatchObject({ id: 'CRD-001', gerador: 'Usina Sol Ltda', status: 'negociacao', valorFechadoKWh: null });
    expect(c.historico[0].texto).toContain('500.000 kWh');
    expect(() => novoCredito([], { ...base, gerador: '' }, agora, 'Ana')).toThrow(/gerador/);
    expect(() => novoCredito([], { ...base, volumeKWh: 0 }, agora, 'Ana')).toThrow(/volume/);
    expect(() => novoCredito([], { ...base, valorPedidoKWh: -1 }, agora, 'Ana')).toThrow(/pedido/);
    // Valores vazios ficam em branco (pode cadastrar antes de ter proposta).
    expect(novoCredito([], { ...base, valorPropostoKWh: '' as unknown as null }, agora, 'Ana').valorPropostoKWh).toBeNull();
  });

  it('edita registrando o que mudou', () => {
    const c = novoCredito([], base, agora, 'Ana');
    const e = editarCredito(c, { valorPropostoKWh: 0.32 }, agora, 'Bia');
    expect(e.valorPropostoKWh).toBe(0.32);
    expect(e.historico[e.historico.length - 1]).toMatchObject({ por: 'Bia', texto: 'Alterado: valor proposto.' });
    expect(editarCredito(c, { gerador: 'Usina Sol Ltda' }, agora, 'Bia')).toBe(c);
  });

  it('fecha, corrige, desiste e reabre', () => {
    const c = novoCredito([], base, agora, 'Ana');
    expect(() => fecharCredito(c, '', agora, 'Ana')).toThrow(/valor fechado/);
    const f = fecharCredito(c, 0.34, agora, 'Ana');
    expect(f).toMatchObject({ status: 'fechado', valorFechadoKWh: 0.34, fechadoEm: agora.toISOString() });
    expect(totalDe(f, f.valorFechadoKWh)).toBeCloseTo(170000);
    expect(fecharCredito(f, 0.35, agora, 'Ana').historico.slice(-1)[0].texto).toContain('corrigido');
    expect(() => desistirCredito(f, '', agora, 'Ana')).toThrow();
    const r = reabrirCredito(f, agora, 'Ana');
    expect(r).toMatchObject({ status: 'negociacao', valorFechadoKWh: null, fechadoEm: null });
    expect(desistirCredito(r, 'achou comprador', agora, 'Ana')).toMatchObject({ status: 'desistencia' });
  });

  it('resume o banco', () => {
    const a = fecharCredito(novoCredito([], base, agora, 'Ana'), 0.3, agora, 'Ana');
    const b = fecharCredito(novoCredito([a], { ...base, volumeKWh: 1500000 }, agora, 'Ana'), 0.34, agora, 'Ana');
    const c = novoCredito([a, b], { ...base, volumeKWh: 200000 }, agora, 'Ana');
    const r = resumoBanco([a, b, c]);
    expect(r.negociacaoKWh).toBe(200000);
    expect(r.fechadoKWh).toBe(2000000);
    expect(r.fechadoValor).toBeCloseTo(660000);
    expect(r.fechadoMedioKWh).toBeCloseTo(0.33);
  });
});
