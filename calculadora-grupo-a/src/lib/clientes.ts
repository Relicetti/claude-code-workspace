// Clientes: o que vem depois da proposta fechada. Segue o fluxo operacional Kora-Comerc:
// cadastro e documentos → contrato → assinatura → troca de titularidade → compensação (mês a mês)
// → retorno da titularidade → encerrado.
import type { Proposta, RevisaoProposta } from './propostas';

export type TipoPessoa = 'PJ' | 'PF';

export type StatusCliente =
  | 'cadastro' | 'contrato' | 'assinado' | 'titularidade' | 'compensacao' | 'retorno' | 'encerrado' | 'cancelado';

export const ETAPAS: { status: StatusCliente; rotulo: string; descricao: string }[] = [
  { status: 'cadastro', rotulo: 'Cadastro', descricao: 'Dados do cliente e documentos.' },
  { status: 'contrato', rotulo: 'Contrato', descricao: 'Contrato gerado e enviado para assinatura.' },
  { status: 'assinado', rotulo: 'Assinado', descricao: 'Contrato assinado por todas as partes.' },
  { status: 'titularidade', rotulo: 'Troca de titularidade', descricao: 'Kora executa a troca de titularidade das UCs.' },
  { status: 'compensacao', rotulo: 'Em compensação', descricao: 'Comerc distribui o saldo; controle mês a mês.' },
  { status: 'retorno', rotulo: 'Retorno da titularidade', descricao: 'Crédito acabou ou houve retirada: titularidade volta ao cliente.' },
  { status: 'encerrado', rotulo: 'Encerrado', descricao: 'Operação concluída.' },
];
export const ROTULO_STATUS: Record<StatusCliente, string> = {
  ...Object.fromEntries(ETAPAS.map((e) => [e.status, e.rotulo])) as Record<StatusCliente, string>,
  cancelado: 'Cancelado',
};

export type TipoDocumento =
  | 'cartao_cnpj' | 'contrato_social' | 'doc_representante' | 'doc_identidade' | 'comprovante_endereco'
  | 'fatura' | 'procuracao' | 'contrato_gerado' | 'procuracao_gerada' | 'contrato_assinado' | 'outro';

export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  cartao_cnpj: 'Cartão CNPJ',
  contrato_social: 'Contrato social / última alteração',
  doc_representante: 'Documento do representante legal (RG/CNH)',
  doc_identidade: 'Documento de identidade (RG/CNH)',
  comprovante_endereco: 'Comprovante de endereço',
  fatura: 'Fatura de energia recente',
  procuracao: 'Procuração assinada',
  contrato_gerado: 'Contrato gerado (para assinatura)',
  procuracao_gerada: 'Procuração gerada (para assinatura)',
  contrato_assinado: 'Contrato assinado',
  outro: 'Outro',
};

/** Documentos exigidos para sair do cadastro (o contrato assinado é exigido depois). */
export function documentosObrigatorios(tipo: TipoPessoa): TipoDocumento[] {
  return tipo === 'PJ'
    ? ['cartao_cnpj', 'contrato_social', 'doc_representante', 'fatura']
    : ['doc_identidade', 'comprovante_endereco', 'fatura'];
}

export interface Endereco {
  logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string; cep: string;
}

export type Sexo = 'M' | 'F';

export interface Representante {
  nome: string; cpf: string; nascimento: string; cargo: string; email: string; telefone: string; sexo: Sexo;
}

export interface Contato { nome: string; email: string; telefone: string }

export interface UnidadeConsumidora {
  numero: string;
  distribuidora: string;
  subgrupo: string;
  modalidade: string;
  /** kWh/mês de crédito alocado na UC. */
  energiaKWhMes: number;
  /** Titular atual na distribuidora (vazio = o próprio cliente). */
  titular: string;
  titularDocumento: string;
  /** Endereço da UC como está na fatura. */
  endereco: string;
  /** Ex.: "Grupo B – classe B3 Comercial". */
  classificacao: string;
  /** Ex.: "trifásico 200A". */
  ligacao: string;
  consumoMedioKWh: number;
  /** Ex.: "jun/2026 a out/2026". */
  periodoConsumo: string;
}

