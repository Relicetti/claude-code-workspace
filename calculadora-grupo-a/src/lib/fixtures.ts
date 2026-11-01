// Dados de exemplo para os testes.
import { anexarDocumento, atualizarCadastro, clienteDaProposta, type Cliente, type DocumentoCliente, type TipoDocumento } from './clientes';
import type { Proposta } from './propostas';

/** Dados fictícios da Kora para os modelos. */
export const CFG = { representanteContrato: { nome: 'Fulano de Tal', cpf: '000.000.000-00' }, sociosProcuracao: 'FULANO DE TAL, brasileiro, inscrito no CPF sob nº 000.000.000-00' };

export const proposta = (uc = '000677708603158'): Proposta => ({
  numero: 'KORA-2026-001', cliente: 'Hotel Tramandaí',
  revisoes: [{
    revisao: 0, criadaEm: '2026-10-26T12:00:00Z',
    entrada: { distribuidora: 'Copel-DIS', subgrupo: 'B3', modalidadeTarifaria: 'Convencional' },
    operacao: { creditoTotalKWh: 172356, prazoMeses: 12, mesInicio: '2026-12', reajusteAnualPct: 0 },
    dados: { cliente: 'Hotel Tramandaí', cnpj: '11.222.333/0001-81', uc, validadeDias: 15, observacao: '', detalhamento: false },
    r: {}, op: { abatimentoMensalKWh: 14363 },
    resumo: { economiaPct: 0.2, creditoKWh: 172356, meses: 12, valorContrato: 100000, economiaContrato: 20000, tarifaKora: 0.6 },
  }],
} as unknown as Proposta);

export const agora = new Date('2026-11-01T12:00:00Z');
const doc = (tipo: TipoDocumento): DocumentoCliente => ({
  id: `${tipo}`.padEnd(24, '0'), tipo, nomeArquivo: `${tipo}.pdf`, mime: 'application/pdf', tamanho: 10, enviadoEm: agora.toISOString(), enviadoPor: 'Ana',
});

/** Cliente PJ completo, pronto para sair do cadastro. */
export function clientePronto(): Cliente {
  let c = clienteDaProposta([], proposta(), 0, agora, 'Ana');
  c = atualizarCadastro(c, {
    endereco: { logradouro: 'Rua Bororos', numero: '14', complemento: '', bairro: 'Vila Izabel', cidade: 'Curitiba', uf: 'PR', cep: '80.320-260' },
    email: 'financeiro@hotel.com.br',
    representante: { nome: 'Maria Souza', cpf: '529.982.247-25', nascimento: '', cargo: 'sócia administradora', email: 'maria@hotel.com.br', telefone: '41999999999', sexo: 'F' },
    ucs: [{ ...c.ucs[0], endereco: 'R. Teste, 100, Curitiba/PR', classificacao: 'Grupo B – classe B3 Comercial', ligacao: 'trifásico 200A', consumoMedioKWh: 14363, periodoConsumo: 'jun/2026 a out/2026' }],
  }, agora, 'Ana');
  for (const t of ['cartao_cnpj', 'contrato_social', 'doc_representante', 'fatura'] as TipoDocumento[]) c = anexarDocumento(c, doc(t), agora);
  return c;
}

