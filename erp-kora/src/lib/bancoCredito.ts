// Banco de crédito: lotes de crédito de GD negociados com os geradores (donos do crédito).
// Um lote é uma negociação com um gerador (empresa + pessoa de contato) e pode ter vários itens:
// cada item é uma distribuidora + modalidade (GD I ou GD II), com volume e preço próprios —
// o crédito só compensa dentro da mesma distribuidora, e GD I e GD II têm valor diferente.
// O lote nasce "em negociação" com o valor que o gerador pediu e o que a Kora propôs (R$/kWh) em cada item;
// quando a negociação fecha, grava o valor fechado de cada item. Total = volume × valor.

export type StatusCredito = 'negociacao' | 'fechado' | 'desistencia';

export const ROTULO_STATUS_CREDITO: Record<StatusCredito, string> = {
  negociacao: 'Em negociação',
  fechado: 'Fechado',
  desistencia: 'Não fechou',
};

/** Como a Kora paga o gerador: conforme o crédito é compensado nos clientes, ou o lote todo à vista. */
export type FormaPagamento = 'compensado' | 'avista';
export const ROTULO_PAGAMENTO: Record<FormaPagamento, string> = { compensado: 'Compensado', avista: 'À vista' };

/** Enquadramento do crédito (Lei 14.300): GD I (direito adquirido) ou GD II (paga Fio B escalonado). */
export type ModalidadeCredito = 'GD1' | 'GD2';
export const ROTULO_MODALIDADE: Record<ModalidadeCredito, string> = { GD1: 'GD I', GD2: 'GD II' };
export const SEM_MODALIDADE = 'Sem modalidade';
export const SEM_DISTRIBUIDORA = 'Sem distribuidora';

export interface EventoCredito { em: string; por: string; texto: string }

export interface ItemCredito {
  distribuidora: string;            // nome da lista ANEEL (DISTRIBUIDORAS), ex. "Copel-DIS"
  modalidade: ModalidadeCredito | ''; // vazio só em lote antigo, antes da separação GD I / GD II
  volumeKWh: number;
  valorPedidoKWh: number | null;    // pedido do gerador
  valorPropostoKWh: number | null;  // oferta da Kora
  valorFechadoKWh: number | null;   // só depois de fechar
}

export interface CreditoGerador {
  id: string;                       // CRD-001
  gerador: string;                  // nome da empresa do gerador
  contato: string;                  // pessoa com quem a Kora fala
  intermediador: string;            // vazio = negociação direta
  formaPagamento: FormaPagamento;
  itens: ItemCredito[];
  status: StatusCredito;
  observacao: string;
  criadoEm: string;
  atualizadoEm: string;
  fechadoEm: string | null;
  historico: EventoCredito[];
}

export type DadosItem = Omit<ItemCredito, 'valorFechadoKWh'>;
/** Campos que a tela envia ao cadastrar ou editar. */
export type DadosCredito = Pick<CreditoGerador, 'gerador' | 'contato' | 'intermediador' | 'formaPagamento' | 'observacao'> & { itens: DadosItem[] };

import { DISTRIBUIDORAS } from './engine';

const R4 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const KWH = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
export const nomeItem = (i: Pick<ItemCredito, 'distribuidora' | 'modalidade'>) =>
  `${i.distribuidora || SEM_DISTRIBUIDORA} ${i.modalidade ? ROTULO_MODALIDADE[i.modalidade] : `(${SEM_MODALIDADE.toLowerCase()})`}`;

