import React, { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Camera, Plus, TrendingDown, TrendingUp, Minus, ChevronDown, ChevronUp, X, Ruler, Weight, Syringe } from "lucide-react";

// ---- cliente da API (backend) ----------------------------------------------------------
//
// Os dados ficam salvos no servidor (Postgres) em vez do armazenamento do
// navegador. Isso garante que abrir o app pelo Safari, pelo ícone da tela de
// início do iPhone, ou em qualquer outro aparelho, sempre mostra o mesmo
// histórico — o navegador deixou de ser a fonte da verdade.

async function apiGetEntries() {
  const res = await fetch("/api/entries");
  if (!res.ok) throw new Error(`GET /api/entries ${res.status}`);
  return res.json();
}

async function apiSaveEntry(meta) {
  const res = await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  if (!res.ok) throw new Error(`POST /api/entries ${res.status}`);
}

async function apiDeleteEntry(id) {
  const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/entries/${id} ${res.status}`);
}

async function apiGetPhoto(id) {
  const res = await fetch(`/api/photos/${id}`);
  if (!res.ok) throw new Error(`GET /api/photos/${id} ${res.status}`);
  return res.json();
}

async function apiSavePhoto(id, value) {
  const res = await fetch(`/api/photos/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`POST /api/photos/${id} ${res.status}`);
}

