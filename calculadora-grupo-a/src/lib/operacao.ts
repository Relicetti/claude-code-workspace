// Operação de longo prazo: um lote grande de crédito comprado de uma vez e abatido mês a mês na
// conta do cliente. Cada mês compensa a mesma quantidade de consumo (crédito ÷ prazo), fora ponta
// primeiro. O lote é saldo fora ponta: com a conversão ligada, cobrir a ponta gasta TE_P / TE_FP kWh
// de crédito (compensacao.ts) — os valores do mês não mudam, o crédito só acaba antes do prazo.
// Os valores em R$ de cada posto vêm do cálculo da planilha (engine.calcular), proporcionais ao kWh
// compensado.
import { compensar, postoDoCredito } from './compensacao';
import { calcular, teConversao } from './engine';
import type { DadosTarifarios, Entrada, Posto, Resultado } from '../types';

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
  /** Consumo compensado por mês (kWh) = crédito ÷ prazo. */
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
  // Sem conversão o saldo zera no prazo; com ela, antes (o limite só evita laço infinito).
  for (let i = 0; saldo > 1e-6 && i < prazo * 10; i++) {
    const mes = somarMes(p.mesInicio, i);
    const ano = Number(mes.slice(0, 4));
    const r = resultadoDoAno(ano);

    // Consumo a cobrir no mês: fora ponta primeiro, depois ponta, até o abatimento mensal. A ponta
    // gasta crédito com o fator da tarifa do ano (o saldo em kWh não é reajustado); no último mês o
    // saldo pode não cobrir tudo.
    const origem = postoDoCredito(r.postos.map((l) => l.posto));
    const alvo: Partial<Record<Posto, number>> = {};
    let restante = abatimentoMensalKWh;
    for (const l of [...r.postos].sort((a, b) => (a.posto === origem ? -1 : b.posto === origem ? 1 : 0))) {
      alvo[l.posto] = Math.min(l.kWh, restante);
      restante -= alvo[l.posto]!;
    }
    const c = compensar(alvo, { [origem]: saldo }, teConversao(r.postos, e.converterPostos));
    const kWh = c.debitado[origem] ?? 0;
    saldo -= kWh;

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
