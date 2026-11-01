import { describe, expect, it } from 'vitest';
import {
  aplicarCobranca, baixarFatura, cancelarFatura, emitirFatura, emitirQuitacao, lancar, precoVigente, proximoNumeroFatura, reajustar, removerLancamento,
  resumoControle, type LancamentoMensal,
} from './controle';
import { clientePronto } from './fixtures';
import type { Cliente } from './clientes';

const agora = new Date('2027-03-15T12:00:00Z');
const l = (mes: string, kwh: number, extra: Partial<LancamentoMensal> = {}): LancamentoMensal => ({
  id: `${mes}-${kwh}`, mes, uc: '000677708603158', compensadoKWh: kwh, saldoDebitadoKWh: kwh, saldoFaturaKWh: null,
  vencimento: `${mes}-20`, valorDistribuidora: null, faturaDistribuidoraId: null, observacao: '', criadoEm: agora.toISOString(), criadoPor: 'Ana', ...extra,
});

/** Cliente com base da proposta: 172.356 kWh em 12 meses a partir de 2026-12, R$ 0,60/kWh. */
function cliente(): Cliente {
  const c = clientePronto();
  const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i === 0 ? '2026-12' : `2027-${String(i).padStart(2, '0')}`, kWh: 14363, compensadoKWh: 14363 }));
  return { ...c, lancamentos: [], faturas: [], base: { ...c.base!, op: { ...c.base!.op, meses } } as never };
}

