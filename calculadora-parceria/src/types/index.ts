export type Enquadramento = 'GD1' | 'GD2' | 'GD3';
export type Fonte = 'Solar' | 'Outras';
export type Modalidade = 'Autoconsumo' | 'Geração Compartilhada';
export type Faixa = '≤1 MW' | '>1 MW';

/** Inputs equivalentes às células amarelas da aba PARCERIA. */
export interface ParceriaInput {
  distribuidora: string;
  ano: number;
  enquadramento: Enquadramento;
  fonte: Fonte;
  modalidade: Modalidade;
  potenciaConexaoMW: number;
  potenciaInstaladaMWp: number;
  /** kWh/mês. Se omitido, usa potenciaInstaladaMWp * 120000 (default da planilha). */
  geracaoMensalKWh?: number;
  /** % desconto ao cliente. Se omitido, usa o valor padrão da aba DESCONTO. */
  descontoClientePct?: number;
  /** Deságio Alexandria (%), PARCERIA!C30. */
  desagioPct: number;
  /** Divisor "%Pescoço" usado no faturamento do 1º mês, PARCERIA!H17 (padrão 1). */
  pescoco?: number;
  /** Consumo médio dos clientes atendidos em kWh, PARCERIA!G8 (padrão 500). */
  consumoMedioClienteKWh?: number;
  /** Consumo mínimo faturável em kWh, PARCERIA!H8 (padrão 50). */
  consumoMinimoKWh?: number;
}

export interface IsencaoFlags {
  teIcms: boolean;
  tePisCofins: boolean;
  tusdIcms: boolean;
  tusdPisCofins: boolean;
}

export interface TarifaBase {
  te: number;   // R$/kWh
  tusd: number; // R$/kWh
  inicioVigencia: string;
  fimVigencia: string;
}

export interface ComponentesTusd {
  fioB: number; // R$/kWh
  fioA_FR: number; // R$/kWh
  fioA_RB: number; // R$/kWh
}

export interface SimulacaoFaturaDetalhe {
  numeroClientes: number;
  teCheia: number;
  tusdCheia: number;
  consumoTE: { qtde: number; valor: number; icms: number; pisCofins: number };
  consumoTUSD: { qtde: number; valor: number; icms: number; pisCofins: number };
  injecaoTE: { qtde: number; valor: number; icms: number; pisCofins: number };
  injecaoTUSD: { qtde: number; valor: number; icms: number; pisCofins: number };
  totalFatura: { valor: number; icms: number; pisCofins: number };
  faturaSemAlexandria: { valor: number; icms: number; pisCofins: number; imposto: number };
  injecaoBase: { valor: number; icms: number; pisCofins: number; imposto: number };
  faturaComAlexandria: { valor: number; icms: number; pisCofins: number; imposto: number };
  creditoImposto: number;
}

export interface ParceriaResultado {
  estado: string;
  icmsAliquota: number;
  pisCofinsAliquota: number;
  isencoes: IsencaoFlags;
  faixa: Faixa;
  tarifaVigente: TarifaBase;
  componentesTusd: ComponentesTusd;
  fioBRampaPct: number;

  trfAneel: number;          // C22
  trfDistribuidora: number;  // C23
  tarifaCompensada: number;  // C24
  tarifaClienteBase: number; // C25
  tarifaDesconto: number;    // C26
  faturaSemAlexandria: number; // C27
  valorTotalBruto: number;   // C33
  geracaoMensalKWh: number;  // C10
  descontoClientePct: number; // C11

  tGerador: number;               // G3
  faturamentoBrutoGerador: number; // G4
  porcentagemBrutaEstimada: number; // G5
  numeroClientes: number;          // G9
  valorInjecao: number;            // G10
  tClienteFinal: number;           // G11
  faturasConcessionariaClientes: number; // G12
  faturaComAlexandria: number;     // G13
  descontoClientes: number;        // G14
  percentualDescontoLiquido: number; // H14
  faturamento1Mes: number;         // G17
  recorrenciaMensal: number;       // G18
  faturamento1Ano: number;         // G19
  takeRate1Ano: number;            // G20
  pescoco: number;
  /** Faturamento Bruto Gerador × (12 - meses de pescoço). */
  faturamentoAnualGerador: number;

  simulacaoFatura: SimulacaoFaturaDetalhe;
}

export interface BatchScenarioInput {
  concessionaria: string;
  /** Ano do contrato (afeta a rampa do Fio B em GD2). Padrão: ano atual. */
  ano?: number;
  desagio: number;
  potCA: number;
  potCC: number;
  geracaoMensal: number;
  pescoco: number;
  enquadramento: Enquadramento;
  fonte: Fonte;
  modalidade: Modalidade;
}

export interface BatchScenarioOutput extends BatchScenarioInput {
  tarifComp: number;
  pctCliente: number;
  tGerador: number;
  fatGerador: number;
  pescocoAlex: number;
  mensalAlex: number;
  takeRate: number;
  erro?: string;
}
