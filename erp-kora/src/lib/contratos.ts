// Dados que preenchem os modelos server/modelos/contrato.docx e procuracao.docx.
// Os modelos vieram dos documentos da Kora; os campos estão entre chaves ({nome}, {#ucs}…{/ucs}).
import { formatarCnpj, formatarCpf, soDigitos, type Cliente, type Endereco } from './clientes';
import type { ConfigKora } from './config';

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
  'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n < 20) return UNIDADES[n];
  if (n < 100) return DEZENAS[Math.floor(n / 10)] + (n % 10 ? ` e ${UNIDADES[n % 10]}` : '');
  if (n === 100) return 'cem';
  return CENTENAS[Math.floor(n / 100)] + (n % 100 ? ` e ${ate999(n % 100)}` : '');
}

/** Inteiro por extenso (até 999.999.999). */
export function extenso(n: number): string {
  n = Math.round(n);
  if (n < 1000) return ate999(n);
  if (n < 1_000_000) {
    const mil = Math.floor(n / 1000), resto = n % 1000;
    const cab = mil === 1 ? 'mil' : `${ate999(mil)} mil`;
    if (!resto) return cab;
    return `${cab}${resto < 100 || resto % 100 === 0 ? ' e' : ''} ${ate999(resto)}`;
  }
  const mi = Math.floor(n / 1_000_000), resto = n % 1_000_000;
  const cab = `${ate999(mi)} ${mi === 1 ? 'milhão' : 'milhões'}`;
  if (!resto) return cab;
  return `${cab}${resto < 100 || (resto < 1000 && resto % 100 === 0) ? ' e' : ''} ${extenso(resto)}`;
}

const plural = (n: number, um: string, varios: string) => `${extenso(n)} ${n === 1 ? um : varios}`;

/**
 * Valor em reais por extenso, com até 4 casas: 0,60 → "sessenta centavos";
 * 0,6123 → "sessenta e um centavos e vinte e três centésimos de centavo".
 */
