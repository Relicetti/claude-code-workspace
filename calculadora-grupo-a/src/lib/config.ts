// Configurações da Kora usadas nos contratos (editadas por administradores).
export interface PessoaAssinatura { nome: string; email: string; telefone: string }

export interface ConfigKora {
  /** Sócio que representa a Kora no texto do contrato ("representada por seu sócio administrador …, CPF nº …"). */
  representanteContrato: { nome: string; cpf: string };
  /** Texto da procuração depois de "representada por seus sócios" (nomes, nacionalidade, RG e CPF). */
  sociosProcuracao: string;
  /** Quem assina o contrato pela Kora, na ordem (o primeiro é o principal). */
  signatariosKora: PessoaAssinatura[];
  /** As duas testemunhas padrão do contrato. */
  testemunhas: [PessoaAssinatura, PessoaAssinatura];
}

const vazia = (): PessoaAssinatura => ({ nome: '', email: '', telefone: '' });
export const configVazia = (): ConfigKora => ({
  representanteContrato: { nome: '', cpf: '' }, sociosProcuracao: '', signatariosKora: [vazia()], testemunhas: [vazia(), vazia()],
});

export function limparConfig(c: (Partial<ConfigKora> & { signatarioKora?: PessoaAssinatura }) | undefined): ConfigKora {
  const p = (x?: Partial<PessoaAssinatura>): PessoaAssinatura => ({
    nome: String(x?.nome ?? '').trim(), email: String(x?.email ?? '').trim().toLowerCase(), telefone: String(x?.telefone ?? '').trim(),
  });
  return {
    representanteContrato: { nome: String(c?.representanteContrato?.nome ?? '').trim(), cpf: String(c?.representanteContrato?.cpf ?? '').trim() },
    sociosProcuracao: String(c?.sociosProcuracao ?? '').trim().replace(/\.$/, ''),
    // Versão antiga guardava um só (signatarioKora); linhas totalmente vazias são descartadas.
    signatariosKora: (c?.signatariosKora ?? (c?.signatarioKora ? [c.signatarioKora] : [])).map(p).filter((x) => x.nome || x.email || x.telefone),
    testemunhas: [p(c?.testemunhas?.[0]), p(c?.testemunhas?.[1])],
  };
}

/** O que falta na configuração para gerar o documento. */
export function pendenciasModelo(c: ConfigKora, modelo: 'contrato' | 'procuracao'): string[] {
  if (modelo === 'contrato') return c.representanteContrato.nome && c.representanteContrato.cpf ? [] : ['Representante da Kora no contrato (nome e CPF), na aba Configurações'];
  return c.sociosProcuracao ? [] : ['Qualificação dos sócios da Kora na procuração, na aba Configurações'];
}

export function pendenciasConfig(c: ConfigKora): string[] {
  const falta: string[] = [];
  const ok = (x: PessoaAssinatura) => x.nome && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email);
  if (c.signatariosKora.length === 0) falta.push('Ao menos um signatário da Kora');
  c.signatariosKora.forEach((s, i) => { if (!ok(s)) falta.push(`Signatário da Kora ${i + 1}${s.nome ? ` (${s.nome})` : ''}: nome e e-mail`); });
  c.testemunhas.forEach((t, i) => { if (!ok(t)) falta.push(`Testemunha ${i + 1} (nome e e-mail)`); });
  return falta;
}
