import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'tarifas.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// Migração: isencoes_overrides passou a ter chave composta (distribuidora, modalidade) —
// antes só existia por distribuidora (implicitamente "Autoconsumo"). Se a tabela antiga
// existir, preserva os dados já salvos em vez de simplesmente derrubar tudo.
const colunasAntigas = db.prepare(`PRAGMA table_info(isencoes_overrides)`).all() as { name: string }[];
if (colunasAntigas.length > 0 && !colunasAntigas.some((c) => c.name === 'modalidade')) {
  db.exec(`ALTER TABLE isencoes_overrides RENAME TO isencoes_overrides_old;`);
}

// Migração: tarifas_b1 ganhou a coluna "detalhe" (distingue consumo normal de energia
// compensada via SCEE). Bancos já existentes precisam do ALTER — CREATE TABLE IF NOT EXISTS
// não adiciona coluna em tabela que já existe.
const colunasTarifasB1 = db.prepare(`PRAGMA table_info(tarifas_b1)`).all() as { name: string }[];
if (colunasTarifasB1.length > 0 && !colunasTarifasB1.some((c) => c.name === 'detalhe')) {
  db.exec(`ALTER TABLE tarifas_b1 ADD COLUMN detalhe TEXT NOT NULL DEFAULT 'Não se aplica';`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS tarifas_b1 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    resolucao TEXT,
    inicio_vigencia TEXT NOT NULL,
    fim_vigencia TEXT,
    subgrupo TEXT,
    modalidade TEXT,
    classe TEXT,
    detalhe TEXT NOT NULL DEFAULT 'Não se aplica',
    tusd REAL NOT NULL,
    te REAL NOT NULL,
    total REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tarifas_b1_codigo ON tarifas_b1(codigo);

  CREATE TABLE IF NOT EXISTS componentes_tarifarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    resolucao TEXT,
    inicio_vigencia TEXT,
    fim_vigencia TEXT,
    subgrupo TEXT,
    modalidade TEXT,
    classe TEXT,
    componente TEXT NOT NULL,
    valor REAL NOT NULL,
    ano_fonte INTEGER NOT NULL,
    ordem INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_componentes_codigo ON componentes_tarifarios(codigo, componente);

  CREATE TABLE IF NOT EXISTS sync_meta (
    dataset TEXT PRIMARY KEY,
    last_synced_at TEXT,
    row_count INTEGER
  );

  CREATE TABLE IF NOT EXISTS propostas_emitidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_usina TEXT NOT NULL,
    potencia_kwp REAL NOT NULL,
    valor_tarifa REAL NOT NULL,
    negociador TEXT NOT NULL,
    revisao INTEGER NOT NULL,
    data_emissao TEXT NOT NULL,
    snapshot TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_propostas_nome_usina ON propostas_emitidas(nome_usina);

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    senha_salt TEXT NOT NULL,
    perfil TEXT NOT NULL CHECK(perfil IN ('adm','operador')),
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    criado_em TEXT NOT NULL,
    expira_em TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);

  CREATE TABLE IF NOT EXISTS impostos_overrides (
    distribuidora TEXT PRIMARY KEY,
    icms REAL NOT NULL,
    pis_cofins REAL NOT NULL,
    atualizado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS isencoes_overrides (
    distribuidora TEXT NOT NULL,
    modalidade TEXT NOT NULL,
    te_icms INTEGER NOT NULL,
    te_pis_cofins INTEGER NOT NULL,
    tusd_icms INTEGER NOT NULL,
    tusd_pis_cofins INTEGER NOT NULL,
    atualizado_em TEXT NOT NULL,
    PRIMARY KEY (distribuidora, modalidade)
  );
`);

if (colunasAntigas.length > 0 && !colunasAntigas.some((c) => c.name === 'modalidade')) {
  db.exec(`
    INSERT INTO isencoes_overrides (distribuidora, modalidade, te_icms, te_pis_cofins, tusd_icms, tusd_pis_cofins, atualizado_em)
    SELECT distribuidora, 'Autoconsumo', te_icms, te_pis_cofins, tusd_icms, tusd_pis_cofins, atualizado_em FROM isencoes_overrides_old;
    DROP TABLE isencoes_overrides_old;
  `);
}

export function getSyncMeta(dataset: string): { lastSyncedAt: string | null; rowCount: number } {
  const row = db.prepare('SELECT last_synced_at, row_count FROM sync_meta WHERE dataset = ?').get(dataset) as
    { last_synced_at: string | null; row_count: number } | undefined;
  return { lastSyncedAt: row?.last_synced_at ?? null, rowCount: row?.row_count ?? 0 };
}

export function setSyncMeta(dataset: string, rowCount: number): void {
  db.prepare(`
    INSERT INTO sync_meta (dataset, last_synced_at, row_count) VALUES (?, ?, ?)
    ON CONFLICT(dataset) DO UPDATE SET last_synced_at = excluded.last_synced_at, row_count = excluded.row_count
  `).run(dataset, new Date().toISOString(), rowCount);
}
