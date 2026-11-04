// Chamadas à API: JSON, erro legível e aviso quando a sessão cai.
export const SESSAO_EXPIRADA = 'kora:sessao-expirada';

export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...resto } = init;
  const res = await fetch(url, {
    ...resto,
    ...(json !== undefined ? { body: JSON.stringify(json), headers: { 'Content-Type': 'application/json', ...resto.headers } } : {}),
  });
  const corpo = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') window.dispatchEvent(new Event(SESSAO_EXPIRADA));
  if (!res.ok) throw new Error((corpo as { erro?: string }).erro ?? `Erro HTTP ${res.status}.`);
  return corpo as T;
}
