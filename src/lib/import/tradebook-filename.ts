/**
 * Recover the broker client id from a Zerodha tradebook filename, e.g.
 * "tradebook-YY7859-EQ.csv" → "YY7859". The CSV export carries no Client ID in
 * its content (unlike the XLSX), so account resolution falls back to this.
 */
export function clientIdFromFileName(fileName: string): string | null {
  const m = fileName.match(/tradebook-([A-Za-z0-9]+)-EQ/i);
  return m ? m[1].toUpperCase() : null;
}
