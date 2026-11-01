// Renderiza as telas novas no servidor para pegar erro de execução (não substitui olhar no navegador).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FaturaKora } from './FaturaKora';
import { CompensacaoBloco } from './CompensacaoView';
import { clientePronto } from './lib/fixtures';
import { emitirFatura, lancar } from './lib/controle';

const agora = new Date('2027-01-20T12:00:00Z');
function cliente() {
  let c = { ...clientePronto(), lancamentos: [], faturas: [], status: 'compensacao' as const };
  c = lancar(c, { id: 'a', mes: '2026-12', uc: '000677708603158', compensadoKWh: 14000, saldoDebitadoKWh: 14000, saldoFaturaKWh: null,
    vencimento: '2027-01-15', valorDistribuidora: 300, faturaDistribuidoraId: null, observacao: '', criadoEm: agora.toISOString(), criadoPor: 'Ana' });
  return emitirFatura(c, '2026-12', 'FK-2027-0001', agora, 'Ana');
}

describe('telas', () => {
  it('fatura Kora', () => {
    const c = cliente();
    const html = renderToStaticMarkup(<FaturaKora f={c.faturas[0]} c={c} saldoAposKWh={158356} />);
    expect(html).toContain('FK-2027-0001');
    expect(html).toContain('8.400,00');
    expect(html).toContain('UC 000677708603158');
    expect(html).toContain('158.356 kWh');
  });
  it('bloco de compensação', () => {
    const html = renderToStaticMarkup(<CompensacaoBloco c={cliente()} ocupado={null} executar={() => {}} docUrl={() => ''} />);
    expect(html).toContain('Compensação e faturas');
    expect(html).toContain('FK-2027-0001');
  });
});
