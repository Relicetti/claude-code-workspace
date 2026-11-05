// Leitura de documentos do cliente (RG/CNH, cartão CNPJ, contrato social, fatura, comprovante) por IA.
// O servidor devolve uma `Extracao`; aqui ela vira sugestão no formulário: só preenche campo vazio,
// e o que diverge do que já está digitado é listado para a pessoa conferir (nunca sobrescreve).
import {
  DISTRIBUIDORA_CONTRATO, soDigitos, UC_VAZIA, type Cadastro, type CondicoesContrato, type TipoPessoa, type UnidadeConsumidora,
} from './clientes';

export type TipoExtraido = 'rg_cnh' | 'cartao_cnpj' | 'contrato_social' | 'fatura' | 'comprovante_endereco' | 'outro';

export interface ConsumoMes { mes: string; kWh: number }

export interface UCExtraida {
  numero: string; titular: string; titularDocumento: string; endereco: string; classificacao: string; ligacao: string;
  subgrupo: string; modalidade: string; distribuidoraRazao: string; historico: ConsumoMes[];
}

/** Tudo string; vazio = não aparece no documento. */
export interface Extracao {
  tipoDetectado: TipoExtraido;
  pessoa: { nome: string; cpf: string; rg: string; rgOrgao: string; nascimento: string; sexo: 'M' | 'F' | ''; nacionalidade: string; naturalidade: string };
  empresa: { razaoSocial: string; nomeFantasia: string; cnpj: string; inscricaoEstadual: string };
  endereco: { logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string; cep: string };
  representante: { nome: string; cpf: string; cargo: string };
  email: string;
  telefone: string;
  ucs: UCExtraida[];
  observacoes: string;
}

export type FormCliente = Cadastro & { contrato: CondicoesContrato };

