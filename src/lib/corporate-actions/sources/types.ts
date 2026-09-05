export interface RawCorporateAction {
  symbol: string;
  isin: string | null;
  subject: string;
  ex_date: string; // YYYY-MM-DD
}

export interface CorporateActionSource {
  readonly name: string;          // 'nse' | 'bse'
  readonly supportsHistory: boolean;
  /** Market-wide actions in [from, to] (BSE ignores the range → forthcoming). */
  fetchWindow(from: Date, to: Date): Promise<RawCorporateAction[]>;
}
