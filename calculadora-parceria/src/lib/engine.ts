import impostosData from '../data/impostos.json';
import descontoData from '../data/desconto.json';
import isencoesData from '../data/isencoes.json';
import equivalenciaData from '../data/equivalencia.json';
import distribuidorasData from '../data/distribuidoras.json';
import { getTarifasB1, getComponentes } from './tarifasStore';
import { getImpostoOverride } from './impostosOverridesStore';
import { getIsencaoOverride } from './isencoesOverridesStore';
import type {
  ParceriaInput, ParceriaResultado, IsencaoFlags, TarifaBase, ComponentesTusd,
  Faixa, Enquadramento, SimulacaoFaturaDetalhe,
} from '../types';

export const DISTRIBUIDORAS: string[] = distribuidorasData;

// ── Rampa Fio B (Lei 14.300), PARCERIA usa a tabela BASE!T8:U13 ───────────────
const RAMPA_FIO_B: Array<[number, number]> = [
  [2025, 0.45],
  [2026, 0.60],
  [2027, 0.75],
  [2028, 0.90],
];
export function fioBRampaPct(ano: number): number {
  if (ano >= 2029) return 1;
  for (let i = RAMPA_FIO_B.length - 1; i >= 0; i--) {
    if (ano >= RAMPA_FIO_B[i][0]) return RAMPA_FIO_B[i][1];
  }
  return RAMPA_FIO_B[0][1];
}

function norm(s: string | undefined | null): string {
  return (s ?? '').trim().toUpperCase();
}

export function resolverEstado(distribuidora: string): string {
  const row = descontoData.find((d) => d.distribuidora === distribuidora);
  if (!row) throw new Error(`Distribuidora não encontrada na tabela de descontos: ${distribuidora}`);
  return row.estado;
}

export function descontoPadrao(distribuidora: string): number {
  const row = descontoData.find((d) => d.distribuidora === distribuidora);
  return row?.desconto ?? 0;
}

/** Se a concessionária tiver um override cadastrado (aba Impostos), ele tem
 * prioridade sobre a alíquota padrão do estado. */
export function buscarImpostos(estado: string, distribuidora?: string): { icms: number; pisCofins: number } {
  if (distribuidora) {
    const override = getImpostoOverride(distribuidora);
    if (override) return { icms: override.icms, pisCofins: override.pisCofins };
  }
  const row = impostosData.find((i) => i.estado === estado);
  if (!row) throw new Error(`Estado sem alíquotas cadastradas: ${estado}`);
  return { icms: row.icms, pisCofins: row.pisCofins };
}

export function resolverEquivalencia(distribuidora: string): { equiv1: string; equiv2: string } {
  const row = equivalenciaData.find((e) => e.distribuidora === distribuidora);
  if (!row) throw new Error(`Distribuidora sem código equivalente ANEEL: ${distribuidora}`);
  return { equiv1: row.equiv1, equiv2: row.equiv2 };
}

export function faixaPotencia(potenciaConexaoMW: number): Faixa {
  return potenciaConexaoMW <= 1 ? '≤1 MW' : '>1 MW';
}

/** Replica a fórmula LET de BASE!C3:F3 — chave exata (estado|modalidade|fonte|faixa)
 * com fallback para fonte="Todas" quando não há regra específica para a fonte. Se a
 * concessionária tiver um override cadastrado (aba Isenções), ele tem prioridade
 * sobre a regra padrão do estado. */
