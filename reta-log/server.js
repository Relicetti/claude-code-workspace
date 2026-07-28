import "dotenv/config";
import express from "express";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      dose TEXT,
      weight REAL,
      waist REAL,
      hip REAL,
      notes TEXT,
      has_photo BOOLEAN DEFAULT false
    )
  `);
  await pool.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS body_fat_pct REAL`);
  await pool.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS body_fat_kg REAL`);
  await pool.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS muscle_kg REAL`);
  await pool.query(`ALTER TABLE entries ADD COLUMN IF NOT EXISTS visceral_fat REAL`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bio_offset (
      id INTEGER PRIMARY KEY,
      value REAL NOT NULL
    )
  `);
  await pool.query(
    `INSERT INTO bio_offset (id, value) VALUES (1, 5.5) ON CONFLICT (id) DO NOTHING`
  );
}

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/api/entries", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, date, dose, weight, waist, hip, notes, has_photo AS "hasPhoto",
            body_fat_pct AS "bodyFatPct", body_fat_kg AS "bodyFatKg",
            muscle_kg AS "muscleKg", visceral_fat AS "visceralFat"
     FROM entries ORDER BY date ASC`
  );
  res.json(rows);
});

app.post("/api/entries", async (req, res) => {
  const { id, date, dose, weight, waist, hip, notes, hasPhoto, bodyFatPct, bodyFatKg, muscleKg, visceralFat } = req.body;
  await pool.query(
    `INSERT INTO entries (id, date, dose, weight, waist, hip, notes, has_photo, body_fat_pct, body_fat_kg, muscle_kg, visceral_fat)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
       date = $2, dose = $3, weight = $4, waist = $5, hip = $6, notes = $7, has_photo = $8,
       body_fat_pct = $9, body_fat_kg = $10, muscle_kg = $11, visceral_fat = $12`,
    [id, date, dose, weight, waist, hip, notes, !!hasPhoto, bodyFatPct, bodyFatKg, muscleKg, visceralFat]
  );
  res.status(201).json({ ok: true });
});

app.delete("/api/entries/:id", async (req, res) => {
  await pool.query("DELETE FROM entries WHERE id = $1", [req.params.id]);
  await pool.query("DELETE FROM photos WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

app.get("/api/photos/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT data FROM photos WHERE id = $1", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not found" });
  res.json({ value: rows[0].data });
});

app.post("/api/photos/:id", async (req, res) => {
  const { value } = req.body;
  await pool.query(
    `INSERT INTO photos (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
    [req.params.id, value]
  );
  res.status(201).json({ ok: true });
});

app.delete("/api/photos/:id", async (req, res) => {
  await pool.query("DELETE FROM photos WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

app.get("/api/bio/offset", async (req, res) => {
  const { rows } = await pool.query("SELECT value FROM bio_offset WHERE id = 1");
  res.json({ offset: rows[0]?.value ?? 5.5 });
});

app.post("/api/bio/offset", async (req, res) => {
  const { offset } = req.body;
  if (typeof offset !== "number" || Number.isNaN(offset)) {
    return res.status(400).json({ error: "offset inválido" });
  }
  await pool.query(
    `INSERT INTO bio_offset (id, value) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET value = $1`,
    [offset]
  );
  res.json({ ok: true });
});

// ---- análise de evolução por IA -------------------------------------------
//
// Gera um texto (Claude) comentando tendências do log inteiro: peso, medidas,
// bioimpedância e notas/efeitos colaterais. Sob demanda (não automático) pra
// manter o custo baixo. Não é orientação médica — só leitura dos dados que já
// estão no log.

function formatEntriesForAnalysis(rows, bioOffset) {
  return rows
    .map((r, i) => {
      const parts = [`#${i + 1} ${r.date}`, `dose ${r.dose ?? "?"}mg`];
      if (r.weight != null) parts.push(`peso ${r.weight}kg`);
      if (r.waist != null) parts.push(`cintura ${r.waist}cm`);
      if (r.hip != null) parts.push(`quadril ${r.hip}cm`);
      if (r.bodyFatPct != null) {
        const corrected = bioOffset != null ? ` (corrigido ${(r.bodyFatPct - bioOffset).toFixed(1)}%)` : "";
        parts.push(`% gordura ${r.bodyFatPct}%${corrected}`);
      }
      if (r.bodyFatKg != null) parts.push(`gordura ${r.bodyFatKg}kg`);
      if (r.muscleKg != null) parts.push(`músculo esquelético ${r.muscleKg}kg`);
      if (r.visceralFat != null) parts.push(`gordura visceral grau ${r.visceralFat}`);
      if (r.notes) parts.push(`notas: "${r.notes}"`);
      return "- " + parts.join(", ");
    })
    .join("\n");
}

app.post("/api/analyze", async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: "análise por IA não configurada (ANTHROPIC_API_KEY ausente no servidor)" });
  }

  try {
    const [{ rows }, offsetResult] = await Promise.all([
      pool.query(
        `SELECT date, dose, weight, waist, hip, notes,
                body_fat_pct AS "bodyFatPct", body_fat_kg AS "bodyFatKg",
                muscle_kg AS "muscleKg", visceral_fat AS "visceralFat"
         FROM entries ORDER BY date ASC`
      ),
      pool.query("SELECT value FROM bio_offset WHERE id = 1"),
    ]);

    if (rows.length < 2) {
      return res.status(400).json({ error: "precisa de pelo menos 2 entradas pra analisar evolução" });
    }

    const bioOffset = offsetResult.rows[0]?.value ?? null;
    const dataText = formatEntriesForAnalysis(rows, bioOffset);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system:
        "Você analisa o log de um protocolo de retatrutida (GLP-1/GIP) pra perda de peso, a partir de dados que a própria pessoa registrou (peso, cintura, quadril, bioimpedância, dose, notas de efeitos colaterais). " +
        "Escreva em português do Brasil, tom técnico e direto (linguagem de log de engenharia, sem floreio), em texto simples sem markdown. " +
        "Comente: tendência e ritmo de perda de peso e medidas, o que a bioimpedância mostra sobre composição corporal (gordura vs músculo) quando houver dado, progressão da dose, e padrões nas notas de efeitos colaterais. " +
        "Não sugira mudanças de dose nem dê qualquer orientação médica ou diagnóstico — isso é decisão do médico da pessoa. Se os dados sugerirem algo que vale conversar com o médico (ex: perda de músculo junto com a gordura, platô, efeito colateral recorrente), diga isso como observação, não como recomendação de tratamento. " +
        "Termine sempre com uma linha separada: 'Isso é leitura dos seus próprios dados, não é orientação médica.'",
      messages: [
        {
          role: "user",
          content: `Dados do log, do mais antigo pro mais recente:\n${dataText}`,
        },
      ],
    });

    const text = message.content.find((b) => b.type === "text")?.text;
    if (!text) {
      return res.status(502).json({ error: "não consegui gerar a análise" });
    }
    res.json({ analysis: text });
  } catch (err) {
    res.status(502).json({ error: `falha ao gerar análise (detalhe técnico: ${err?.message || err})` });
  }
});

const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = process.env.PORT || 3100;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`reta-log server listening on ${PORT}`));
  })
  .catch((err) => {
    console.error("failed to init db", err);
    process.exit(1);
  });
