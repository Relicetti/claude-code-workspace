import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lerFaturaCopel, mesmaUC } from './faturaCopel';

// Texto no formato que server/lerPdf.ts produz, com dados fictícios (layout da DANF3E da Copel, Grupo B com SCEE).
const EXEMPLO = `DANF3E - DOCUMENTO AUXILIAR DA
Copel Distribuição S.A.
B3 Comercial, Servicos, Outras Atividades / Comercio | Trifasico /50A
14/05/2025 | 12/06/2025 | 29 | 14/07/2025
06/2025 | 10/07/2025 | R$208,38
ENERGIA ELET CONSUMO | kWh | 608 | 0,379539 | 230,76 | 10,49 | 43,84 | 0,290190 | PIS | 89,77
ENERGIA ELET USO SISTEMA | kWh | 608 | 0,444457 | 270,23 | 12,28 | 51,34 | 0,339820
ENERGIA INJ. OUC MPT TE 05/2025 GDI-I | kWh | -3 | 0,290000 | -0,87 | 0,00 | 0,00 | 0,290190
ENERGIA INJ. OUC MPT TUSD 05/2025 GDI-I | kWh | -3 | 0,336667 | -1,01 | 0,00 | 0,00 | 0,339820
ENERGIA INJ. OUC MPT TE 05/2025 GDI-I | kWh | -459 | 0,290174 | -133,19 | 0,00 | 0,00 | 0,290190
ENERGIA INJ. OUC MPT TUSD 05/2025 GDI-I | kWh | -459 | 0,339804 | -155,97 | 0,00 | 0,00 | 0,339820 | HISTÓRICO DE CONSUMO / kWh
ENERGIA INJ. OUC MPT TE 05/2025 GDI-I | Segunda Via | kWh | -46 | 0,290000 | -13,34 | 0,00 | 0,00 | 0,290190
ENERGIA INJ. OUC MPT TUSD 05/2025 GDI-I | kWh | -46 | 0,339783 | -15,63 | 0,00 | 0,00 | 0,339820
ENERGIA INJ. BAND. AMARELA TE | kWh | -297,79 | 0,018839 | -5,61 | 0,00 | 0,00 | 0,018850 | MAR25 | 1814 | 31
ENERGIA INJ. BAND. VERMELHA TE P1 | kWh | -210,21 | 0,044623 | -9,38 | 0,00 | 0,00 | 0,044630 | FEV25 | 1927 | 32
Demonstrativo de saldos SCEE desta Unidade Consumidora. Saldo Mês Ponta 0, Saldo Mês F Ponta 1743, Saldo
Acumulado Ponta 0, Saldo Acumulado F Ponta 2633, Saldo a Expirar Próximo Mês Ponta 0, Saldo a Expirar Próximo
Mês F Ponta 120.
99999999 | 06/2025 | 10/07/2025 | R$208,38`.split('\n');

describe('fatura Copel', () => {
  it('lê UC, referência, vencimento, total, compensação e saldos', () => {
    const f = lerFaturaCopel(EXEMPLO);
    expect(f).toMatchObject({
      uc: '99999999', mes: '2025-06', vencimento: '2025-07-10', total: 208.38, leituraAnterior: '2025-05-14', leituraAtual: '2025-06-12',
      consumoKWh: 608, compensadoKWh: 508, compensadoForaPontaKWh: 508, compensadoPontaKWh: 0,
      saldoAcumuladoKWh: 2633, saldoExpirarKWh: 120, classificacao: 'B3 Comercial, Servicos, Outras Atividades / Comercio', ligacao: 'Trifasico /50A',
    });
    expect(f.linhasCompensacao).toHaveLength(3);
    expect(f.avisos).toEqual(['Atenção: 120 kWh de saldo expiram no próximo mês.']);
  });

  it('recusa fatura de outra distribuidora', () => {
    expect(() => lerFaturaCopel(['Celesc Distribuição S.A.'])).toThrow(/Copel/);
  });

  it('fatura sem compensação avisa e dá zero', () => {
    const f = lerFaturaCopel(EXEMPLO.filter((l) => !l.startsWith('ENERGIA INJ')));
    expect(f.compensadoKWh).toBe(0);
    expect(f.avisos[0]).toMatch(/Nenhuma linha/);
  });

  it('UC com e sem zeros à esquerda', () => {
    expect(mesmaUC('000677708603158', '677708603158')).toBe(true);
    expect(mesmaUC('61230243', '61230244')).toBe(false);
  });

  // Faturas reais ficam em amostras/ (fora do git). Sem elas, pula.
  const real = path.join(__dirname, '..', '..', 'amostras', 'copel-b3.pdf');
  it.skipIf(!fs.existsSync(real))('lê a fatura real de exemplo (amostras/copel-b3.pdf)', async () => {
    const { linhasDoPdf } = await import('../../server/lerPdf');
    const f = lerFaturaCopel(await linhasDoPdf(fs.readFileSync(real)));
    expect(f).toMatchObject({ uc: '61230243', mes: '2025-06', vencimento: '2025-07-10', total: 208.38, compensadoKWh: 508, saldoAcumuladoKWh: 2633, consumoKWh: 608 });
  });
});