export function buscarIsencoes(estado: string, modalidade: string, fonte: string, faixa: Faixa, distribuidora?: string): IsencaoFlags {
  if (distribuidora) {
    const override = getIsencaoOverride(distribuidora, modalidade);
    if (override) {
      return {
        teIcms: override.teIcms, tePisCofins: override.tePisCofins,
        tusdIcms: override.tusdIcms, tusdPisCofins: override.tusdPisCofins,
      };
    }
  }
  const keyExata = `${norm(estado)}|${norm(modalidade)}|${norm(fonte)}|${norm(faixa)}`;
  const keyTodas = `${norm(estado)}|${norm(modalidade)}|TODAS|${norm(faixa)}`;
  const buildKey = (r: (typeof isencoesData)[number]) =>
    `${norm(r.estado)}|${norm(r.modalidade)}|${norm(r.fonte)}|${norm(r.faixa)}`;
  const row = isencoesData.find((r) => buildKey(r) === keyExata) ?? isencoesData.find((r) => buildKey(r) === keyTodas);
  if (!row) throw new Error(`Sem regra de isenção para ${estado}/${modalidade}/${faixa}`);
  return {
    teIcms: row.teIcms === 'SIM',
    tePisCofins: row.tePisCofins === 'SIM',
    tusdIcms: row.tusdIcms === 'SIM',
    tusdPisCofins: row.tusdPisCofins === 'SIM',
  };
}

/** Tarifa homologada vigente (Tarifas_B1), replica BASE!L7/L8: pega a linha do
 * código equivalente com a maior data de início de vigência. Valores convertidos
 * de R$/MWh para R$/kWh. Só considera a linha de consumo normal (detalhe "Não se
 * aplica") — a linha específica de energia compensada via SCEE tem sua própria
 * busca, ver tarifaVigenteScee. */
export function tarifaVigente(equiv1: string): TarifaBase {
  const linhas = getTarifasB1().filter((r) => r.codigo === equiv1 && r.detalhe === 'Não se aplica');
  if (linhas.length === 0) throw new Error(`Sem tarifa homologada para código ${equiv1}`);
  const maisRecente = linhas.reduce((a, b) => (b.inicioVigencia > a.inicioVigencia ? b : a));
  return {
    te: maisRecente.te / 1000, tusd: maisRecente.tusd / 1000,
    inicioVigencia: maisRecente.inicioVigencia, fimVigencia: maisRecente.fimVigencia,
  };
}

/** Tarifa TE/TUSD específica de energia compensada via SCEE (detalhe "SCEE" na base da
 * ANEEL) — usada só pro cálculo de Benefício Bruto/Líquido das distribuidoras Equatorial
 * em GD2 (ver DISTRIBUIDORAS_METODO_SCEE). Mesma busca de tarifaVigente, mas filtrando o
 * outro detalhe. Valores em R$/kWh. */
export function tarifaVigenteScee(equiv1: string): TarifaBase {
  const linhas = getTarifasB1().filter((r) => r.codigo === equiv1 && r.detalhe === 'SCEE');
  if (linhas.length === 0) throw new Error(`Sem tarifa SCEE homologada para código ${equiv1}`);
  const maisRecente = linhas.reduce((a, b) => (b.inicioVigencia > a.inicioVigencia ? b : a));
  return {
    te: maisRecente.te / 1000, tusd: maisRecente.tusd / 1000,
    inicioVigencia: maisRecente.inicioVigencia, fimVigencia: maisRecente.fimVigencia,
  };
}

/** Componentes de TUSD (Componentes_Tarifarias), replica BASE!L9/L10/L11: primeira
 * linha do código equivalente com o componente pedido, em R$/kWh. */
export function componentesTusd(equiv2: string): ComponentesTusd {
  const busca = (componente: string) => {
    const row = getComponentes().find((r) => r.codigo === equiv2 && r.componente === componente);
    return (row?.valor ?? 0) / 1000;
  };
  return {
    fioB: busca('TUSD_FioB'),
    fioA_FR: busca('TUSD_FR'),
    fioA_RB: busca('TUSD_RB'),
  };
}

interface TarifaCompensadaResultado {
  compensada: number;
  parteTE: number;
  parteTUSD: number;
}

/** Distribuidoras Equatorial cuja tarifa compensada em GD2 é calculada via Benefício
 * Bruto/Líquido (tarifa SCEE homologada pela ANEEL) em vez da fórmula genérica de
 * grossTE/grossTUSD — validado contra fatura real de Equatorial PI. Só se aplica ao
 * enquadramento GD2; GD1/GD3 dessas distribuidoras continuam na fórmula genérica. */
