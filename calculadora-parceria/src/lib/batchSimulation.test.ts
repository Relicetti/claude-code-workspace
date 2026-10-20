import { describe, expect, it } from 'vitest';
import { parseCsv, rodarLote } from './batchSimulation';

describe('parseCsv', () => {
  it('aceita o CSV do Excel em português (";", decimal com vírgula, outra ordem de colunas)', () => {
    const csv = [
      'CONCESSIONARIA ;DESAGIO;ANO;POT CA;POT CC;GERACAO MENSAL;PESCOCO;ENQUADRAMENTO;FONTE ;MODALIDADE',
      'ENEL SP ;0,17;2026;0,075;0,112;15000;1;GD1;SOLAR;GERACAO COMPARTILHADA',
      'CEEE EQUATORIAL;0,17;2026;0,075;0,112;15.000;1;GD1;SOLAR;GERACAO COMPARTILHADA',
      'COPEL-DIS ;0,17;2026;0,075;0,112;15000;1;GD2;SOLAR;AUTOCONSUMO',
    ].join('\r\n');
    const [enel, ceee, copel] = parseCsv(csv);
    expect(enel).toEqual({
      concessionaria: 'Enel SP', ano: 2026, desagio: 0.17, potCA: 0.075, potCC: 0.112,
      geracaoMensal: 15000, pescoco: 1, enquadramento: 'GD1', fonte: 'Solar',
      modalidade: 'Geração Compartilhada',
    });
    expect(ceee.concessionaria).toBe('Equatorial CEEE');
    expect(ceee.geracaoMensal).toBe(15000);
    expect(copel.concessionaria).toBe('Copel-DIS');
    expect(copel.modalidade).toBe('Autoconsumo');
    expect(rodarLote([enel, ceee, copel]).map((r) => r.erro)).toEqual([undefined, undefined, undefined]);
  });

  it('continua aceitando o formato com vírgula do texto de ajuda', () => {
    const csv = 'Concessionária,Ano,Deságio,Pot CA,Pot CC,Geração Mensal,Pescoço,Enquadramento,Fonte,Modalidade\n'
      + 'Light,2026,17,0.075,0.112,15000,1,GD1,Solar,Geração Compartilhada';
    expect(parseCsv(csv)[0]).toMatchObject({ concessionaria: 'Light', desagio: 0.17, potCA: 0.075 });
  });
});
