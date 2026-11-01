import { describe, expect, it } from 'vitest';
import { atualizarCadastro, clienteDaProposta, cnpjValido, cpfValido, mudarStatus, pendencias, pendenciasContrato, proximoIdCliente } from './clientes';
import { agora, clientePronto, proposta } from './fixtures';

describe('clientes', () => {
  it('valida CPF e CNPJ', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
  });

  it('numera CLI-0001, CLI-0002…', () => {
    expect(proximoIdCliente([])).toBe('CLI-0001');
    expect(proximoIdCliente(['CLI-0001', 'CLI-0007'])).toBe('CLI-0008');
  });

  it('fecha a proposta: cliente com nome, CNPJ, UC, crédito mensal e condições do contrato', () => {
    const c = clienteDaProposta([], proposta(), 0, agora, 'Ana');
    expect(c).toMatchObject({ id: 'CLI-0001', status: 'cadastro', tipo: 'PJ', nome: 'Hotel Tramandaí', documento: '11222333000181' });
    expect(c.ucs).toHaveLength(1);
    expect(c.ucs[0]).toMatchObject({ numero: '000677708603158', distribuidora: 'Copel-DIS', subgrupo: 'B3', energiaKWhMes: 14363 });
    expect(c.contrato).toEqual({ precoKWh: 0.6, prazoSaldoMeses: 12, distribuidoraNome: 'Copel', distribuidoraRazao: 'Copel Distribuição S.A.' });
    expect(c.historico[0].texto).toContain('KORA-2026-001');
  });

  it('divide o crédito mensal entre as UCs sem perder kWh', () => {
    const c = clienteDaProposta([], proposta('111, 222; 333'), 0, agora, 'Ana');
    expect(c.ucs.map((u) => u.numero)).toEqual(['111', '222', '333']);
    expect(c.ucs.reduce((s, u) => s + u.energiaKWhMes, 0)).toBe(14363);
  });

  it('não fecha a mesma proposta duas vezes', () => {
    const c = clienteDaProposta([], proposta(), 0, agora, 'Ana');
    expect(() => clienteDaProposta([c], proposta(), 0, agora, 'Ana')).toThrow(/já foi fechada/);
    // Cancelado libera.
    expect(() => clienteDaProposta([{ ...c, status: 'cancelado' }], proposta(), 0, agora, 'Ana')).not.toThrow();
  });

  it('só avança de etapa com o cadastro e os documentos completos', () => {
    const incompleto = clienteDaProposta([], proposta(), 0, agora, 'Ana');
    const falta = pendencias(incompleto, 'contrato');
    expect(falta).toContain('Documento: Cartão CNPJ');
    expect(falta.some((f) => f.startsWith('Endereço'))).toBe(true);
    expect(() => mudarStatus(incompleto, 'contrato', agora, 'Ana')).toThrow(/Falta para "Contrato"/);

    const c = clientePronto();
    expect(pendencias(c, 'contrato')).toEqual([]);
    const emContrato = mudarStatus(c, 'contrato', agora, 'Ana');
    expect(emContrato.status).toBe('contrato');
    // Assinado exige contrato e procuração assinados.
    expect(pendencias(emContrato, 'assinado')).toEqual(['Documento: Contrato assinado', 'Documento: Procuração assinada']);
    // Voltar e cancelar são livres e ficam no histórico.
    expect(mudarStatus(emContrato, 'cadastro', agora, 'Ana', 'faltou assinatura').historico.slice(-1)[0].texto).toContain('faltou assinatura');
    expect(mudarStatus(incompleto, 'cancelado', agora, 'Ana').status).toBe('cancelado');
  });

  it('pessoa física exige RG, naturalidade e nascimento para o contrato', () => {
    const c = { ...clientePronto(), tipo: 'PF' as const, documento: '52998224725', naturalidade: '', rg: '' };
    const falta = pendenciasContrato(c);
    expect(falta).toContain('Naturalidade');
    expect(falta).toContain('RG e órgão emissor');
    expect(falta).toContain('Data de nascimento');
  });

  it('atualizar cadastro não mexe em status, anexos nem base', () => {
    const c = clientePronto();
    const x = atualizarCadastro(c, { nome: 'Novo Nome', status: 'encerrado', documentos: [] } as never, agora, 'Bia');
    expect(x.nome).toBe('Novo Nome');
    expect(x.status).toBe('cadastro');
    expect(x.documentos).toHaveLength(4);
    expect(atualizarCadastro(x, { nome: 'Novo Nome' }, agora, 'Bia')).toBe(x);
  });
});