export const DISTRIBUIDORAS_METODO_SCEE = new Set([
  'Equatorial AL', 'Equatorial PA', 'Equatorial PI', 'Equatorial MA', 'Equatorial CEA',
]);

interface BeneficioScee {
  bruto: number;
  liquido: number;
}

/** Benefício Bruto/Líquido = tarifa SCEE (TE+TUSD específico de energia compensada) menos o
 * Fio B da rampa GD2, no Líquido sem tributos e no Bruto com tributos (ICMS "por dentro" +
 * PIS/COFINS) grossados separadamente — sem considerar isenções (instrução explícita: essas
 * distribuidoras não levam isenção em conta nesse cálculo). Validado contra duas faturas
 * reais (Equatorial PI e PA, 08/2026): Líquido bate exato; Bruto fica a ~1-1,5% do valor
 * impresso, atribuído a arredondamento em cascata nas 6 casas decimais que a ANEEL publica
 * (a distribuidora deve calcular internamente com mais precisão do que exibe). */
export function calcularBeneficioScee(
  tarifasScee: TarifaBase, fioBSemTributos: number, icmsAliquota: number, pisCofinsAliquota: number,
): BeneficioScee {
  const grossar = (base: number) => base / (1 - icmsAliquota) / (1 - pisCofinsAliquota);
  const tarifaSceeSemTributos = tarifasScee.te + tarifasScee.tusd;

  const liquido = tarifaSceeSemTributos - fioBSemTributos;
  const bruto = grossar(tarifaSceeSemTributos) - grossar(fioBSemTributos);
  return { bruto, liquido };
}

/** Tarifa compensada de GD2 via Benefício Bruto/Líquido — validado contra faturas reais de
 * Equatorial PI e PA (08/2026). Fórmula:
 *   T_compensada = trfDistribuidora − FioB(c/tributos) − (BenefícioBruto − BenefícioLíquido)
 * onde FioB é o Fio B da rampa GD2 (Lei 14.300) grossado por ICMS/PIS-COFINS, sempre — sem
 * considerar isenções (instrução explícita: essas distribuidoras não levam isenção em conta
 * nesse cálculo específico de GD2). O split parteTE/parteTUSD não é significativo aqui (a
 * fórmula mistura os dois); todo o valor fica em parteTUSD só pra não quebrar simularFatura. */
function calcularTarifaCompensadaScee(
  tarifas: TarifaBase, componentes: ComponentesTusd, tarifasScee: TarifaBase,
  icmsAliquota: number, pisCofinsAliquota: number, ano: number,
): TarifaCompensadaResultado {
  const grossar = (base: number) => base / (1 - icmsAliquota) / (1 - pisCofinsAliquota);

  const trfDistribuidora = grossar(tarifas.te + tarifas.tusd);
  const fioBSemTributos = componentes.fioB * fioBRampaPct(ano);
  const fioBRate = grossar(fioBSemTributos);
  const { bruto, liquido } = calcularBeneficioScee(tarifasScee, fioBSemTributos, icmsAliquota, pisCofinsAliquota);

  const compensada = trfDistribuidora - fioBRate - (bruto - liquido);
  return { compensada, parteTE: 0, parteTUSD: compensada };
}

/** Replica BASE!L17:L19 (GD1/GD2/GD3). Pra GD2 das distribuidoras em
 * DISTRIBUIDORAS_METODO_SCEE, usa o método validado por fatura real em vez da fórmula
 * genérica — ver calcularTarifaCompensadaScee. */
