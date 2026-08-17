import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, setSyncMeta } from './db';
import { parseNumeroBr, streamCsvRows } from './csvStream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (calculadora-parceria)' };

const TARIFAS_B1_URL =
  'https://dadosabertos.aneel.gov.br/dataset/5a583f3e-1646-4f67-bf0f-69db4203e89e/resource/fcf2906c-7c32-4b9b-a637-054e7a5234f4/download/tarifas-homologadas-distribuidoras-energia-eletrica.csv';

const COMPONENTES_PACKAGE_URL =
  'https://dadosabertos.aneel.gov.br/api/3/action/package_show?id=613e6b74-1a4b-4c48-a231-096815e96bd5';

const COMPONENTES_ALVO = new Set(['TUSD_FioB', 'TUSD_FR', 'TUSD_RB']);

// Detalhes de consumidor aceitos na tarifa B1: consumo normal ("Não se aplica") e a linha
// específica de energia compensada via SCEE — usada pro cálculo de Benefício Bruto/Líquido
// das distribuidoras Equatorial em GD2 (ver DISTRIBUIDORAS_METODO_SCEE em engine.ts).
const DETALHES_B1 = new Set(['Não se aplica', 'SCEE']);

async function fetchComRetentativa(url: string): Promise<Response> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok || !res.body) throw new Error(`Falha ao baixar ${url}: HTTP ${res.status}`);
  return res;
}

/** Replica a query M "tarifas-homologadas-distribuido" + o filtro extra que a planilha original
 * aplicava em cima dela (Convencional / posto "Não se aplica"), e reduz pra só a linha mais
 * recente por (código, detalhe) — a mesma tarifa "cheia" que BASE!L7/L8 busca via MAX(vigência).
 * Captura tanto o consumo normal quanto a linha SCEE (ver DETALHES_B1). */
