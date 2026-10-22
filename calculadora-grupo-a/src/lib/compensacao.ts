// Conversão de créditos GD entre postos tarifários (memorial "Conversão de créditos GD entre postos
// tarifários", REN 1.000/2021 arts. 655-G a 655-S): o crédito compensa primeiro o próprio posto
// (mPT, sem fator) e só o que sobra cobre outro posto (oPT). Para cobrir 1 kWh consumido no posto d
// com crédito do posto o, debita-se TE_d / TE_o kWh do saldo de o — TE de aplicação da UC
// consumidora, sem impostos, sem bandeira e sem desconto de irrigante.
import type { Posto } from '../types';

export type PorPosto = Partial<Record<Posto, number>>;

export interface Compensacao {
  /** kWh de consumo cobertos por posto (o que a fatura mostra em mPT + oPT). */
  compensado: PorPosto;
  /** kWh debitados por posto de origem do saldo. */
  debitado: PorPosto;
  saldoFinal: PorPosto;
}

/** Fator para usar crédito do posto `origem` no posto `destino`: TE_destino / TE_origem. */
export function fatorConversao(te: PorPosto, origem: Posto, destino: Posto): number {
  if (origem === destino) return 1;
  const teO = te[origem] ?? 0;
  const teD = te[destino] ?? 0;
  if (!(teO > 0) || !(teD > 0)) throw new Error(`Sem TE para converter crédito de ${origem} para ${destino}.`);
  return teD / teO;
}

export function compensar(consumo: PorPosto, saldoInicial: PorPosto, te: PorPosto): Compensacao {
  const postos = Object.keys(consumo) as Posto[];
  const saldo: PorPosto = { ...saldoInicial };
  const compensado: PorPosto = {};
  const debitado: PorPosto = {};
  for (const p of postos) { compensado[p] = 0; }

  // 1) mesmo posto, sem fator
  for (const p of postos) {
    const x = Math.min(consumo[p] ?? 0, saldo[p] ?? 0);
    if (x <= 0) continue;
    compensado[p]! += x;
    saldo[p] = (saldo[p] ?? 0) - x;
    debitado[p] = (debitado[p] ?? 0) + x;
  }

  // 2) outro posto, com fator TE_d / TE_o. Ponta primeiro (é o caso do Grupo A: crédito fora ponta
  // cobrindo a ponta).
  const destinos = [...postos].sort((a, b) => (a === 'Ponta' ? -1 : b === 'Ponta' ? 1 : 0));
  for (const d of destinos) {
    for (const o of Object.keys(saldo) as Posto[]) {
      const falta = (consumo[d] ?? 0) - compensado[d]!;
      if (o === d || falta <= 0 || !((saldo[o] ?? 0) > 0)) continue;
      const f = fatorConversao(te, o, d);
      const x = Math.min(falta, saldo[o]! / f); // kWh do posto d cobertos
      compensado[d]! += x;
      saldo[o]! -= x * f;
      debitado[o] = (debitado[o] ?? 0) + x * f;
    }
  }
  return { compensado, debitado, saldoFinal: saldo };
}

/** Posto em que entra o crédito comprado: fora ponta na UC horária (o excedente de gerador
 * convencional chega como fora ponta), posto único no Grupo B convencional. */
export function postoDoCredito(postos: Posto[]): Posto {
  return postos.includes('Fora ponta') ? 'Fora ponta' : postos[0];
}