export function calcularTarifaCompensada(
  enquadramento: Enquadramento,
  tarifas: TarifaBase,
  componentes: ComponentesTusd,
  isencoes: IsencaoFlags,
  icmsAliquota: number,
  pisCofinsAliquota: number,
  ano: number,
  distribuidora?: string,
  tarifasScee?: TarifaBase,
): TarifaCompensadaResultado {
  if (enquadramento === 'GD2' && distribuidora && DISTRIBUIDORAS_METODO_SCEE.has(distribuidora)) {
    if (!tarifasScee) throw new Error(`Sem tarifa SCEE pra calcular GD2 de ${distribuidora}`);
    return calcularTarifaCompensadaScee(tarifas, componentes, tarifasScee, icmsAliquota, pisCofinsAliquota, ano);
  }

  const qTE_icms = isencoes.teIcms ? icmsAliquota : 0;
  const qTE_pis = isencoes.tePisCofins ? pisCofinsAliquota : 0;
  const qTUSD_icms = isencoes.tusdIcms ? icmsAliquota : 0;
  const qTUSD_pis = isencoes.tusdPisCofins ? pisCofinsAliquota : 0;

  const grossTE = (base: number) => base / (1 - qTE_icms) / (1 - qTE_pis);
  const grossTUSD = (base: number) => base / (1 - qTUSD_icms) / (1 - qTUSD_pis);

  if (enquadramento === 'GD1') {
    const parteTE = grossTE(tarifas.te);
    const parteTUSD = grossTUSD(tarifas.tusd);
    return { compensada: parteTE + parteTUSD, parteTE, parteTUSD };
  }
  if (enquadramento === 'GD2') {
    const fioBBenef = fioBRampaPct(ano) * componentes.fioB;
    const parteTE = grossTE(tarifas.te);
    const parteTUSD = grossTUSD(tarifas.tusd - fioBBenef);
    return { compensada: parteTE + parteTUSD, parteTE, parteTUSD };
  }
  // GD3
  const beneficioFioA = 0.4 * (componentes.fioA_FR + componentes.fioA_RB);
  const parteTE = grossTE(tarifas.te - beneficioFioA);
  const parteTUSD = grossTUSD(tarifas.tusd - componentes.fioB);
  return { compensada: parteTE + parteTUSD, parteTE, parteTUSD };
}

