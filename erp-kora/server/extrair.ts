// Leitura de documento do cliente pela API da Anthropic (chave em ANTHROPIC_API_KEY).
// Devolve só o que está escrito no documento; quem decide o que vai para o cadastro é a tela (mesclarExtracao).
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Extracao, TipoExtraido } from '../src/lib/extracao.ts';
import { ROTULO_DOCUMENTO, type TipoDocumento } from '../src/lib/clientes.ts';

export const extracaoConfigurada = () => !!process.env.ANTHROPIC_API_KEY;

const MODELO = 'claude-opus-5-5';

const s = (d: string) => z.string().describe(d);
const TIPOS: TipoExtraido[] = ['rg_cnh', 'cartao_cnpj', 'contrato_social', 'fatura', 'comprovante_endereco', 'outro'];

const Esquema = z.object({
  tipoDetectado: s(`Um de: ${TIPOS.join(', ')}.`),
  pessoa: z.object({
    nome: s('Nome completo da pessoa física do documento (RG, CNH, CIN).'),
    cpf: s('CPF só com dígitos.'),
    rg: s('Número do RG como impresso.'),
    rgOrgao: s('Órgão emissor e UF do RG, ex. "SSP/PR".'),
    nascimento: s('AAAA-MM-DD.'),
    sexo: s('"M" ou "F", só se estiver impresso no documento; senão "".'),
    nacionalidade: s('Ex. "brasileira".'),
    naturalidade: s('Cidade/UF de nascimento, ex. "Curitiba/PR".'),
  }),
  empresa: z.object({
    razaoSocial: s(''), nomeFantasia: s(''), cnpj: s('Só dígitos.'), inscricaoEstadual: s(''),
  }),
  endereco: z.object({
    logradouro: s('Tipo e nome da via, ex. "Rua XV de Novembro".'), numero: s(''), complemento: s(''), bairro: s(''),
    cidade: s(''), uf: s('Sigla.'), cep: s('Só dígitos.'),
  }).describe('Endereço do cliente: residência (pessoa física) ou sede (empresa). Em fatura de energia, deixe vazio — o endereço da unidade vai em ucs.'),
  representante: z.object({
    nome: s('Sócio administrador / representante legal da empresa (contrato social).'),
    cpf: s('Só dígitos.'),
    cargo: s('Ex. "sócio administrador".'),
  }),
  email: s(''),
  telefone: s(''),
  ucs: z.array(z.object({
    numero: s('Número da unidade consumidora (UC / instalação), como impresso.'),
    titular: s('Nome do titular da conta.'),
    titularDocumento: s('CPF ou CNPJ do titular, como impresso.'),
    endereco: s('Endereço da unidade consumidora em uma linha.'),
    classificacao: s('Grupo e classe, ex. "Grupo B – B3 Comercial" ou "Grupo A – A4 Industrial".'),
    ligacao: s('Tipo de ligação, ex. "trifásico".'),
    subgrupo: s('Ex. "B3", "A4".'),
    modalidade: s('Modalidade tarifária, ex. "Convencional", "Verde", "Azul".'),
    distribuidoraRazao: s('Razão social da distribuidora que emitiu a fatura.'),
    historico: z.array(z.object({ mes: s('AAAA-MM.'), kWh: z.number().describe('Consumo total do mês em kWh (somando ponta e fora ponta).') }))
      .describe('Histórico de consumo mês a mês impresso na fatura, inclusive o mês atual.'),
  })).describe('Só em fatura de energia; senão lista vazia.'),
  observacoes: s('Em uma frase: o que não deu para ler ou parece inconsistente. Vazio se nada.'),
});

const INSTRUCOES = `Você lê documentos de clientes de uma empresa de energia para preencher o cadastro.
Transcreva apenas o que está escrito no documento. Campo que não aparece fica "" (ou lista vazia) — não deduza nem invente,
nem o sexo pelo nome. Datas em AAAA-MM-DD; CPF, CNPJ e CEP só com dígitos.
Em contrato social, os dados da empresa vão em "empresa" e o sócio administrador em "representante".
Em RG, CNH ou CIN, os dados vão em "pessoa".`;

const MIDIA_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export async function extrairDocumento(conteudo: Buffer, mime: string, tipo: TipoDocumento): Promise<Extracao> {
  if (!extracaoConfigurada()) throw new Error('Leitura por IA não configurada (falta ANTHROPIC_API_KEY).');
  const dados = conteudo.toString('base64');
  const arquivo: Anthropic.Beta.BetaContentBlockParam = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: dados } }
    : (MIDIA_IMAGEM as readonly string[]).includes(mime)
      ? { type: 'image', source: { type: 'base64', media_type: mime as (typeof MIDIA_IMAGEM)[number], data: dados } }
      : (() => { throw new Error('A leitura por IA aceita PDF, JPG, PNG ou WEBP. Converta o arquivo (HEIC/Word não dá).'); })();

  const client = new Anthropic();
  const resposta = await client.beta.messages.parse({
    model: MODELO,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(Esquema) },
    system: INSTRUCOES,
    messages: [{
      role: 'user',
      content: [arquivo, { type: 'text', text: `O documento foi anexado como: ${ROTULO_DOCUMENTO[tipo]}.` }],
    }],
  });
  if (resposta.stop_reason === 'refusal') throw new Error('A IA não quis ler este documento. Preencha à mão.');
  if (resposta.stop_reason === 'max_tokens') throw new Error('Documento grande demais para ler de uma vez.');
  const r = resposta.parsed_output;
  if (!r) throw new Error('A IA não devolveu os dados no formato esperado. Tente de novo.');
  const sx = r.pessoa.sexo.trim().toUpperCase().charAt(0);
  return {
    ...r,
    tipoDetectado: (TIPOS as string[]).includes(r.tipoDetectado) ? r.tipoDetectado as TipoExtraido : 'outro',
    pessoa: { ...r.pessoa, sexo: sx === 'M' || sx === 'F' ? sx : '' },
  };
}
