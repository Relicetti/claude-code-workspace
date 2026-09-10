import { db } from './db';

export interface IsencaoOverride {
  distribuidora: string;
  modalidade: string;
  teIcms: boolean;
  tePisCofins: boolean;
  tusdIcms: boolean;
  tusdPisCofins: boolean;
  atualizadoEm: string;
}

export function listarIsencoesOverrides(): IsencaoOverride[] {
  const rows = db.prepare(`
    SELECT distribuidora, modalidade, te_icms AS teIcms, te_pis_cofins AS tePisCofins,
           tusd_icms AS tusdIcms, tusd_pis_cofins AS tusdPisCofins, atualizado_em AS atualizadoEm
    FROM isencoes_overrides
    ORDER BY distribuidora ASC, modalidade ASC
  `).all() as any[];
  return rows.map((r) => ({
    distribuidora: r.distribuidora,
    modalidade: r.modalidade,
    teIcms: !!r.teIcms,
    tePisCofins: !!r.tePisCofins,
    tusdIcms: !!r.tusdIcms,
    tusdPisCofins: !!r.tusdPisCofins,
    atualizadoEm: r.atualizadoEm,
  }));
}

export function salvarIsencaoOverride(
  distribuidora: string,
  modalidade: string,
  flags: { teIcms: boolean; tePisCofins: boolean; tusdIcms: boolean; tusdPisCofins: boolean },
): void {
  db.prepare(`
    INSERT INTO isencoes_overrides (distribuidora, modalidade, te_icms, te_pis_cofins, tusd_icms, tusd_pis_cofins, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(distribuidora, modalidade) DO UPDATE SET
      te_icms = excluded.te_icms, te_pis_cofins = excluded.te_pis_cofins,
      tusd_icms = excluded.tusd_icms, tusd_pis_cofins = excluded.tusd_pis_cofins,
      atualizado_em = excluded.atualizado_em
  `).run(
    distribuidora, modalidade,
    flags.teIcms ? 1 : 0, flags.tePisCofins ? 1 : 0, flags.tusdIcms ? 1 : 0, flags.tusdPisCofins ? 1 : 0,
    new Date().toISOString(),
  );
}

export function removerIsencaoOverride(distribuidora: string, modalidade: string): void {
  db.prepare('DELETE FROM isencoes_overrides WHERE distribuidora = ? AND modalidade = ?').run(distribuidora, modalidade);
}
