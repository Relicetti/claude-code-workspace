export type Grupo = 'A' | 'B';
export type ModalidadeTarifaria = 'Verde' | 'Azul' | 'Convencional';
/** Posto tarifário como a ANEEL grava: Grupo A tem Ponta/Fora ponta, Grupo B é monômio. */
export type Posto = 'Ponta' | 'Fora ponta' | 'Não se aplica';
export type Enquadramento = 'GD1' | 'GD2' | 'GD3';
export type ModalidadeGD = 'Autoconsumo' | 'Geração Compartilhada';
export type Fonte = 'Solar' | 'Outras';

/** Uma linha de tarifa homologada (R$/MWh), uma por vigência. */
export interface TarifaRow {
  agente: string;      // SigAgente da ANEEL
  subgrupo: string;
  modalidade: string;
  posto: Posto;
  inicio: string;      // YYYY-MM-DD
  fim: string;
  tusd: number;
  te: number;
  resolucao: string;
}

/** Componente TUSD_FioB (R$/MWh), uma por vigência. */
export interface FioBRow {
  agente: string;
  subgrupo: string;
  modalidade: string;
  posto: Posto;
  inicio: string;
  fioB: number;
}

export interface DadosTarifarios {
  tarifas: TarifaRow[];
  fioB: FioBRow[];
  atualizadoEm: string | null;
}

export interface Entrada {
  distribuidora: string;
  ano: number;
  subgrupo: string;
  modalidadeTarifaria: ModalidadeTarifaria;
  /** kWh/mês por posto. Grupo A usa Ponta e Fora ponta; Grupo B usa "Não se aplica". */
  consumo: Partial<Record<Posto, number>>;
  icms: number;
  pis: number;
  cofins: number;
  enquadramento: Enquadramento;
  modalidadeGD: ModalidadeGD;
  fonte: Fonte;
  /** % de desconto contratado sobre a fatura atual do cliente. */
  descontoPct: number;
  /** % da fatura de geração que fica com a Kora. */
  desagioPct: number;
  /** Valor pago ao dono do crédito, R$/kWh. Se informado, substitui o deságio: a Kora fica
   * com o que sobrar da fatura de geração. */
  precoGeradorKWh?: number;
  /** Comissão do vendedor, R$/kWh fixo, tirada da parte da Kora. */
  vendedorKWh?: number;
}

export interface IsencoesGD {
  teIcms: boolean;
  tePisCofins: boolean;
  tusdIcms: boolean;
  tusdPisCofins: boolean;
}

export interface LinhaPosto {
  posto: Posto;
  kWh: number;
  /** Tarifas ANEEL sem impostos, R$/MWh. */
  te: number;
  tusd: number;
  fioB: number;
  fioBAplicado: number;
  /** Tarifa cheia com impostos (cliente), R$/MWh. */
  teCheia: number;
  tusdCheia: number;
  /** Tarifa da energia injetada/compensada, com isenções GD, R$/MWh. */
  teInjetada: number;
  tusdInjetada: number;
  valorAtual: number;
  valorInjetado: number;
  inicioVigencia: string;
  resolucao: string;
}

export interface Resultado {
  estado: string;
  agenteAneel: string;
  isencoes: IsencoesGD;
  fioBRampaPct: number;
  postos: LinhaPosto[];
  consumoTotalKWh: number;

  /** Faturamento atual (sem GD). */
  valorAtual: number;
  tarifaMediaCliente: number;      // R$/kWh
  desconto: number;

  /** Energia injetada (créditos). */
  valorInjetado: number;
  tarifaMediaInjetada: number;     // R$/kWh

  /** Resultado final — operação Kora. */
  valorCss: number;                // o que o cliente ainda paga à distribuidora
  tarifaMediaCss: number;          // R$/kWh (Fio B / parcela não compensada)
  faturaGeracao: number;           // o que o cliente paga pelos créditos
  valorTotalComKora: number;
  tarifaMediaGeracao: number;      // R$/kWh
  /** Parte da Kora já descontada a comissão do vendedor ("nosso"). */
  valorKora: number;
  tarifaMediaKora: number;         // R$/kWh
  valorVendedor: number;
  tarifaMediaVendedor: number;     // R$/kWh
  /** Custo final do kWh para o cliente: distribuidora + gerador + Kora + vendedor. */
  tarifaMediaFinal: number;        // R$/kWh
  /** Deságio de fato (Kora + vendedor sobre a fatura de geração): o informado, ou o resultante
   * quando o valor do dono do crédito é fixado. */
  desagioEfetivoPct: number;
  valorGerador: number;            // o que vai para o dono do crédito
  tarifaMediaGerador: number;      // R$/kWh
  economiaClientePct: number;
}
