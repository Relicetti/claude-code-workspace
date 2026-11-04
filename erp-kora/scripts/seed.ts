// Regenera src/data/tarifas.json a partir da ANEEL.
//   node scripts/seed.ts                        — baixa tudo da ANEEL
//   node scripts/seed.ts tarifas.csv comp*.csv  — usa CSVs já baixados
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirCsvLocal, processarFioB, processarTarifas, sincronizarAneel } from '../server/aneel.ts';
import type { DadosTarifarios, FioBRow } from '../src/types.ts';

const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'tarifas.json');
const [arqTarifas, ...arqsComponentes] = process.argv.slice(2);

let dados: DadosTarifarios;
if (arqTarifas) {
  const fioB = new Map<string, FioBRow>();
  for (const arq of arqsComponentes) await processarFioB(abrirCsvLocal(arq), fioB);
  dados = { tarifas: await processarTarifas(abrirCsvLocal(arqTarifas)), fioB: [...fioB.values()], atualizadoEm: new Date().toISOString() };
} else {
  dados = await sincronizarAneel(fs.mkdtempSync(path.join(os.tmpdir(), 'aneel-')));
}

fs.writeFileSync(destino, JSON.stringify(dados));
console.log(`${dados.tarifas.length} tarifas e ${dados.fioB.length} linhas de Fio B gravadas em ${destino}`);