function simularFatura(
  input: ParceriaInput,
  ctx: {
    icmsAliquota: number; pisCofinsAliquota: number;
    tarifaCompensada: TarifaCompensadaResultado;
    isencoes: IsencaoFlags;
    geracaoMensalKWh: number; numeroClientes: number; consumoMinimoKWh: number;
    descontoClientePct: number;
  },
): SimulacaoFaturaDetalhe {
  const { icmsAliquota, pisCofinsAliquota, tarifaCompensada, isencoes, geracaoMensalKWh, numeroClientes, consumoMinimoKWh, descontoClientePct } = ctx;

  // TE/TUSD "cheias" (grossed up sem considerar isenção — Simulação Fatura!B2/B3 = BASE!M13/N13)
  const { te, tusd } = tarifaVigente(resolverEquivalencia(input.distribuidora).equiv1);
  const teCheia = te / (1 - icmsAliquota) / (1 - pisCofinsAliquota);
  const tusdCheia = tusd / (1 - icmsAliquota) / (1 - pisCofinsAliquota);

  const qInjTE_icms = isencoes.teIcms ? icmsAliquota : 0;
  const qInjTE_pis = isencoes.tePisCofins ? pisCofinsAliquota : 0;
  const qInjTUSD_icms = isencoes.tusdIcms ? icmsAliquota : 0;
  const qInjTUSD_pis = isencoes.tusdPisCofins ? pisCofinsAliquota : 0;

  const kConsumo = geracaoMensalKWh + numeroClientes * consumoMinimoKWh;
  const consumoTE = { qtde: kConsumo, valor: kConsumo * teCheia, icms: 0, pisCofins: 0 };
  consumoTE.icms = consumoTE.valor * icmsAliquota;
  consumoTE.pisCofins = (consumoTE.valor - consumoTE.icms) * pisCofinsAliquota;

  const consumoTUSD = { qtde: kConsumo, valor: kConsumo * tusdCheia, icms: 0, pisCofins: 0 };
  consumoTUSD.icms = consumoTUSD.valor * icmsAliquota;
  consumoTUSD.pisCofins = (consumoTUSD.valor - consumoTUSD.icms) * pisCofinsAliquota;

  const kInjecao = -geracaoMensalKWh;
  const injecaoTE = { qtde: kInjecao, valor: kInjecao * tarifaCompensada.parteTE, icms: 0, pisCofins: 0 };
  injecaoTE.icms = injecaoTE.valor * qInjTE_icms;
  injecaoTE.pisCofins = (injecaoTE.valor - injecaoTE.icms) * qInjTE_pis;

  const injecaoTUSD = { qtde: kInjecao, valor: kInjecao * tarifaCompensada.parteTUSD, icms: 0, pisCofins: 0 };
  injecaoTUSD.icms = injecaoTUSD.valor * qInjTUSD_icms;
  injecaoTUSD.pisCofins = (injecaoTUSD.valor - injecaoTUSD.icms) * qInjTUSD_pis;

  const totalFatura = {
    valor: consumoTE.valor + consumoTUSD.valor + injecaoTE.valor + injecaoTUSD.valor,
    icms: consumoTE.icms + consumoTUSD.icms + injecaoTE.icms + injecaoTUSD.icms,
    pisCofins: consumoTE.pisCofins + consumoTUSD.pisCofins + injecaoTE.pisCofins + injecaoTUSD.pisCofins,
  };

  const trfCheia = teCheia + tusdCheia;
  const semAlexandriaValor = kConsumo * trfCheia;
  const semAlexandriaIcms = semAlexandriaValor * icmsAliquota;
  const semAlexandriaPis = (semAlexandriaValor - semAlexandriaIcms) * pisCofinsAliquota;
  const faturaSemAlexandria = {
    valor: semAlexandriaValor, icms: semAlexandriaIcms, pisCofins: semAlexandriaPis,
    imposto: semAlexandriaIcms + semAlexandriaPis,
  };

  const injecaoBaseValor = geracaoMensalKWh * (trfCheia * (1 - descontoClientePct));
  const injecaoBaseIcms = injecaoBaseValor * icmsAliquota;
  const injecaoBasePis = (injecaoBaseValor - injecaoBaseIcms) * pisCofinsAliquota;
  const injecaoBase = {
    valor: injecaoBaseValor, icms: injecaoBaseIcms, pisCofins: injecaoBasePis,
    imposto: injecaoBaseIcms + injecaoBasePis,
  };

  const faturaComAlexandria = {
    valor: totalFatura.valor, icms: totalFatura.icms, pisCofins: totalFatura.pisCofins,
    imposto: totalFatura.icms + totalFatura.pisCofins,
  };

  return {
    numeroClientes, teCheia, tusdCheia,
    consumoTE, consumoTUSD, injecaoTE, injecaoTUSD, totalFatura,
    faturaSemAlexandria, injecaoBase, faturaComAlexandria,
    creditoImposto: faturaSemAlexandria.imposto - injecaoBase.imposto - faturaComAlexandria.imposto,
  };
}