export interface ResultadoMescla { form: FormCliente; preenchidos: string[]; divergencias: string[] }

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (aaaamm: string) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]}/${aaaamm.slice(0, 4)}`;

/** Média dos últimos até 12 meses do histórico da fatura (kWh) e o período usado. */
export function consumoMedio(historico: ConsumoMes[]): { media: number; periodo: string } | null {
  const validos = historico
    .filter((h) => /^\d{4}-(0[1-9]|1[0-2])$/.test(h.mes) && Number.isFinite(h.kWh) && h.kWh >= 0)
    .sort((a, b) => a.mes.localeCompare(b.mes));
  const unicos = validos.filter((h, i) => i === validos.length - 1 || validos[i + 1].mes !== h.mes).slice(-12);
  if (unicos.length === 0) return null;
  const media = Math.round(unicos.reduce((s, h) => s + h.kWh, 0) / unicos.length);
  const periodo = unicos.length === 1 ? mesCurto(unicos[0].mes) : `${mesCurto(unicos[0].mes)} a ${mesCurto(unicos[unicos.length - 1].mes)}`;
  return { media, periodo };
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Nome curto da distribuidora a partir da razão social da fatura. */
export function distribuidoraDaRazao(razao: string): { nome: string; razao: string } | null {
  const r = normal(razao);
  if (!r) return null;
  const conhecida = Object.values(DISTRIBUIDORA_CONTRATO).find((d) => normal(d.razao) === r)
    ?? Object.values(DISTRIBUIDORA_CONTRATO).find((d) => r.includes(normal(d.nome)));
  if (conhecida) return conhecida;
  const primeira = razao.trim().split(/\s+/)[0];
  return { nome: primeira.charAt(0).toUpperCase() + primeira.slice(1).toLowerCase(), razao: razao.trim() };
}

export function mesclarExtracao(form: FormCliente, e: Extracao, rotuloDoc = 'documento'): ResultadoMescla {
  const f: FormCliente = structuredClone(form);
  const preenchidos: string[] = [];
  const divergencias: string[] = [];
  const tipo: TipoPessoa = f.tipo;

  /** Preenche se vazio; se já tem valor diferente, só avisa. `digitos` compara só os números (CPF, CEP…). */
  const campo = (rotulo: string, atual: string, novo: string, gravar: (v: string) => void, digitos = false) => {
    const v = (digitos ? soDigitos(novo) : novo).trim();
    if (!v) return;
    const a = (atual ?? '').trim();
    if (!a) { gravar(v); preenchidos.push(rotulo); return; }
    const igual = digitos ? soDigitos(a) === soDigitos(v) : normal(a) === normal(v);
    if (!igual) divergencias.push(`${rotulo}: cadastro "${a}", ${rotuloDoc} "${v}"`);
  };
  const data = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');

  // Documento de pessoa: em PF é o próprio cliente; em PJ é o representante legal.
  const p = e.pessoa;
  if (tipo === 'PF') {
    campo('Nome', f.nome, p.nome.toUpperCase(), (v) => { f.nome = v; });
    campo('CPF', f.documento, p.cpf, (v) => { f.documento = v; }, true);
    campo('RG', f.rg, p.rg, (v) => { f.rg = v; });
    campo('Órgão emissor do RG', f.rgOrgao, p.rgOrgao, (v) => { f.rgOrgao = v; });
    campo('Data de nascimento', f.nascimento, data(p.nascimento), (v) => { f.nascimento = v; });
    campo('Nacionalidade', f.nacionalidade, p.nacionalidade, (v) => { f.nacionalidade = v; });
    campo('Naturalidade', f.naturalidade, p.naturalidade, (v) => { f.naturalidade = v; });
    // Sexo só vem quando está impresso (CIN, CNH nova); o cadastro sempre tem um valor, então o documento prevalece.
    if (p.sexo && p.sexo !== f.sexo) { f.sexo = p.sexo; preenchidos.push('Sexo (pelo documento)'); }
  } else {
    const r = f.representante;
    const nomeRep = (e.representante.nome || p.nome).toUpperCase();
    campo('Representante: nome', r.nome, nomeRep, (v) => { r.nome = v; });
    campo('Representante: CPF', r.cpf, e.representante.cpf || p.cpf, (v) => { r.cpf = v; }, true);
    campo('Representante: cargo', r.cargo, e.representante.cargo.toLowerCase(), (v) => { r.cargo = v; });
    campo('Representante: nascimento', r.nascimento, data(p.nascimento), (v) => { r.nascimento = v; });
    if (p.sexo && p.sexo !== r.sexo && normal(p.nome) === normal(r.nome)) { r.sexo = p.sexo; preenchidos.push('Representante: sexo (pelo documento)'); }
    const em = e.empresa;
    campo('Razão social', f.nome, em.razaoSocial.toUpperCase(), (v) => { f.nome = v; });
    campo('Nome fantasia', f.nomeFantasia, em.nomeFantasia, (v) => { f.nomeFantasia = v; });
    campo('CNPJ', f.documento, em.cnpj, (v) => { f.documento = v; }, true);
    campo('Inscrição estadual', f.inscricaoEstadual, em.inscricaoEstadual, (v) => { f.inscricaoEstadual = v; });
  }

  const end = e.endereco;
  const fe = f.endereco;
  campo('Endereço: rua', fe.logradouro, end.logradouro, (v) => { fe.logradouro = v; });
  campo('Endereço: número', fe.numero, end.numero, (v) => { fe.numero = v; });
  campo('Endereço: complemento', fe.complemento, end.complemento, (v) => { fe.complemento = v; });
  campo('Endereço: bairro', fe.bairro, end.bairro, (v) => { fe.bairro = v; });
  campo('Endereço: cidade', fe.cidade, end.cidade, (v) => { fe.cidade = v; });
  campo('Endereço: UF', fe.uf, end.uf.toUpperCase(), (v) => { fe.uf = v; });
  campo('Endereço: CEP', fe.cep, end.cep, (v) => { fe.cep = v; }, true);
  campo('E-mail', f.email, e.email.toLowerCase(), (v) => { f.email = v; });
  campo('Telefone', f.telefone, e.telefone, (v) => { f.telefone = v; });

  for (const ux of e.ucs) {
    const num = soDigitos(ux.numero);
    if (!num) continue;
    let i = f.ucs.findIndex((u) => soDigitos(u.numero) === num);
    if (i < 0) i = f.ucs.findIndex((u) => !u.numero.trim());
    if (i < 0) { f.ucs.push({ ...UC_VAZIA }); i = f.ucs.length - 1; }
    const u: UnidadeConsumidora = f.ucs[i];
    const r = `UC ${num}`;
    campo(`${r}: número`, u.numero, ux.numero.trim(), (v) => { u.numero = v; });
    campo(`${r}: endereço`, u.endereco, ux.endereco, (v) => { u.endereco = v; });
    campo(`${r}: grupo/classe`, u.classificacao, ux.classificacao, (v) => { u.classificacao = v; });
    campo(`${r}: ligação`, u.ligacao, ux.ligacao, (v) => { u.ligacao = v; });
    campo(`${r}: subgrupo`, u.subgrupo, ux.subgrupo, (v) => { u.subgrupo = v; });
    campo(`${r}: modalidade`, u.modalidade, ux.modalidade, (v) => { u.modalidade = v; });
    // Titular: só registra se for outra pessoa/empresa (vazio no cadastro = o próprio cliente).
    const docTitular = soDigitos(ux.titularDocumento);
    if (docTitular && docTitular !== soDigitos(f.documento) && !u.titular.trim()) {
      u.titular = ux.titular.trim().toUpperCase();
      u.titularDocumento = `${docTitular.length === 14 ? 'CNPJ' : 'CPF'} ${ux.titularDocumento.trim()}`;
      preenchidos.push(`${r}: titular (outro que não o cliente)`);
    }
    const cm = consumoMedio(ux.historico);
    if (cm && !(u.consumoMedioKWh > 0)) {
      u.consumoMedioKWh = cm.media;
      if (!u.periodoConsumo.trim()) u.periodoConsumo = cm.periodo;
      preenchidos.push(`${r}: consumo médio (${cm.media.toLocaleString('pt-BR')} kWh/mês, ${cm.periodo})`);
    } else if (cm && Math.abs(u.consumoMedioKWh - cm.media) > Math.max(1, cm.media * 0.02)) {
      divergencias.push(`${r}: consumo médio no cadastro ${Math.round(u.consumoMedioKWh)} kWh, ${rotuloDoc} ${cm.media} kWh (${cm.periodo})`);
    }
    const dist = distribuidoraDaRazao(ux.distribuidoraRazao);
    if (dist) {
      campo('Distribuidora (nome no contrato)', f.contrato.distribuidoraNome, dist.nome, (v) => { f.contrato.distribuidoraNome = v; });
      campo('Distribuidora (razão social)', f.contrato.distribuidoraRazao, dist.razao, (v) => { f.contrato.distribuidoraRazao = v; });
    }
  }

  return { form: f, preenchidos, divergencias };
}

/** Só lê PDF e imagem (a API não aceita HEIC nem Word). */
export const MIME_LEGIVEL_IA = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
