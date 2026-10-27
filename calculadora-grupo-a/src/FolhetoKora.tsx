// Folheto "Estudo de Economia Kora": uma página A4 no molde do PPTX comercial da Kora
// (KORA energIA - <cliente> - Crédito kWh.pptx). Valores vêm da simulação; textos fixos são os do modelo.
import type React from 'react';
import type { ResultadoOperacao } from './lib/operacao';
import type { Enquadramento, Resultado } from './types';
import topo from './assets/proposta/topo.jpg';
import banner from './assets/proposta/banner.jpg';
import logo from './assets/proposta/logo.png';

const K = { ciano: '#00B0F0', marinho: '#141F3B', texto: '#15191A', cinza: '#E3E4E0' };
const PRETO = "'Arial Black', 'Arial Bold', Arial, sans-serif";
const CORPO = "Arial, 'Helvetica Neue', sans-serif";

const n = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const kwh = (v: number) => `R$${n(v, 2)}/kWh`;

export interface DadosFolheto {
  cliente: string;
  cnpj: string;
  uc: string;
  /** Linhas pequenas abaixo do volume de energia (condições da injeção). */
  observacao: string;
}

export const SITE = 'www.koraenergia.com.br';
export const TELEFONE = '+55 41 99517-5300';

export function FolhetoKora({ r, op, creditoTotalKWh, enquadramento, dados }: {
  r: Resultado; op: ResultadoOperacao; creditoTotalKWh: number; enquadramento: Enquadramento; dados: DadosFolheto;
}) {
  const economiaMes = op.meses[0].desconto;
  const titulo: React.CSSProperties = { fontFamily: PRETO, color: K.ciano, fontSize: '13pt', lineHeight: 1.2 };

  return (
    <div className="folheto" style={{ width: '210mm', height: '297mm', margin: '0 auto', background: '#fff', color: K.texto, fontFamily: CORPO, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Topo: foto com cliente e logo */}
      <div style={{ height: '46mm', position: 'relative', background: `linear-gradient(90deg, rgba(7,20,40,.88) 0%, rgba(7,20,40,.65) 48%, rgba(7,20,40,0) 70%), url(${topo}) center 55% / cover` }}>
        <img src={logo} alt="Kora" style={{ position: 'absolute', right: '6mm', top: '5mm', width: '44mm' }} />
        <div style={{ position: 'absolute', left: '10mm', bottom: '6mm', right: '60mm', color: '#fff', fontSize: '10.5pt', lineHeight: 1.45 }}>
          <div style={{ color: K.ciano, fontWeight: 700, fontSize: '13pt', marginBottom: '1.5mm' }}>Energia por Assinatura – Geração Distribuída (GD)</div>
          <div><span style={{ color: K.ciano }}>Cliente:</span> <b>{dados.cliente || '—'}</b>{dados.cnpj && <> (CNPJ: {dados.cnpj})</>}</div>
          {dados.uc && <div><span style={{ color: K.ciano }}>Unidade Consumidora (UC):</span> {dados.uc}</div>}
        </div>
      </div>

      {/* Chamada e desconto */}
      <div style={{ padding: '9mm 12mm 0 12mm' }}>
        <div style={{ borderLeft: `2.2mm solid ${K.marinho}`, borderRadius: '1mm', paddingLeft: '6mm' }}>
          <div style={{ fontFamily: PRETO, fontSize: '27pt', lineHeight: 1.18, letterSpacing: '-0.01em' }}>
            Boas notícias, seu <span style={{ color: K.ciano }}>Estudo de Economia Kora</span> chegou!
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3mm', marginTop: '6mm', marginLeft: '4mm' }}>
          <span style={{ fontSize: '13pt' }}>Agora, <b style={{ fontFamily: PRETO, fontWeight: 400 }}>você economiza:</b></span>
          <span style={{ background: K.marinho, color: '#fff', fontFamily: PRETO, fontSize: '20pt', padding: '1.5mm 6mm', borderRadius: '2mm' }}>{n(r.economiaClientePct * 100, 1)}%</span>
        </div>
        <div style={{ fontSize: '8pt', color: '#555', marginTop: '1.5mm', marginLeft: '4mm' }}>*desconto na tarifa com impostos</div>
      </div>

      {/* Benefícios */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: '8mm', padding: '9mm 12mm 0 12mm', flex: 1 }}>
        <div style={{ alignSelf: 'center' }}>
          <div style={{ borderLeft: `2.2mm solid ${K.marinho}`, borderRadius: '1mm', paddingLeft: '6mm' }}>
            <div style={{ fontSize: '26pt', lineHeight: 1.1 }}>Seus</div>
            <div style={{ fontFamily: PRETO, color: K.ciano, fontSize: '26pt', lineHeight: 1.15 }}>benefícios</div>
          </div>
          <div style={{ fontSize: '12pt', lineHeight: 1.5, marginTop: '4mm', paddingLeft: '8.2mm' }}>
            <b style={{ fontFamily: PRETO, fontWeight: 400 }}>Pague menos</b> pela energia que você consome
          </div>
          <div style={{ fontSize: '10pt', lineHeight: 1.5, marginTop: '3mm', paddingLeft: '8.2mm', color: '#333' }}>
            Economia estimada de <b style={{ whiteSpace: 'nowrap' }}>R$ {n(economiaMes, 2)}/mês</b>
            {op.meses.length > 1 && <> e <b style={{ whiteSpace: 'nowrap' }}>R$ {n(op.total.desconto, 2)}</b> em {op.meses.length} meses</>}.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4.5mm', fontSize: '11pt', lineHeight: 1.35 }}>
          <div><div style={titulo}>Simples e Digital</div>Fácil de aderir</div>
          <div><div style={titulo}>Sem investimentos</div>Simples assim: Assinou, economizou!</div>
          <div>
            <div style={titulo}>Volume de Energia</div>
            <div style={{ fontFamily: PRETO, fontSize: '14pt', letterSpacing: '0.04em' }}>{n(creditoTotalKWh)} kWh</div>
            {dados.observacao && (
              <div style={{ fontSize: '7.5pt', letterSpacing: '0.06em', marginTop: '1mm', whiteSpace: 'pre-line' }}>{dados.observacao}</div>
            )}
          </div>
          <div>
            <div style={{ fontFamily: PRETO, fontSize: '14pt' }}>
              <span style={{ color: K.ciano }}>Valor Especial:</span> {kwh(r.tarifaMediaGeracao)}
            </div>
            <div style={{ fontSize: '10.5pt' }}><span style={{ color: K.ciano }}>Tarifa Final Cliente:</span> {kwh(r.tarifaMediaFinal)}</div>
            <div style={{ fontSize: '8pt' }}>(TUSD-{enquadramento}: R${n(r.tarifaMediaCss, 2)})</div>
            <div style={{ marginTop: '1mm' }}>Pagamento conforme consumo</div>
          </div>
        </div>
      </div>

      {/* Banner */}
      <div style={{ margin: '7mm 15mm 6mm', height: '62mm', borderRadius: '1mm', position: 'relative', background: `url(${banner}) right 18% / cover`, backgroundColor: '#0b1f4a' }}>
        <div style={{ position: 'absolute', left: '8mm', top: '50%', transform: 'translateY(-50%)', width: '72mm', color: K.ciano, fontSize: '21pt', lineHeight: 1.3, fontFamily: 'Georgia, serif' }}>
          E aí, já sabe o que vai fazer com essa economia?!
        </div>
      </div>

      {/* Rodapé */}
      <div style={{ background: K.cinza, padding: '6mm 11mm 7mm' }}>
        <div style={{ background: K.marinho, color: '#fff', borderRadius: '2.5mm', textAlign: 'center', fontFamily: PRETO, fontSize: '17pt', padding: '3.5mm 0' }}>
          Kora, <span style={{ color: K.ciano }}>energia orientada por inteligência</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7mm', marginTop: '4mm' }}>
          <Contato icone={<Globo />} titulo="Acesse nosso site" texto={SITE} href={`https://${SITE}`} />
          <Contato icone={<Whats />} titulo="Entre em contato" texto={TELEFONE} href={`https://wa.me/${TELEFONE.replace(/\D/g, '')}`} />
        </div>
      </div>
    </div>
  );
}

