// Controle de compensação mês a mês e faturas da Kora (contrato: Cláusulas 3ª a 6ª e 9ª).
// Cada mês, para cada UC, lança-se o que a fatura da distribuidora mostrou: kWh compensados (é o que a Kora
// cobra: kWh × R$/kWh vigente) e quanto saiu do saldo de crédito. A fatura Kora do mês discrimina, por UC,
// kWh compensados, preço e valor, e vence junto com a fatura da distribuidora.
import type { Cliente } from './clientes';

export interface LancamentoMensal {
  id: string;
  /** Mês de referência da fatura da distribuidora, "YYYY-MM". */
  mes: string;
  /** Número da UC. */
  uc: string;
  /** Energia compensada na fatura da distribuidora (o que a Kora cobra). */
  compensadoKWh: number;
  /** Crédito que saiu do saldo (igual ao compensado; maior quando a ponta foi coberta pelo fator). */
  saldoDebitadoKWh: number;
  /** Saldo de créditos que a distribuidora informa na fatura, se houver. */
  saldoFaturaKWh: number | null;
  /** Vencimento da fatura da distribuidora (a fatura Kora vence no mesmo dia). */
  vencimento: string;
  /** Total da fatura da distribuidora (informativo). */
  valorDistribuidora: number | null;
  /** Fatura da distribuidora anexada (id do documento do cliente). */
  faturaDistribuidoraId: string | null;
  observacao: string;
  criadoEm: string;
  criadoPor: string;
}

export interface ItemFatura { uc: string; compensadoKWh: number; precoKWh: number; valor: number }

export type StatusFatura = 'emitida' | 'paga' | 'cancelada';

export interface FaturaKora {
  numero: string;       // FK-2026-0001
  mes: string;
  emitidaEm: string;
  emitidaPor: string;
  vencimento: string;   // YYYY-MM-DD
  itens: ItemFatura[];
  total: number;
  status: StatusFatura;
  pagaEm: string | null;
  valorPago: number | null;
  /** Fatura de quitação do saldo remanescente (Cláusula 9ª §3), em vez de mensal. */
  quitacaoSaldo: boolean;
  observacao: string;
}

export interface Reajuste {
  /** Mês a partir do qual vale, "YYYY-MM". */
  aPartirDe: string;
  precoKWh: number;
  motivo: string;
}

const arred2 = (v: number) => Math.round(v * 100) / 100;

export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Preço por kWh vigente no mês: o do contrato, ou o último reajuste que já vale. */
export function precoVigente(c: Pick<Cliente, 'contrato'>, mes: string): number {
  const r = [...(c.contrato.reajustes ?? [])].filter((x) => x.aPartirDe <= mes).sort((a, b) => a.aPartirDe.localeCompare(b.aPartirDe));
  return r.length ? r[r.length - 1].precoKWh : c.contrato.precoKWh;
}

/** Mês em que o crédito começou a ser injetado (início do prazo do saldo). */
export function inicioInjecao(c: Pick<Cliente, 'contrato' | 'base'>): string | null {
  return c.contrato.inicioInjecao || c.base?.operacao.mesInicio || null;
}

