// Curva de degradação (State of Health) por ciclos acumulados — aba CURVA_SOH_WEG
// da planilha de referência. Pontos anuais assumindo ~1 ciclo/dia (365 ciclos/ano).
import type { SohPonto } from '../types'

export const CURVA_SOH_WEG: SohPonto[] = [
  { ano: 0, ciclos: 0, sohFrac: 0.986 },
  { ano: 1, ciclos: 365, sohFrac: 0.9371 },
  { ano: 2, ciclos: 730, sohFrac: 0.9123 },
  { ano: 3, ciclos: 1095, sohFrac: 0.8903 },
  { ano: 4, ciclos: 1460, sohFrac: 0.8691 },
  { ano: 5, ciclos: 1825, sohFrac: 0.8506 },
  { ano: 6, ciclos: 2190, sohFrac: 0.8335 },
  { ano: 7, ciclos: 2555, sohFrac: 0.8173 },
  { ano: 8, ciclos: 2920, sohFrac: 0.802 },
  { ano: 9, ciclos: 3285, sohFrac: 0.7873 },
  { ano: 10, ciclos: 3650, sohFrac: 0.7733 },
  { ano: 11, ciclos: 4015, sohFrac: 0.7597 },
  { ano: 12, ciclos: 4380, sohFrac: 0.7466 },
  { ano: 13, ciclos: 4745, sohFrac: 0.7339 },
  { ano: 14, ciclos: 5110, sohFrac: 0.7214 },
  { ano: 15, ciclos: 5475, sohFrac: 0.7094 },
  { ano: 16, ciclos: 5840, sohFrac: 0.6977 },
  { ano: 17, ciclos: 6205, sohFrac: 0.6861 },
  { ano: 18, ciclos: 6570, sohFrac: 0.6756 },
  { ano: 19, ciclos: 6935, sohFrac: 0.6652 },
  { ano: 20, ciclos: 7300, sohFrac: 0.6549 },
]

/**
 * Interpolação linear de SoH entre os pontos da curva, pelos ciclos acumulados.
 *
 * NOTA sobre a planilha original: a aba DIMENSIONAMENTO calculava o SoH via
 * INDEX/MATCH com aproximação por "degrau" (usa o ponto anterior mais próximo,
 * sem interpolar), enquanto a aba ECONOMIA_ANUAL trazia valores colados que,
 * conferindo as contas, batem com interpolação linear entre os mesmos pontos
 * (ex.: em 264 ciclos, o degrau dava 0,9860 mas o valor realmente usado no
 * financeiro era 0,9506 — o ponto interpolado entre os ciclos 0 e 365). Ou
 * seja, a própria planilha usava dois métodos diferentes para a mesma curva.
 * Aqui padronizamos em interpolação linear em todo o engine (é o método que
 * de fato alimentou o financeiro da proposta de referência).
 */
export function lookupSoH(ciclosAcumulados: number, curva: SohPonto[] = CURVA_SOH_WEG): number {
  const primeiro = curva[0]
  const ultimo = curva[curva.length - 1]
  if (ciclosAcumulados <= primeiro.ciclos) return primeiro.sohFrac
  if (ciclosAcumulados >= ultimo.ciclos) return ultimo.sohFrac

  for (let i = 0; i < curva.length - 1; i++) {
    const atual = curva[i]
    const proximo = curva[i + 1]
    if (ciclosAcumulados >= atual.ciclos && ciclosAcumulados <= proximo.ciclos) {
      const fracao = (ciclosAcumulados - atual.ciclos) / (proximo.ciclos - atual.ciclos)
      return atual.sohFrac - (atual.sohFrac - proximo.sohFrac) * fracao
    }
  }
  return ultimo.sohFrac
}
