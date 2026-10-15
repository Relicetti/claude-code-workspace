// Porte da aba "Simulação" de Calculos_GD_GrupoA.xlsx, generalizado para o Grupo B
// (tarifa monômia: um único posto "Não se aplica" no lugar de Ponta/Fora ponta).
import type {
  DadosTarifarios, Entrada, Grupo, IsencoesGD, LinhaPosto, ModalidadeTarifaria, Posto, Resultado,
} from '../types';
import descontoData from '../data/desconto.json';
import equivalenciaData from '../data/equivalencia.json';
import isencoesData from '../data/isencoes.json';
import distribuidorasData from '../data/distribuidoras.json';

export const DISTRIBUIDORAS: string[] = distribuidorasData;
export const SUBGRUPOS: Record<Grupo, string[]> = {
  A: ['A1', 'A2', 'A3', 'A3a', 'A4', 'AS'],
  B: ['B1', 'B2', 'B3'],
};

export function grupoDoSubgrupo(subgrupo: string): Grupo {
  return subgrupo.startsWith('B') ? 'B' : 'A';
}

export function postosDoGrupo(grupo: Grupo): Posto[] {
  return grupo === 'A' ? ['Ponta', 'Fora ponta'] : ['Não se aplica'];
}

export function modalidadesDoGrupo(grupo: Grupo): ModalidadeTarifaria[] {
  return grupo === 'A' ? ['Verde', 'Azul'] : ['Convencional'];
}

/** Impostos padrão da planilha (Simulação!F4:F6) — conferir na fatura do cliente. */
export const IMPOSTOS_PADRAO = { icms: 0.24, pis: 0.0053, cofins: 0.0242 };

// Rampa do Fio B não compensado em GD2 (Lei 14.300) — mesma tabela da calculadora-parceria.
// A planilha usa 2024=20%, 2025=40%, 2026=60%, 2027=80%, ≥2028=100%; coincide só em 2026.
const RAMPA_FIO_B: Array<[number, number]> = [
  [2023, 0.15], [2024, 0.30], [2025, 0.45], [2026, 0.60], [2027, 0.75], [2028, 0.90],
];
export function fioBRampaPct(ano: number): number {
  if (ano >= 2029) return 1;
  for (let i = RAMPA_FIO_B.length - 1; i >= 0; i--) {
    if (ano >= RAMPA_FIO_B[i][0]) return RAMPA_FIO_B[i][1];
  }
  return RAMPA_FIO_B[0][1];
}

export function resolverEstado(distribuidora: string): string {
  const row = descontoData.find((d) => d.distribuidora === distribuidora);
  if (!row) throw new Error(`Distribuidora sem estado cadastrado: ${distribuidora}`);
  return row.estado;
}

export function descontoPadrao(distribuidora: string): number {
  return descontoData.find((d) => d.distribuidora === distribuidora)?.desconto ?? 0.1;
}

/** Nome comercial → SigAgente da ANEEL (Simulação!C8). A ANEEL renomeia agentes de vez em
 * quando (ex: AME → "Âmbar Amazonas"), então tenta as duas equivalências contra os dados. */
export function resolverAgenteAneel(distribuidora: string, dados: DadosTarifarios): string {
  const eq = equivalenciaData.find((e) => e.distribuidora === distribuidora);
  const candidatos = eq ? [eq.equiv2, eq.equiv1] : [distribuidora];
  return candidatos.find((c) => dados.tarifas.some((t) => t.agente === c)) ?? candidatos[0];
}

/** Simulação!I9:I12 — busca por estado|modalidade|fonte|≤1 MW, com fallback para fonte "Todas". */
export function resolverIsencoes(estado: string, modalidadeGD: string, fonte: string): IsencoesGD {
  const achar = (f: string) => isencoesData.find(
    (i) => i.estado === estado && i.modalidade === modalidadeGD && i.fonte === f && i.faixa === '≤1 MW',
  );
  const row = achar(fonte) ?? achar('Todas');
  const sim = (v: string | undefined) => v === 'SIM';
  return {
    teIcms: sim(row?.teIcms), tePisCofins: sim(row?.tePisCofins),
    tusdIcms: sim(row?.tusdIcms), tusdPisCofins: sim(row?.tusdPisCofins),
  };
}

/** Linha com a vigência mais recente que começou até 31/12 do ano de referência
 * (o XLOOKUP + MAXIFS da planilha). */
function maisRecente<T extends { inicio: string }>(linhas: T[], ano: number): T | undefined {
  const limite = `${ano}-12-31`;
  let melhor: T | undefined;
  for (const l of linhas) {
    if (l.inicio <= limite && (!melhor || l.inicio > melhor.inicio)) melhor = l;
  }
  return melhor;
}