/** Condições que vão para o contrato (vêm da proposta, mas podem ser ajustadas antes de gerar). */
export interface CondicoesContrato {
  /** R$ por kWh compensado pago à Kora. */
  precoKWh: number;
  /** Prazo máximo para usar o saldo (meses a partir da injeção). */
  prazoSaldoMeses: number;
  /** Nome curto da distribuidora no texto ("Copel"). */
  distribuidoraNome: string;
  /** Razão social da distribuidora ("Copel Distribuição S.A."). */
  distribuidoraRazao: string;
}

export type PapelAssinatura = 'cliente' | 'kora' | 'testemunha';

export interface SignatarioEnvio {
  papel: PapelAssinatura;
  nome: string;
  email: string;
  telefone: string;
  /** Preenchidos ao consultar a Autentique. */
  assinadoEm: string | null;
  recusadoEm: string | null;
  /** Id da assinatura na Autentique. */
  publicId: string;
}

/** Um documento enviado para assinatura eletrônica. */
export interface EnvioAssinatura {
  documento: 'contrato' | 'procuracao';
  autentiqueId: string;
  /** Documento gerado (anexo) que foi enviado. */
  arquivoId: string;
  enviadoEm: string;
  enviadoPor: string;
  sandbox: boolean;
  signatarios: SignatarioEnvio[];
  /** Quando todos assinaram e o PDF assinado foi anexado. */
  concluidoEm: string | null;
  cancelado: boolean;
}

export interface DocumentoCliente {
  id: string;
  tipo: TipoDocumento;
  nomeArquivo: string;
  mime: string;
  tamanho: number;
  enviadoEm: string;
  enviadoPor: string;
}

export interface EventoCliente { em: string; por: string; texto: string }

/** Dados cadastrais: o que a tela de cadastro edita. */
export interface Cadastro {
  tipo: TipoPessoa;
  /** Razão social (PJ) ou nome completo (PF). */
  nome: string;
  nomeFantasia: string;
  /** CNPJ (PJ) ou CPF (PF), só dígitos. */
  documento: string;
  inscricaoEstadual: string;
  /** PF: data de nascimento (AAAA-MM-DD), sexo (para a concordância no contrato), nacionalidade, naturalidade e RG. */
  nascimento: string;
  sexo: Sexo;
  nacionalidade: string;
  naturalidade: string;
  rg: string;
  rgOrgao: string;
  email: string;
  telefone: string;
  endereco: Endereco;
  /** Só PJ. */
  representante: Representante;
  contatoFinanceiro: Contato;
  ucs: UnidadeConsumidora[];
  observacoes: string;
}

export interface Cliente extends Cadastro {
  id: string;          // CLI-0001
  status: StatusCliente;
  criadoEm: string;
  atualizadoEm: string;
  /** Proposta fechada que originou o cliente. */
  proposta: { numero: string; revisao: number } | null;
  /** Retrato da revisão fechada: base contratada para o contrato e para o previsto mês a mês. */
  base: RevisaoProposta | null;
  documentos: DocumentoCliente[];
  contrato: CondicoesContrato;
  assinaturas: EnvioAssinatura[];
  historico: EventoCliente[];
}