function Contato({ icone, titulo, texto, href }: { icone: React.ReactNode; titulo: string; texto: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'stretch', border: `1px solid ${K.marinho}`, borderRadius: '1.5mm', overflow: 'hidden', background: '#fff', color: K.texto, textDecoration: 'none' }}>
      <div style={{ background: K.marinho, width: '17mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icone}</div>
      <div style={{ padding: '2.5mm 4mm' }}>
        <div style={{ fontFamily: PRETO, color: K.marinho, fontSize: '12pt' }}>{titulo}</div>
        <div style={{ fontSize: '10.5pt' }}>{texto}</div>
      </div>
    </a>
  );
}

const Globo = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.6 2.8 3.9 6 3.9 9.5s-1.3 6.7-3.9 9.5c-2.6-2.8-3.9-6-3.9-9.5s1.3-6.7 3.9-9.5z" />
  </svg>
);

const Whats = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 20.5l1.3-4.2A9 9 0 1 1 8 19.4z" />
    <path d="M9 8.3c.3-.6.9-.6 1.1-.1l.6 1.5c.1.3 0 .6-.2.8l-.5.5c.6 1.3 1.6 2.3 2.9 2.9l.5-.5c.2-.2.5-.3.8-.2l1.5.6c.5.2.5.8-.1 1.1-.8.5-1.7.6-2.6.2a8.3 8.3 0 0 1-4.3-4.3c-.4-.9-.3-1.8.3-2.5z" fill="#fff" stroke="none" />
  </svg>
);
