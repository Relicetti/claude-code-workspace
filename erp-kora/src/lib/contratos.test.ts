import { describe, expect, it } from 'vitest';
import { dadosModelo, dataExtenso, extenso, precoTexto, reaisExtenso } from './contratos';
import { CFG, clientePronto } from './fixtures';

describe('contratos', () => {
  it('escreve números por extenso', () => {
    expect(extenso(14)).toBe('quatorze');
    expect(extenso(12)).toBe('doze');
    expect(extenso(100)).toBe('cem');
    expect(extenso(121)).toBe('cento e vinte e um');
    expect(extenso(1000)).toBe('mil');
    expect(extenso(1100)).toBe('mil e cem');
    expect(extenso(2345)).toBe('dois mil trezentos e quarenta e cinco');
    expect(extenso(1_000_000)).toBe('um milhão');
  });

  it('data por extenso usa 1º no primeiro dia', () => {
    expect(dataExtenso(new Date(2026, 10, 1))).toBe('1º de novembro de 2026');
    expect(dataExtenso(new Date(2026, 9, 30))).toBe('30 de outubro de 2026');
  });

  it('escreve o preço por kWh como no contrato', () => {
    expect(precoTexto(0.6)).toBe('0,60');
    expect(reaisExtenso(0.6)).toBe('sessenta centavos');
    expect(precoTexto(0.6123)).toBe('0,6123');
    expect(reaisExtenso(0.6123)).toBe('sessenta e um centavos e vinte e três centésimos de centavo');
    expect(reaisExtenso(0.615)).toBe('sessenta e um centavos e cinco décimos de centavo');
    expect(reaisExtenso(1.01)).toBe('um real e um centavo');
  });

  it('monta qualificação PJ, UCs e condições', () => {
    const d = dadosModelo(clientePronto(), new Date(2026, 9, 30), CFG);
    expect(d.nome).toBe('HOTEL TRAMANDAÍ');
    expect(d.qualificacao).toBe(', pessoa jurídica de direito privado, inscrita no CNPJ sob nº 11.222.333/0001-81, com sede na Rua Bororos, nº 14, '
      + 'Bairro Vila Izabel, CEP 80.320-260, Curitiba/PR, neste ato representada por sua sócia administradora MARIA SOUZA, inscrita no CPF sob nº 529.982.247-25');
    expect(d.denominado).toBe('denominada');
    expect(d.ucs).toEqual([{ numero: '000677708603158', descricao: 'titular HOTEL TRAMANDAÍ, CNPJ 11.222.333/0001-81; R. Teste, 100, Curitiba/PR; '
      + 'Grupo B – classe B3 Comercial, trifásico 200A; consumo médio de referência de 14.363 kWh/mês (jun/2026 a out/2026).' }]);
    expect(d).toMatchObject({
      preco: '0,60', preco_extenso: 'sessenta centavos', prazo_saldo: '12', prazo_saldo_extenso: 'doze',
      distribuidora: 'Copel', distribuidora_razao: 'Copel Distribuição S.A.', data_extenso: '30 de outubro de 2026',
      rotulo_ucs: 'à Unidade Consumidora nº', numeros_ucs: '000677708603158', doc_rotulo: 'CNPJ',
    });
  });

  it('pessoa física com concordância de gênero', () => {
    const c = { ...clientePronto(), tipo: 'PF' as const, nome: 'Ana Lima', documento: '52998224725', sexo: 'F' as const,
      nacionalidade: 'brasileira', naturalidade: 'Curitiba/PR', nascimento: '1981-08-07', rg: '7.584.104-3', rgOrgao: 'SESP/PR' };
    const d = dadosModelo(c, new Date(2026, 9, 30), CFG);
    expect(d.qualificacao).toBe(', brasileira, natural de Curitiba/PR, nascida em 07/08/1981, portadora do RG nº 7.584.104-3 SESP/PR, '
      + 'inscrita no CPF sob nº 529.982.247-25, residente e domiciliada na Rua Bororos, nº 14, Bairro Vila Izabel, CEP 80.320-260, Curitiba/PR');
    expect(d.qualificacao_procuracao).toMatch(/^, pessoa física, brasileira/);
    expect(d.denominado).toBe('denominada');
    expect(d.doc_formatado).toBe('529.982.247-25');
  });

  it('várias UCs: plural no texto', () => {
    const base = clientePronto();
    const c = { ...base, ucs: [base.ucs[0], { ...base.ucs[0], numero: '999' }] };
    const d = dadosModelo(c, new Date(2026, 9, 30), CFG);
    expect(d.destino_ucs).toBe('às unidades consumidoras abaixo identificadas');
    expect(d.atendida).toBe('atendidas');
    expect(d.rotulo_ucs).toBe('às Unidades Consumidoras nºs');
    expect(d.numeros_ucs).toBe('000677708603158 e 999');
  });
});
