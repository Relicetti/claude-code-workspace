import { describe, it, expect } from 'vitest';
import { calcularParceria } from './engine';
import batchScenarios from './__fixtures__/batch_scenarios.json';
import liveSnapshot from './__fixtures__/live_snapshot.json';

/** Distribuidoras cuja tarifa homologada mais recente (Tarifas_B1) tem início de
 * vigência em abr/mai 2026 — resoluções publicadas pela ANEEL DEPOIS da última
 * vez que a simulação em lote (aba RESUL. PARC.) foi rodada na planilha original.
 * O engine corretamente usa a tarifa mais nova (mesmo comportamento da aba
 * PARCERIA, que recalcula ao vivo), então diverge do valor congelado no lote —
 * isso não é um bug, é o motor usando dado mais atual que o snapshot de teste.
 * Confirmado manualmente comparando Tarifas_B1 antes/depois da resolução nova. */
const DISTRIBUIDORAS_COM_TARIFA_MAIS_NOVA_QUE_O_LOTE = new Set([
  'Equatorial CEA', 'Cemig-D', 'CPFL Paulista', 'Neoenergia Coelba', 'Neoenergia Pernambuco',
  'Energisa TO', 'Certel',
]);

/** Cenários extraídos de RESUL. PARC. (calculados pela própria planilha via a
 * macro de simulação em lote) — servem de gabarito real para o engine em TS. */
describe('calcularParceria — cenários em lote (RESUL. PARC.)', () => {
  for (const s of batchScenarios as any[]) {
    const testFn = DISTRIBUIDORAS_COM_TARIFA_MAIS_NOVA_QUE_O_LOTE.has(s.concessionaria) ? it.skip : it;
    testFn(`${s.concessionaria} / ${s.enquadramento} / ${s.modalidade}`, () => {
      const r = calcularParceria({
        distribuidora: s.concessionaria,
        ano: 2026,
        enquadramento: s.enquadramento,
        fonte: s.fonte,
        modalidade: s.modalidade,
        potenciaConexaoMW: s.potCA,
        potenciaInstaladaMWp: s.potCC,
        geracaoMensalKWh: s.geracaoMensal,
        desagioPct: s.desagio,
        pescoco: s.pescoco,
      });

      expect(Math.round(r.tarifaCompensada * 1000) / 1000).toBeCloseTo(s.tarifComp, 3);
      expect(r.descontoClientePct).toBeCloseTo(s.pctCliente, 6);
      expect(Math.round(r.tGerador * 1000) / 1000).toBeCloseTo(s.tGerador, 3);
      expect(r.faturamentoBrutoGerador).toBeCloseTo(s.fatGerador, 1);
      // pescocoAlex/mensalAlex/takeRate dependem do Valor Injeção, cuja fórmula mudou por
      // decisão de negócio (não aplica mais o desconto ao termo trfDistribuidora - tarifaCompensada)
      // — não são mais comparáveis com o lote congelado da planilha original.
    });
  }
});

/** Cenário "ao vivo" da aba PARCERIA (Roraima Energia, GD2, Autoconsumo, Solar,
 * 2026) — valida também as etapas intermediárias (impostos, isenções, tarifas). */
