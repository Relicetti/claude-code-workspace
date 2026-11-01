import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { gerarDocx, validarModelo } from './gerarDocx';
import { dadosModelo } from '../src/lib/contratos';
import { CFG, clientePronto } from '../src/lib/fixtures';

const texto = (buf: Buffer) => new PizZip(buf).file('word/document.xml')!.asText()
  .replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');

// Os modelos reais não vão para o git; localmente ficam em server/modelos/ (ignorada). Sem eles, os testes pulam.
const DIR = path.join(__dirname, 'modelos');
const temModelos = fs.existsSync(path.join(DIR, 'contrato.docx')) && fs.existsSync(path.join(DIR, 'procuracao.docx'));

describe.skipIf(!temModelos)('modelos .docx', () => {
  const base = clientePronto();
  const c = { ...base, ucs: [base.ucs[0], { ...base.ucs[0], numero: '999' }] };
  const dados = dadosModelo(c, new Date(2026, 9, 30), CFG);

  it('contrato: todos os campos preenchidos, uma linha por UC', () => {
    const t = texto(gerarDocx(DIR, 'contrato', dados));
    expect(t).not.toMatch(/[{}]/);
    expect(t).toContain('CONTRATANTE: HOTEL TRAMANDAÍ, pessoa jurídica de direito privado');
    expect(t).toContain('doravante denominada simplesmente CLIENTE');
    expect(t).toContain('UC nº 000677708603158:');
    expect(t).toContain('UC nº 999:');
    expect(t).toContain('R$ 0,60 (sessenta centavos) por quilowatt-hora');
    expect(t).toContain('prazo máximo de 12 (doze) meses');
    expect(t).toContain('perante a Copel, comprometendo-se');
    expect(t).toContain('Curitiba, 30 de outubro de 2026.');
    expect(t).toContain('representada por seu sócio administrador Fulano de Tal, CPF nº 000.000.000-00, doravante denominada KORA');
    expect(t).not.toMatch(/ALESSANDRO|CONTENTE|033\.682|066\.597|009\.882|9\.433/);
  });

  it('procuração: outorgante, distribuidora e UCs', () => {
    const t = texto(gerarDocx(DIR, 'procuracao', dados));
    expect(t).not.toMatch(/[{}]/);
    expect(t).toContain('perante a Copel Distribuição S.A., exclusivamente em relação às Unidades Consumidoras nºs 000677708603158 e 999, podendo:');
    expect(t).toContain('CNPJ: 11.222.333/0001-81');
    expect(t).toContain('neste ato representada por seus sócios FULANO DE TAL, brasileiro, inscrito no CPF sob nº 000.000.000-00.');
    expect(t).not.toMatch(/ALESSANDRO|CONTENTE|033\.682/);
  });
});

describe('validarModelo', () => {
  it('recusa arquivo que não é .docx', () => {
    expect(() => validarModelo(Buffer.from('não sou docx'))).toThrow(/não é um .docx/);
  });
  it.skipIf(!temModelos)('lista os campos do modelo', () => {
    const campos = validarModelo(fs.readFileSync(path.join(DIR, 'contrato.docx')));
    expect(campos).toEqual(expect.arrayContaining(['nome', 'qualificacao', '#ucs', '/ucs', 'preco', 'kora_representante']));
  });
});
