import type { Posto } from './types';

export const R = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
export const RS = (n: number) => `R$ ${R(n, 2)}`;
export const RKWH = (n: number) => `R$ ${R(n, 4)}/kWh`;
export const PCT = (n: number) => (Number.isFinite(n) ? `${R(n * 100, 1)}%` : '—');
export const DATA = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export const ROTULO_POSTO: Record<Posto, string> = { Ponta: 'Ponta', 'Fora ponta': 'Fora Ponta', 'Não se aplica': 'Consumo' };

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MES = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;

/** Aceita "0,32", "0.32" e "1.500.000" (milhar com ponto). */
export function numeroBR(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}
