import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseNumeroBr, streamCsvRows } from './csvStream.ts';
import type { DadosTarifarios, FioBRow, Posto, TarifaRow } from '../src/types.ts';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (calculadora-grupo-a)' };

const TARIFAS_URL =
  'https://dadosabertos.aneel.gov.br/dataset/5a583f3e-1646-4f67-bf0f-69db4203e89e/resource/fcf2906c-7c32-4b9b-a637-054e7a5234f4/download/tarifas-homologadas-distribuidoras-energia-eletrica.csv';
const COMPONENTES_PACKAGE_URL =
  'https://dadosabertos.aneel.gov.br/api/3/action/package_show?id=613e6b74-1a4b-4c48-a231-096815e96bd5';

/** Vigências mais antigas que isso não interessam (o seletor de ano começa em 2020). */
const VIGENCIA_MINIMA = '2020-01-01';

const SUBGRUPOS_A = new Set(['A1', 'A2', 'A3', 'A3a', 'A4', 'AS']);
const POSTOS_A = new Set(['Ponta', 'Fora ponta']);

/** Grupo B: a classe/subclasse "padrão" de cada subgrupo, tarifa convencional sem SCEE. */
const CLASSE_B: Record<string, [string, string]> = {
  B1: ['Residencial', 'Residencial'],
  B2: ['Rural', 'Não se aplica'],
  B3: ['Não se aplica', 'Não se aplica'],
};

// Índices das colunas — iguais nos dois CSVs:
// 0=data 1=resolucao 2=agente 3=cnpj 4=inicio 5=fim 6=baseTarifaria 7=subgrupo 8=modalidade
// 9=classe 10=subclasse 11=detalhe 12=posto 13=unidade 14=acessante 15=tusd|componente 16=te|valor

/** Linha de consumo "comum" (sem APE/SCEE, sem acessante específico) do Grupo A ou B. */
function linhaInteressa(f: string[]): boolean {
  if (f[6] !== 'Tarifa de Aplicação' || f[4] < VIGENCIA_MINIMA) return false;
  if (f[11] !== 'Não se aplica' || f[14] !== 'Não se aplica') return false;
  const subgrupo = f[7];
  if (SUBGRUPOS_A.has(subgrupo)) {
    return (f[8] === 'Verde' || f[8] === 'Azul') && POSTOS_A.has(f[12])
      && f[9] === 'Não se aplica' && f[10] === 'Não se aplica';
  }
  const classe = CLASSE_B[subgrupo];
  return !!classe && f[8] === 'Convencional' && f[12] === 'Não se aplica'
    && f[9] === classe[0] && f[10] === classe[1];
}

let progresso: string | null = null;
export function getProgresso(): string | null { return progresso; }

export async function processarTarifas(csv: ReadableStream<Uint8Array>): Promise<TarifaRow[]> {
  const porChave = new Map<string, TarifaRow>();
  await streamCsvRows(csv, 'utf-8', (f, idx) => {
    if (idx % 50000 === 0) progresso = `Processando tarifas (linha ${idx.toLocaleString('pt-BR')})…`;
    // Tarifa de energia vem em MWh; demanda (kW) fica de fora — o cálculo é só de energia.
    if (f[13] !== 'MWh' || !linhaInteressa(f)) return;
    const chave = [f[2], f[7], f[8], f[12], f[4]].join('|');
    porChave.set(chave, {
      agente: f[2], subgrupo: f[7], modalidade: f[8], posto: f[12] as Posto,
      inicio: f[4], fim: f[5], tusd: parseNumeroBr(f[15]), te: parseNumeroBr(f[16]), resolucao: f[1],
    });
  });
  return [...porChave.values()];
}

export async function processarFioB(csv: ReadableStream<Uint8Array>, destino: Map<string, FioBRow>): Promise<void> {
  await streamCsvRows(csv, 'utf-8', (f, idx) => {
    if (idx % 100000 === 0) progresso = `Processando componentes tarifários (linha ${idx.toLocaleString('pt-BR')})…`;
    if (f[15] !== 'TUSD_FioB' || f[13] !== 'R$/MWh' || !linhaInteressa(f)) return;
    const chave = [f[2], f[7], f[8], f[12], f[4]].join('|');
    destino.set(chave, {
      agente: f[2], subgrupo: f[7], modalidade: f[8], posto: f[12] as Posto, inicio: f[4], fioB: parseNumeroBr(f[16]),
    });
  });
}

export function abrirCsvLocal(caminho: string): ReadableStream<Uint8Array> {
  return Readable.toWeb(fs.createReadStream(caminho)) as unknown as ReadableStream<Uint8Array>;
}

async function baixar(url: string, destino: string): Promise<void> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok || !res.body) throw new Error(`Falha ao baixar ${url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), fs.createWriteStream(destino));
}

/** URLs dos CSVs de componentes tarifários do ano atual e do anterior. */
async function urlsComponentes(): Promise<string[]> {
  const res = await fetch(COMPONENTES_PACKAGE_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`Falha ao consultar ANEEL: HTTP ${res.status}`);
  const json = (await res.json()) as { result: { resources: { name: string; format: string; url: string }[] } };
  const ano = new Date().getFullYear();
  return [ano, ano - 1]
    .map((a) => json.result.resources.find((r) => r.name === `componentes-tarifarias-${a}.csv` && r.format === 'CSV'))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => r.url);
}

/** Baixa os CSVs da ANEEL (um de cada vez, apagando depois — somam ~700 MB) e devolve os
 * dados já filtrados. */
export async function sincronizarAneel(pastaTemp: string): Promise<DadosTarifarios> {
  fs.mkdirSync(pastaTemp, { recursive: true });
  try {
    progresso = 'Baixando tarifas homologadas (~90 MB)…';
    const arqTarifas = path.join(pastaTemp, 'tarifas.csv');
    await baixar(TARIFAS_URL, arqTarifas);
    const tarifas = await processarTarifas(abrirCsvLocal(arqTarifas));
    fs.unlinkSync(arqTarifas);

    const fioB = new Map<string, FioBRow>();
    for (const url of await urlsComponentes()) {
      progresso = 'Baixando componentes tarifários (pode passar de 400 MB)…';
      const arq = path.join(pastaTemp, 'componentes.csv');
      await baixar(url, arq);
      await processarFioB(abrirCsvLocal(arq), fioB);
      fs.unlinkSync(arq);
    }
    return { tarifas, fioB: [...fioB.values()], atualizadoEm: new Date().toISOString() };
  } finally {
    progresso = null;
  }
}
