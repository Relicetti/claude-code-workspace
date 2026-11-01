// Fatura de serviços da Kora (uma página A4): energia compensada por UC × R$/kWh, como pede a Cláusula 5ª §2.
import type React from 'react';
import logo from './assets/proposta/logo.png';
import { CORPO, K, PRETO, SITE, TELEFONE } from './FolhetoKora';
import { formatarDocumento, type Cliente } from './lib/clientes';
import { enderecoTexto } from './lib/contratos';
import { mesBR, type FaturaKora as Fatura } from './lib/controle';

const n = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const data = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const preco = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const KORA = {
  razao: 'KORA ENERGIA LTDA.', cnpj: '65.132.301/0001-14',
  endereco: 'Rua Bororos, nº 14, Vila Izabel, Curitiba/PR, CEP 80.320-260',
};

export function FaturaKora({ f, c, saldoAposKWh }: { f: Fatura; c: Cliente; saldoAposKWh: number | null }) {
  const rotulo: React.CSSProperties = { fontSize: '7.5pt', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '1mm' };
  const caixa: React.CSSProperties = { border: `0.3mm solid ${K.cinza}`, borderRadius: '2mm', padding: '4mm 5mm' };
  const th: React.CSSProperties = { textAlign: 'right', padding: '2.5mm 3mm', fontSize: '8.5pt', color: '#fff', background: K.marinho, fontWeight: 700 };
  const td: React.CSSProperties = { textAlign: 'right', padding: '2.5mm 3mm', fontSize: '10pt', borderBottom: `0.3mm solid ${K.cinza}` };
  const distrib = c.contrato.distribuidoraNome || 'distribuidora';
  const cancelada = f.status === 'cancelada';

  return (
    <div className="folheto" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: '#fff', color: K.texto, fontFamily: CORPO, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {cancelada && (
        <div style={{ position: 'absolute', top: '120mm', left: 0, right: 0, textAlign: 'center', fontFamily: PRETO, fontSize: '60pt', color: 'rgba(227,73,72,.18)', transform: 'rotate(-20deg)', pointerEvents: 'none' }}>CANCELADA</div>
      )}
      <div style={{ background: K.marinho, color: '#fff', padding: '8mm 12mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <img src={logo} alt="Kora" style={{ width: '42mm' }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: PRETO, fontSize: '15pt', color: K.ciano }}>{f.quitacaoSaldo ? 'FATURA DE QUITAÇÃO DE SALDO' : 'FATURA DE SERVIÇOS'}</div>
          <div style={{ fontSize: '11pt', marginTop: '1mm' }}>Nº {f.numero}</div>
        </div>
      </div>

      <div style={{ padding: '8mm 12mm', display: 'flex', flexDirection: 'column', gap: '6mm', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4mm' }}>
          <div style={caixa}><div style={rotulo}>Referência</div><div style={{ fontSize: '12pt', fontWeight: 700 }}>{f.quitacaoSaldo ? 'Saldo remanescente' : mesBR(f.mes)}</div></div>
          <div style={caixa}><div style={rotulo}>Emissão</div><div style={{ fontSize: '12pt', fontWeight: 700 }}>{data(f.emitidaEm)}</div></div>
          <div style={{ ...caixa, background: K.ciano, borderColor: K.ciano, color: '#fff' }}>
            <div style={{ ...rotulo, color: 'rgba(255,255,255,.9)' }}>Vencimento</div><div style={{ fontSize: '14pt', fontFamily: PRETO }}>{data(f.vencimento)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4mm' }}>
          <div style={caixa}>
            <div style={rotulo}>Cliente</div>
            <div style={{ fontWeight: 700, fontSize: '11pt' }}>{c.nome}</div>
            <div style={{ fontSize: '9pt' }}>{c.tipo === 'PJ' ? 'CNPJ' : 'CPF'} {formatarDocumento(c.tipo, c.documento)}</div>
            {c.endereco.logradouro && <div style={{ fontSize: '9pt' }}>{enderecoTexto(c.endereco)}</div>}
          </div>
          <div style={caixa}>
            <div style={rotulo}>Prestador</div>
            <div style={{ fontWeight: 700, fontSize: '11pt' }}>{KORA.razao}</div>
            <div style={{ fontSize: '9pt' }}>CNPJ {KORA.cnpj}</div>
            <div style={{ fontSize: '9pt' }}>{KORA.endereco}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>{f.quitacaoSaldo ? 'Descrição' : 'Unidade consumidora'}</th>
            <th style={th}>{f.quitacaoSaldo ? 'kWh remanescentes' : 'kWh compensados'}</th>
            <th style={th}>Preço (R$/kWh)</th>
            <th style={th}>Valor (R$)</th>
          </tr></thead>
          <tbody>
            {f.itens.map((i) => (
              <tr key={i.uc}>
                <td style={{ ...td, textAlign: 'left' }}>{f.quitacaoSaldo ? i.uc : `UC ${i.uc}`}</td>
                <td style={td}>{n(i.compensadoKWh)}</td>
                <td style={td}>{preco(i.precoKWh)}</td>
                <td style={td}>{n(i.valor, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ background: K.marinho, color: '#fff', borderRadius: '2mm', padding: '4mm 8mm', textAlign: 'right' }}>
            <div style={{ fontSize: '8pt', color: K.ciano, textTransform: 'uppercase', letterSpacing: '.05em' }}>Total a pagar</div>
            <div style={{ fontFamily: PRETO, fontSize: '20pt' }}>R$ {n(f.total, 2)}</div>
          </div>
        </div>

        <div style={{ fontSize: '8.5pt', lineHeight: 1.5, color: '#3c4043' }}>
          {f.quitacaoSaldo ? (
            <p>Quitação do saldo de créditos não utilizado, calculado pelos kWh remanescentes × preço por kWh vigente, nos termos da Cláusula Nona, Parágrafo Terceiro, do Contrato de Assessoria Energética e Gestão de Créditos de Energia Elétrica.</p>
          ) : (
            <>
              <p>Valor referente à energia efetivamente compensada nas faturas da {distrib} de {mesBR(f.mes)}, conforme as Cláusulas Terceira a Quinta do Contrato de Assessoria Energética e Gestão de Créditos de Energia Elétrica. Não inclui os valores da fatura da {distrib}, que é paga à parte, diretamente à distribuidora.</p>
              {saldoAposKWh !== null && <p>Saldo de créditos remanescente após esta apuração: <b>{n(Math.max(0, saldoAposKWh))} kWh</b>.</p>}
            </>
          )}
          <p>Pagamento por boleto bancário emitido pela KORA. Atraso sujeito a multa de 2%, juros de 1% ao mês pro rata die e correção pelo IPCA (Cláusula Oitava).</p>
          {f.observacao && <p>{f.observacao}</p>}
          {f.status === 'paga' && <p style={{ color: '#1baf7a', fontWeight: 700 }}>PAGA em {data(f.pagaEm!)} — R$ {n(f.valorPago ?? 0, 2)}</p>}
        </div>
      </div>

      <div style={{ background: K.cinza, padding: '4mm 12mm', fontSize: '8pt', display: 'flex', justifyContent: 'space-between' }}>
        <span>{SITE}</span><span>{TELEFONE}</span>
      </div>
    </div>
  );
}
