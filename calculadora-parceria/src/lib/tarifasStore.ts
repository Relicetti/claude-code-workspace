import tarifasB1Seed from '../data/tarifas_b1.json';
import componentesSeed from '../data/componentes_tarifarias.json';
import equivalenciaData from '../data/equivalencia.json';

export interface TarifaB1Row {
  codigo: string; resolucao: string; inicioVigencia: string; fimVigencia: string;
  subgrupo: string; modalidade: string; classe: string; detalhe: string; tusd: number; te: number; total: number;
}

export interface ComponenteRow {
  codigo: string; resolucao: string | null; inicioVigencia: string; fimVigencia: string;
  subgrupo: string; modalidade: string; classe: string; componente: string; valor: number;
}

export interface SyncStatus {
  tarifasB1: { lastSyncedAt: string | null; rowCount: number };
  componentes: { lastSyncedAt: string | null; rowCount: number };
}

let tarifasB1: TarifaB1Row[] = tarifasB1Seed;
let componentes: ComponenteRow[] = componentesSeed;
let status: SyncStatus | null = null;

export function getTarifasB1(): TarifaB1Row[] { return tarifasB1; }
export function getComponentes(): ComponenteRow[] { return componentes; }
export function getStatus(): SyncStatus | null { return status; }

const MAPA_EQUIV1 = new Map(equivalenciaData.map((e) => [e.equiv1, e.distribuidora]));
const MAPA_EQUIV2 = new Map(equivalenciaData.map((e) => [e.equiv2, e.distribuidora]));

/** Tenta resolver o código ANEEL (usado em tarifas_b1/componentes) de volta pro nome
 * "amigável" da distribuidora (o mesmo usado no dropdown da calculadora). Só pra exibição
 * na tela de consulta — se não achar, mostra o próprio código. */
export function resolverDistribuidoraPorCodigo(codigo: string, dataset: 'b1' | 'componentes'): string | undefined {
  return dataset === 'b1' ? MAPA_EQUIV1.get(codigo) : MAPA_EQUIV2.get(codigo);
}

/** Busca o dataset atual do servidor (banco SQLite) e substitui o cache em memória.
 * Chamado uma vez ao montar o app; se falhar, mantém o seed estático já carregado. */
export async function carregarDaAPI(): Promise<void> {
  try {
    const [b1, comp, statusResp] = await Promise.all([
      fetch('/api/tarifas/b1').then((r) => r.json()),
      fetch('/api/tarifas/componentes').then((r) => r.json()),
      fetch('/api/tarifas/status').then((r) => r.json()),
    ]);
    if (Array.isArray(b1) && b1.length > 0) tarifasB1 = b1;
    if (Array.isArray(comp) && comp.length > 0) componentes = comp;
    status = statusResp;
  } catch (e) {
    console.warn('Não foi possível carregar tarifas do servidor, usando dados locais.', e);
  }
}

/** Dispara a sincronização real com a ANEEL no servidor e, se der certo, recarrega o cache. */
export async function atualizarTarifasAneel(): Promise<
  { ok: true; tarifasB1Count: number; componentesCount: number; tookMs: number } | { ok: false; error: string }
> {
  const res = await fetch('/api/tarifas/atualizar', { method: 'POST' });
  const data = await res.json();
  if (data.ok) await carregarDaAPI();
  return data;
}

export interface ProgressoSync { descricao: string; linhas: number }

/** Consulta o progresso da sincronização em andamento (os CSVs da ANEEL somam centenas de
 * MB e o processo pode levar vários minutos) — pra polling enquanto atualizarTarifasAneel
 * está pendente. */
export async function consultarProgressoSync(): Promise<{ sincronizando: boolean; progresso: ProgressoSync | null }> {
  const res = await fetch('/api/tarifas/progresso');
  return res.json();
}
