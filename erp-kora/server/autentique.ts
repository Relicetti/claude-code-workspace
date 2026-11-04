// Assinatura eletrônica pela Autentique (conta da Kora; token em AUTENTIQUE_TOKEN).
// AUTENTIQUE_SANDBOX=1 manda documentos de teste: não gastam crédito e não têm validade jurídica.
const URL_API = 'https://api.autentique.com.br/v2/graphql';

export const autentiqueConfigurada = () => !!process.env.AUTENTIQUE_TOKEN;
export const autentiqueSandbox = () => process.env.AUTENTIQUE_SANDBOX === '1';

export interface SignatarioAutentique {
  nome: string;
  email: string;
  /** Com DDD; se `whatsapp`, o link vai por WhatsApp em vez de e-mail. */
  telefone: string;
  whatsapp: boolean;
  testemunha: boolean;
}

export interface AssinaturaAutentique {
  publicId: string;
  nome: string;
  email: string;
  link: string;
  assinadoEm: string | null;
  recusadoEm: string | null;
}

export interface DocumentoAutentique {
  id: string;
  assinaturas: AssinaturaAutentique[];
  /** URL do PDF assinado (com a página de auditoria). */
  pdfAssinado: string | null;
}

/** "+55 (41) 99999-9999" → "+5541999999999". */
export function telefoneInternacional(t: string): string {
  const d = t.replace(/\D/g, '');
  if (!d) return '';
  return `+${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}`;
}

async function chamar<T>(corpo: FormData | string): Promise<T> {
  const token = process.env.AUTENTIQUE_TOKEN;
  if (!token) throw new Error('Autentique não configurada (falta AUTENTIQUE_TOKEN).');
  const res = await fetch(URL_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(typeof corpo === 'string' ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo,
  });
  const texto = await res.text();
  let json: { data?: T; errors?: { message: string }[] };
  try { json = JSON.parse(texto); } catch { throw new Error(`Autentique respondeu HTTP ${res.status}: ${texto.slice(0, 200)}`); }
  if (json.errors?.length) throw new Error(`Autentique: ${json.errors.map((e) => e.message).join('; ')}`);
  if (!res.ok || !json.data) throw new Error(`Autentique respondeu HTTP ${res.status}.`);
  return json.data;
}

const CAMPOS_ASSINATURA = 'public_id name email link { short_link } signed { created_at } rejected { created_at }';

interface AssinaturaApi {
  public_id: string; name: string | null; email: string | null;
  link: { short_link: string } | null; signed: { created_at: string } | null; rejected: { created_at: string } | null;
}

const converter = (a: AssinaturaApi): AssinaturaAutentique => ({
  publicId: a.public_id, nome: a.name ?? '', email: a.email ?? '', link: a.link?.short_link ?? '',
  assinadoEm: a.signed?.created_at ?? null, recusadoEm: a.rejected?.created_at ?? null,
});

export async function criarDocumento(nome: string, arquivo: Buffer, nomeArquivo: string, mime: string, signatarios: SignatarioAutentique[]): Promise<DocumentoAutentique> {
  const signers = signatarios.map((s) => {
    const action = s.testemunha ? 'SIGN_AS_A_WITNESS' : 'SIGN';
    return s.whatsapp && s.telefone
      ? { phone: telefoneInternacional(s.telefone), delivery_method: 'DELIVERY_METHOD_WHATSAPP', action }
      : { email: s.email.trim().toLowerCase(), action };
  });
  const query = `mutation ($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!, $sandbox: Boolean) {
    createDocument(sandbox: $sandbox, document: $document, signers: $signers, file: $file) {
      id signatures { ${CAMPOS_ASSINATURA} }
    }
  }`;
  const form = new FormData();
  form.append('operations', JSON.stringify({
    query,
    variables: {
      document: { name: nome, refusable: true, reminder: 'DAILY', locale: { country: 'BR', language: 'pt-BR' } },
      signers, file: null, sandbox: autentiqueSandbox(),
    },
  }));
  form.append('map', JSON.stringify({ file: ['variables.file'] }));
  form.append('file', new Blob([new Uint8Array(arquivo)], { type: mime }), nomeArquivo);
  const data = await chamar<{ createDocument: { id: string; signatures: AssinaturaApi[] } }>(form);
  return { id: data.createDocument.id, assinaturas: data.createDocument.signatures.map(converter), pdfAssinado: null };
}

export async function consultarDocumento(id: string): Promise<DocumentoAutentique> {
  // O id vai literal na query (como nos exemplos da Autentique), por isso só aceita [A-Za-z0-9-].
  if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error('Id de documento inválido.');
  const query = `query { document(id: "${id}") { id files { signed } signatures { ${CAMPOS_ASSINATURA} } } }`;
  const data = await chamar<{ document: { id: string; files: { signed: string | null } | null; signatures: AssinaturaApi[] } | null }>(
    JSON.stringify({ query }));
  if (!data.document) throw new Error('Documento não encontrado na Autentique.');
  return { id: data.document.id, assinaturas: data.document.signatures.map(converter), pdfAssinado: data.document.files?.signed ?? null };
}

export async function baixarPdf(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar o PDF assinado (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}