function valorOuNulo(v: unknown, campo: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${campo} precisa ser um valor maior que zero.`);
  return n;
}

/**
 * Lote gravado antes dos itens (um só gerador/distribuidora/volume/valor no próprio lote) vira um lote
 * de um item sem modalidade, para a tela pedir GD I ou GD II na próxima edição.
 */
export function normalizarCredito(c: CreditoGerador): CreditoGerador {
  if (Array.isArray(c.itens)) return { ...c, contato: c.contato ?? '' };
  const antigo = c as unknown as Record<string, unknown> & CreditoGerador;
  const { distribuidora, volumeKWh, valorPedidoKWh, valorPropostoKWh, valorFechadoKWh, ...resto } = antigo;
  return {
    ...resto, contato: '',
    itens: [{
      distribuidora: String(distribuidora ?? ''), modalidade: '', volumeKWh: Number(volumeKWh) || 0,
      valorPedidoKWh: (valorPedidoKWh as number | null) ?? null, valorPropostoKWh: (valorPropostoKWh as number | null) ?? null,
      valorFechadoKWh: (valorFechadoKWh as number | null) ?? null,
    }],
  } as CreditoGerador;
}

function limparItem(d: Partial<DadosItem>, n: number): DadosItem {
  const qual = `Item ${n}`;
  const digitada = String(d.distribuidora ?? '').trim();
  if (!digitada) throw new Error(`${qual}: informe a distribuidora do crédito.`);
  const distribuidora = DISTRIBUIDORAS.find((x) => x.toLowerCase() === digitada.toLowerCase());
  if (!distribuidora) throw new Error(`${qual}: distribuidora "${digitada}" não está na lista da ANEEL. Escolha uma das opções.`);
  const modalidade = d.modalidade;
  if (modalidade !== 'GD1' && modalidade !== 'GD2') throw new Error(`${qual} (${distribuidora}): escolha a modalidade do crédito, GD I ou GD II.`);
  const volumeKWh = Number(d.volumeKWh);
  if (!Number.isFinite(volumeKWh) || volumeKWh <= 0) throw new Error(`${qual} (${distribuidora}): o volume de crédito (kWh) precisa ser maior que zero.`);
  return {
    distribuidora, modalidade, volumeKWh,
    valorPedidoKWh: valorOuNulo(d.valorPedidoKWh, `${qual}: o valor pedido`),
    valorPropostoKWh: valorOuNulo(d.valorPropostoKWh, `${qual}: o valor proposto`),
  };
}

/** Confere e limpa o que veio da tela. Lança erro com mensagem legível. */
export function limparDados(d: Partial<DadosCredito>): DadosCredito {
  const gerador = String(d.gerador ?? '').trim();
  if (!gerador) throw new Error('Informe o nome da empresa do gerador.');
  const formaPagamento = d.formaPagamento;
  if (formaPagamento !== 'compensado' && formaPagamento !== 'avista') throw new Error('Escolha a forma de pagamento: Compensado ou À vista.');
  const brutos = Array.isArray(d.itens) ? d.itens : [];
  if (brutos.length === 0) throw new Error('Inclua pelo menos um item de crédito (distribuidora, modalidade e volume).');
  const itens = brutos.map((i, k) => limparItem(i, k + 1));
  const vistos = new Set<string>();
  for (const i of itens) {
    const chave = `${i.distribuidora}|${i.modalidade}`;
    if (vistos.has(chave)) throw new Error(`${nomeItem(i)} aparece em mais de um item. Junte o volume num item só.`);
    vistos.add(chave);
  }
  return {
    gerador, contato: String(d.contato ?? '').trim(), intermediador: String(d.intermediador ?? '').trim(),
    formaPagamento, itens, observacao: String(d.observacao ?? '').trim(),
  };
}

export function proximoId(existentes: string[]): string {
  const ultimo = existentes.reduce((m, id) => Math.max(m, Number(id.replace(/^CRD-/, '')) || 0), 0);
  return `CRD-${String(ultimo + 1).padStart(3, '0')}`;
}

export const volumeTotal = (c: Pick<CreditoGerador, 'itens'>) => c.itens.reduce((s, i) => s + i.volumeKWh, 0);
/** Total em R$ de um valor por kWh aplicado ao volume do item. */
export const totalDe = (i: Pick<ItemCredito, 'volumeKWh'>, valorKWh: number | null) => (valorKWh === null ? null : i.volumeKWh * valorKWh);
/** Total fechado do lote (soma dos itens). */
export const totalFechado = (c: Pick<CreditoGerador, 'itens'>) => c.itens.reduce((s, i) => s + i.volumeKWh * (i.valorFechadoKWh ?? 0), 0);

export function novoCredito(lista: CreditoGerador[], d: Partial<DadosCredito>, agora: Date, por: string): CreditoGerador {
  const dados = limparDados(d);
  const em = agora.toISOString();
  const itens = dados.itens.map((i) => ({ ...i, valorFechadoKWh: null }));
  const partes = itens.map((i) => `${nomeItem(i)} ${KWH(i.volumeKWh)} kWh`).join('; ');
  return {
    id: proximoId(lista.map((c) => c.id)), ...dados, itens,
    status: 'negociacao', criadoEm: em, atualizadoEm: em, fechadoEm: null,
    historico: [{ em, por, texto: `Cadastrado: ${partes}, pagamento ${ROTULO_PAGAMENTO[dados.formaPagamento].toLowerCase()}.` }],
  };
}

const ROTULO_CAMPO: Record<Exclude<keyof DadosCredito, 'itens'>, string> = {
  gerador: 'empresa', contato: 'contato', intermediador: 'intermediador', formaPagamento: 'forma de pagamento', observacao: 'observação',
};

export function editarCredito(c0: CreditoGerador, d: Partial<DadosCredito>, agora: Date, por: string): CreditoGerador {
  const c = normalizarCredito(c0);
  const dados = limparDados({ ...c, ...d });
  if (c.status === 'fechado' && dados.itens.length !== c.itens.length) throw new Error('Reabra a negociação para incluir ou tirar itens de um lote fechado.');
  // O valor fechado acompanha o item na mesma posição (só existe em lote fechado).
  const itens: ItemCredito[] = dados.itens.map((i, k) => ({ ...i, valorFechadoKWh: c.status === 'fechado' ? c.itens[k]?.valorFechadoKWh ?? null : null }));
  const mudou = (Object.keys(ROTULO_CAMPO) as (keyof typeof ROTULO_CAMPO)[]).filter((k) => dados[k] !== c[k]).map((k) => ROTULO_CAMPO[k]);
  if (JSON.stringify(itens) !== JSON.stringify(c.itens)) mudou.push(`itens (${itens.map((i) => `${nomeItem(i)} ${KWH(i.volumeKWh)} kWh`).join('; ')})`);
  if (mudou.length === 0) return c0;
  const em = agora.toISOString();
  return { ...c, ...dados, itens, atualizadoEm: em, historico: [...c.historico, { em, por, texto: `Alterado: ${mudou.join(', ')}.` }] };
}

/** Fecha (ou corrige) com o valor fechado de cada item, na ordem dos itens. */
export function fecharCredito(c0: CreditoGerador, valoresFechadosKWh: unknown, agora: Date, por: string): CreditoGerador {
  const c = normalizarCredito(c0);
  const valores = Array.isArray(valoresFechadosKWh) ? valoresFechadosKWh : [];
  const itens = c.itens.map((i, k) => {
    const v = valorOuNulo(valores[k], `O valor fechado de ${nomeItem(i)}`);
    if (v === null) throw new Error(`Informe o valor fechado (R$/kWh) de ${nomeItem(i)}.`);
    return { ...i, valorFechadoKWh: v };
  });
  const em = agora.toISOString();
  const lista = itens.map((i) => `${nomeItem(i)} a R$ ${R4(i.valorFechadoKWh)}/kWh`).join('; ');
  const texto = c.status === 'fechado' ? `Valor fechado corrigido: ${lista}.` : `Negociação fechada: ${lista}.`;
  return { ...c, itens, status: 'fechado', fechadoEm: c.fechadoEm ?? em, atualizadoEm: em, historico: [...c.historico, { em, por, texto }] };
}

export function desistirCredito(c0: CreditoGerador, motivo: string, agora: Date, por: string): CreditoGerador {
  const c = normalizarCredito(c0);
  if (c.status === 'fechado') throw new Error('Esse crédito já foi fechado. Reabra a negociação antes.');
  const em = agora.toISOString();
  const m = motivo.trim();
  return { ...c, status: 'desistencia', atualizadoEm: em, historico: [...c.historico, { em, por, texto: `Não fechou${m ? `: ${m}` : ''}.` }] };
}

export function reabrirCredito(c0: CreditoGerador, agora: Date, por: string): CreditoGerador {
  if (c0.status === 'negociacao') return c0;
  const c = normalizarCredito(c0);
  const em = agora.toISOString();
  return {
    ...c, status: 'negociacao', itens: c.itens.map((i) => ({ ...i, valorFechadoKWh: null })), fechadoEm: null, atualizadoEm: em,
    historico: [...c.historico, { em, por, texto: 'Negociação reaberta.' }],
  };
}

export interface ResumoBanco {
  negociacaoKWh: number;
  fechadoKWh: number;
  fechadoValor: number;
  /** Média ponderada pelo volume dos itens fechados (R$/kWh). */
  fechadoMedioKWh: number | null;
}

/** Filtro por distribuidora e/ou modalidade: o lote fica só com os itens que batem (some se nenhum bater). */
export function filtrarItens(lista: CreditoGerador[], distribuidora = '', modalidade = ''): CreditoGerador[] {
  const bate = (i: ItemCredito) => (!distribuidora || (i.distribuidora || SEM_DISTRIBUIDORA) === distribuidora)
    && (!modalidade || (i.modalidade || SEM_MODALIDADE) === modalidade);
  return lista.map((c) => ({ ...c, itens: c.itens.filter(bate) })).filter((c) => c.itens.length > 0);
}

export function resumoBanco(lista: CreditoGerador[]): ResumoBanco {
  const itensDe = (s: StatusCredito) => lista.filter((c) => c.status === s).flatMap((c) => c.itens);
  const fechados = itensDe('fechado');
  const fechadoKWh = fechados.reduce((s, i) => s + i.volumeKWh, 0);
  const fechadoValor = fechados.reduce((s, i) => s + i.volumeKWh * (i.valorFechadoKWh ?? 0), 0);
  return {
    negociacaoKWh: itensDe('negociacao').reduce((s, i) => s + i.volumeKWh, 0),
    fechadoKWh, fechadoValor, fechadoMedioKWh: fechadoKWh > 0 ? fechadoValor / fechadoKWh : null,
  };
}

/**
 * Resumo de cada distribuidora × modalidade, em ordem alfabética e GD I antes de GD II
 * (item antigo sem distribuidora/modalidade fica em "Sem distribuidora"/"Sem modalidade").
 */
export function resumoPorDistribuidora(lista: CreditoGerador[]): (ResumoBanco & { distribuidora: string; modalidade: string; lotes: number })[] {
  const chaves = new Map<string, { distribuidora: string; modalidade: string }>();
  for (const i of lista.flatMap((c) => c.itens)) {
    const k = { distribuidora: i.distribuidora || SEM_DISTRIBUIDORA, modalidade: i.modalidade ? ROTULO_MODALIDADE[i.modalidade] : SEM_MODALIDADE };
    chaves.set(`${k.distribuidora}|${k.modalidade}`, k);
  }
  return [...chaves.values()]
    .map((k) => {
      const mod = k.modalidade === SEM_MODALIDADE ? SEM_MODALIDADE : (Object.keys(ROTULO_MODALIDADE) as ModalidadeCredito[]).find((m) => ROTULO_MODALIDADE[m] === k.modalidade)!;
      const sub = filtrarItens(lista, k.distribuidora, mod);
      return { ...k, lotes: sub.length, ...resumoBanco(sub) };
    })
    .sort((a, b) => a.distribuidora.localeCompare(b.distribuidora, 'pt-BR') || a.modalidade.localeCompare(b.modalidade, 'pt-BR'));
}
