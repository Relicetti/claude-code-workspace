export interface IsencaoOverride {
  distribuidora: string;
  modalidade: string;
  teIcms: boolean;
  tePisCofins: boolean;
  tusdIcms: boolean;
  tusdPisCofins: boolean;
  atualizadoEm: string;
}

const chave = (distribuidora: string, modalidade: string) => `${distribuidora}|${modalidade}`;

let overrides: Map<string, IsencaoOverride> = new Map();

export function getIsencaoOverride(distribuidora: string, modalidade: string): IsencaoOverride | undefined {
  return overrides.get(chave(distribuidora, modalidade));
}

export function getTodosIsencoesOverrides(): IsencaoOverride[] {
  return [...overrides.values()];
}

/** Busca os overrides do servidor e substitui o cache em memória. Chamado ao
 * montar o app e depois de qualquer salvamento/remoção, pra manter o motor de
 * cálculo (engine.ts) sincronizado com o que está salvo no banco. */
export async function carregarDaAPI(): Promise<void> {
  try {
    const res = await fetch('/api/isencoes/overrides');
    if (!res.ok) return;
    const data: IsencaoOverride[] = await res.json();
    overrides = new Map(data.map((o) => [chave(o.distribuidora, o.modalidade), o]));
  } catch (e) {
    console.warn('Não foi possível carregar os overrides de isenções.', e);
  }
}

export async function salvarOverride(
  distribuidora: string,
  modalidade: string,
  flags: { teIcms: boolean; tePisCofins: boolean; tusdIcms: boolean; tusdPisCofins: boolean },
): Promise<void> {
  const res = await fetch('/api/isencoes/overrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distribuidora, modalidade, ...flags }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro ?? 'Falha ao salvar a isenção.');
  await carregarDaAPI();
}

export async function removerOverride(distribuidora: string, modalidade: string): Promise<void> {
  const res = await fetch(
    `/api/isencoes/overrides/${encodeURIComponent(distribuidora)}?modalidade=${encodeURIComponent(modalidade)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.erro ?? 'Falha ao restaurar o padrão.');
  }
  await carregarDaAPI();
}