export async function syncTarifasB1(): Promise<number> {
  const res = await fetchComRetentativa(TARIFAS_B1_URL);
  type Linha = {
    codigo: string; resolucao: string; inicioVigencia: string; fimVigencia: string;
    subgrupo: string; modalidade: string; classe: string; detalhe: string;
    tusd: number; te: number; total: number;
  };
  const maisRecentePorChave = new Map<string, Linha>();

  // O CSV "tarifas-homologadas-distribuidoras-energia-eletrica" é servido em UTF-8 (confirmado
  // byte a byte) — decodificar como windows-1252 corrompe os acentos e faz TODOS os filtros de
  // string abaixo (ex: "Tarifa de Aplicação") nunca casarem, zerando a sincronização.
  await streamCsvRows(res.body!, 'utf-8', (f) => {
    // 0=data 1=resolucao 2=codigo 3=cnpj 4=inicioVigencia 5=fimVigencia 6=baseTarifaria
    // 7=subgrupo 8=modalidade 9=classe 10=subclasse 11=detalhe 12=posto 13=unidade 14=acessante 15=tusd 16=te
    if (f[6] !== 'Tarifa de Aplicação' || f[7] !== 'B1' || f[8] !== 'Convencional') return;
    if (f[10] !== 'Residencial' || f[12] !== 'Não se aplica') return;
    if (!DETALHES_B1.has(f[11])) return;
    const chave = `${f[2]}|${f[11]}`;
    const atual = maisRecentePorChave.get(chave);
    if (atual && atual.inicioVigencia >= f[4]) return; // já temos uma linha igual ou mais recente pra essa chave
    const tusd = parseNumeroBr(f[15]);
    const te = parseNumeroBr(f[16]);
    maisRecentePorChave.set(chave, {
      codigo: f[2], resolucao: f[1], inicioVigencia: f[4], fimVigencia: f[5],
      subgrupo: f[7], modalidade: f[8], classe: f[9], detalhe: f[11], tusd, te, total: tusd + te,
    });
  });

  const linhas = [...maisRecentePorChave.values()];

  db.exec('DELETE FROM tarifas_b1');
  const insert = db.prepare(`
    INSERT INTO tarifas_b1 (codigo, resolucao, inicio_vigencia, fim_vigencia, subgrupo, modalidade, classe, detalhe, tusd, te, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN');
  try {
    for (const l of linhas) {
      insert.run(l.codigo, l.resolucao, l.inicioVigencia, l.fimVigencia, l.subgrupo, l.modalidade, l.classe, l.detalhe, l.tusd, l.te, l.total);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  setSyncMeta('tarifas_b1', linhas.length);
  return linhas.length;
}

interface CkanResource { name: string; format: string; url: string }

async function descobrirRecursoAno(ano: number): Promise<CkanResource | null> {
  const res = await fetchComRetentativa(COMPONENTES_PACKAGE_URL);
  const json = (await res.json()) as { result: { resources: CkanResource[] } };
  const nomeAlvo = `componentes-tarifarias-${ano}.csv`;
  return json.result.resources.find((r) => r.name === nomeAlvo && r.format === 'CSV') ?? null;
}

/** Replica a query M "FioB": combina ano atual + ano anterior (atual primeiro), filtra
 * Tarifa de Aplicação / B1 / Convencional / Residencial / Não se aplica / componente alvo. */
export async function syncComponentesTarifarias(): Promise<number> {
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual, anoAtual - 1];

  db.exec('DELETE FROM componentes_tarifarios');
  const insert = db.prepare(`
    INSERT INTO componentes_tarifarios
      (codigo, resolucao, inicio_vigencia, fim_vigencia, subgrupo, modalidade, classe, componente, valor, ano_fonte, ordem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let ordem = 0;
  let total = 0;
  db.exec('BEGIN');
  try {
    for (const ano of anos) {
      const recurso = await descobrirRecursoAno(ano);
      if (!recurso) continue; // ano ainda não publicado pela ANEEL (ex: início de ano novo)
      const res = await fetchComRetentativa(recurso.url);
      await streamCsvRows(res.body!, 'utf-8', (f) => {
        // 0=data 1=resolucao 2=codigo 3=cnpj 4=inicioVigencia 5=fimVigencia 6=baseTarifaria
        // 7=subgrupo 8=modalidade 9=classe 10=subclasse 11=detalhe 12=posto 13=unidade 14=acessante 15=componente 16=valor
        if (f[6] !== 'Tarifa de Aplicação' || f[7] !== 'B1' || f[8] !== 'Convencional') return;
        if (f[10] !== 'Residencial' || f[11] !== 'Não se aplica') return;
        if (!COMPONENTES_ALVO.has(f[15])) return;
        insert.run(f[2], f[1], f[4], f[5], f[7], f[8], f[9], f[15], parseNumeroBr(f[16]), ano, ordem++);
        total++;
      });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  setSyncMeta('componentes_tarifarios', total);
  return total;
}

/** Popula o banco com os JSONs já empacotados no app, só na primeira vez (banco vazio),
 * para o app funcionar antes do primeiro clique em "Atualizar". */
export function seedFromJsonIfEmpty(): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM tarifas_b1').get() as { c: number }).c;
  if (count > 0) return;

  const dataDir = path.join(__dirname, '..', 'src', 'data');
  const tarifasB1 = JSON.parse(fs.readFileSync(path.join(dataDir, 'tarifas_b1.json'), 'utf-8')) as Array<{
    codigo: string; resolucao: string; inicioVigencia: string; fimVigencia: string;
    subgrupo: string; modalidade: string; classe: string; detalhe: string; tusd: number; te: number; total: number;
  }>;
  const componentes = JSON.parse(fs.readFileSync(path.join(dataDir, 'componentes_tarifarias.json'), 'utf-8')) as Array<{
    codigo: string; resolucao: string | null; inicioVigencia: string; fimVigencia: string;
    subgrupo: string; modalidade: string; classe: string; componente: string; valor: number;
  }>;

  const insertB1 = db.prepare(`
    INSERT INTO tarifas_b1 (codigo, resolucao, inicio_vigencia, fim_vigencia, subgrupo, modalidade, classe, detalhe, tusd, te, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertComp = db.prepare(`
    INSERT INTO componentes_tarifarios
      (codigo, resolucao, inicio_vigencia, fim_vigencia, subgrupo, modalidade, classe, componente, valor, ano_fonte, ordem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  for (const l of tarifasB1) {
    insertB1.run(l.codigo, l.resolucao, l.inicioVigencia, l.fimVigencia, l.subgrupo, l.modalidade, l.classe, l.detalhe ?? 'Não se aplica', l.tusd, l.te, l.total);
  }
  componentes.forEach((c, i) => {
    insertComp.run(c.codigo, c.resolucao, c.inicioVigencia, c.fimVigencia, c.subgrupo, c.modalidade, c.classe, c.componente, c.valor, 0, i);
  });
  db.exec('COMMIT');

  setSyncMeta('tarifas_b1', tarifasB1.length);
  setSyncMeta('componentes_tarifarios', componentes.length);
}
