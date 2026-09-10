import { db } from './db';

export interface PropostaEmitida {
  id: number;
  nomeUsina: string;
  potenciaKwp: number;
  valorTarifa: number;
  negociador: string;
  revisao: number;
  dataEmissao: string;
}

export interface EmitirPropostaInput {
  nomeUsina: string;
  potenciaKwp: number;
  valorTarifa: number;
  negociador: string;
  snapshot: unknown;
}

/** Lista todas as propostas já emitidas (sem o snapshot, que é só usado internamente),
 * mais recentes primeiro. Registro é append-only — nunca é alterado, só inserido. */
export function listarPropostas(): PropostaEmitida[] {
  const rows = db.prepare(`
    SELECT id, nome_usina AS nomeUsina, potencia_kwp AS potenciaKwp, valor_tarifa AS valorTarifa,
           negociador, revisao, data_emissao AS dataEmissao
    FROM propostas_emitidas
    ORDER BY id DESC
  `).all();
  return rows as unknown as PropostaEmitida[];
}

/** Busca uma proposta específica com o snapshot completo (pra baixar/reimprimir o
 * documento exatamente como foi emitido, sem recalcular com dados atuais). */
export function obterProposta(id: number): (PropostaEmitida & { snapshot: unknown }) | undefined {
  const row = db.prepare(`
    SELECT id, nome_usina AS nomeUsina, potencia_kwp AS potenciaKwp, valor_tarifa AS valorTarifa,
           negociador, revisao, data_emissao AS dataEmissao, snapshot
    FROM propostas_emitidas
    WHERE id = ?
  `).get(id) as (PropostaEmitida & { snapshot: string }) | undefined;
  if (!row) return undefined;
  return { ...row, snapshot: JSON.parse(row.snapshot) };
}

/** Emite uma nova proposta: se já existe alguma com o mesmo nome de usina (case-insensitive),
 * sobe automaticamente pra próxima revisão (rev00 -> rev01 -> ...). */
export function emitirProposta(input: EmitirPropostaInput): PropostaEmitida {
  const chave = input.nomeUsina.trim().toLowerCase();
  const maxRevRow = db.prepare(`
    SELECT MAX(revisao) AS maxRev FROM propostas_emitidas WHERE LOWER(TRIM(nome_usina)) = ?
  `).get(chave) as { maxRev: number | null };
  const revisao = (maxRevRow.maxRev ?? -1) + 1;
  const dataEmissao = new Date().toISOString();

  const info = db.prepare(`
    INSERT INTO propostas_emitidas (nome_usina, potencia_kwp, valor_tarifa, negociador, revisao, data_emissao, snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(input.nomeUsina, input.potenciaKwp, input.valorTarifa, input.negociador, revisao, dataEmissao, JSON.stringify(input.snapshot));

  return {
    id: Number(info.lastInsertRowid), nomeUsina: input.nomeUsina, potenciaKwp: input.potenciaKwp,
    valorTarifa: input.valorTarifa, negociador: input.negociador, revisao, dataEmissao,
  };
}

/** Apaga uma proposta emitida. Só deve ser chamado por rota restrita a ADM. */
export function apagarProposta(id: number): boolean {
  const info = db.prepare('DELETE FROM propostas_emitidas WHERE id = ?').run(id);
  return info.changes > 0;
}
