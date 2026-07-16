import express from "express";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});

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
