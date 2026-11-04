// Leitura da fatura (DANF3E) da Copel a partir do texto do PDF, uma linha por linha visual, células separadas
// por " | " (server/lerPdf.ts monta assim). Determinístico: se não reconhecer o layout, diz o que faltou em vez
// de chutar número.
//
// Compensação na Copel: linhas "ENERGIA INJ. ... TE ..." com quantidade negativa (kWh compensados); as linhas
// TUSD repetem os mesmos kWh e as "ENERGIA INJ. BAND. ..." são o crédito das bandeiras (mesmos kWh repartidos
// por período) — nenhuma das duas entra na soma.

export interface LeituraFatura {
  distribuidora: string;
  uc: string;
  /** Mês de referência da fatura, "YYYY-MM". */
  mes: string;
  vencimento: string;          // YYYY-MM-DD
  total: number;               // R$
  leituraAnterior: string | null;
  leituraAtual: string | null;
  consumoKWh: number | null;
  compensadoKWh: number;
  compensadoPontaKWh: number;
  compensadoForaPontaKWh: number;
  /** Saldo acumulado de créditos (ponta + fora ponta) informado pela distribuidora. */
  saldoAcumuladoKWh: number | null;
  saldoExpirarKWh: number | null;
  classificacao: string | null;
  ligacao: string | null;
  /** Linhas de compensação encontradas (para conferência). */
  linhasCompensacao: { descricao: string; kWh: number }[];
  avisos: string[];
}

/** "1.234,56" → 1234.56 */
export const numBR = (s: string) => Number(s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
const isoDeBR = (d: string) => d.split('/').reverse().join('-');

const celulas = (linha: string) => linha.split('|').map((c) => c.trim()).filter((c) => c && !/^Segunda Via$/i.test(c));

export function lerFaturaCopel(linhas: string[]): LeituraFatura {
  const texto = linhas.join('\n');
  if (!/Copel Distribui[cç][aã]o/i.test(texto)) throw new Error('Não parece uma fatura da Copel.');

  // Rodapé: "UC | MM/AAAA | DD/MM/AAAA | R$x" (a mesma faixa aparece no topo).
  let rodape: RegExpMatchArray | null = null;
  for (const l of linhas) {
    const m = l.match(/^(\d{6,})\s*\|\s*(\d{2})\/(\d{4})\s*\|\s*(\d{2}\/\d{2}\/\d{4})\s*\|\s*R\$\s*([\d.,]+)/);
    if (m) { rodape = m; break; }
  }
  if (!rodape) throw new Error('Não achei UC, mês de referência, vencimento e total na fatura.');
  const [, uc, mm, aaaa, venc, total] = rodape;

  const leituras = linhas.map((l) => l.match(/^(\d{2}\/\d{2}\/\d{4})\s*\|\s*(\d{2}\/\d{2}\/\d{4})\s*\|\s*\d+\s*\|\s*\d{2}\/\d{2}\/\d{4}$/)).find(Boolean);

  // Itens da fatura: descrição | unidade | quantidade | …
  const itens = linhas.map(celulas).filter((c) => /^ENERGIA /i.test(c[0] ?? '') && c[1] === 'kWh' && /^-?[\d.,]+$/.test(c[2] ?? ''))
    .map((c) => ({ descricao: c[0], kWh: numBR(c[2]) }));
  const consumo = itens.find((i) => /^ENERGIA ELET CONSUMO/i.test(i.descricao));
  const injecao = itens.filter((i) => /^ENERGIA INJ/i.test(i.descricao) && !/BAND/i.test(i.descricao));
  let comp = injecao.filter((i) => /\bTE\b/.test(i.descricao));
  const avisos: string[] = [];
  if (comp.length === 0 && injecao.length > 0) {
    comp = injecao.filter((i) => /\bTUSD\b/.test(i.descricao));
    avisos.push('Sem linhas de TE: usei as de TUSD para os kWh compensados.');
  }
  const posto = (d: string) => (/F\.?\s*PONTA|FORA\s*PONTA|\bFP\b/i.test(d) ? 'FP' : /\bPONTA\b|\bPTA\b/i.test(d) ? 'P' : 'FP');
  const ponta = comp.filter((i) => posto(i.descricao) === 'P').reduce((s, i) => s + Math.abs(i.kWh), 0);
  const fora = comp.filter((i) => posto(i.descricao) === 'FP').reduce((s, i) => s + Math.abs(i.kWh), 0);
  if (comp.length === 0) avisos.push('Nenhuma linha de energia injetada/compensada nesta fatura.');

  const corrido = texto.replace(/\s+/g, ' ');
  const n = (re: RegExp) => { const m = corrido.match(re); return m ? numBR(m[1]) : null; };
  const accP = n(/Saldo Acumulado Ponta ([\d.,]+)/i);
  const accFP = n(/Saldo Acumulado F(?:ora)?\.? ?Ponta ([\d.,]+)/i);
  const expP = n(/Saldo a Expirar Pr[oó]ximo M[eê]s Ponta ([\d.,]+)/i);
  const expFP = n(/Saldo a Expirar Pr[oó]ximo M[eê]s F(?:ora)?\.? ?Ponta ([\d.,]+)/i);
  if (accP === null && accFP === null) avisos.push('A fatura não traz o demonstrativo de saldos SCEE.');
  if (expP || expFP) avisos.push(`Atenção: ${((expP ?? 0) + (expFP ?? 0)).toLocaleString('pt-BR')} kWh de saldo expiram no próximo mês.`);

  const classe = linhas.map(celulas).find((c) => /^(A\d|AS|B\d)\b/.test(c[0] ?? '') && c.length >= 1);

  return {
    distribuidora: 'Copel',
    uc,
    mes: `${aaaa}-${mm}`,
    vencimento: isoDeBR(venc),
    total: numBR(total),
    leituraAnterior: leituras ? isoDeBR(leituras[1]) : null,
    leituraAtual: leituras ? isoDeBR(leituras[2]) : null,
    consumoKWh: consumo ? consumo.kWh : null,
    compensadoKWh: ponta + fora,
    compensadoPontaKWh: ponta,
    compensadoForaPontaKWh: fora,
    saldoAcumuladoKWh: accP === null && accFP === null ? null : (accP ?? 0) + (accFP ?? 0),
    saldoExpirarKWh: expP === null && expFP === null ? null : (expP ?? 0) + (expFP ?? 0),
    classificacao: classe?.[0] ?? null,
    ligacao: classe?.[1] ?? null,
    linhasCompensacao: comp.map((i) => ({ descricao: i.descricao, kWh: Math.abs(i.kWh) })),
    avisos,
  };
}

/** UCs com e sem zeros à esquerda são a mesma ("000677708603158" = "677708603158"). */
export const mesmaUC = (a: string, b: string) => a.replace(/\D/g, '').replace(/^0+/, '') === b.replace(/\D/g, '').replace(/^0+/, '');