export function calcularParceria(input: ParceriaInput): ParceriaResultado {
  const estado = resolverEstado(input.distribuidora);
  const { icms: icmsAliquota, pisCofins: pisCofinsAliquota } = buscarImpostos(estado, input.distribuidora);
  const faixa = faixaPotencia(input.potenciaConexaoMW);
  const isencoes = buscarIsencoes(estado, input.modalidade, input.fonte, faixa, input.distribuidora);
  const { equiv1, equiv2 } = resolverEquivalencia(input.distribuidora);
  const tarifas = tarifaVigente(equiv1);
  const componentes = componentesTusd(equiv2);
  const usaMetodoScee = input.enquadramento === 'GD2' && DISTRIBUIDORAS_METODO_SCEE.has(input.distribuidora);
  const tarifasScee = usaMetodoScee ? tarifaVigenteScee(equiv1) : undefined;

  const geracaoMensalKWh = input.geracaoMensalKWh ?? input.potenciaInstaladaMWp * 120000;
  const descontoClientePct = input.descontoClientePct ?? descontoPadrao(input.distribuidora);
  const pescoco = input.pescoco ?? 1;
  const consumoMedioClienteKWh = input.consumoMedioClienteKWh ?? 500;
  const consumoMinimoKWh = input.consumoMinimoKWh ?? 50;

  const tarifaCompensadaResultado = calcularTarifaCompensada(
    input.enquadramento, tarifas, componentes, isencoes, icmsAliquota, pisCofinsAliquota, input.ano,
    input.distribuidora, tarifasScee,
  );
  const tarifaCompensada = tarifaCompensadaResultado.compensada;

  const trfAneel = tarifas.te + tarifas.tusd;
  const trfDistribuidora = trfAneel / (1 - icmsAliquota) / (1 - pisCofinsAliquota);
  const tarifaClienteBase = trfDistribuidora * (1 - descontoClientePct);
  const tarifaDesconto = tarifaCompensada - descontoClientePct * trfDistribuidora;
  const valorTotalBruto = tarifaCompensada * geracaoMensalKWh;

  const numeroClientes = geracaoMensalKWh / (consumoMedioClienteKWh - consumoMinimoKWh);
  const faturaSemAlexandria = numeroClientes * consumoMedioClienteKWh * trfDistribuidora;

  const tGerador = tarifaDesconto * (1 - input.desagioPct);
  const faturamentoBrutoGerador = tGerador * geracaoMensalKWh;
  const porcentagemBrutaEstimada = faturamentoBrutoGerador / valorTotalBruto;

  const valorInjecao = (tarifaClienteBase - (trfDistribuidora - tarifaCompensada)) * geracaoMensalKWh;
  const tClienteFinal = valorInjecao / geracaoMensalKWh;

  const simulacaoFatura = simularFatura(input, {
    icmsAliquota, pisCofinsAliquota, tarifaCompensada: tarifaCompensadaResultado, isencoes,
    geracaoMensalKWh, numeroClientes, consumoMinimoKWh, descontoClientePct,
  });
  const faturasConcessionariaClientes = simulacaoFatura.totalFatura.valor;

  const faturaComAlexandria = valorInjecao + faturasConcessionariaClientes;
  const descontoClientes = faturaSemAlexandria - faturaComAlexandria;
  const percentualDescontoLiquido = descontoClientes / faturaSemAlexandria;

  const faturamento1Mes = valorInjecao * pescoco;
  const recorrenciaMensal = valorInjecao - faturamentoBrutoGerador;
  const faturamento1Ano = faturamento1Mes + (12 - pescoco) * recorrenciaMensal;
  const takeRate1Ano = faturamento1Ano / (valorTotalBruto * 12);
  const faturamentoAnualGerador = faturamentoBrutoGerador * (12 - pescoco);

  return {
    estado, icmsAliquota, pisCofinsAliquota, isencoes, faixa,
    tarifaVigente: tarifas, componentesTusd: componentes, fioBRampaPct: fioBRampaPct(input.ano),
    trfAneel, trfDistribuidora, tarifaCompensada, tarifaClienteBase, tarifaDesconto,
    faturaSemAlexandria, valorTotalBruto, geracaoMensalKWh, descontoClientePct,
    tGerador, faturamentoBrutoGerador, porcentagemBrutaEstimada, numeroClientes,
    valorInjecao, tClienteFinal, faturasConcessionariaClientes, faturaComAlexandria,
    descontoClientes, percentualDescontoLiquido, faturamento1Mes, recorrenciaMensal,
    faturamento1Ano, takeRate1Ano, pescoco, faturamentoAnualGerador,
    simulacaoFatura,
  };
}