const ENDERECO_VAZIO: Endereco = { logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', cep: '' };
const REPRESENTANTE_VAZIO: Representante = { nome: '', cpf: '', nascimento: '', cargo: '', email: '', telefone: '', sexo: 'M' };

export const UC_VAZIA: UnidadeConsumidora = {
  numero: '', distribuidora: '', subgrupo: '', modalidade: '', energiaKWhMes: 0, titular: '', titularDocumento: '',
  endereco: '', classificacao: '', ligacao: '', consumoMedioKWh: 0, periodoConsumo: '',
};

/** Nome curto e razão social das distribuidoras mais comuns (o resto o usuário preenche). */
export const DISTRIBUIDORA_CONTRATO: Record<string, { nome: string; razao: string }> = {
  'Copel-DIS': { nome: 'Copel', razao: 'Copel Distribuição S.A.' },
  'Celesc-DIS': { nome: 'Celesc', razao: 'Celesc Distribuição S.A.' },
  'Cemig-D': { nome: 'Cemig', razao: 'Cemig Distribuição S.A.' },
  'CPFL Paulista': { nome: 'CPFL Paulista', razao: 'Companhia Paulista de Força e Luz' },
  'CPFL Piratininga': { nome: 'CPFL Piratininga', razao: 'Companhia Piratininga de Força e Luz' },
  RGE: { nome: 'RGE', razao: 'RGE Sul Distribuidora de Energia S.A.' },
  Light: { nome: 'Light', razao: 'Light Serviços de Eletricidade S.A.' },
  'Enel SP': { nome: 'Enel SP', razao: 'Eletropaulo Metropolitana Eletricidade de São Paulo S.A.' },
  'Enel RJ': { nome: 'Enel RJ', razao: 'Ampla Energia e Serviços S.A.' },
  'Enel CE': { nome: 'Enel CE', razao: 'Companhia Energética do Ceará' },
  'EDP SP': { nome: 'EDP', razao: 'EDP São Paulo Distribuição de Energia S.A.' },
  'EDP ES': { nome: 'EDP', razao: 'EDP Espírito Santo Distribuição de Energia S.A.' },
  'Energisa MS': { nome: 'Energisa', razao: 'Energisa Mato Grosso do Sul – Distribuidora de Energia S.A.' },
  'Energisa MT': { nome: 'Energisa', razao: 'Energisa Mato Grosso – Distribuidora de Energia S.A.' },
  'Neoenergia Coelba': { nome: 'Coelba', razao: 'Companhia de Eletricidade do Estado da Bahia – Coelba' },
  'Neoenergia Elektro': { nome: 'Elektro', razao: 'Elektro Redes S.A.' },
  'Neoenergia Pernambuco': { nome: 'Neoenergia Pernambuco', razao: 'Companhia Energética de Pernambuco – Celpe' },
  'Neoenergia Cosern': { nome: 'Cosern', razao: 'Companhia Energética do Rio Grande do Norte – Cosern' },
};

export function condicoesPadrao(rev: RevisaoProposta | null, distribuidora: string): CondicoesContrato {
  const d = DISTRIBUIDORA_CONTRATO[distribuidora] ?? { nome: distribuidora, razao: distribuidora };
  return {
    precoKWh: rev ? Number(rev.resumo.tarifaKora.toFixed(4)) : 0,
    prazoSaldoMeses: rev ? rev.operacao.prazoMeses : 12,
    distribuidoraNome: d.nome,
    distribuidoraRazao: d.razao,
  };
}

export function cadastroVazio(): Cadastro {
  return {
    tipo: 'PJ', nome: '', nomeFantasia: '', documento: '', inscricaoEstadual: '', nascimento: '', sexo: 'M',
    nacionalidade: 'brasileira', naturalidade: '', rg: '', rgOrgao: '', email: '', telefone: '',
    endereco: { ...ENDERECO_VAZIO }, representante: { ...REPRESENTANTE_VAZIO },
    contatoFinanceiro: { nome: '', email: '', telefone: '' }, ucs: [], observacoes: '',
  };
}

export const soDigitos = (s: string) => (s ?? '').replace(/\D/g, '');

export function cpfValido(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    const soma = [...d.slice(0, n)].reduce((s, c, i) => s + Number(c) * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cnpjValido(cnpj: string): boolean {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = [...d.slice(0, n)].reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

export const formatarCnpj = (s: string) => soDigitos(s).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
export const formatarCpf = (s: string) => soDigitos(s).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
export const formatarDocumento = (tipo: TipoPessoa, s: string) => (tipo === 'PJ' ? formatarCnpj(s) : formatarCpf(s));

/** Próximo número sequencial: CLI-0001, CLI-0002… */
export function proximoIdCliente(existentes: string[]): string {
  const ultimo = existentes.reduce((m, id) => Math.max(m, Number(id.replace(/^CLI-/, '')) || 0), 0);
  return `CLI-${String(ultimo + 1).padStart(4, '0')}`;
}

const evento = (agora: Date, por: string, texto: string): EventoCliente => ({ em: agora.toISOString(), por, texto });

/** UCs da proposta ("123, 456" ou "123 / 456"); o crédito mensal é dividido igualmente entre elas. */
function ucsDaProposta(rev: RevisaoProposta): UnidadeConsumidora[] {
  const numeros = (rev.dados.uc ?? '').split(/[,;/\n]+/).map((s) => s.trim()).filter(Boolean);
  const mensal = rev.op.abatimentoMensalKWh;
  const lista = numeros.length > 0 ? numeros : [''];
  return lista.map((numero, i) => ({
    ...UC_VAZIA,
    numero,
    distribuidora: rev.entrada.distribuidora,
    subgrupo: rev.entrada.subgrupo,
    modalidade: rev.entrada.modalidadeTarifaria,
    // O último fecha a conta para a soma bater com o crédito mensal.
    energiaKWhMes: i < lista.length - 1 ? Math.round(mensal / lista.length) : mensal - Math.round(mensal / lista.length) * (lista.length - 1),
  }));
}

/** Fecha a proposta: cria o cliente com o que a proposta já tem (nome, CNPJ, UCs) e o retrato da revisão. */
export function clienteDaProposta(lista: Cliente[], proposta: Proposta, revisao: number, agora: Date, por: string): Cliente {
  const rev = proposta.revisoes.find((r) => r.revisao === revisao);
  if (!rev) throw new Error(`Revisão ${revisao} da ${proposta.numero} não encontrada.`);
  const ja = lista.find((c) => c.proposta?.numero === proposta.numero && c.status !== 'cancelado');
  if (ja) throw new Error(`A proposta ${proposta.numero} já foi fechada no cliente ${ja.id}.`);
  const doc = soDigitos(rev.dados.cnpj);
  const iso = agora.toISOString();
  return {
    ...cadastroVazio(),
    tipo: doc.length === 11 ? 'PF' : 'PJ',
    nome: rev.dados.cliente.trim(),
    documento: doc,
    ucs: ucsDaProposta(rev),
    id: proximoIdCliente(lista.map((c) => c.id)),
    status: 'cadastro',
    criadoEm: iso,
    atualizadoEm: iso,
    proposta: { numero: proposta.numero, revisao },
    base: rev,
    documentos: [],
    contrato: condicoesPadrao(rev, rev.entrada.distribuidora),
    assinaturas: [],
    historico: [evento(agora, por, `Cliente criado a partir da proposta ${proposta.numero} Rev. ${String(revisao).padStart(2, '0')}.`)],
  };
}

/** Cliente sem proposta (cadastro manual). */
export function clienteNovo(lista: Cliente[], cadastro: Partial<Cadastro>, agora: Date, por: string): Cliente {
  const iso = agora.toISOString();
  return {
    ...cadastroVazio(), ...limparCadastro(cadastro),
    id: proximoIdCliente(lista.map((c) => c.id)), status: 'cadastro', criadoEm: iso, atualizadoEm: iso,
    proposta: null, base: null, documentos: [], assinaturas: [],
    contrato: condicoesPadrao(null, cadastro.ucs?.[0]?.distribuidora ?? ''),
    historico: [evento(agora, por, 'Cliente cadastrado.')],
  };
}

const CAMPOS_CADASTRO: (keyof Cadastro)[] = [
  'tipo', 'nome', 'nomeFantasia', 'documento', 'inscricaoEstadual', 'nascimento', 'sexo', 'nacionalidade', 'naturalidade',
  'rg', 'rgOrgao', 'email', 'telefone',
  'endereco', 'representante', 'contatoFinanceiro', 'ucs', 'observacoes',
];

/** Só os campos cadastrais, com documentos/CEP em dígitos — o resto (status, anexos, histórico) não se edita por aqui. */
export function limparCadastro(p: Partial<Cadastro>): Partial<Cadastro> {
  const out: Partial<Cadastro> = {};
  for (const k of CAMPOS_CADASTRO) if (p[k] !== undefined) (out as Record<string, unknown>)[k] = p[k];
  if (out.tipo !== undefined && out.tipo !== 'PJ' && out.tipo !== 'PF') delete out.tipo;
  if (out.documento !== undefined) out.documento = soDigitos(out.documento);
  if (out.endereco) out.endereco = { ...ENDERECO_VAZIO, ...out.endereco, cep: soDigitos(out.endereco.cep ?? '') };
  if (out.representante) out.representante = { ...REPRESENTANTE_VAZIO, ...out.representante, cpf: soDigitos(out.representante.cpf ?? '') };
  if (out.sexo !== undefined && out.sexo !== 'M' && out.sexo !== 'F') delete out.sexo;
  if (out.ucs) {
    out.ucs = out.ucs.map((u) => ({
      ...UC_VAZIA, ...u, numero: String(u.numero ?? '').trim(),
      energiaKWhMes: Number(u.energiaKWhMes) || 0, consumoMedioKWh: Number(u.consumoMedioKWh) || 0,
    }));
  }
  return out;
}

export function atualizarCadastro(c: Cliente, patch: Partial<Cadastro>, agora: Date, por: string): Cliente {
  const limpo = limparCadastro(patch);
  const mudou = (Object.keys(limpo) as (keyof Cadastro)[]).filter((k) => JSON.stringify(limpo[k]) !== JSON.stringify(c[k]));
  if (mudou.length === 0) return c;
  return { ...c, ...limpo, atualizadoEm: agora.toISOString(), historico: [...c.historico, evento(agora, por, 'Cadastro atualizado.')] };
}

export function atualizarCondicoes(c: Cliente, patch: Partial<CondicoesContrato>, agora: Date, por: string): Cliente {
  const novo: CondicoesContrato = {
    precoKWh: patch.precoKWh !== undefined ? Number(patch.precoKWh) || 0 : c.contrato.precoKWh,
    prazoSaldoMeses: patch.prazoSaldoMeses !== undefined ? Math.round(Number(patch.prazoSaldoMeses)) || 0 : c.contrato.prazoSaldoMeses,
    distribuidoraNome: patch.distribuidoraNome !== undefined ? String(patch.distribuidoraNome).trim() : c.contrato.distribuidoraNome,
    distribuidoraRazao: patch.distribuidoraRazao !== undefined ? String(patch.distribuidoraRazao).trim() : c.contrato.distribuidoraRazao,
  };
  if (JSON.stringify(novo) === JSON.stringify(c.contrato)) return c;
  return { ...c, contrato: novo, atualizadoEm: agora.toISOString(), historico: [...c.historico, evento(agora, por, 'Condições do contrato atualizadas.')] };
}

/** O que falta para gerar o contrato e a procuração (dados que entram no texto). */
export function pendenciasContrato(c: Cliente): string[] {
  const p: string[] = [];
  if (!c.nome.trim()) p.push(c.tipo === 'PJ' ? 'Razão social' : 'Nome completo');
  if (c.tipo === 'PJ' ? !cnpjValido(c.documento) : !cpfValido(c.documento)) p.push(c.tipo === 'PJ' ? 'CNPJ válido' : 'CPF válido');
  const e = c.endereco;
  if (!e.logradouro.trim() || !e.numero.trim() || !e.cidade.trim() || !e.uf.trim() || soDigitos(e.cep).length !== 8) p.push('Endereço completo (rua, número, cidade, UF e CEP)');
  if (c.tipo === 'PF') {
    if (!c.nacionalidade.trim()) p.push('Nacionalidade');
    if (!c.naturalidade.trim()) p.push('Naturalidade');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.nascimento)) p.push('Data de nascimento');
    if (!c.rg.trim() || !c.rgOrgao.trim()) p.push('RG e órgão emissor');
  } else {
    if (!c.representante.nome.trim()) p.push('Nome do representante legal');
    if (!cpfValido(c.representante.cpf)) p.push('CPF válido do representante legal');
  }
  if (c.ucs.length === 0) p.push('Ao menos uma UC');
  c.ucs.forEach((u, i) => {
    const n = `UC ${u.numero || i + 1}`;
    if (!u.numero.trim()) p.push(`Número da UC ${i + 1}`);
    if (!u.endereco.trim()) p.push(`${n}: endereço`);
    if (!u.classificacao.trim()) p.push(`${n}: grupo/classe`);
    if (!(u.consumoMedioKWh > 0)) p.push(`${n}: consumo médio de referência`);
  });
  if (!(c.contrato.precoKWh > 0)) p.push('Preço por kWh');
  if (!(c.contrato.prazoSaldoMeses > 0)) p.push('Prazo máximo do saldo');
  if (!c.contrato.distribuidoraNome || !c.contrato.distribuidoraRazao) p.push('Nome e razão social da distribuidora');
  return p;
}

/** O que falta para o cliente poder entrar em `destino`. Vazio = pode. */
export function pendencias(c: Cliente, destino: StatusCliente): string[] {
  const p: string[] = [];
  const ordem = ETAPAS.findIndex((e) => e.status === destino);
  if (destino === 'cancelado' || destino === 'cadastro') return p;
  // Sair do cadastro: dados e documentos completos.
  if (ordem >= 1) {
    if (!c.nome.trim()) p.push(c.tipo === 'PJ' ? 'Razão social' : 'Nome completo');
    if (c.tipo === 'PJ' ? !cnpjValido(c.documento) : !cpfValido(c.documento)) p.push(c.tipo === 'PJ' ? 'CNPJ válido' : 'CPF válido');
    const e = c.endereco;
    if (!e.logradouro.trim() || !e.numero.trim() || !e.cidade.trim() || !e.uf.trim() || soDigitos(e.cep).length !== 8) p.push('Endereço completo (rua, número, cidade, UF e CEP)');
    if (!c.email.trim() && !c.contatoFinanceiro.email.trim()) p.push('E-mail de contato');
    if (c.tipo === 'PJ') {
      if (!c.representante.nome.trim()) p.push('Nome do representante legal');
      if (!cpfValido(c.representante.cpf)) p.push('CPF válido do representante legal');
      if (!c.representante.email.trim()) p.push('E-mail do representante legal (para a assinatura)');
    }
    if (c.ucs.length === 0 || c.ucs.some((u) => !u.numero.trim())) p.push('Número de todas as UCs');
    if (!c.base) p.push('Proposta fechada (base contratada)');
    for (const t of documentosObrigatorios(c.tipo)) {
      if (!c.documentos.some((d) => d.tipo === t)) p.push(`Documento: ${ROTULO_DOCUMENTO[t]}`);
    }
  }
  if (ordem >= 1) for (const x of pendenciasContrato(c)) if (!p.includes(x)) p.push(x);
  if (ordem >= 2) {
    if (!c.documentos.some((d) => d.tipo === 'contrato_assinado')) p.push(`Documento: ${ROTULO_DOCUMENTO.contrato_assinado}`);
    if (!c.documentos.some((d) => d.tipo === 'procuracao')) p.push(`Documento: ${ROTULO_DOCUMENTO.procuracao}`);
  }
  return p;
}

/** Muda a etapa. Avançar exige as pendências resolvidas; voltar ou cancelar é livre (fica no histórico). */
export function mudarStatus(c: Cliente, destino: StatusCliente, agora: Date, por: string, motivo = ''): Cliente {
  if (destino === c.status) return c;
  const de = ETAPAS.findIndex((e) => e.status === c.status);
  const para = ETAPAS.findIndex((e) => e.status === destino);
  if (destino !== 'cancelado' && para < 0) throw new Error(`Etapa desconhecida: ${destino}.`);
  if (c.status !== 'cancelado' && para > de) {
    const falta = pendencias(c, destino);
    if (falta.length > 0) throw new Error(`Falta para "${ROTULO_STATUS[destino]}": ${falta.join('; ')}.`);
  }
  const texto = `Etapa: ${ROTULO_STATUS[c.status]} → ${ROTULO_STATUS[destino]}${motivo.trim() ? ` (${motivo.trim()})` : ''}.`;
  return { ...c, status: destino, atualizadoEm: agora.toISOString(), historico: [...c.historico, evento(agora, por, texto)] };
}

export function anexarDocumento(c: Cliente, doc: DocumentoCliente, agora: Date): Cliente {
  return {
    ...c, documentos: [...c.documentos, doc], atualizadoEm: agora.toISOString(),
    historico: [...c.historico, evento(agora, doc.enviadoPor, `Anexou ${ROTULO_DOCUMENTO[doc.tipo]}: ${doc.nomeArquivo}.`)],
  };
}

export function removerDocumento(c: Cliente, docId: string, agora: Date, por: string): Cliente {
  const doc = c.documentos.find((d) => d.id === docId);
  if (!doc) throw new Error('Documento não encontrado.');
  return {
    ...c, documentos: c.documentos.filter((d) => d.id !== docId), atualizadoEm: agora.toISOString(),
    historico: [...c.historico, evento(agora, por, `Removeu ${ROTULO_DOCUMENTO[doc.tipo]}: ${doc.nomeArquivo}.`)],
  };
}

export const TIPOS_ARQUIVO_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
export const TAMANHO_MAX_ARQUIVO = 20 * 1024 * 1024;