export function reaisExtenso(valor: number): string {
  const decimos = Math.round(valor * 10000);
  const reais = Math.floor(decimos / 10000);
  const centavos = Math.floor((decimos % 10000) / 100);
  const fracao = decimos % 100;
  const partes: string[] = [];
  if (reais) partes.push(plural(reais, 'real', 'reais'));
  if (centavos) partes.push(plural(centavos, 'centavo', 'centavos'));
  if (fracao) {
    partes.push(fracao % 10 === 0
      ? plural(fracao / 10, 'décimo de centavo', 'décimos de centavo')
      : plural(fracao, 'centésimo de centavo', 'centésimos de centavo'));
  }
  if (partes.length === 0) return 'zero real';
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/** 0,6 → "0,60"; 0,6123 → "0,6123" (mínimo 2 casas, máximo 4). */
export const precoTexto = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const dataExtenso = (d: Date) => `${d.getDate() === 1 ? '1º' : d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

const cepTexto = (cep: string) => soDigitos(cep).replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2-$3');

export function enderecoTexto(e: Endereco): string {
  const rua = `${e.logradouro.trim()}, nº ${e.numero.trim()}${e.complemento.trim() ? `, ${e.complemento.trim()}` : ''}`;
  return `${rua}, Bairro ${e.bairro.trim()}, CEP ${cepTexto(e.cep)}, ${e.cidade.trim()}/${e.uf.trim().toUpperCase()}`;
}

/** Concordância de gênero: o/a. */
const g = (sexo: 'M' | 'F', m: string, f: string) => (sexo === 'F' ? f : m);

/** Qualificação depois do nome, como no modelo: ", brasileiro, natural de …, residente e domiciliado na …". */
export function qualificacao(c: Cliente, procuracao = false): string {
  if (c.tipo === 'PF') {
    const s = c.sexo;
    const nac = c.nacionalidade.trim().toLowerCase() === 'brasileira' || c.nacionalidade.trim().toLowerCase() === 'brasileiro'
      ? g(s, 'brasileiro', 'brasileira') : c.nacionalidade.trim();
    return `${procuracao ? ', pessoa física' : ''}, ${nac}, natural de ${c.naturalidade.trim()}, ${g(s, 'nascido', 'nascida')} em ${dataBR(c.nascimento)}, `
      + `${g(s, 'portador', 'portadora')} do RG nº ${c.rg.trim()} ${c.rgOrgao.trim()}, ${g(s, 'inscrito', 'inscrita')} no CPF sob nº ${formatarCpf(c.documento)}, `
      + `${g(s, 'residente e domiciliado', 'residente e domiciliada')} na ${enderecoTexto(c.endereco)}`;
  }
  const r = c.representante;
  const cargo = r.cargo.trim() ? `${g(r.sexo, 'seu', 'sua')} ${r.cargo.trim()}` : g(r.sexo, 'seu representante legal', 'sua representante legal');
  return `, pessoa jurídica de direito privado, inscrita no CNPJ sob nº ${formatarCnpj(c.documento)}, com sede na ${enderecoTexto(c.endereco)}, `
    + `neste ato representada por ${cargo} ${r.nome.trim().toUpperCase()}, inscrit${g(r.sexo, 'o', 'a')} no CPF sob nº ${formatarCpf(r.cpf)}`;
}

export function descricaoUC(c: Cliente, i: number): string {
  const u = c.ucs[i];
  const titular = u.titular.trim() || c.nome.trim().toUpperCase();
  const docTitular = u.titularDocumento.trim()
    || (c.tipo === 'PF' ? `CPF ${formatarCpf(c.documento)}` : `CNPJ ${formatarCnpj(c.documento)}`);
  const partes = [
    `titular ${titular}, ${docTitular}`,
    u.endereco.trim(),
    [u.classificacao.trim(), u.ligacao.trim()].filter(Boolean).join(', '),
    `consumo médio de referência de ${Math.round(u.consumoMedioKWh).toLocaleString('pt-BR')} kWh/mês${u.periodoConsumo.trim() ? ` (${u.periodoConsumo.trim()})` : ''}`,
  ].filter(Boolean);
  return `${partes.join('; ')}.`;
}

export type DadosModelo = Record<string, unknown>;

export function dadosModelo(c: Cliente, agora: Date, cfg: Pick<ConfigKora, 'representanteContrato' | 'sociosProcuracao'>): DadosModelo {
  const varias = c.ucs.length > 1;
  const numeros = c.ucs.map((u) => u.numero.trim());
  return {
    nome: c.nome.trim().toUpperCase(),
    qualificacao: qualificacao(c),
    qualificacao_procuracao: qualificacao(c, true),
    denominado: c.tipo === 'PJ' ? 'denominada' : g(c.sexo, 'denominado', 'denominada'),
    destino_ucs: varias ? 'às unidades consumidoras abaixo identificadas' : 'à unidade consumidora abaixo identificada',
    atendida: varias ? 'atendidas' : 'atendida',
    distribuidora: c.contrato.distribuidoraNome,
    distribuidora_razao: c.contrato.distribuidoraRazao,
    ucs: c.ucs.map((u, i) => ({ numero: u.numero.trim(), descricao: descricaoUC(c, i) })),
    rotulo_ucs: varias ? 'às Unidades Consumidoras nºs' : 'à Unidade Consumidora nº',
    numeros_ucs: varias ? `${numeros.slice(0, -1).join(', ')} e ${numeros[numeros.length - 1]}` : numeros[0] ?? '',
    preco: precoTexto(c.contrato.precoKWh),
    preco_extenso: reaisExtenso(c.contrato.precoKWh),
    prazo_saldo: String(c.contrato.prazoSaldoMeses),
    prazo_saldo_extenso: extenso(c.contrato.prazoSaldoMeses),
    data_extenso: dataExtenso(agora),
    kora_representante: cfg.representanteContrato.nome,
    kora_representante_cpf: cfg.representanteContrato.cpf,
    kora_socios: cfg.sociosProcuracao,
    doc_rotulo: c.tipo === 'PJ' ? 'CNPJ' : 'CPF',
    doc_formatado: c.tipo === 'PJ' ? formatarCnpj(c.documento) : formatarCpf(c.documento),
  };
}
