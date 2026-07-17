export function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

export function formatDateLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function makeId() {
  // timestamp + sufixo aleatório evita colisão de id em criações rápidas
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
