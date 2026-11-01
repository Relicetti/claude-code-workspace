import { describe, expect, it } from 'vitest';
import { limparConfig, pendenciasConfig } from './config';

describe('config da Kora', () => {
  it('converte a versão antiga (um signatário) para a lista', () => {
    const c = limparConfig({ signatarioKora: { nome: 'Marcos', email: 'M@Kora.com', telefone: '' } } as never);
    expect(c.signatariosKora).toEqual([{ nome: 'Marcos', email: 'm@kora.com', telefone: '' }]);
  });

  it('vários signatários na ordem, descartando linhas vazias, e exige e-mail de todos', () => {
    const c = limparConfig({
      signatariosKora: [{ nome: 'Marcos', email: 'm@kora.com', telefone: '' }, { nome: '', email: '', telefone: '' }, { nome: 'Leandro', email: '', telefone: '' }],
      testemunhas: [{ nome: 'T1', email: 't1@x.com', telefone: '' }, { nome: 'T2', email: 't2@x.com', telefone: '' }],
    });
    expect(c.signatariosKora.map((s) => s.nome)).toEqual(['Marcos', 'Leandro']);
    expect(pendenciasConfig(c)).toEqual(['Signatário da Kora 2 (Leandro): nome e e-mail']);
  });
});
