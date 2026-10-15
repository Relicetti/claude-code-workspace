// Operação de longo prazo: um lote grande de crédito comprado de uma vez e abatido mês a mês na
// conta do cliente. Cada mês aplica os valores por kWh do cálculo da planilha (engine.calcular)
// à quantidade abatida naquele mês.
import { calcular } from './engine';
import type { DadosTarifarios, Entrada, Resultado } from '../types';

export interface ParametrosOperacao {
  creditoTotalKWh: number;
  prazoMeses: number;
  /** Primeiro mês de abatimento, "YYYY-MM". */
  mesInicio: string;
  /** Reajuste tarifário anual projetado, aplicado a partir do 2º ano da operação (composto). */
  reajusteAnualPct: number;
}

export interface MesOperacao {
  mes: string;            // "YYYY-MM"
  kWh: number;
  saldoFinalKWh: number;
  desconto: number;       // economia do cliente
  faturaGeracao: number;  // o que o cliente paga pelos créditos (receita da operação)
  valorGerador: number;   // pago ao dono do crédito
  valorVendedor: number;  // comissão do vendedor
  valorKora: number;      // o que fica com a Kora, já sem a comissão
}

export interface AnoOperacao extends Omit<MesOperacao, 'mes' | 'saldoFinalKWh'> {
  ano: number;
  meses: number;
}

export interface ResultadoOperacao {
  abatimentoMensalKWh: number;
  meses: MesOperacao[];
  anos: AnoOperacao[];
  total: Omit<AnoOperacao, 'ano'>;
}

/** Prazo mínimo (meses) para o cliente consumir o crédito todo com o consumo atual. */
export function prazoPeloConsumo(creditoTotalKWh: number, consumoMensalKWh: number): number {
  return consumoMensalKWh > 0 ? Math.ceil(creditoTotalKWh / consumoMensalKWh) : 0;
}

function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function simularOperacao(e: Entrada, dados: DadosTarifarios, p: ParametrosOperacao): ResultadoOperacao {
  if (!(p.creditoTotalKWh > 0)) throw new Error('Informe o total de crédito comprado.');
  if (!(p.prazoMeses >= 1)) throw new Error('Informe o prazo de consumo em meses.');

  const prazo = Math.round(p.prazoMeses);
  const abatimentoMensalKWh = p.creditoTotalKWh / prazo;
  const anoInicio = Number(p.mesInicio.slice(0, 4));

  // Um cálculo por ano: a tarifa vigente e a rampa do Fio B (GD2) mudam de ano para ano.
  const porAno = new Map<number, Resultado>();
  const resultadoDoAno = (ano: number) => {
    if (!porAno.has(ano)) porAno.set(ano, calcular({ ...e, ano }, dados));
    return porAno.get(ano)!;
  };

  const consumoCliente = resultadoDoAno(anoInicio).consumoTotalKWh;
  if (abatimentoMensalKWh > consumoCliente + 1e-9) {
    throw new Error(
      `O cliente consome ${consumoCliente.toLocaleString('pt-BR')} kWh/mês, mas o abatimento seria de `
      + `${Math.round(abatimentoMensalKWh).toLocaleString('pt-BR')} kWh/mês — não dá para compensar mais do que `
      + `ele consome. Prazo mínimo: ${prazoPeloConsumo(p.creditoTotalKWh, consumoCliente)} meses.`,
    );
  }

  const meses: MesOperacao[] = [];
  let saldo = p.creditoTotalKWh;
  for (let i = 0; i < prazo; i++) {
    const mes = somarMes(p.mesInicio, i);
    const ano = Number(mes.slice(0, 4));
    const r = resultadoDoAno(ano);
    const kWh = i === prazo - 1 ? saldo : abatimentoMensalKWh; // último mês fecha o saldo exato
    saldo -= kWh;

    // Valores por kWh do cálculo (perfil de consumo do cliente), com o reajuste projetado.
    const fator = (1 + p.reajusteAnualPct) ** (ano - anoInicio);
    const porKWh = (v: number) => (v / r.consumoTotalKWh) * kWh * fator;
    const faturaGeracao = porKWh(r.faturaGeracao);
    // Valor do dono do crédito fixado em contrato não é reajustado — a Kora absorve a diferença.
    const valorGerador = e.precoGeradorKWh !== undefined ? e.precoGeradorKWh * kWh : porKWh(r.valorGerador);
    // Comissão do vendedor é R$/kWh fixo, também sem reajuste.
    const valorVendedor = (e.vendedorKWh ?? 0) * kWh;
    meses.push({
      mes, kWh, saldoFinalKWh: Math.max(saldo, 0),
      desconto: porKWh(r.desconto), faturaGeracao, valorGerador, valorVendedor,
      valorKora: faturaGeracao - valorGerador - valorVendedor,
    });
  }

  const zerado = () => ({ meses: 0, kWh: 0, desconto: 0, faturaGeracao: 0, valorGerador: 0, valorVendedor: 0, valorKora: 0 });
  const acumular = (acc: ReturnType<typeof zerado>, m: MesOperacao) => {
    acc.meses += 1; acc.kWh += m.kWh; acc.desconto += m.desconto;
    acc.faturaGeracao += m.faturaGeracao; acc.valorGerador += m.valorGerador;
    acc.valorVendedor += m.valorVendedor; acc.valorKora += m.valorKora;
  };
  const anosMap = new Map<number, AnoOperacao>();
  const total = zerado();
  for (const m of meses) {
    const ano = Number(m.mes.slice(0, 4));
    if (!anosMap.has(ano)) anosMap.set(ano, { ano, ...zerado() });
    acumular(anosMap.get(ano)!, m);
    acumular(total, m);
  }

  return { abatimentoMensalKWh, meses, anos: [...anosMap.values()], total };
}
