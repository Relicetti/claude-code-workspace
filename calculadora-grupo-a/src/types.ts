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
  /** % da fatura de geração que fica com a Alexandria. */
  desagioPct: number;
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

  /** Resultado final — operação Alexandria. */
  valorCss: number;                // o que o cliente ainda paga à distribuidora
  faturaGeracao: number;           // o que o cliente paga pelos créditos
  valorTotalComAlexandria: number;
  tarifaMediaGeracao: number;      // R$/kWh
  valorAlexandria: number;
  valorGerador: number;            // o que vai para o dono do crédito
  tarifaMediaGerador: number;      // R$/kWh
  economiaClientePct: number;
}
