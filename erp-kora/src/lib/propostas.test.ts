import { describe, expect, it } from 'vitest';
import { apagar, doVendedor, identificacao, SEM_VENDEDOR, vendedores, proximoNumero, registrarRevisao, type NovaRevisao, type Proposta } from './propostas';

const nova = (cliente: string) => ({
  entrada: {}, operacao: { creditoTotalKWh: 1000 }, dados: { cliente },
  r: { economiaClientePct: 0.1, tarifaMediaGeracao: 0.5 }, op: { meses: [{}, {}], total: { faturaGeracao: 900, desconto: 100 } },
}) as unknown as NovaRevisao;

describe('propostas', () => {
  it('numera em sequência dentro do ano e recomeça no ano seguinte', () => {
    expect(proximoNumero([], 2026)).toBe('KORA-2026-001');
    expect(proximoNumero(['KORA-2026-001', 'KORA-2026-009', 'KORA-2025-040'], 2026)).toBe('KORA-2026-010');
    expect(proximoNumero(['KORA-2026-010'], 2027)).toBe('KORA-2027-001');
  });

  it('cria na Rev. 00 e sobe a revisão ao editar', () => {
    const a = registrarRevisao([], nova('Hotel'), new Date('2026-10-26T12:00:00Z'));
    expect(a.proposta.numero).toBe('KORA-2026-001');
    expect(a.proposta.revisoes[0].revisao).toBe(0);
    expect(a.proposta.revisoes[0].resumo).toMatchObject({ creditoKWh: 1000, meses: 2, valorContrato: 900 });

    const b = registrarRevisao(a.lista, nova('Hotel Ltda'), new Date('2026-10-27T12:00:00Z'), 'KORA-2026-001');
    expect(b.lista).toHaveLength(1);
    expect(b.proposta.revisoes.map((r) => r.revisao)).toEqual([0, 1]);
    expect(b.proposta.cliente).toBe('Hotel Ltda');
    expect(identificacao(b.proposta.numero, 1)).toBe('KORA-2026-001 · Rev. 01');
  });

  it('apaga a proposta inteira ou só uma revisão', () => {
    const a = registrarRevisao([], nova('A'), new Date('2026-10-26T12:00:00Z'));
    const b = registrarRevisao(a.lista, nova('B'), new Date('2026-10-26T13:00:00Z'));
    const c = registrarRevisao(b.lista, nova('A2'), new Date('2026-10-27T12:00:00Z'), 'KORA-2026-001');

    expect(apagar(c.lista, 'KORA-2026-002').map((p) => p.numero)).toEqual(['KORA-2026-001']);
    const semRev1 = apagar(c.lista, 'KORA-2026-001', 1);
    expect(semRev1[0].revisoes.map((r) => r.revisao)).toEqual([0]);
    expect(semRev1[0].cliente).toBe('A');
    // A única revisão leva a proposta junto.
    expect(apagar(semRev1, 'KORA-2026-001', 0).map((p) => p.numero)).toEqual(['KORA-2026-002']);
    expect(() => apagar(c.lista, 'KORA-2026-009')).toThrow();
    expect(() => apagar(c.lista, 'KORA-2026-001', 7)).toThrow();
  });

  it('recusa revisão de proposta inexistente', () => {
    expect(() => registrarRevisao([] as Proposta[], nova('X'), new Date(), 'KORA-2026-999')).toThrow();
  });
});

describe('vendedor da proposta', () => {
  const comVendedor = (numero: string, vendedor?: string) =>
    ({ numero, cliente: 'X', revisoes: [{ revisao: 0, dados: { vendedor } }] }) as unknown as Proposta;
  const lista = [comVendedor('A', 'João'), comVendedor('B', 'joao '), comVendedor('C', 'Ana'), comVendedor('D'), comVendedor('E', '  ')];

  it('lista vendedores distintos, sem repetir por acento/maiúscula', () => {
    expect(vendedores(lista)).toEqual(['Ana', 'João']);
  });
  it('filtra por vendedor, sem vendedor e todos', () => {
    expect(lista.filter((p) => doVendedor(p, 'João')).map((p) => p.numero)).toEqual(['A', 'B']);
    expect(lista.filter((p) => doVendedor(p, SEM_VENDEDOR)).map((p) => p.numero)).toEqual(['D', 'E']);
    expect(lista.filter((p) => doVendedor(p, '')).length).toBe(5);
  });
});
