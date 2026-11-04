// Cobrança por boleto (com QR Pix) no Asaas — conta da Kora.
// ASAAS_API_KEY (sandbox começa com $aact_hmlg_, produção com $aact_prod_), ASAAS_AMBIENTE=producao para valer,
// ASAAS_WEBHOOK_TOKEN: o token que o Asaas manda no cabeçalho asaas-access-token dos avisos de pagamento.
import crypto from 'node:crypto';

export const asaasProducao = () => process.env.ASAAS_AMBIENTE === 'producao';
export const asaasConfigurado = () => !!process.env.ASAAS_API_KEY;
const URL_BASE = () => (asaasProducao() ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3');

async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new Error('Asaas não configurado (falta ASAAS_API_KEY).');
  const res = await fetch(`${URL_BASE()}${caminho}`, {
    method: metodo,
    headers: { access_token: chave, 'Content-Type': 'application/json', 'User-Agent': 'erp-kora' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await res.text();
  let json: unknown = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
  if (!res.ok) {
    const erros = (json as { errors?: { description: string }[] } | null)?.errors?.map((e) => e.description).join('; ');
    throw new Error(`Asaas (HTTP ${res.status}): ${erros || texto.slice(0, 200) || 'erro'}`);
  }
  return json as T;
}

export interface DadosPagador {
  nome: string; cpfCnpj: string; email: string; celular: string; cep: string; numero: string; endereco: string;
  complemento: string; bairro: string; referencia: string;
}

/** Acha o cliente no Asaas pelo CPF/CNPJ ou cria. */
export async function clienteAsaas(p: DadosPagador): Promise<string> {
  const achados = await chamar<{ data: { id: string; deleted?: boolean }[] }>('GET', `/customers?cpfCnpj=${encodeURIComponent(p.cpfCnpj)}`);
  const ativo = achados.data.find((c) => !c.deleted);
  if (ativo) return ativo.id;
  const novo = await chamar<{ id: string }>('POST', '/customers', {
    name: p.nome, cpfCnpj: p.cpfCnpj, email: p.email || undefined, mobilePhone: p.celular || undefined,
    postalCode: p.cep || undefined, addressNumber: p.numero || undefined, address: p.endereco || undefined,
    complement: p.complemento || undefined, province: p.bairro || undefined, externalReference: p.referencia,
    // No sandbox não manda e-mail/SMS para o cliente de verdade.
    notificationDisabled: !asaasProducao(),
  });
  return novo.id;
}

export interface PagamentoAsaas {
  id: string; status: string; value: number; netValue?: number; dueDate: string; paymentDate?: string | null;
  clientPaymentDate?: string | null; bankSlipUrl?: string | null; invoiceUrl?: string | null; nossoNumero?: string | null;
  externalReference?: string | null; deleted?: boolean;
}

export async function criarCobranca(c: {
  cliente: string; valor: number; vencimento: string; descricao: string; referencia: string; multaPct: number; jurosMesPct: number;
}): Promise<PagamentoAsaas> {
  return chamar<PagamentoAsaas>('POST', '/payments', {
    customer: c.cliente, billingType: 'BOLETO', value: c.valor, dueDate: c.vencimento, description: c.descricao.slice(0, 500),
    externalReference: c.referencia, fine: { value: c.multaPct, type: 'PERCENTAGE' }, interest: { value: c.jurosMesPct },
  });
}

export const consultarCobranca = (id: string) => chamar<PagamentoAsaas>('GET', `/payments/${encodeURIComponent(id)}`);
export const linhaDigitavel = (id: string) =>
  chamar<{ identificationField: string; nossoNumero: string; barCode: string }>('GET', `/payments/${encodeURIComponent(id)}/identificationField`);
export const pixQrCode = (id: string) =>
  chamar<{ encodedImage: string; payload: string; expirationDate: string }>('GET', `/payments/${encodeURIComponent(id)}/pixQrCode`);
export const cancelarCobranca = (id: string) => chamar<{ deleted: boolean }>('DELETE', `/payments/${encodeURIComponent(id)}`);

export async function registrarWebhook(url: string, email: string): Promise<void> {
  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!token || token.length < 32) throw new Error('Defina ASAAS_WEBHOOK_TOKEN (32+ caracteres) no servidor antes.');
  await chamar('POST', '/webhooks', {
    name: 'ERP Kora', url, email, enabled: true, interrupted: false, apiVersion: 3, authToken: token, sendType: 'SEQUENTIALLY',
    events: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE'],
  });
}

/** Confere o token do aviso de pagamento (cabeçalho asaas-access-token). */
export function webhookAutentico(recebido: string | undefined): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado || !recebido) return false;
  const a = crypto.createHash('sha256').update(recebido).digest();
  const b = crypto.createHash('sha256').update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}
