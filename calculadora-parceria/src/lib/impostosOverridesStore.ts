export interface ImpostoOverride {
  distribuidora: string;
  icms: number;
  pisCofins: number;
  atualizadoEm: string;
}

let overrides: Map<string, ImpostoOverride> = new Map();

export function getImpostoOverride(distribuidora: string): ImpostoOverride | undefined {
  return overrides.get(distribuidora);
}

export function getTodosOverrides(): ImpostoOverride[] {
  return [...overrides.values()];
}

/** Busca os overrides do servidor e substitui o cache em memória. Chamado ao
 * montar o app e depois de qualquer salvamento/remoção, pra manter o motor de
 * cálculo (engine.ts) sincronizado com o que está salvo no banco. */
export async function carregarDaAPI(): Promise<void> {
  try {
    const res = await fetch('/api/impostos/overrides');
    if (!res.ok) return;
    const data: ImpostoOverride[] = await res.json();
    overrides = new Map(data.map((o) => [o.distribuidora, o]));
  } catch (e) {
    console.warn('Não foi possível carregar os overrides de impostos.', e);
  }
}

export async function salvarOverride(distribuidora: string, icms: number, pisCofins: number): Promise<void> {
  const res = await fetch('/api/impostos/overrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distribuidora, icms, pisCofins }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro ?? 'Falha ao salvar o imposto.');
  await carregarDaAPI();
}

export async function removerOverride(distribuidora: string): Promise<void> {
  const res = await fetch(`/api/impostos/overrides/${encodeURIComponent(distribuidora)}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.erro ?? 'Falha ao restaurar o padrão.');
  }
  await carregarDaAPI();
}