describe('controle de compensação', () => {
  it('lança por UC e mês, substitui na correção e recusa UC de fora', () => {
    let c = lancar(cliente(), l('2026-12', 10000));
    c = lancar(c, l('2026-12', 12000));
    expect(c.lancamentos).toHaveLength(1);
    expect(c.lancamentos[0].compensadoKWh).toBe(12000);
    expect(c.historico.slice(-1)[0].texto).toContain('Corrigiu');
    expect(() => lancar(c, l('2027-01', 1, { uc: '999' }))).toThrow(/não é deste cliente/);
    expect(() => lancar(c, l('2027-01', 1, { vencimento: '' }))).toThrow(/vencimento/);
  });

  it('fatura = kWh compensados × preço vigente, vence com a distribuidora, e trava o mês', () => {
    let c = lancar(cliente(), l('2026-12', 14000));
    c = emitirFatura(c, '2026-12', 'FK-2027-0001', agora, 'Ana');
    const f = c.faturas[0];
    expect(f).toMatchObject({ numero: 'FK-2027-0001', mes: '2026-12', vencimento: '2026-12-20', total: 8400, status: 'emitida' });
    expect(f.itens).toEqual([{ uc: '000677708603158', compensadoKWh: 14000, precoKWh: 0.6, valor: 8400 }]);
    expect(() => lancar(c, l('2026-12', 1))).toThrow(/já tem fatura/);
    expect(() => removerLancamento(c, c.lancamentos[0].id, agora, 'Ana')).toThrow(/já tem fatura/);
    expect(() => emitirFatura(c, '2026-12', 'FK-2027-0002', agora, 'Ana')).toThrow(/já tem fatura/);
    // Cancelada libera o mês.
    c = cancelarFatura(c, 'FK-2027-0001', 'kWh errado', agora, 'Ana');
    expect(() => lancar(c, l('2026-12', 13000))).not.toThrow();
  });

  it('exige todas as UCs lançadas antes de faturar', () => {
    const base = cliente();
    const c = { ...base, ucs: [...base.ucs, { ...base.ucs[0], numero: '999' }] };
    expect(() => emitirFatura(lancar(c, l('2026-12', 100)), '2026-12', 'FK-2027-0001', agora, 'Ana')).toThrow(/Falta lançar .* 999/);
  });

  it('reajuste vale a partir do mês indicado', () => {
    const c = reajustar(cliente(), { aPartirDe: '2027-12', precoKWh: 0.65, motivo: 'RTA Copel' }, agora, 'Ana');
    expect(precoVigente(c, '2027-11')).toBe(0.6);
    expect(precoVigente(c, '2027-12')).toBe(0.65);
    expect(precoVigente(c, '2028-03')).toBe(0.65);
  });

  it('baixa de pagamento e totais em aberto/vencido', () => {
    let c = lancar(cliente(), l('2026-12', 10000));
    c = lancar(c, l('2027-01', 10000));
    c = emitirFatura(c, '2026-12', 'FK-2027-0001', agora, 'Ana');
    c = emitirFatura(c, '2027-01', 'FK-2027-0002', agora, 'Ana');
    c = baixarFatura(c, 'FK-2027-0001', '2026-12-19', 6000, agora, 'Ana');
    expect(() => baixarFatura(c, 'FK-2027-0001', '2026-12-19', 6000, agora, 'Ana')).toThrow(/paga/);
    const r = resumoControle(c, agora);
    expect(r).toMatchObject({ faturado: 12000, recebido: 6000, emAberto: 6000, vencido: 6000 });
  });

  it('saldo, prazo e projeção', () => {
    let c = cliente();
    for (const m of ['2026-12', '2027-01', '2027-02']) c = lancar(c, l(m, 10000));
    const r = resumoControle(c, agora);
    expect(r.saldoKWh).toBe(172356 - 30000);
    expect(r.fimPrazo).toBe('2027-11'); // 12 meses a partir de 2026-12
    expect(r.mesesRestantes).toBe(8);   // de mar/2027 até nov/2027
    expect(r.mediaMensalKWh).toBe(10000);
    // 9 meses depois de fev/2027 a 10.000 = 90.000; sobram 52.356
    expect(r.sobraProjetadaKWh).toBe(52356);
    const dez = r.linhas.find((x) => x.mes === '2026-12')!;
    expect(dez).toMatchObject({ previstoKWh: 14363, compensadoKWh: 10000, saldoFinalKWh: 162356, valor: 6000 });
  });

  it('quitação do saldo remanescente', () => {
    let c = lancar(cliente(), l('2026-12', 172000));
    c = emitirQuitacao(c, 'FK-2027-0009', '2027-03-25', agora, 'Ana', 'fim do prazo');
    const f = c.faturas[0];
    expect(f).toMatchObject({ quitacaoSaldo: true, total: 213.6 });
    expect(f.itens[0].compensadoKWh).toBe(356);
    expect(() => emitirQuitacao(c, 'FK-2027-0010', '2027-03-25', agora, 'Ana', '')).toThrow(/Já existe/);
  });

  it('numera FK-AAAA-NNNN por ano', () => {
    expect(proximoNumeroFatura([], 2027)).toBe('FK-2027-0001');
    expect(proximoNumeroFatura(['FK-2027-0003', 'FK-2026-0040'], 2027)).toBe('FK-2027-0004');
  });

  it('boleto do Asaas: guarda a cobrança, baixa sozinha quando pago e volta se estornado', () => {
    let c = emitirFatura(lancar(cliente(), l('2026-12', 10000)), '2026-12', 'FK-2027-0001', agora, 'Ana');
    const cob = { asaasId: 'pay_1', status: 'PENDING', vencimento: '2026-12-20', valor: 6000, linhaDigitavel: '123', pixCopiaCola: 'pix',
      pixQrBase64: '', boletoUrl: 'u', faturaUrl: 'f', sandbox: true, criadaEm: agora.toISOString(), atualizadaEm: agora.toISOString() };
    c = aplicarCobranca(c, 'FK-2027-0001', cob, { data: null, valor: null }, agora, 'Ana');
    expect(c.faturas[0]).toMatchObject({ status: 'emitida', cobranca: { asaasId: 'pay_1', status: 'PENDING' } });
    // Mesma informação de novo não mexe em nada.
    expect(aplicarCobranca(c, 'FK-2027-0001', cob, { data: null, valor: null }, agora, 'Ana')).toBe(c);
    c = aplicarCobranca(c, 'FK-2027-0001', { ...cob, status: 'RECEIVED' }, { data: '2026-12-19', valor: 6000 }, agora, 'Asaas');
    expect(c.faturas[0]).toMatchObject({ status: 'paga', pagaEm: '2026-12-19', valorPago: 6000 });
    expect(c.historico.slice(-1)[0].texto).toContain('Baixa automática');
    c = aplicarCobranca(c, 'FK-2027-0001', { ...cob, status: 'REFUNDED' }, { data: null, valor: null }, agora, 'Asaas');
    expect(c.faturas[0]).toMatchObject({ status: 'emitida', pagaEm: null });
  });
});
