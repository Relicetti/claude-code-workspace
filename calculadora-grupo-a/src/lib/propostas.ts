// Controle de propostas geradas: cada "Gerar PDF" grava uma revisão com o retrato completo da simulação
// (entradas e resultado), para reimprimir igual mesmo depois de as tarifas mudarem.
import type { ParametrosOperacao, ResultadoOperacao } from './operacao';
import type { Entrada, Resultado } from '../types';

/** Campos que o usuário preenche na tela da proposta. */
export interface DadosProposta {
  cliente: string;
  cnpj: string;
  uc: string;
  validadeDias: number;
  observacao: string;
  detalhamento: boolean;
}

export interface Resumo {
  economiaPct: number;
  creditoKWh: number;
  meses: number;
  valorContrato: number;
  economiaContrato: number;
  /** "Valor especial": R$/kWh pago à Kora. */
  tarifaKora: number;
}

export interface RevisaoProposta {
  revisao: number;
  criadaEm: string;   // ISO
  entrada: Entrada;
  operacao: ParametrosOperacao;
  dados: DadosProposta;
  r: Resultado;
  op: ResultadoOperacao;
  resumo: Resumo;
}

export interface Proposta {
  numero: string;     // KORA-AAAA-NNN
  cliente: string;    // da última revisão
  revisoes: RevisaoProposta[];
}

/** O que o app envia ao gerar: a revisão sem número, data nem resumo (o servidor preenche). */
export type NovaRevisao = Pick<RevisaoProposta, 'entrada' | 'operacao' | 'dados' | 'r' | 'op'>;

export const rotuloRevisao = (n: number) => `Rev. ${String(n).padStart(2, '0')}`;
export const identificacao = (numero: string, revisao: number) => `${numero} · ${rotuloRevisao(revisao)}`;

/** Próximo número sequencial do ano: KORA-2026-001, KORA-2026-002… */
export function proximoNumero(existentes: string[], ano: number): string {
  const prefixo = `KORA-${ano}-`;
  const ultimo = existentes
    .filter((n) => n.startsWith(prefixo))
    .reduce((m, n) => Math.max(m, Number(n.slice(prefixo.length)) || 0), 0);
  return `${prefixo}${String(ultimo + 1).padStart(3, '0')}`;
}

export function resumir(rev: Pick<RevisaoProposta, 'r' | 'op' | 'operacao'>): Resumo {
  return {
    economiaPct: rev.r.economiaClientePct,
    creditoKWh: rev.operacao.creditoTotalKWh,
    meses: rev.op.meses.length,
    valorContrato: rev.op.total.faturaGeracao,
    economiaContrato: rev.op.total.desconto,
    tarifaKora: rev.r.tarifaMediaGeracao,
  };
}

/** Acrescenta uma revisão: sem `numero` cria a proposta (Rev. 00); com `numero`, sobe a revisão. */
export function registrarRevisao(lista: Proposta[], nova: NovaRevisao, agora: Date, numero?: string): { lista: Proposta[]; proposta: Proposta } {
  const base = { ...nova, criadaEm: agora.toISOString(), resumo: resumir(nova) };
  if (!numero) {
    const proposta: Proposta = {
      numero: proximoNumero(lista.map((p) => p.numero), agora.getFullYear()),
      cliente: nova.dados.cliente,
      revisoes: [{ ...base, revisao: 0 }],
    };
    return { lista: [...lista, proposta], proposta };
  }
  const atual = lista.find((p) => p.numero === numero);
  if (!atual) throw new Error(`Proposta ${numero} não encontrada.`);
  const revisao = Math.max(...atual.revisoes.map((r) => r.revisao)) + 1;
  const proposta: Proposta = { ...atual, cliente: nova.dados.cliente, revisoes: [...atual.revisoes, { ...base, revisao }] };
  return { lista: lista.map((p) => (p.numero === numero ? proposta : p)), proposta };
}
