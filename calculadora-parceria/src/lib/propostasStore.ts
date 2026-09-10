import type { ParceriaInput, ParceriaResultado } from '../types';

export interface PropostaEmitida {
  id: number;
  nomeUsina: string;
  potenciaKwp: number;
  valorTarifa: number;
  negociador: string;
  revisao: number;
  dataEmissao: string;
}

export interface PropostaSnapshot {
  input: ParceriaInput;
  proposta: {
    negociador: string; nomeUsina: string; cidade: string;
    vigenciaAnos: number; avisoPrevioDias: number; valorLocacaoImovel: number;
  };
  resultado: ParceriaResultado;
}

export async function listarPropostas(): Promise<PropostaEmitida[]> {
  const res = await fetch('/api/propostas');
  if (!res.ok) throw new Error('Não foi possível carregar o controle de propostas.');
  return res.json();
}

/** Busca a proposta com o snapshot completo, pra reabrir/baixar o documento
 * exatamente como foi emitido (sem recalcular com tarifas/dados atuais). */
export async function obterProposta(id: number): Promise<PropostaEmitida & { snapshot: PropostaSnapshot }> {
  const res = await fetch(`/api/propostas/${id}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro ?? 'Não foi possível carregar essa proposta.');
  return data;
}

export async function apagarProposta(id: number): Promise<void> {
  const res = await fetch(`/api/propostas/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.erro ?? 'Falha ao apagar a proposta.');
  }
}

export async function emitirProposta(payload: {
  nomeUsina: string; potenciaKwp: number; valorTarifa: number; negociador: string; snapshot: unknown;
}): Promise<PropostaEmitida> {
  const res = await fetch('/api/propostas/emitir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro ?? 'Falha ao emitir a proposta.');
  return data;
}