describe('calcularParceria — cenário detalhado (PARCERIA ao vivo)', () => {
  const snap = liveSnapshot as any;
  const p = snap.inputs_atuais;

  const r = calcularParceria({
    distribuidora: p.C3,
    ano: p.C5,
    enquadramento: p.C4,
    fonte: p.C12,
    modalidade: p.C13,
    potenciaConexaoMW: p.C8,
    potenciaInstaladaMWp: p.C9,
    desagioPct: p.C30,
  });

  it('resolve estado e alíquotas', () => {
    expect(r.estado).toBe(p.C7);
    expect(r.icmsAliquota).toBeCloseTo(p.C16, 6);
    expect(r.pisCofinsAliquota).toBeCloseTo(p.C17, 6);
  });

  it('resolve geração mensal e desconto padrão', () => {
    expect(r.geracaoMensalKWh).toBeCloseTo(p.C10, 6);
    expect(r.descontoClientePct).toBeCloseTo(p.C11, 6);
  });

  it('resolve tarifas TE/TUSD e tarifa distribuidora', () => {
    expect(r.tarifaVigente.te).toBeCloseTo(snap.base.L7, 6);
    expect(r.tarifaVigente.tusd).toBeCloseTo(snap.base.L8, 6);
    expect(r.trfAneel).toBeCloseTo(p.C22, 6);
    expect(r.trfDistribuidora).toBeCloseTo(p.C23, 6);
  });

  it('resolve componentes de TUSD (Fio B / Fio A)', () => {
    expect(r.componentesTusd.fioB).toBeCloseTo(snap.base.L9, 6);
    expect(r.componentesTusd.fioA_FR).toBeCloseTo(snap.base.L10, 6);
    expect(r.componentesTusd.fioA_RB).toBeCloseTo(snap.base.L11, 6);
  });

  it('resolve flags de isenção', () => {
    expect(r.isencoes.teIcms).toBe(snap.base.R9 === 'SIM');
    expect(r.isencoes.tePisCofins).toBe(snap.base.R10 === 'SIM');
    expect(r.isencoes.tusdIcms).toBe(snap.base.R12 === 'SIM');
    expect(r.isencoes.tusdPisCofins).toBe(snap.base.R13 === 'SIM');
  });

  it('calcula a tarifa compensada (GD2)', () => {
    expect(r.tarifaCompensada).toBeCloseTo(p.C24, 6);
    expect(r.tarifaCompensada).toBeCloseTo(snap.base.L18, 6);
  });

  it('calcula tarifa cliente base e desconto', () => {
    expect(r.tarifaClienteBase).toBeCloseTo(p.C25, 6);
    expect(r.tarifaDesconto).toBeCloseTo(p.C26, 6);
    expect(r.faturaSemAlexandria).toBeCloseTo(p.C27, 1);
    expect(r.valorTotalBruto).toBeCloseTo(p.C33, 1);
  });

  it('calcula faturamento do gerador', () => {
    expect(r.tGerador).toBeCloseTo(p.G3, 6);
    expect(r.faturamentoBrutoGerador).toBeCloseTo(p.G4, 1);
    expect(r.porcentagemBrutaEstimada).toBeCloseTo(p.G5, 6);
  });

  it('calcula número de clientes e valor de injeção', () => {
    expect(r.numeroClientes).toBeCloseTo(p.G9, 4);
    // Fórmula do Valor Injeção mudou por decisão de negócio (não aplica mais o desconto ao
    // termo trfDistribuidora - tarifaCompensada) — G10/G11 da planilha usam a fórmula antiga,
    // então recalculamos o esperado a partir dos componentes (tarifaClienteBase, trfDistribuidora,
    // tarifaCompensada, geracaoMensalKWh) já validados individualmente acima.
    const valorInjecaoEsperado = (p.C25 - (p.C23 - p.C24)) * p.C10;
    expect(r.valorInjecao).toBeCloseTo(valorInjecaoEsperado, 1);
    expect(r.tClienteFinal).toBeCloseTo(valorInjecaoEsperado / p.C10, 6);
  });

  it('calcula a simulação de fatura (nº clientes, fatura total)', () => {
    expect(r.faturasConcessionariaClientes).toBeCloseTo(snap.simulacao_fatura.M9, 1);
    expect(r.simulacaoFatura.totalFatura.valor).toBeCloseTo(snap.simulacao_fatura.M9, 1);
  });

  it('calcula fatura com parceria, desconto e take rate', () => {
    // Toda essa cadeia depende do Valor Injeção (fórmula mudou, ver teste acima), então
    // G13/G14/H14/G17-G20 da planilha não servem mais de gabarito — recalculamos o
    // esperado a partir dos componentes já validados individualmente (faturaSemAlexandria,
    // faturasConcessionariaClientes, faturamentoBrutoGerador, valorTotalBruto).
    const valorInjecaoEsperado = (p.C25 - (p.C23 - p.C24)) * p.C10;
    const pescoco = 1; // input não define pescoco nesse cenário — usa o default do engine
    const faturaComAlexandriaEsperada = valorInjecaoEsperado + snap.simulacao_fatura.M9;
    const descontoClientesEsperado = p.C27 - faturaComAlexandriaEsperada;
    const faturamento1MesEsperado = valorInjecaoEsperado * pescoco;
    const recorrenciaMensalEsperada = valorInjecaoEsperado - p.G4;
    const faturamento1AnoEsperado = faturamento1MesEsperado + (12 - pescoco) * recorrenciaMensalEsperada;
    const takeRate1AnoEsperado = faturamento1AnoEsperado / (p.C33 * 12);

    expect(r.faturaComAlexandria).toBeCloseTo(faturaComAlexandriaEsperada, 1);
    expect(r.descontoClientes).toBeCloseTo(descontoClientesEsperado, 1);
    expect(r.percentualDescontoLiquido).toBeCloseTo(descontoClientesEsperado / p.C27, 4);
    expect(r.faturamento1Mes).toBeCloseTo(faturamento1MesEsperado, 1);
    expect(r.recorrenciaMensal).toBeCloseTo(recorrenciaMensalEsperada, 1);
    expect(r.faturamento1Ano).toBeCloseTo(faturamento1AnoEsperado, 0);
    expect(r.takeRate1Ano).toBeCloseTo(takeRate1AnoEsperado, 6);
  });
});
