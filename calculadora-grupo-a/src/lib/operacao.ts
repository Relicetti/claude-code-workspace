// Operação de longo prazo: um lote grande de crédito comprado de uma vez e abatido mês a mês na
// conta do cliente. Cada mês entra a mesma quantidade de crédito (crédito ÷ prazo) no saldo fora
// ponta: compensa primeiro o fora ponta e o que sobra cobre a ponta gastando TE_P / TE_FP kWh por kWh
// (compensacao.ts). Para cobrir o consumo todo o lote precisa ser o crédito necessário (crédito gasto
// no mês com o consumo todo × prazo); com menos, parte da ponta fica para a distribuidora.
// Os valores em R$ de cada posto vêm do cálculo da planilha (engine.calcular), proporcionais ao kWh
// compensado.
import { compensar, postoDoCredito } from './compensacao';
import { calcular, teConversao } from './engine';
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
  kWh: number;            // crédito (saldo) debitado no mês
  compensadoKWh: number;  // consumo coberto (fora ponta + ponta)
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
  /** Crédito que entra por mês (kWh) = crédito ÷ prazo. */
  abatimentoMensalKWh: number;
  meses: MesOperacao[];
  anos: AnoOperacao[];
  total: Omit<AnoOperacao, 'ano'>;
}

/** Prazo mínimo (meses) para o cliente gastar o crédito todo; `gastoMensalKWh` é o crédito que o
 * consumo todo gasta no mês (Resultado.saldoDebitadoKWh, já com a conversão da ponta). */
export function prazoPeloConsumo(creditoTotalKWh: number, gastoMensalKWh: number): number {
  return gastoMensalKWh > 0 ? Math.ceil(creditoTotalKWh / gastoMensalKWh) : 0;
}

/** Crédito para compensar o consumo todo durante o prazo (kWh, arredondado para cima). */
export function creditoNecessario(gastoMensalKWh: number, prazoMeses: number): number {
  return Math.ceil(gastoMensalKWh * Math.round(prazoMeses) - 1e-6);
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

  // Tarifa final fixada vale no 1º ano: vira o desconto em % daquele ano, que segue igual depois —
  // assim a tarifa final acompanha o reajuste projetado.
  if (e.tarifaFinalKWh !== undefined) {
    e = { ...e, descontoPct: calcular({ ...e, ano: anoInicio }, dados).economiaClientePct, tarifaFinalKWh: undefined };
  }

  // Um cálculo por ano: a tarifa vigente e a rampa do Fio B (GD2) mudam de ano para ano.
  const porAno = new Map<number, Resultado>();
  const resultadoDoAno = (ano: number) => {
    if (!porAno.has(ano)) porAno.set(ano, calcular({ ...e, ano }, dados));
    return porAno.get(ano)!;
  };

  const gastoCliente = resultadoDoAno(anoInicio).saldoDebitadoKWh;
  if (p.creditoTotalKWh > creditoNecessario(gastoCliente, prazo)) {
    throw new Error(
      `O consumo todo do cliente gasta ${Math.round(gastoCliente).toLocaleString('pt-BR')} kWh/mês de crédito, mas entrariam `
      + `${Math.round(abatimentoMensalKWh).toLocaleString('pt-BR')} kWh/mês — não dá para compensar mais do que `
      + `ele consome. Prazo mínimo: ${prazoPeloConsumo(p.creditoTotalKWh, gastoCliente)} meses.`,
    );
  }

  const meses: MesOperacao[] = [];
  let saldo = p.creditoTotalKWh;
  let liberado = 0; // crédito já entregue ao cliente (abatimento × meses), gasto ou não
  // Termina no prazo; depois dele só segue se sobrou crédito de verdade (fator da ponta menor em ano
  // seguinte), não a fração do arredondamento do crédito necessário. O limite evita laço infinito.
  for (let i = 0; saldo > (i >= prazo ? 1 : 1e-6) && i < prazo * 10; i++) {
    const mes = somarMes(p.mesInicio, i);
    const ano = Number(mes.slice(0, 4));
    const r = resultadoDoAno(ano);

    // Crédito do mês (mais a sobra de meses anteriores) contra o consumo todo: fora ponta primeiro,
    // depois a ponta com o fator da tarifa do ano (o saldo em kWh não é reajustado).
    const origem = postoDoCredito(r.postos.map((l) => l.posto));
    liberado = Math.min(liberado + abatimentoMensalKWh, p.creditoTotalKWh);
    const disponivel = Math.min(saldo, liberado - (p.creditoTotalKWh - saldo));
    const consumo = Object.fromEntries(r.postos.map((l) => [l.posto, l.kWh]));
    const c = compensar(consumo, { [origem]: disponivel }, teConversao(r.postos, e.converterPostos));
    const kWh = c.debitado[origem] ?? 0;
    saldo -= kWh;
    if (i >= prazo && kWh <= 1e-6) break;

    // Valores em R$ de cada posto proporcionais ao kWh compensado nele, com o reajuste projetado.
    const reajuste = (1 + p.reajusteAnualPct) ** (ano - anoInicio);
    let valorAtual = 0;
    let valorInjetado = 0;
    let compensadoKWh = 0;
    for (const l of r.postos) {
      const k = c.compensado[l.posto] ?? 0;
      if (l.kWh <= 0 || k <= 0) continue;
      compensadoKWh += k;
      valorAtual += (l.valorAtual / l.kWh) * k * reajuste;
      valorInjetado += (l.valorInjetado / l.kWh) * k * reajuste;
    }
    const desconto = e.descontoPct * valorAtual;
    const faturaGeracao = valorInjetado - desconto; // = atual − desconto − CSS
    // Valor do dono do crédito fixado em contrato não é reajustado — a Kora absorve a diferença.
    // R$/kWh é por kWh compensado: a conversão da ponta gasta mais crédito, mas não paga mais ao gerador.
    const valorGerador = e.precoGeradorKWh !== undefined ? e.precoGeradorKWh * compensadoKWh : faturaGeracao * (1 - e.desagioPct);
    // Comissão em R$/kWh é fixa, sem reajuste; em % acompanha a fatura de geração reajustada.
    const valorVendedor = e.vendedorPct !== undefined ? e.vendedorPct * faturaGeracao : (e.vendedorKWh ?? 0) * compensadoKWh;
    meses.push({
      mes, kWh, compensadoKWh, saldoFinalKWh: Math.max(saldo, 0),
      desconto, faturaGeracao, valorGerador, valorVendedor,
      valorKora: faturaGeracao - valorGerador - valorVendedor,
    });
  }

  const zerado = () => ({ meses: 0, kWh: 0, compensadoKWh: 0, desconto: 0, faturaGeracao: 0, valorGerador: 0, valorVendedor: 0, valorKora: 0 });
  const acumular = (acc: ReturnType<typeof zerado>, m: MesOperacao) => {
    acc.meses += 1; acc.kWh += m.kWh; acc.compensadoKWh += m.compensadoKWh; acc.desconto += m.desconto;
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
