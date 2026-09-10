import { calcularParceria } from './engine';
import type { BatchScenarioInput, BatchScenarioOutput } from '../types';

const CSV_COLUNAS = [
  'Concessionária', 'Ano', 'Deságio (%)', 'Pot. CA (MWca)', 'Pot. CC (MWp)', 'Geração Mensal (kWh)',
  '%Pescoço', 'Enquadramento', 'Tipo de Fonte', 'Modalidade',
  'Tarif. Comp.', '%Cliente', 'T_gerador', 'Fat_gerador', 'Pescoco_Alex', 'Mensal_Alex', 'Take Rate',
] as const;

/** Roda um cenário do lote pelo engine e monta a mesma saída da aba RESUL. PARC. */
export function rodarCenario(cenario: BatchScenarioInput): BatchScenarioOutput {
  try {
    const r = calcularParceria({
      distribuidora: cenario.concessionaria,
      ano: cenario.ano ?? new Date().getFullYear(),
      enquadramento: cenario.enquadramento,
      fonte: cenario.fonte,
      modalidade: cenario.modalidade,
      potenciaConexaoMW: cenario.potCA,
      potenciaInstaladaMWp: cenario.potCC,
      geracaoMensalKWh: cenario.geracaoMensal,
      desagioPct: cenario.desagio,
      pescoco: cenario.pescoco,
    });
    return {
      ...cenario,
      tarifComp: Math.round(r.tarifaCompensada * 1000) / 1000,
      pctCliente: r.descontoClientePct,
      tGerador: Math.round(r.tGerador * 1000) / 1000,
      fatGerador: r.faturamentoBrutoGerador,
      pescocoAlex: r.faturamento1Mes,
      mensalAlex: r.recorrenciaMensal,
      takeRate: r.takeRate1Ano,
    };
  } catch (e) {
    return {
      ...cenario,
      tarifComp: NaN, pctCliente: NaN, tGerador: NaN, fatGerador: NaN,
      pescocoAlex: NaN, mensalAlex: NaN, takeRate: NaN,
      erro: e instanceof Error ? e.message : String(e),
    };
  }
}

export function rodarLote(cenarios: BatchScenarioInput[]): BatchScenarioOutput[] {
  return cenarios.map(rodarCenario);
}

export function parseCsv(texto: string): BatchScenarioInput[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length < 2) return [];
  return linhas.slice(1).map((linha) => {
    const c = linha.split(',').map((v) => v.trim());
    return {
      concessionaria: c[0],
      ano: c[1] ? Number(c[1]) : undefined,
      desagio: Number(c[2]),
      potCA: Number(c[3]),
      potCC: Number(c[4]),
      geracaoMensal: Number(c[5]),
      pescoco: Number(c[6]),
      enquadramento: c[7] as BatchScenarioInput['enquadramento'],
      fonte: c[8] as BatchScenarioInput['fonte'],
      modalidade: c[9] as BatchScenarioInput['modalidade'],
    };
  });
}

export function exportarCsv(resultados: BatchScenarioOutput[]): string {
  const linhas = [CSV_COLUNAS.join(',')];
  for (const r of resultados) {
    linhas.push([
      r.concessionaria, r.ano ?? '', r.desagio, r.potCA, r.potCC, r.geracaoMensal, r.pescoco,
      r.enquadramento, r.fonte, r.modalidade,
      r.tarifComp, r.pctCliente, r.tGerador, r.fatGerador, r.pescocoAlex, r.mensalAlex, r.takeRate,
    ].join(','));
  }
  return linhas.join('\n');
}
