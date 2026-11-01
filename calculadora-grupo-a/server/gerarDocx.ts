import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import type { DadosModelo } from '../src/lib/contratos.ts';

// Os modelos (.docx da Kora com os campos entre chaves) NÃO ficam no git — o repositório é público.
// Um administrador sobe cada modelo na aba Configurações; ficam em <volume>/modelos/.
export type Modelo = 'contrato' | 'procuracao';
export const MODELOS: Modelo[] = ['contrato', 'procuracao'];

export const arquivoModelo = (dir: string, modelo: Modelo) => path.join(dir, `${modelo}.docx`);

export function gerarDocx(dir: string, modelo: Modelo, dados: DadosModelo): Buffer {
  const arq = arquivoModelo(dir, modelo);
  if (!fs.existsSync(arq)) throw new Error(`Modelo de ${modelo === 'contrato' ? 'contrato' : 'procuração'} ainda não enviado (aba Configurações).`);
  const doc = new Docxtemplater(new PizZip(fs.readFileSync(arq)), { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render(dados);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

/** Confere se o arquivo é um .docx com campos válidos e devolve os campos encontrados. */
export function validarModelo(conteudo: Buffer): string[] {
  let zip: PizZip;
  try { zip = new PizZip(conteudo); } catch { throw new Error('O arquivo não é um .docx válido.'); }
  if (!zip.file('word/document.xml')) throw new Error('O arquivo não é um .docx válido.');
  try {
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
    return [...new Set([...doc.getFullText().matchAll(/\{([#/]?[a-z_]+)\}/g)].map((m) => m[1]))];
  } catch (e) {
    const err = e as { properties?: { errors?: { properties?: { explanation?: string } }[] } };
    const det = err.properties?.errors?.map((x) => x.properties?.explanation).filter(Boolean).join('; ');
    throw new Error(`Campos com erro no modelo: ${det || (e as Error).message}`);
  }
}
