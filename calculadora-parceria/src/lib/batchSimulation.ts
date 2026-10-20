import { calcularParceria } from './engine';
import descontoData from '../data/desconto.json';
import type { BatchScenarioInput, BatchScenarioOutput, Enquadramento, Fonte, Modalidade } from '../types';

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

/** Maiúsculas, sem acentos e só letras/dígitos separados por espaço. */
function chave(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** Mesma chave com as palavras em ordem alfabética ("CEEE EQUATORIAL" = "Equatorial CEEE"). */
function chaveSemOrdem(s: string): string {
  return chave(s).split(' ').sort().join(' ');
}

/** Acha o nome exato da tabela de descontos, ignorando caixa, acentos,
 * espaços, hífens e ordem das palavras. Sem correspondência, devolve o texto
 * original (o engine aponta o erro). */
function resolverConcessionaria(nome: string): string {
  const k = chaveSemOrdem(nome);
  return descontoData.find((d) => chaveSemOrdem(d.distribuidora) === k)?.distribuidora ?? nome.trim();
}

function resolverFonte(v: string): Fonte {
  return chave(v) === 'SOLAR' ? 'Solar' : 'Outras';
}

function resolverModalidade(v: string): Modalidade {
  return chave(v).includes('AUTO') ? 'Autoconsumo' : 'Geração Compartilhada';
}

/** Coluna do cabeçalho → campo. O cabeçalho é comparado pela chave normalizada,
 * então "Deságio (%)", "DESAGIO" e "desagio" valem igual. */
const CAMPOS_CABECALHO: Array<[keyof BatchScenarioInput, RegExp]> = [
  ['concessionaria', /^(CONCESSIONARIA|DISTRIBUIDORA)/],
  ['ano', /^ANO/],
  ['desagio', /^DESAGIO/],
  ['potCA', /^POT\w* CA/],
  ['potCC', /^POT\w* CC/],
  ['geracaoMensal', /^GERACAO/],
  ['pescoco', /PESCOCO/],
  ['enquadramento', /^ENQUADRAMENTO/],
  ['fonte', /FONTE/],
  ['modalidade', /^MODALIDADE/],
];

/** Ordem usada quando o cabeçalho não é reconhecido (a do texto de ajuda). */
const ORDEM_PADRAO = CAMPOS_CABECALHO.map(([campo]) => campo);

/** Número em formato BR ("0,075", "15.000", "1.234,5") ou US ("0.075"). */
function numero(v: string, decimalVirgula: boolean): number {
  const s = v.replace(/\s/g, '');
  if (!decimalVirgula) return Number(s);
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
  // Sem vírgula: ponto só é milhar se vier em grupos de 3 ("15.000").
  return /^-?\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : Number(s);
}

/** Aceita o CSV do Excel em português (separador ";" e decimal com vírgula)
 * ou o formato com vírgula, com colunas em qualquer ordem desde que o
 * cabeçalho as identifique. */
export function parseCsv(texto: string): BatchScenarioInput[] {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length < 2) return [];
  const sep = linhas[0].includes(';') ? ';' : linhas[0].includes('\t') ? '\t' : ',';
  const decimalVirgula = sep !== ',';

  const cabecalho = linhas[0].split(sep).map(chave);
  const indice = new Map<keyof BatchScenarioInput, number>();
  for (const [campo, re] of CAMPOS_CABECALHO) {
    const i = cabecalho.findIndex((h) => re.test(h));
    if (i >= 0) indice.set(campo, i);
  }
  if (indice.size < CAMPOS_CABECALHO.length) {
    ORDEM_PADRAO.forEach((campo, i) => indice.set(campo, i));
  }

  return linhas.slice(1).map((linha) => {
    const c = linha.split(sep).map((v) => v.trim());
    const col = (campo: keyof BatchScenarioInput) => c[indice.get(campo)!] ?? '';
    const num = (campo: keyof BatchScenarioInput) => numero(col(campo), decimalVirgula);
    const desagio = num('desagio');
    return {
      concessionaria: resolverConcessionaria(col('concessionaria')),
      ano: col('ano') ? num('ano') : undefined,
      // Deságio é fração (0,17); "17" também é aceito como 17%.
      desagio: desagio > 1 ? desagio / 100 : desagio,
      potCA: num('potCA'),
      potCC: num('potCC'),
      geracaoMensal: num('geracaoMensal'),
      pescoco: num('pescoco'),
      enquadramento: chave(col('enquadramento')) as Enquadramento,
      fonte: resolverFonte(col('fonte')),
      modalidade: resolverModalidade(col('modalidade')),
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