/** Inclui ou substitui o lançamento do mês para a UC. Mês já faturado não muda. */
export function lancar(c: Cliente, l: LancamentoMensal): Cliente {
  if (!/^\d{4}-\d{2}$/.test(l.mes)) throw new Error('Mês de referência inválido.');
  if (!c.ucs.some((u) => u.numero === l.uc)) throw new Error(`UC ${l.uc} não é deste cliente.`);
  if (!(l.compensadoKWh >= 0) || !(l.saldoDebitadoKWh >= 0)) throw new Error('Informe os kWh compensados.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.vencimento)) throw new Error('Informe o vencimento da fatura da distribuidora.');
  if (faturaAtivaDoMes(c, l.mes)) throw new Error(`O mês ${l.mes} já tem fatura emitida; cancele a fatura para alterar.`);
  const outros = (c.lancamentos ?? []).filter((x) => !(x.mes === l.mes && x.uc === l.uc));
  const substitui = outros.length < (c.lancamentos ?? []).length;
  return {
    ...c, lancamentos: [...outros, l].sort((a, b) => a.mes.localeCompare(b.mes) || a.uc.localeCompare(b.uc)), atualizadoEm: l.criadoEm,
    historico: [...c.historico, {
      em: l.criadoEm, por: l.criadoPor,
      texto: `${substitui ? 'Corrigiu' : 'Lançou'} ${mesBR(l.mes)} da UC ${l.uc}: ${fmt(l.compensadoKWh)} kWh compensados.`,
    }],
  };
}

export function removerLancamento(c: Cliente, id: string, agora: Date, por: string): Cliente {
  const l = (c.lancamentos ?? []).find((x) => x.id === id);
  if (!l) throw new Error('Lançamento não encontrado.');
  if (faturaAtivaDoMes(c, l.mes)) throw new Error(`O mês ${l.mes} já tem fatura emitida; cancele a fatura antes.`);
  return {
    ...c, lancamentos: c.lancamentos.filter((x) => x.id !== id), atualizadoEm: agora.toISOString(),
    historico: [...c.historico, { em: agora.toISOString(), por, texto: `Removeu o lançamento de ${mesBR(l.mes)} da UC ${l.uc}.` }],
  };
}

export const faturaAtivaDoMes = (c: Pick<Cliente, 'faturas'>, mes: string) =>
  (c.faturas ?? []).find((f) => f.mes === mes && f.status !== 'cancelada' && !f.quitacaoSaldo);

/** Próximo número de fatura no ano, contando todos os clientes: FK-2026-0001… */
export function proximoNumeroFatura(existentes: string[], ano: number): string {
  const prefixo = `FK-${ano}-`;
  const ultimo = existentes.filter((n) => n.startsWith(prefixo)).reduce((m, n) => Math.max(m, Number(n.slice(prefixo.length)) || 0), 0);
  return `${prefixo}${String(ultimo + 1).padStart(4, '0')}`;
}

/** Itens da fatura do mês: uma linha por UC lançada, kWh × preço vigente. */
export function itensDoMes(c: Cliente, mes: string): ItemFatura[] {
  const preco = precoVigente(c, mes);
  return (c.lancamentos ?? []).filter((l) => l.mes === mes).map((l) => ({
    uc: l.uc, compensadoKWh: l.compensadoKWh, precoKWh: preco, valor: arred2(l.compensadoKWh * preco),
  }));
}

export function emitirFatura(c: Cliente, mes: string, numero: string, agora: Date, por: string, observacao = ''): Cliente {
  if (faturaAtivaDoMes(c, mes)) throw new Error(`O mês ${mesBR(mes)} já tem fatura emitida.`);
  const lancs = (c.lancamentos ?? []).filter((l) => l.mes === mes);
  if (lancs.length === 0) throw new Error(`Nenhum lançamento em ${mesBR(mes)}.`);
  const faltam = c.ucs.filter((u) => !lancs.some((l) => l.uc === u.numero)).map((u) => u.numero);
  if (faltam.length) throw new Error(`Falta lançar ${mesBR(mes)} da(s) UC(s) ${faltam.join(', ')}.`);
  const itens = itensDoMes(c, mes);
  const total = arred2(itens.reduce((s, i) => s + i.valor, 0));
  if (!(total > 0)) throw new Error('Fatura sem valor (nenhum kWh compensado no mês).');
  // Vence com a fatura da distribuidora (com várias UCs, a primeira data).
  const vencimento = lancs.map((l) => l.vencimento).sort()[0];
  const f: FaturaKora = {
    numero, mes, emitidaEm: agora.toISOString(), emitidaPor: por, vencimento, itens, total,
    status: 'emitida', pagaEm: null, valorPago: null, quitacaoSaldo: false, observacao,
  };
  return {
    ...c, faturas: [...(c.faturas ?? []), f], atualizadoEm: agora.toISOString(),
    historico: [...c.historico, { em: agora.toISOString(), por, texto: `Emitiu a fatura ${numero} de ${mesBR(mes)}: R$ ${fmt(total, 2)}, vence ${dataBR(vencimento)}.` }],
  };
}

/** Fatura de quitação do saldo remanescente (prazo do saldo vencido ou rescisão): kWh restantes × preço vigente. */
export function emitirQuitacao(c: Cliente, numero: string, vencimento: string, agora: Date, por: string, motivo: string): Cliente {
  const r = resumoControle(c, agora);
  if (!(r.saldoKWh > 0)) throw new Error('Não há saldo remanescente.');
  if ((c.faturas ?? []).some((f) => f.quitacaoSaldo && f.status !== 'cancelada')) throw new Error('Já existe fatura de quitação do saldo.');
  const mes = agora.toISOString().slice(0, 7);
  const preco = precoVigente(c, mes);
  const kwh = Math.round(r.saldoKWh);
  const f: FaturaKora = {
    numero, mes, emitidaEm: agora.toISOString(), emitidaPor: por, vencimento,
    itens: [{ uc: 'Saldo remanescente', compensadoKWh: kwh, precoKWh: preco, valor: arred2(kwh * preco) }],
    total: arred2(kwh * preco), status: 'emitida', pagaEm: null, valorPago: null, quitacaoSaldo: true, observacao: motivo,
  };
  return {
    ...c, faturas: [...(c.faturas ?? []), f], atualizadoEm: agora.toISOString(),
    historico: [...c.historico, { em: agora.toISOString(), por, texto: `Emitiu a fatura ${numero} de quitação do saldo (${fmt(kwh)} kWh): R$ ${fmt(f.total, 2)}.` }],
  };
}

export function baixarFatura(c: Cliente, numero: string, pagaEm: string, valorPago: number, agora: Date, por: string): Cliente {
  const f = (c.faturas ?? []).find((x) => x.numero === numero);
  if (!f) throw new Error('Fatura não encontrada.');
  if (f.status !== 'emitida') throw new Error(`Fatura ${numero} está ${f.status}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pagaEm)) throw new Error('Informe a data do pagamento.');
  return {
    ...c, faturas: c.faturas.map((x) => (x.numero === numero ? { ...x, status: 'paga', pagaEm, valorPago: arred2(valorPago) } : x)),
    atualizadoEm: agora.toISOString(),
    historico: [...c.historico, { em: agora.toISOString(), por, texto: `Baixou a fatura ${numero}: pago R$ ${fmt(valorPago, 2)} em ${dataBR(pagaEm)}.` }],
  };
}

export function cancelarFatura(c: Cliente, numero: string, motivo: string, agora: Date, por: string): Cliente {
  const f = (c.faturas ?? []).find((x) => x.numero === numero);
  if (!f) throw new Error('Fatura não encontrada.');
  if (f.status === 'cancelada') return c;
  return {
    ...c, faturas: c.faturas.map((x) => (x.numero === numero ? { ...x, status: 'cancelada', observacao: [x.observacao, `Cancelada: ${motivo}`].filter(Boolean).join(' · ') } : x)),
    atualizadoEm: agora.toISOString(),
    historico: [...c.historico, { em: agora.toISOString(), por, texto: `Cancelou a fatura ${numero}${motivo ? ` (${motivo})` : ''}.` }],
  };
}

export function reajustar(c: Cliente, r: Reajuste, agora: Date, por: string): Cliente {
  if (!/^\d{4}-\d{2}$/.test(r.aPartirDe)) throw new Error('Mês do reajuste inválido.');
  if (!(r.precoKWh > 0)) throw new Error('Informe o novo preço por kWh.');
  const lista = [...(c.contrato.reajustes ?? []).filter((x) => x.aPartirDe !== r.aPartirDe), r].sort((a, b) => a.aPartirDe.localeCompare(b.aPartirDe));
  return {
    ...c, contrato: { ...c.contrato, reajustes: lista }, atualizadoEm: agora.toISOString(),
    historico: [...c.historico, { em: agora.toISOString(), por, texto: `Reajuste: R$ ${r.precoKWh.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}/kWh a partir de ${mesBR(r.aPartirDe)}${r.motivo ? ` (${r.motivo})` : ''}.` }],
  };
}

export interface LinhaControle {
  mes: string;
  previstoKWh: number | null;   // compensado previsto na proposta
  compensadoKWh: number;        // realizado (soma das UCs)
  saldoDebitadoKWh: number;
  saldoFinalKWh: number;        // crédito restante depois do mês
  ucsLancadas: number;
  precoKWh: number;
  valor: number;                // a faturar/faturado
  fatura: FaturaKora | null;
}

export interface ResumoControle {
  creditoTotalKWh: number;
  compensadoKWh: number;
  debitadoKWh: number;
  saldoKWh: number;
  /** Último mês para usar o saldo (início da injeção + prazo − 1). */
  fimPrazo: string | null;
  mesesRestantes: number | null;
  /** Meses lançados e média por mês; projeção de quando o saldo acaba nesse ritmo. */
  mediaMensalKWh: number;
  projecaoFim: string | null;
  /** Saldo que sobraria no fim do prazo no ritmo atual (seria cobrado na quitação). */
  sobraProjetadaKWh: number;
  faturado: number;
  recebido: number;
  emAberto: number;
  vencido: number;
  linhas: LinhaControle[];
}

/** Junta previsto (proposta) e realizado (lançamentos), mês a mês, com saldo e faturamento. */
export function resumoControle(c: Cliente, agora: Date): ResumoControle {
  const creditoTotalKWh = c.base?.operacao.creditoTotalKWh ?? 0;
  const lancs = c.lancamentos ?? [];
  const faturas = (c.faturas ?? []).filter((f) => f.status !== 'cancelada');
  const previsto = new Map((c.base?.op.meses ?? []).map((m) => [m.mes, m.compensadoKWh]));
  const meses = [...new Set([...previsto.keys(), ...lancs.map((l) => l.mes)])].sort();

  let saldo = creditoTotalKWh;
  const linhas: LinhaControle[] = meses.map((mes) => {
    const doMes = lancs.filter((l) => l.mes === mes);
    const compensadoKWh = doMes.reduce((s, l) => s + l.compensadoKWh, 0);
    const saldoDebitadoKWh = doMes.reduce((s, l) => s + l.saldoDebitadoKWh, 0);
    saldo -= saldoDebitadoKWh;
    const fatura = faturas.find((f) => f.mes === mes && !f.quitacaoSaldo) ?? null;
    const precoKWh = precoVigente(c, mes);
    return {
      mes, previstoKWh: previsto.get(mes) ?? null, compensadoKWh, saldoDebitadoKWh, saldoFinalKWh: saldo,
      ucsLancadas: doMes.length, precoKWh, valor: fatura ? fatura.total : arred2(compensadoKWh * precoKWh), fatura,
    };
  });

  const compensadoKWh = lancs.reduce((s, l) => s + l.compensadoKWh, 0);
  const debitadoKWh = lancs.reduce((s, l) => s + l.saldoDebitadoKWh, 0);
  const saldoKWh = creditoTotalKWh - debitadoKWh;
  const inicio = inicioInjecao(c);
  const fimPrazo = inicio && c.contrato.prazoSaldoMeses > 0 ? somarMeses(inicio, c.contrato.prazoSaldoMeses - 1) : null;
  const mesAtual = agora.toISOString().slice(0, 7);
  const mesesRestantes = fimPrazo ? Math.max(0, difMeses(mesAtual, fimPrazo)) : null;
  const mesesLancados = new Set(lancs.map((l) => l.mes)).size;
  const mediaMensalKWh = mesesLancados ? debitadoKWh / mesesLancados : 0;
  const ultimo = lancs.length ? lancs.map((l) => l.mes).sort().slice(-1)[0] : null;
  const projecaoFim = ultimo && mediaMensalKWh > 0 && saldoKWh > 0 ? somarMeses(ultimo, Math.ceil(saldoKWh / mediaMensalKWh)) : null;
  const restantesAposUltimo = fimPrazo && ultimo ? Math.max(0, difMeses(ultimo, fimPrazo)) : null;
  const sobraProjetadaKWh = restantesAposUltimo !== null ? Math.max(0, saldoKWh - mediaMensalKWh * restantesAposUltimo) : 0;

  const hoje = agora.toISOString().slice(0, 10);
  const faturado = arred2(faturas.reduce((s, f) => s + f.total, 0));
  const recebido = arred2(faturas.reduce((s, f) => s + (f.valorPago ?? 0), 0));
  const abertas = faturas.filter((f) => f.status === 'emitida');
  return {
    creditoTotalKWh, compensadoKWh, debitadoKWh, saldoKWh, fimPrazo, mesesRestantes, mediaMensalKWh, projecaoFim, sobraProjetadaKWh,
    faturado, recebido,
    emAberto: arred2(abertas.reduce((s, f) => s + f.total, 0)),
    vencido: arred2(abertas.filter((f) => f.vencimento < hoje).reduce((s, f) => s + f.total, 0)),
    linhas,
  };
}

/** Meses de `de` até `ate` (positivo se `ate` é depois). */
export function difMeses(de: string, ate: string): number {
  const [a1, m1] = de.split('-').map(Number), [a2, m2] = ate.split('-').map(Number);
  return (a2 * 12 + m2) - (a1 * 12 + m1);
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const mesBR = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
