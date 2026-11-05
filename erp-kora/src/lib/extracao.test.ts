import { describe, expect, it } from 'vitest';
import { cadastroVazio, condicoesPadrao } from './clientes';
import { consumoMedio, distribuidoraDaRazao, mesclarExtracao, type Extracao, type FormCliente } from './extracao';

const vazia = (): Extracao => ({
  tipoDetectado: 'outro',
  pessoa: { nome: '', cpf: '', rg: '', rgOrgao: '', nascimento: '', sexo: '', nacionalidade: '', naturalidade: '' },
  empresa: { razaoSocial: '', nomeFantasia: '', cnpj: '', inscricaoEstadual: '' },
  endereco: { logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', cep: '' },
  representante: { nome: '', cpf: '', cargo: '' },
  email: '', telefone: '', ucs: [], observacoes: '',
});
const form = (tipo: 'PF' | 'PJ'): FormCliente => ({ ...cadastroVazio(), tipo, contrato: condicoesPadrao(null, '') });

describe('consumoMedio', () => {
  it('usa os últimos 12 meses, ignora repetidos e meses inválidos', () => {
    const h = Array.from({ length: 14 }, (_, i) => ({ mes: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, kWh: 100 }));
    h.push({ mes: '2026-02', kWh: 100 });
    h.push({ mes: 'out/2026', kWh: 9999 });
    const r = consumoMedio(h)!;
    expect(r.media).toBe(100);
    expect(r.periodo).toBe('mar/2025 a fev/2026');
  });
  it('sem histórico → null', () => expect(consumoMedio([])).toBeNull());
});

describe('distribuidoraDaRazao', () => {
  it('reconhece a razão social conhecida', () => expect(distribuidoraDaRazao('COPEL DISTRIBUIÇÃO S.A.')).toEqual({ nome: 'Copel', razao: 'Copel Distribuição S.A.' }));
  it('desconhecida: usa a primeira palavra como nome curto', () => expect(distribuidoraDaRazao('XYZENERGIA LTDA')?.nome).toBe('Xyzenergia'));
});

describe('mesclarExtracao', () => {
  it('PF: RG preenche campos vazios do cliente', () => {
    const e = vazia();
    e.pessoa = { nome: 'Maria da Silva', cpf: '529.982.247-25', rg: '12.345.678-9', rgOrgao: 'SSP/PR', nascimento: '1980-05-02', sexo: 'F', nacionalidade: 'brasileira', naturalidade: 'Curitiba/PR' };
    const r = mesclarExtracao(form('PF'), e, 'rg');
    expect(r.form.nome).toBe('MARIA DA SILVA');
    expect(r.form.documento).toBe('52998224725');
    expect(r.form.sexo).toBe('F');
    expect(r.form.nascimento).toBe('1980-05-02');
    expect(r.divergencias).toEqual([]);
  });

  it('não sobrescreve o que já está digitado; lista a divergência', () => {
    const f = form('PF');
    f.nome = 'MARIA SILVA';
    f.documento = '52998224725';
    const e = vazia();
    e.pessoa.nome = 'Maria da Silva';
    e.pessoa.cpf = '529.982.247-25';
    const r = mesclarExtracao(f, e, 'rg');
    expect(r.form.nome).toBe('MARIA SILVA');
    expect(r.divergencias).toHaveLength(1);
    expect(r.divergencias[0]).toContain('Nome');
  });

  it('PJ: documento de pessoa vai para o representante', () => {
    const e = vazia();
    e.pessoa.nome = 'João Souza';
    e.pessoa.cpf = '52998224725';
    e.empresa = { razaoSocial: 'Hotel Mar Ltda', nomeFantasia: 'Hotel Mar', cnpj: '11.222.333/0001-81', inscricaoEstadual: '' };
    const r = mesclarExtracao(form('PJ'), e);
    expect(r.form.representante.nome).toBe('JOÃO SOUZA');
    expect(r.form.representante.cpf).toBe('52998224725');
    expect(r.form.nome).toBe('HOTEL MAR LTDA');
    expect(r.form.documento).toBe('11222333000181');
  });

  it('fatura: preenche a UC vazia, consumo médio e distribuidora', () => {
    const f = form('PJ');
    f.documento = '11222333000181';
    f.ucs = [{ ...f.ucs[0] ?? {}, numero: '', distribuidora: '', subgrupo: '', modalidade: '', energiaKWhMes: 0, titular: '', titularDocumento: '', endereco: '', classificacao: '', ligacao: '', consumoMedioKWh: 0, periodoConsumo: '' }];
    const e = vazia();
    e.ucs = [{
      numero: '123456789', titular: 'HOTEL MAR LTDA', titularDocumento: '11.222.333/0001-81', endereco: 'Rua A, 10, Centro, Curitiba/PR',
      classificacao: 'Grupo B – B3 Comercial', ligacao: 'trifásico', subgrupo: 'B3', modalidade: 'Convencional',
      distribuidoraRazao: 'COPEL DISTRIBUICAO S.A.', historico: [{ mes: '2026-09', kWh: 1000 }, { mes: '2026-10', kWh: 2000 }],
    }];
    const r = mesclarExtracao(f, e, 'fatura');
    expect(r.form.ucs).toHaveLength(1);
    const u = r.form.ucs[0];
    expect(u.numero).toBe('123456789');
    expect(u.consumoMedioKWh).toBe(1500);
    expect(u.periodoConsumo).toBe('set/2026 a out/2026');
    expect(u.titular).toBe(''); // titular é o próprio cliente
    expect(r.form.contrato.distribuidoraNome).toBe('Copel');
  });

  it('fatura de UC nova é acrescentada; titular diferente é registrado', () => {
    const f = form('PF');
    f.documento = '52998224725';
    f.ucs = [];
    const e = vazia();
    e.ucs = [{ numero: '999', titular: 'Outra Pessoa', titularDocumento: '111.444.777-35', endereco: '', classificacao: '', ligacao: '', subgrupo: '', modalidade: '', distribuidoraRazao: '', historico: [] }];
    const r = mesclarExtracao(f, e);
    expect(r.form.ucs).toHaveLength(1);
    expect(r.form.ucs[0].titular).toBe('OUTRA PESSOA');
    expect(r.form.ucs[0].titularDocumento).toBe('CPF 111.444.777-35');
  });

  it('não altera o formulário original', () => {
    const f = form('PF');
    const e = vazia();
    e.pessoa.nome = 'X';
    mesclarExtracao(f, e);
    expect(f.nome).toBe('');
  });
});
