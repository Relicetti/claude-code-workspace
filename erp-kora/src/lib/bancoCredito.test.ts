import { describe, expect, it } from 'vitest';
import {
  desistirCredito, editarCredito, fecharCredito, filtrarItens, normalizarCredito, novoCredito, proximoId, reabrirCredito, resumoBanco,
  resumoPorDistribuidora, totalDe, totalFechado, volumeTotal, type CreditoGerador,
} from './bancoCredito';

const agora = new Date('2026-11-04T12:00:00Z');
const item = { distribuidora: 'Copel-DIS', modalidade: 'GD1' as const, volumeKWh: 500000, valorPropostoKWh: 0.3, valorPedidoKWh: 0.38 };
const base = { gerador: 'Usina Sol Ltda', contato: 'Carlos', formaPagamento: 'compensado' as const, intermediador: 'João', observacao: '', itens: [item] };
const doisItens = { ...base, itens: [item, { ...item, modalidade: 'GD2' as const, volumeKWh: 200000, valorPropostoKWh: 0.25, valorPedidoKWh: 0.3 }] };

describe('banco de crédito', () => {
  it('numera em sequência', () => {
    expect(proximoId([])).toBe('CRD-001');
    expect(proximoId(['CRD-001', 'CRD-007'])).toBe('CRD-008');
  });

  it('cadastra em negociação e valida os campos', () => {
    const c = novoCredito([], { ...base, gerador: '  Usina Sol Ltda ', contato: ' Carlos ' }, agora, 'Ana');
    expect(c).toMatchObject({ id: 'CRD-001', gerador: 'Usina Sol Ltda', contato: 'Carlos', status: 'negociacao' });
    expect(c.itens[0]).toMatchObject({ distribuidora: 'Copel-DIS', modalidade: 'GD1', valorFechadoKWh: null });
    expect(c.historico[0].texto).toContain('Copel-DIS GD I 500.000 kWh');
    expect(() => novoCredito([], { ...base, gerador: '' }, agora, 'Ana')).toThrow(/empresa do gerador/);
    expect(novoCredito([], { ...base, contato: undefined }, agora, 'Ana').contato).toBe('');
    expect(() => novoCredito([], { ...base, itens: [] }, agora, 'Ana')).toThrow(/pelo menos um item/);
    expect(() => novoCredito([], { ...base, itens: [{ ...item, distribuidora: '' }] }, agora, 'Ana')).toThrow(/Item 1: informe a distribuidora/);
    expect(() => novoCredito([], { ...base, itens: [{ ...item, distribuidora: 'Inventada' }] }, agora, 'Ana')).toThrow(/ANEEL/);
    expect(novoCredito([], { ...base, itens: [{ ...item, distribuidora: 'copel-dis' }] }, agora, 'Ana').itens[0].distribuidora).toBe('Copel-DIS');
    expect(() => novoCredito([], { ...base, itens: [item, { ...item, modalidade: '' }] }, agora, 'Ana')).toThrow(/Item 2 \(Copel-DIS\): escolha a modalidade/);
    expect(() => novoCredito([], { ...base, itens: [item, item] }, agora, 'Ana')).toThrow(/Copel-DIS GD I aparece em mais de um item/);
    expect(() => novoCredito([], { ...base, formaPagamento: undefined }, agora, 'Ana')).toThrow(/forma de pagamento/);
    expect(c.historico[0].texto).toContain('pagamento compensado');
    expect(editarCredito(c, { formaPagamento: 'avista' }, agora, 'Bia').historico.slice(-1)[0].texto).toBe('Alterado: forma de pagamento.');
    expect(() => novoCredito([], { ...base, itens: [{ ...item, volumeKWh: 0 }] }, agora, 'Ana')).toThrow(/volume/);
    expect(() => novoCredito([], { ...base, itens: [{ ...item, valorPedidoKWh: -1 }] }, agora, 'Ana')).toThrow(/pedido/);
    // Valores vazios ficam em branco (pode cadastrar antes de ter proposta).
    expect(novoCredito([], { ...base, itens: [{ ...item, valorPropostoKWh: '' as unknown as null }] }, agora, 'Ana').itens[0].valorPropostoKWh).toBeNull();
  });

  it('separa GD I e GD II e várias distribuidoras no mesmo gerador', () => {
    const c = novoCredito([], { ...doisItens, itens: [...doisItens.itens, { ...item, distribuidora: 'Celesc-DIS', volumeKWh: 100000 }] }, agora, 'Ana');
    expect(c.itens.map((i) => `${i.distribuidora} ${i.modalidade}`)).toEqual(['Copel-DIS GD1', 'Copel-DIS GD2', 'Celesc-DIS GD1']);
    expect(volumeTotal(c)).toBe(800000);
  });

  it('edita registrando o que mudou', () => {
    const c = novoCredito([], base, agora, 'Ana');
    const e = editarCredito(c, { itens: [{ ...item, valorPropostoKWh: 0.32 }] }, agora, 'Bia');
    expect(e.itens[0].valorPropostoKWh).toBe(0.32);
    expect(e.historico[e.historico.length - 1]).toMatchObject({ por: 'Bia', texto: 'Alterado: itens (Copel-DIS GD I 500.000 kWh).' });
    expect(editarCredito(c, { gerador: 'Usina Sol Ltda' }, agora, 'Bia')).toBe(c);
    expect(editarCredito(c, { contato: 'Maria' }, agora, 'Bia').historico.slice(-1)[0].texto).toBe('Alterado: contato.');
  });

  it('fecha com valor por item, corrige, desiste e reabre', () => {
    const c = novoCredito([], doisItens, agora, 'Ana');
    expect(() => fecharCredito(c, [0.34], agora, 'Ana')).toThrow(/Copel-DIS GD II/);
    const f = fecharCredito(c, [0.34, 0.28], agora, 'Ana');
    expect(f).toMatchObject({ status: 'fechado', fechadoEm: agora.toISOString() });
    expect(f.itens.map((i) => i.valorFechadoKWh)).toEqual([0.34, 0.28]);
    expect(totalDe(f.itens[0], f.itens[0].valorFechadoKWh)).toBeCloseTo(170000);
    expect(totalFechado(f)).toBeCloseTo(170000 + 56000);
    expect(f.historico.slice(-1)[0].texto).toBe('Negociação fechada: Copel-DIS GD I a R$ 0,3400/kWh; Copel-DIS GD II a R$ 0,2800/kWh.');
    expect(fecharCredito(f, [0.35, 0.28], agora, 'Ana').historico.slice(-1)[0].texto).toContain('corrigido');
    // Lote fechado: edita os dados mantendo o valor fechado, mas não muda a quantidade de itens.
    expect(editarCredito(f, { observacao: 'ok' }, agora, 'Ana').itens[1].valorFechadoKWh).toBe(0.28);
    expect(() => editarCredito(f, { itens: [item] }, agora, 'Ana')).toThrow(/Reabra/);
    expect(() => desistirCredito(f, '', agora, 'Ana')).toThrow();
    const r = reabrirCredito(f, agora, 'Ana');
    expect(r).toMatchObject({ status: 'negociacao', fechadoEm: null });
    expect(r.itens.every((i) => i.valorFechadoKWh === null)).toBe(true);
    expect(desistirCredito(r, 'achou comprador', agora, 'Ana')).toMatchObject({ status: 'desistencia' });
  });

  it('converte lote antigo (sem itens) num item sem modalidade', () => {
    const antigo = {
      id: 'CRD-001', gerador: 'Usina Velha', distribuidora: 'Copel-DIS', intermediador: '', formaPagamento: 'avista', volumeKWh: 300000,
      valorPropostoKWh: 0.3, valorPedidoKWh: 0.4, valorFechadoKWh: 0.33, status: 'fechado', observacao: '',
      criadoEm: agora.toISOString(), atualizadoEm: agora.toISOString(), fechadoEm: agora.toISOString(), historico: [],
    } as unknown as CreditoGerador;
    const n = normalizarCredito(antigo);
    expect(n).toMatchObject({ contato: '', itens: [{ distribuidora: 'Copel-DIS', modalidade: '', volumeKWh: 300000, valorFechadoKWh: 0.33 }] });
    expect(n).not.toHaveProperty('volumeKWh');
    expect(normalizarCredito(n)).toEqual(n);
    // Na próxima edição pede a modalidade.
    expect(() => editarCredito(antigo, { observacao: 'x' }, agora, 'Ana')).toThrow(/modalidade/);
    const ok = editarCredito(antigo, { itens: [{ ...n.itens[0], modalidade: 'GD1' }] }, agora, 'Ana');
    expect(ok.itens[0]).toMatchObject({ modalidade: 'GD1', valorFechadoKWh: 0.33 });
    expect(resumoPorDistribuidora([n])[0]).toMatchObject({ distribuidora: 'Copel-DIS', modalidade: 'Sem modalidade', fechadoKWh: 300000 });
  });

  it('resume o banco', () => {
    const a = fecharCredito(novoCredito([], base, agora, 'Ana'), [0.3], agora, 'Ana');
    const b = fecharCredito(novoCredito([a], { ...base, itens: [{ ...item, volumeKWh: 1500000 }] }, agora, 'Ana'), [0.34], agora, 'Ana');
    const c = novoCredito([a, b], { ...base, itens: [{ ...item, volumeKWh: 200000 }] }, agora, 'Ana');
    const r = resumoBanco([a, b, c]);
    expect(r.negociacaoKWh).toBe(200000);
    expect(r.fechadoKWh).toBe(2000000);
    expect(r.fechadoValor).toBeCloseTo(660000);
    expect(r.fechadoMedioKWh).toBeCloseTo(0.33);
  });

  it('resume por distribuidora e modalidade', () => {
    const a = fecharCredito(novoCredito([], doisItens, agora, 'Ana'), [0.3, 0.25], agora, 'Ana');
    const b = novoCredito([a], { ...base, itens: [{ ...item, distribuidora: 'Celesc-DIS', volumeKWh: 200000 }] }, agora, 'Ana');
    const c = novoCredito([a, b], { ...base, itens: [{ ...item, volumeKWh: 100000 }] }, agora, 'Ana');
    const r = resumoPorDistribuidora([a, b, c]);
    expect(r.map((x) => `${x.distribuidora} ${x.modalidade}`)).toEqual(['Celesc-DIS GD I', 'Copel-DIS GD I', 'Copel-DIS GD II']);
    expect(r[0]).toMatchObject({ lotes: 1, negociacaoKWh: 200000, fechadoKWh: 0, fechadoMedioKWh: null });
    expect(r[1]).toMatchObject({ lotes: 2, negociacaoKWh: 100000, fechadoKWh: 500000 });
    expect(r[1].fechadoValor).toBeCloseTo(150000);
    expect(r[2]).toMatchObject({ lotes: 1, fechadoKWh: 200000 });
    expect(r[2].fechadoMedioKWh).toBeCloseTo(0.25);
    // Filtro por modalidade deixa no lote só os itens que batem.
    const soGD2 = filtrarItens([a, b, c], '', 'GD2');
    expect(soGD2.map((x) => x.id)).toEqual(['CRD-001']);
    expect(soGD2[0].itens).toHaveLength(1);
  });
});
