// Banco de crédito: lotes de crédito de GD negociados com os geradores (donos do crédito).
// Cada lote nasce "em negociação" com o valor que o gerador pediu e o que a Kora propôs (R$/kWh);
// O crédito só compensa dentro da mesma distribuidora, por isso ela é obrigatória (nome da lista ANEEL).
// quando a negociação fecha, grava o valor fechado. Valores sempre em R$/kWh; o total é volume × valor.

export type StatusCredito = 'negociacao' | 'fechado' | 'desistencia';

export const ROTULO_STATUS_CREDITO: Record<StatusCredito, string> = {
  negociacao: 'Em negociação',
  fechado: 'Fechado',
  desistencia: 'Não fechou',
};

/** Como a Kora paga o gerador: conforme o crédito é compensado nos clientes, ou o lote todo à vista. */
export type FormaPagamento = 'compensado' | 'avista';
export const ROTULO_PAGAMENTO: Record<FormaPagamento, string> = { compensado: 'Compensado', avista: 'À vista' };

export interface EventoCredito { em: string; por: string; texto: string }

export interface CreditoGerador {
  id: string;                       // CRD-001
  gerador: string;
  distribuidora: string;            // nome da lista ANEEL (DISTRIBUIDORAS), ex. "Copel-DIS"
  intermediador: string;            // vazio = negociação direta
  formaPagamento: FormaPagamento;
  volumeKWh: number;
  valorPropostoKWh: number | null;  // oferta da Kora
  valorPedidoKWh: number | null;    // pedido do gerador
  valorFechadoKWh: number | null;   // só depois de fechar
  status: StatusCredito;
  observacao: string;
  criadoEm: string;
  atualizadoEm: string;
  fechadoEm: string | null;
  historico: EventoCredito[];
}

/** Campos que a tela envia ao cadastrar ou editar. */
export type DadosCredito = Pick<CreditoGerador, 'gerador' | 'distribuidora' | 'intermediador' | 'formaPagamento' | 'volumeKWh' | 'valorPropostoKWh' | 'valorPedidoKWh' | 'observacao'>;

import { DISTRIBUIDORAS } from './engine';

const R4 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const KWH = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