export function calcular(e: Entrada, dados: DadosTarifarios): Resultado {
  const estado = resolverEstado(e.distribuidora);
  const agente = resolverAgenteAneel(e.distribuidora, dados);
  const isencoes = resolverIsencoes(estado, e.modalidadeGD, e.fonte);
  const rampa = e.enquadramento === 'GD2' ? fioBRampaPct(e.ano) : 0;
  const pisCofins = e.pis + e.cofins;

  // Tarifa cheia: ICMS e PIS/COFINS "por dentro" (Simulação!F10:F13).
  const cheia = (v: number) => v / (1 - e.icms) / (1 - pisCofins);
  // Tarifa injetada: só grossa pelo imposto que a isenção GD devolve (Simulação!I16:I19).
  const injetada = (v: number, isentoIcms: boolean, isentoPisCofins: boolean) =>
    v / (1 - (isentoIcms ? e.icms : 0)) / (1 - (isentoPisCofins ? pisCofins : 0));

  const postos: LinhaPosto[] = postosDoGrupo(grupoDoSubgrupo(e.subgrupo)).map((posto) => {
    const filtro = <T extends { agente: string; subgrupo: string; modalidade: string; posto: string }>(l: T) =>
      l.agente === agente && l.subgrupo === e.subgrupo && l.modalidade === e.modalidadeTarifaria && l.posto === posto;
    const tarifa = maisRecente(dados.tarifas.filter(filtro), e.ano);
    if (!tarifa) {
      throw new Error(`Sem tarifa ANEEL para ${agente} ${e.subgrupo} ${e.modalidadeTarifaria} (${posto}) até ${e.ano}.`);
    }
    const fioB = maisRecente(dados.fioB.filter(filtro), e.ano)?.fioB ?? 0;
    // A planilha desconta o Fio B só da TUSD Ponta; na prática ele só é não-nulo lá
    // (Verde/Ponta), então descontar em todo posto dá o mesmo resultado e cobre o Grupo B.
    const fioBAplicado = fioB * rampa;
    const kWh = e.consumo[posto] ?? 0;

    const teCheia = cheia(tarifa.te);
    const tusdCheia = cheia(tarifa.tusd);
    const teInjetada = injetada(tarifa.te, isencoes.teIcms, isencoes.tePisCofins);
    const tusdInjetada = injetada(tarifa.tusd - fioBAplicado, isencoes.tusdIcms, isencoes.tusdPisCofins);
    return {
      posto, kWh, te: tarifa.te, tusd: tarifa.tusd, fioB, fioBAplicado,
      teCheia, tusdCheia, teInjetada, tusdInjetada,
      valorAtual: (kWh * (teCheia + tusdCheia)) / 1000,
      valorInjetado: (kWh * (teInjetada + tusdInjetada)) / 1000,
      inicioVigencia: tarifa.inicio, resolucao: tarifa.resolucao,
    };
  });

  const consumoTotalKWh = postos.reduce((s, p) => s + p.kWh, 0);
  const valorAtual = postos.reduce((s, p) => s + p.valorAtual, 0);
  const valorInjetado = postos.reduce((s, p) => s + p.valorInjetado, 0);
  const porKWh = (v: number) => (consumoTotalKWh > 0 ? v / consumoTotalKWh : 0);

  const desconto = e.descontoPct * valorAtual;              // F23
  const valorCss = valorAtual - valorInjetado;              // L4 = (F21 − I26) × C18
  const faturaGeracao = valorAtual - desconto - valorCss;   // L5
  // Planilha: Kora = fatura de geração × deságio (L10) e gerador = o resto (L11). Com o valor do
  // dono do crédito fixado, a conta inverte: gerador = R$/kWh × consumo e a Kora fica com o resto.
  const valorGerador = e.precoGeradorKWh !== undefined
    ? e.precoGeradorKWh * consumoTotalKWh
    : faturaGeracao * (1 - e.desagioPct);
  const margem = faturaGeracao - valorGerador;
  // Comissão do vendedor: R$/kWh fixo que sai da parte da Kora.
  const valorVendedor = (e.vendedorKWh ?? 0) * consumoTotalKWh;
  const valorKora = margem - valorVendedor;

  return {
    estado, agenteAneel: agente, isencoes, fioBRampaPct: rampa, postos, consumoTotalKWh,
    valorAtual, tarifaMediaCliente: porKWh(valorAtual), desconto,
    valorInjetado, tarifaMediaInjetada: porKWh(valorInjetado),
    valorCss, tarifaMediaCss: porKWh(valorCss), faturaGeracao, valorTotalComKora: valorCss + faturaGeracao,
    tarifaMediaGeracao: porKWh(faturaGeracao),
    valorKora, tarifaMediaKora: porKWh(valorKora), valorVendedor, tarifaMediaVendedor: porKWh(valorVendedor),
    tarifaMediaFinal: porKWh(valorCss + faturaGeracao),
    desagioEfetivoPct: faturaGeracao !== 0 ? margem / faturaGeracao : 0, valorGerador, tarifaMediaGerador: porKWh(valorGerador),
    economiaClientePct: valorAtual > 0 ? desconto / valorAtual : 0,
  };
}
