import { db } from './db';

export interface ImpostoOverride {
  distribuidora: string;
  icms: number;
  pisCofins: number;
  atualizadoEm: string;
}

export function listarImpostosOverrides(): ImpostoOverride[] {
  const rows = db.prepare(`
    SELECT distribuidora, icms, pis_cofins AS pisCofins, atualizado_em AS atualizadoEm
    FROM impostos_overrides
    ORDER BY distribuidora ASC
  `).all();
  return rows as unknown as ImpostoOverride[];
}

export function salvarImpostoOverride(distribuidora: string, icms: number, pisCofins: number): void {
  db.prepare(`
    INSERT INTO impostos_overrides (distribuidora, icms, pis_cofins, atualizado_em)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(distribuidora) DO UPDATE SET icms = excluded.icms, pis_cofins = excluded.pis_cofins, atualizado_em = excluded.atualizado_em
  `).run(distribuidora, icms, pisCofins, new Date().toISOString());
}

export function removerImpostoOverride(distribuidora: string): void {
  db.prepare('DELETE FROM impostos_overrides WHERE distribuidora = ?').run(distribuidora);
}