function valorOuNulo(v: unknown, campo: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${campo} precisa ser um valor maior que zero.`);
  return n;
}

/** Confere e limpa o que veio da tela. Lança erro com mensagem legível. */
export function limparDados(d: Partial<DadosCredito>): DadosCredito {
  const gerador = String(d.gerador ?? '').trim();
  if (!gerador) throw new Error('Informe o nome do gerador.');
  const digitada = String(d.distribuidora ?? '').trim();
  if (!digitada) throw new Error('Informe a distribuidora do crédito.');
  const distribuidora = DISTRIBUIDORAS.find((x) => x.toLowerCase() === digitada.toLowerCase());
  if (!distribuidora) throw new Error(`Distribuidora "${digitada}" não está na lista da ANEEL. Escolha uma das opções.`);
  const formaPagamento = d.formaPagamento;
  if (formaPagamento !== 'compensado' && formaPagamento !== 'avista') throw new Error('Escolha a forma de pagamento: Compensado ou À vista.');
  const volumeKWh = Number(d.volumeKWh);
  if (!Number.isFinite(volumeKWh) || volumeKWh <= 0) throw new Error('O volume de crédito (kWh) precisa ser maior que zero.');
  return {
    gerador,
    distribuidora,
    intermediador: String(d.intermediador ?? '').trim(),
    formaPagamento,
    volumeKWh,
    valorPropostoKWh: valorOuNulo(d.valorPropostoKWh, 'O valor proposto'),
    valorPedidoKWh: valorOuNulo(d.valorPedidoKWh, 'O valor pedido'),
    observacao: String(d.observacao ?? '').trim(),
  };
}

export function proximoId(existentes: string[]): string {
  const ultimo = existentes.reduce((m, id) => Math.max(m, Number(id.replace(/^CRD-/, '')) || 0), 0);
  return `CRD-${String(ultimo + 1).padStart(3, '0')}`;
}

export function novoCredito(lista: CreditoGerador[], d: Partial<DadosCredito>, agora: Date, por: string): CreditoGerador {
  const dados = limparDados(d);
  const em = agora.toISOString();
  return {
    id: proximoId(lista.map((c) => c.id)), ...dados,
    valorFechadoKWh: null, status: 'negociacao', criadoEm: em, atualizadoEm: em, fechadoEm: null,
    historico: [{ em, por, texto: `Cadastrado: ${KWH(dados.volumeKWh)} kWh, pagamento ${ROTULO_PAGAMENTO[dados.formaPagamento].toLowerCase()}.` }],
  };
}

const ROTULO_CAMPO: Record<keyof DadosCredito, string> = {
  gerador: 'gerador', distribuidora: 'distribuidora', intermediador: 'intermediador', formaPagamento: 'forma de pagamento', volumeKWh: 'volume', valorPropostoKWh: 'valor proposto',
  valorPedidoKWh: 'valor pedido', observacao: 'observação',
};

export function editarCredito(c: CreditoGerador, d: Partial<DadosCredito>, agora: Date, por: string): CreditoGerador {
  const dados = limparDados({ ...c, ...d });
  const mudou = (Object.keys(ROTULO_CAMPO) as (keyof DadosCredito)[]).filter((k) => dados[k] !== c[k]);
  if (mudou.length === 0) return c;
  const em = agora.toISOString();
  return { ...c, ...dados, atualizadoEm: em, historico: [...c.historico, { em, por, texto: `Alterado: ${mudou.map((k) => ROTULO_CAMPO[k]).join(', ')}.` }] };
}

export function fecharCredito(c: CreditoGerador, valorFechadoKWh: unknown, agora: Date, por: string): CreditoGerador {
  const valor = valorOuNulo(valorFechadoKWh, 'O valor fechado');
  if (valor === null) throw new Error('Informe o valor fechado (R$/kWh).');
  const em = agora.toISOString();
  const texto = c.status === 'fechado' ? `Valor fechado corrigido para R$ ${R4(valor)}/kWh.` : `Negociação fechada a R$ ${R4(valor)}/kWh.`;
  return { ...c, status: 'fechado', valorFechadoKWh: valor, fechadoEm: c.fechadoEm ?? em, atualizadoEm: em, historico: [...c.historico, { em, por, texto }] };
}

export function desistirCredito(c: CreditoGerador, motivo: string, agora: Date, por: string): CreditoGerador {
  if (c.status === 'fechado') throw new Error('Esse crédito já foi fechado. Reabra a negociação antes.');
  const em = agora.toISOString();
  const m = motivo.trim();
  return { ...c, status: 'desistencia', atualizadoEm: em, historico: [...c.historico, { em, por, texto: `Não fechou${m ? `: ${m}` : ''}.` }] };
}

export function reabrirCredito(c: CreditoGerador, agora: Date, por: string): CreditoGerador {
  if (c.status === 'negociacao') return c;
  const em = agora.toISOString();
  return { ...c, status: 'negociacao', valorFechadoKWh: null, fechadoEm: null, atualizadoEm: em, historico: [...c.historico, { em, por, texto: 'Negociação reaberta.' }] };
}

/** Total em R$ de um valor por kWh aplicado ao volume do lote. */
export const totalDe = (c: Pick<CreditoGerador, 'volumeKWh'>, valorKWh: number | null) => (valorKWh === null ? null : c.volumeKWh * valorKWh);

export interface ResumoBanco {
  negociacaoKWh: number;
  fechadoKWh: number;
  fechadoValor: number;
  /** Média ponderada pelo volume dos lotes fechados (R$/kWh). */
  fechadoMedioKWh: number | null;
}

export function resumoBanco(lista: CreditoGerador[]): ResumoBanco {
  const fechados = lista.filter((c) => c.status === 'fechado');
  const fechadoKWh = fechados.reduce((s, c) => s + c.volumeKWh, 0);
  const fechadoValor = fechados.reduce((s, c) => s + c.volumeKWh * (c.valorFechadoKWh ?? 0), 0);
  return {
    negociacaoKWh: lista.filter((c) => c.status === 'negociacao').reduce((s, c) => s + c.volumeKWh, 0),
    fechadoKWh, fechadoValor, fechadoMedioKWh: fechadoKWh > 0 ? fechadoValor / fechadoKWh : null,
  };
}

/** Resumo de cada distribuidora, em ordem alfabética (lote antigo sem distribuidora fica em "Sem distribuidora"). */
export function resumoPorDistribuidora(lista: CreditoGerador[]): (ResumoBanco & { distribuidora: string })[] {
  const grupos = new Map<string, CreditoGerador[]>();
  for (const c of lista) {
    const d = c.distribuidora || 'Sem distribuidora';
    grupos.set(d, [...(grupos.get(d) ?? []), c]);
  }
  return [...grupos.entries()]
    .map(([distribuidora, cs]) => ({ distribuidora, ...resumoBanco(cs) }))
    .sort((a, b) => a.distribuidora.localeCompare(b.distribuidora, 'pt-BR'));
}