async function apiDeletePhoto(id) {
  const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/photos/${id} ${res.status}`);
}

// ---- migração de dados antigos do localStorage -----------------------------------------
//
// Antes deste app usar um backend, os registros ficavam no localStorage do
// navegador — por isso o ícone da tela de início do iPhone, que roda num
// container de armazenamento à parte do Safari, abria "zerado". Os formatos
// abaixo são os que já existiram: v1 (tudo numa chave só), v2 (uma chave por
// entrada) e v3 (metadados numa chave, fotos em chaves separadas). Na
// primeira carga, se o backend ainda estiver vazio, consolidamos qualquer
// um desses formatos achado no localStorage deste navegador e mandamos pro
// servidor, uma única vez.

const OLD_STORAGE_KEY = "reta-log::retatrutide-log:entries";
const V2_ENTRY_PREFIX = "reta-log::retalog:entry:";
const V3_META_KEY = "reta-log::retalog:meta-v3";
const V3_PHOTO_PREFIX = "reta-log::retalog:photo:";

function readLocalEntries() {
  const metaEntries = [];
  const photos = {};

  // v3: uma chave com todos os metadados + fotos em chaves separadas
  try {
    const raw = window.localStorage.getItem(V3_META_KEY);
    if (raw) {
      for (const meta of JSON.parse(raw)) {
        metaEntries.push(meta);
        if (meta.hasPhoto) {
          const photo = window.localStorage.getItem(V3_PHOTO_PREFIX + meta.id);
          if (photo) photos[meta.id] = photo;
        }
      }
    }
  } catch {
    // v3 ausente ou corrompido, tudo bem
  }

  // v2: uma chave por entrada, foto embutida
  if (metaEntries.length === 0) {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith(V2_ENTRY_PREFIX)) continue;
        const entry = JSON.parse(window.localStorage.getItem(key));
        const { photo, ...meta } = entry;
        meta.hasPhoto = !!photo;
        metaEntries.push(meta);
        if (photo) photos[entry.id] = photo;
      }
    } catch {
      // v2 ausente ou corrompido, tudo bem
    }
  }

  // v1: tudo numa chave só
  if (metaEntries.length === 0) {
    try {
      const raw = window.localStorage.getItem(OLD_STORAGE_KEY);
      if (raw) {
        for (const entry of JSON.parse(raw)) {
          const { photo, ...meta } = entry;
          meta.hasPhoto = !!photo;
          metaEntries.push(meta);
          if (photo) photos[entry.id] = photo;
        }
      }
    } catch {
      // v1 ausente ou corrompido, tudo bem
    }
  }

  return { metaEntries, photos };
}

// Roda uma única vez: se o backend ainda não tem nada e existem dados
// antigos no localStorage deste navegador, sobe tudo pro servidor.
async function migrateLocalToBackendIfNeeded(currentEntries) {
  if (currentEntries.length > 0) return currentEntries;
  const { metaEntries, photos } = readLocalEntries();
  if (metaEntries.length === 0) return currentEntries;

  for (const meta of metaEntries) {
    try {
      if (meta.hasPhoto && photos[meta.id]) {
        await apiSavePhoto(meta.id, photos[meta.id]);
      }
      await apiSaveEntry(meta);
    } catch {
      // se uma entrada falhar ao migrar, tenta as próximas em vez de travar tudo
    }
  }

  try {
    return await apiGetEntries();
  } catch {
    return metaEntries;
  }
}

// ---- funções auxiliares ----------------------------------------------------------

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function pad3(n) {
  return String(n).padStart(3, "0");
}

function resizeImage(file, maxWidth = 480) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function makeId() {
  // timestamp + sufixo aleatório evita colisão de id em criações rápidas
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---- componente principal -----------------------------------------------------

export default function RetaLog() {
  const [entries, setEntries] = useState(null); // null = carregando
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoCache, setPhotoCache] = useState({}); // id -> dataURL, carregado sob demanda
  const [photoLoadingId, setPhotoLoadingId] = useState(null);
  const [showBio, setShowBio] = useState(false);
  const fileInputRef = useRef(null);

  const [draft, setDraft] = useState({
    date: toISODate(new Date()),
    dose: "2.5",
    weight: "",
    waist: "",
    hip: "",
    bodyFatPct: "",
    bodyFatKg: "",
    muscleKg: "",
    visceralFat: "",
    notes: "",
    photo: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const remote = await apiGetEntries();
        const finalEntries = await migrateLocalToBackendIfNeeded(remote);
        setEntries(finalEntries);
      } catch (err) {
        setEntries([]);
        setError(`Não consegui carregar os registros (detalhe técnico: ${err?.message || err}).`);
      }
    })();
  }, []);

  // Busca a foto de uma entrada só quando ela é expandida, e guarda em
  // cache local pra não buscar de novo se o usuário fechar e abrir de novo.
  const toggleExpand = async (entry) => {
    const isOpen = expanded === entry.id;
    if (isOpen) {
      setExpanded(null);
      return;
    }
    setExpanded(entry.id);
    if (entry.hasPhoto && !photoCache[entry.id]) {
      setPhotoLoadingId(entry.id);
      try {
        const res = await apiGetPhoto(entry.id);
        if (res?.value) setPhotoCache((c) => ({ ...c, [entry.id]: res.value }));
      } catch {
        // se a foto não carregar, a entrada continua expandida sem a imagem
      } finally {
        setPhotoLoadingId(null);
      }
    }
  };

  // Bug 2 corrigido: limpa o valor do input de arquivo no final, assim
  // selecionar a mesma foto de novo (ex: refazer a mesma imagem) dispara onChange.
  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      setDraft((d) => ({ ...d, photo: dataUrl }));
    } catch {
      setError("Não consegui processar a foto.");
    } finally {
      e.target.value = "";
    }
  };

  const submit = async () => {
    if (!draft.weight && !draft.waist) {
      setError("Registra pelo menos peso ou cintura.");
      return;
    }
    setSaving(true);
    const id = makeId();
    const hasPhoto = !!draft.photo;

    try {
      // salva a foto primeiro (se houver) — é a parte que pode ser grande
      if (hasPhoto) {
        await apiSavePhoto(id, draft.photo);
      }

      const meta = {
        id,
        date: draft.date,
        dose: draft.dose,
        weight: draft.weight ? parseFloat(draft.weight.replace(",", ".")) : null,
        waist: draft.waist ? parseFloat(draft.waist.replace(",", ".")) : null,
        hip: draft.hip ? parseFloat(draft.hip.replace(",", ".")) : null,
        bodyFatPct: draft.bodyFatPct ? parseFloat(draft.bodyFatPct.replace(",", ".")) : null,
        bodyFatKg: draft.bodyFatKg ? parseFloat(draft.bodyFatKg.replace(",", ".")) : null,
        muscleKg: draft.muscleKg ? parseFloat(draft.muscleKg.replace(",", ".")) : null,
        visceralFat: draft.visceralFat ? parseFloat(draft.visceralFat.replace(",", ".")) : null,
        notes: draft.notes,
        hasPhoto,
      };
      await apiSaveEntry(meta);
      const nextEntries = [...entries, meta].sort((a, b) => a.date.localeCompare(b.date));

      if (hasPhoto) setPhotoCache((c) => ({ ...c, [id]: draft.photo }));
      setEntries(nextEntries);
      setError(null);
      setDraft({
        date: toISODate(new Date()),
        dose: draft.dose,
        weight: "",
        waist: "",
        hip: "",
        bodyFatPct: "",
        bodyFatKg: "",
        muscleKg: "",
        visceralFat: "",
        notes: "",
        photo: null,
      });
      setShowBio(false);
      setShowForm(false);
    } catch (err) {
      if (hasPhoto) {
        try {
          await apiDeletePhoto(id);
        } catch {
          // limpeza best-effort; se falhar, fica uma foto órfã sem entrada associada
        }
      }
      const detail = err?.message || String(err);
      setError(`Não consegui salvar (detalhe técnico: ${detail}).`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    const previous = entries;
    const nextEntries = entries.filter((e) => e.id !== id);
    setEntries(nextEntries);
    try {
      await apiDeleteEntry(id);
      setError(null);
      setPhotoCache((c) => {
        const copy = { ...c };
        delete copy[id];
        return copy;
      });
      if (expanded === id) setExpanded(null);
    } catch {
      setEntries(previous);
      setError("Não consegui remover a entrada. Tenta de novo.");
    }
  };

  if (entries === null) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingText}>CARREGANDO REGISTRO&hellip;</div>
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const chartData = sorted.map((e, i) => ({
    idx: i + 1,
    label: formatDateLabel(e.date),
    weight: e.weight,
    waist: e.waist,
    hip: e.hip,
  }));
  const hasHip = sorted.some((e) => e.hip != null);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const weightDelta = first && last && first.weight != null && last.weight != null ? last.weight - first.weight : null;
  const waistDelta = first && last && first.waist != null && last.waist != null ? last.waist - first.waist : null;

  return (
    <div style={styles.page}>
      <style>{fontImport}</style>

      {/* cabeçalho */}
      <div style={styles.masthead}>
        <div style={styles.mastheadTop}>
          <span style={styles.mastheadLabel}>REGISTRO DE PROTOCOLO</span>
          <span style={styles.mastheadLabel}>RETATRUTIDA · GLP-1/GIP</span>
        </div>
        <h1 style={styles.title}>LOG DE EVOLUÇÃO</h1>
        <div style={styles.mastheadRule} />
        <div style={styles.mastheadBottom}>
          <span>ENTRADAS: {pad3(sorted.length)}</span>
          <span>CADÊNCIA: SEMANAL / TERÇA</span>
          <span>DOSE ATUAL: {sorted.length ? sorted[sorted.length - 1].dose : draft.dose} MG</span>
        </div>
      </div>

      {/* estatísticas resumo */}
      {sorted.length > 1 && (
        <div style={styles.statRow}>
          <StatCard label="Δ PESO TOTAL" value={weightDelta} unit="kg" invertGood />
          <StatCard label="Δ CINTURA TOTAL" value={waistDelta} unit="cm" invertGood />
          <StatCard label="DIAS EM CURSO" value={Math.round((new Date(last.date) - new Date(first.date)) / 86400000)} unit="d" plain />
        </div>
      )}

      {/* gráficos */}
      {sorted.length >= 2 && (
        <div style={styles.chartPanel}>
          <div style={styles.panelHeader}>
            <span>CURVA — PESO (KG)</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#2c3a52" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="label" stroke="#6b7a99" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#3d5a80" }} tickLine={false} />
              <YAxis domain={["auto", "auto"]} stroke="#6b7a99" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#3d5a80" }} tickLine={false} width={38} />
              <Tooltip contentStyle={{ background: "#0f1826", border: "1px solid #3d5a80", borderRadius: 2, fontFamily: "IBM Plex Mono", fontSize: 11 }} labelStyle={{ color: "#e8a33d" }} />
              <Line type="monotone" dataKey="weight" stroke="#e8a33d" strokeWidth={2} dot={{ r: 2.5, fill: "#e8a33d", strokeWidth: 0 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>

          <div style={{ ...styles.panelHeader, marginTop: 6 }}>
            <span>CURVA — CINTURA (CM)</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#2c3a52" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="label" stroke="#6b7a99" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#3d5a80" }} tickLine={false} />
              <YAxis domain={["auto", "auto"]} stroke="#6b7a99" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#3d5a80" }} tickLine={false} width={38} />
              <Tooltip contentStyle={{ background: "#0f1826", border: "1px solid #3d5a80", borderRadius: 2, fontFamily: "IBM Plex Mono", fontSize: 11 }} labelStyle={{ color: "#7fb3d5" }} />
              <Line type="monotone" dataKey="waist" stroke="#7fb3d5" strokeWidth={2} dot={{ r: 2.5, fill: "#7fb3d5", strokeWidth: 0 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>

          {hasHip && (
            <>
              <div style={{ ...styles.panelHeader, marginTop: 6 }}>
                <span>CURVA — QUADRIL (CM)</span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#2c3a52" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="label" stroke="#6b7a99" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#3d5a80" }} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} stroke="#6b7a99" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#3d5a80" }} tickLine={false} width={38} />
                  <Tooltip contentStyle={{ background: "#0f1826", border: "1px solid #3d5a80", borderRadius: 2, fontFamily: "IBM Plex Mono", fontSize: 11 }} labelStyle={{ color: "#c08fd9" }} />
                  <Line type="monotone" dataKey="hip" stroke="#c08fd9" strokeWidth={2} dot={{ r: 2.5, fill: "#c08fd9", strokeWidth: 0 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}

      {error && <div style={styles.errorBanner}>{error}</div>}

      {/* botão / formulário de nova entrada / galeria de fotos */}
      {showGallery ? (
        <PhotoGallery
          entries={sorted}
          photoCache={photoCache}
          setPhotoCache={setPhotoCache}
          onClose={() => setShowGallery(false)}
        />
      ) : !showForm ? (
        <>
          {sorted.some((e) => e.hasPhoto) && (
            <button style={styles.galleryButton} onClick={() => setShowGallery(true)}>
              <Camera size={15} />
              GALERIA DE FOTOS
            </button>
          )}
          <button style={styles.addButton} onClick={() => setShowForm(true)}>
            <Plus size={16} strokeWidth={2.5} />
            NOVA ENTRADA — {pad3(sorted.length + 1)}
          </button>
        </>
      ) : (
        <div style={styles.formPanel}>
          <div style={styles.panelHeader}>
            <span>NOVA ENTRADA — {pad3(sorted.length + 1)}</span>
            <button style={styles.iconBtn} onClick={() => setShowForm(false)}>
              <X size={14} />
            </button>
          </div>

          <div style={styles.fieldGrid}>
            <Field label="DATA">
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                style={styles.input}
              />
            </Field>
            <Field label="DOSE (MG)">
              <input
                type="text"
                inputMode="decimal"
                value={draft.dose}
                onChange={(e) => setDraft((d) => ({ ...d, dose: e.target.value }))}
                style={styles.input}
                placeholder="2.5"
              />
            </Field>
          </div>

          <div style={styles.fieldGrid}>
            <Field label="PESO (KG)">
              <input
                type="text"
                inputMode="decimal"
                value={draft.weight}
                onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))}
                style={styles.input}
                placeholder="0,0"
              />
            </Field>
            <Field label="CINTURA (CM)">
              <input
                type="text"
                inputMode="decimal"
                value={draft.waist}
                onChange={(e) => setDraft((d) => ({ ...d, waist: e.target.value }))}
                style={styles.input}
                placeholder="0,0"
              />
            </Field>
          </div>

          <Field label="QUADRIL (CM) — OPCIONAL">
            <input
              type="text"
              inputMode="decimal"
              value={draft.hip}
              onChange={(e) => setDraft((d) => ({ ...d, hip: e.target.value }))}
              style={styles.input}
              placeholder="0,0"
            />
          </Field>

          <div style={styles.bioSection}>
            <button type="button" style={styles.bioToggle} onClick={() => setShowBio((s) => !s)}>
              <span>DADOS DE BIOIMPEDÂNCIA</span>
              {showBio ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showBio && (
              <>
                <div style={styles.fieldGrid}>
                  <Field label="% GORDURA">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.bodyFatPct}
                      onChange={(e) => setDraft((d) => ({ ...d, bodyFatPct: e.target.value }))}
                      style={styles.input}
                      placeholder="0,0"
                    />
                  </Field>
                  <Field label="GORDURA (KG)">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.bodyFatKg}
                      onChange={(e) => setDraft((d) => ({ ...d, bodyFatKg: e.target.value }))}
                      style={styles.input}
                      placeholder="0,0"
                    />
                  </Field>
                </div>
                <div style={styles.fieldGrid}>
                  <Field label="MÚSC. ESQUELÉTICO (KG)">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.muscleKg}
                      onChange={(e) => setDraft((d) => ({ ...d, muscleKg: e.target.value }))}
                      style={styles.input}
                      placeholder="0,0"
                    />
                  </Field>
                  <Field label="GORDURA VISCERAL">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.visceralFat}
                      onChange={(e) => setDraft((d) => ({ ...d, visceralFat: e.target.value }))}
                      style={styles.input}
                      placeholder="0"
                    />
                  </Field>
                </div>
              </>
            )}
          </div>

          <Field label="NOTAS / EFEITOS COLATERAIS">
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              style={{ ...styles.input, minHeight: 56, resize: "vertical" }}
              placeholder="náusea, sono, apetite..."
            />
          </Field>

          <Field label="FOTO (ESPELHO)">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
            <button style={styles.photoButton} onClick={() => fileInputRef.current?.click()}>
              <Camera size={15} />
              {draft.photo ? "TROCAR FOTO" : "ANEXAR FOTO"}
            </button>
            {draft.photo && <img src={draft.photo} alt="pré-visualização" style={styles.photoPreview} />}
          </Field>

          <button style={styles.submitButton} onClick={submit} disabled={saving}>
            {saving ? "SALVANDO…" : "REGISTRAR ENTRADA"}
          </button>
        </div>
      )}

      {/* lista do log */}
      <div style={styles.logList}>
        {[...sorted].reverse().map((e, revIdx) => {
          const i = sorted.length - revIdx;
          const prevIdx = sorted.findIndex((s) => s.id === e.id) - 1;
          const prev = prevIdx >= 0 ? sorted[prevIdx] : null;
          const dWeight = prev && prev.weight != null && e.weight != null ? e.weight - prev.weight : null;
          const dWaist = prev && prev.waist != null && e.waist != null ? e.waist - prev.waist : null;
          const isOpen = expanded === e.id;
          return (
            <div key={e.id} style={styles.logEntry}>
              <div style={styles.logEntryHeader} onClick={() => toggleExpand(e)}>
                <span style={styles.logIdx}>{pad3(i)}</span>
                <span style={styles.logDate}>{formatDateLabel(e.date)}</span>
                <span style={styles.logMetric}>
                  <Weight size={12} /> {e.weight != null ? e.weight.toFixed(1) : "—"}
                  {dWeight != null && <DeltaTag value={dWeight} />}
                </span>
                <span style={styles.logMetric}>
                  <Ruler size={12} /> {e.waist != null ? e.waist.toFixed(1) : "—"}
                  {dWaist != null && <DeltaTag value={dWaist} />}
                </span>
                <span style={styles.logMetric}>
                  <Syringe size={12} /> {e.dose}
                </span>
                {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
              {isOpen && (
                <div style={styles.logEntryBody}>
                  {e.hip != null && <div style={styles.logDetailLine}>QUADRIL: {e.hip.toFixed(1)} cm</div>}
                  {e.bodyFatPct != null && <div style={styles.logDetailLine}>% GORDURA: {e.bodyFatPct.toFixed(1)}%</div>}
                  {e.bodyFatKg != null && <div style={styles.logDetailLine}>GORDURA: {e.bodyFatKg.toFixed(1)} kg</div>}
                  {e.muscleKg != null && <div style={styles.logDetailLine}>MÚSC. ESQUELÉTICO: {e.muscleKg.toFixed(1)} kg</div>}
                  {e.visceralFat != null && <div style={styles.logDetailLine}>GORDURA VISCERAL: {e.visceralFat}</div>}
                  {e.notes && <div style={styles.logDetailLine}>NOTAS: {e.notes}</div>}
                  {e.hasPhoto && photoCache[e.id] && (
                    <img src={photoCache[e.id]} alt={`entrada ${i}`} style={styles.logPhoto} />
                  )}
                  {e.hasPhoto && !photoCache[e.id] && photoLoadingId === e.id && (
                    <div style={styles.logDetailLine}>CARREGANDO FOTO&hellip;</div>
                  )}
                  <button style={styles.deleteButton} onClick={() => remove(e.id)}>
                    REMOVER ENTRADA
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div style={styles.emptyState}>
            NENHUMA ENTRADA AINDA.
            <br />
            Registra a primeira medição pra abrir a curva.
          </div>
        )}
      </div>
    </div>
  );
}

// ---- subcomponentes -------------------------------------------------

function Field({ label, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function DeltaTag({ value }) {
  const isNeg = value < 0;
  const isZero = Math.abs(value) < 0.05;
  const color = isZero ? "#6b7a99" : isNeg ? "#588157" : "#c05746";
  const Icon = isZero ? Minus : isNeg ? TrendingDown : TrendingUp;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color, fontSize: 10, marginLeft: 4 }}>
      <Icon size={10} />
      {Math.abs(value).toFixed(1)}
    </span>
  );
}

function StatCard({ label, value, unit, invertGood, plain }) {
  const hasVal = value != null && !Number.isNaN(value);
  const isNeg = hasVal && value < 0;
  let color = "#e6e2d8";
  if (!plain && hasVal) {
    const good = invertGood ? isNeg : !isNeg;
    color = good ? "#588157" : "#c05746";
  }
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color }}>
        {hasVal ? `${isNeg ? "" : "+"}${value.toFixed(plain ? 0 : 1)}` : "—"}
        <span style={styles.statUnit}>{unit}</span>
      </div>
    </div>
  );
}

function PhotoGallery({ entries, photoCache, setPhotoCache, onClose }) {
  const withPhotos = entries.filter((e) => e.hasPhoto);
  const [selected, setSelected] = useState([]); // até 2 ids, pra comparar lado a lado
  const [loadingIds, setLoadingIds] = useState({});

  useEffect(() => {
    withPhotos.forEach(async (e) => {
      if (photoCache[e.id]) return;
      setLoadingIds((l) => ({ ...l, [e.id]: true }));
      try {
        const res = await apiGetPhoto(e.id);
        if (res?.value) setPhotoCache((c) => ({ ...c, [e.id]: res.value }));
      } catch {
        // se uma foto não carregar, a miniatura fica vazia, o resto segue normal
      } finally {
        setLoadingIds((l) => ({ ...l, [e.id]: false }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelect = (id) => {
    setSelected((sel) => {
      if (sel.includes(id)) return sel.filter((s) => s !== id);
      if (sel.length < 2) return [...sel, id];
      return [sel[1], id]; // já tem 2: solta a mais antiga, entra a nova escolha
    });
  };

  const selectedEntries = selected.map((id) => withPhotos.find((e) => e.id === id)).filter(Boolean);

  return (
    <div style={styles.formPanel}>
      <div style={styles.panelHeader}>
        <span>GALERIA DE FOTOS</span>
        <button style={styles.iconBtn} onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {selectedEntries.length > 0 ? (
        <div style={styles.compareRow}>
          {selectedEntries.map((e) => (
            <div key={e.id} style={styles.compareCard}>
              {photoCache[e.id] ? (
                <img src={photoCache[e.id]} alt={formatDateLabel(e.date)} style={styles.comparePhoto} />
              ) : (
                <div style={styles.comparePlaceholder}>CARREGANDO&hellip;</div>
              )}
              <div style={styles.compareLabel}>
                {formatDateLabel(e.date)}
                {e.weight != null ? ` · ${e.weight.toFixed(1)}kg` : ""}
              </div>
            </div>
          ))}
          {selectedEntries.length === 1 && (
            <div style={styles.compareCard}>
              <div style={styles.comparePlaceholder}>TOQUE EM OUTRA FOTO PRA COMPARAR</div>
            </div>
          )}
        </div>
      ) : (
        <div style={styles.compareHint}>TOQUE EM ATÉ 2 FOTOS PRA COMPARAR LADO A LADO</div>
      )}

      <div style={styles.galleryGrid}>
        {withPhotos.map((e) => (
          <button
            key={e.id}
            style={{
              ...styles.galleryThumbWrap,
              borderColor: selected.includes(e.id) ? "#e8a33d" : "#2c3a52",
            }}
            onClick={() => toggleSelect(e.id)}
          >
            {photoCache[e.id] ? (
              <img src={photoCache[e.id]} alt={formatDateLabel(e.date)} style={styles.galleryThumb} />
            ) : (
              <div style={styles.galleryThumbLoading}>{loadingIds[e.id] ? "…" : ""}</div>
            )}
            <div style={styles.galleryThumbLabel}>{formatDateLabel(e.date)}</div>
          </button>
        ))}
        {withPhotos.length === 0 && <div style={styles.emptyState}>NENHUMA FOTO REGISTRADA AINDA.</div>}
      </div>
    </div>
  );
}

// ---- estilos ---------------------------------------------------------------

const fontImport = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
`;

const styles = {
  page: {
    fontFamily: "'Inter', sans-serif",
    background: "#0f1826",
    backgroundImage:
      "linear-gradient(#1b2740 1px, transparent 1px), linear-gradient(90deg, #1b2740 1px, transparent 1px)",
    backgroundSize: "24px 24px",
    color: "#e6e2d8",
    minHeight: "100vh",
    padding: "20px 16px 60px",
    maxWidth: 480,
    margin: "0 auto",
    boxSizing: "border-box",
  },
  loadingText: {
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#6b7a99",
    fontSize: 12,
    letterSpacing: 1,
    paddingTop: 40,
    textAlign: "center",
  },
  masthead: { marginBottom: 18 },
  mastheadTop: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9,
    color: "#6b7a99",
    letterSpacing: 1,
  },
  title: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    fontSize: 28,
    letterSpacing: 1,
    margin: "6px 0 8px",
    color: "#f2ede4",
  },
  mastheadRule: { height: 1, background: "#3d5a80", marginBottom: 8 },
  mastheadBottom: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9,
    color: "#e8a33d",
    letterSpacing: 0.5,
    flexWrap: "wrap",
    gap: 4,
  },
  statRow: { display: "flex", gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1,
    border: "1px solid #2c3a52",
    background: "#141f33",
    padding: "8px 10px",
    borderRadius: 2,
  },
  statLabel: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "#6b7a99", letterSpacing: 0.5 },
  statValue: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 600, marginTop: 2 },
  statUnit: { fontSize: 10, marginLeft: 3, color: "#6b7a99" },
  chartPanel: {
    border: "1px solid #2c3a52",
    background: "#141f33",
    padding: "10px 10px 4px",
    borderRadius: 2,
    marginBottom: 16,
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "#7fb3d5",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  errorBanner: {
    background: "#2b1a1a",
    border: "1px solid #c05746",
    color: "#e6a89e",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    padding: "8px 10px",
    borderRadius: 2,
    marginBottom: 12,
  },
  addButton: {
    width: "100%",
    background: "#e8a33d",
    color: "#0f1826",
    border: "none",
    borderRadius: 2,
    padding: "12px 14px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 0.5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer",
    marginBottom: 16,
  },
  galleryButton: {
    width: "100%",
    background: "transparent",
    color: "#7fb3d5",
    border: "1px solid #3d5a80",
    borderRadius: 2,
    padding: "10px 14px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 0.5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer",
    marginBottom: 8,
  },
  compareHint: {
    textAlign: "center",
    color: "#6b7a99",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    padding: "16px 10px",
    border: "1px dashed #2c3a52",
    borderRadius: 2,
    marginBottom: 10,
  },
  compareRow: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
  },
  compareCard: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    border: "1px solid #2c3a52",
    borderRadius: 2,
    overflow: "hidden",
    background: "#0f1826",
  },
  comparePhoto: {
    width: "100%",
    aspectRatio: "3 / 4",
    objectFit: "cover",
    display: "block",
  },
  comparePlaceholder: {
    width: "100%",
    aspectRatio: "3 / 4",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7a99",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9,
    textAlign: "center",
    padding: 8,
    boxSizing: "border-box",
  },
  compareLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "#e6e2d8",
    padding: "6px 4px",
    textAlign: "center",
  },
  galleryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 6,
  },
  galleryThumbWrap: {
    display: "flex",
    flexDirection: "column",
    border: "2px solid #2c3a52",
    borderRadius: 2,
    overflow: "hidden",
    background: "#0f1826",
    padding: 0,
    cursor: "pointer",
  },
  galleryThumb: {
    width: "100%",
    aspectRatio: "1 / 1",
    objectFit: "cover",
    display: "block",
  },
  galleryThumbLoading: {
    width: "100%",
    aspectRatio: "1 / 1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7a99",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9,
  },
  galleryThumbLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 8,
    color: "#a8b3c9",
    textAlign: "center",
    padding: "3px 2px",
  },
  formPanel: {
    border: "1px solid #3d5a80",
    background: "#141f33",
    borderRadius: 2,
    padding: 12,
    marginBottom: 16,
  },
  iconBtn: { background: "none", border: "none", color: "#6b7a99", cursor: "pointer", padding: 2 },
  fieldGrid: { display: "flex", gap: 8 },
  field: { flex: 1, marginBottom: 10 },
  fieldLabel: {
    display: "block",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9,
    color: "#6b7a99",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    width: "100%",
    background: "#0f1826",
    border: "1px solid #2c3a52",
    borderRadius: 2,
    color: "#e6e2d8",
    padding: "8px 9px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    boxSizing: "border-box",
  },
  photoButton: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#0f1826",
    border: "1px dashed #3d5a80",
    color: "#7fb3d5",
    borderRadius: 2,
    padding: "8px 10px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    cursor: "pointer",
    width: "100%",
    justifyContent: "center",
  },
  photoPreview: { width: "100%", borderRadius: 2, marginTop: 8, border: "1px solid #2c3a52" },
  bioSection: { marginBottom: 10 },
  bioToggle: {
    width: "100%",
    background: "transparent",
    border: "1px dashed #3d5a80",
    color: "#c08fd9",
    borderRadius: 2,
    padding: "8px 10px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: 0.5,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    marginBottom: 8,
  },
  submitButton: {
    width: "100%",
    background: "#588157",
    color: "#f2ede4",
    border: "none",
    borderRadius: 2,
    padding: "11px 14px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 0.5,
    cursor: "pointer",
    marginTop: 4,
  },
  logList: { display: "flex", flexDirection: "column", gap: 6 },
  logEntry: { border: "1px solid #2c3a52", background: "#141f33", borderRadius: 2 },
  logEntryHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 10px",
    cursor: "pointer",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    flexWrap: "wrap",
  },
  logIdx: { color: "#6b7a99", minWidth: 26 },
  logDate: { color: "#f2ede4", minWidth: 40 },
  logMetric: { display: "flex", alignItems: "center", gap: 3, color: "#e6e2d8" },
  logEntryBody: {
    borderTop: "1px solid #2c3a52",
    padding: "10px 10px 12px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: "#a8b3c9",
  },
  logDetailLine: { marginBottom: 6, lineHeight: 1.5 },
  logPhoto: { width: "100%", borderRadius: 2, marginTop: 4, marginBottom: 8, border: "1px solid #2c3a52" },
  deleteButton: {
    background: "none",
    border: "1px solid #c05746",
    color: "#c05746",
    borderRadius: 2,
    padding: "6px 10px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    cursor: "pointer",
  },
  emptyState: {
    textAlign: "center",
    color: "#6b7a99",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    padding: "30px 10px",
    lineHeight: 1.6,
    border: "1px dashed #2c3a52",
    borderRadius: 2,
  },
};
