import Papa from 'papaparse';
import { z } from 'zod';
import { dateValue, numberValue, LedgerError } from './values.ts';

export type DocumentKind = 'activity' | 'holdings' | 'portfolio';
const text = z.string().max(100_000);
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/).nullable();
export const balanceSchema = z.object({
  id: text, sourceId: text, row: z.number().int().positive(), broker: z.literal('merrill'),
  kind: z.enum(['holdings', 'portfolio']), basis: z.enum(['cob', 'realtime']),
  date: text.nullable(), time: text.nullable(), account: text, symbol: text, description: text,
  currency: z.literal('USD'), quantity: decimal, price: decimal, value: decimal,
  cash: decimal, moneyAccounts: decimal, investments: decimal, netValue: decimal,
  raw: z.record(z.string(), text), issues: z.array(text),
}).strict();
export type Balance = z.infer<typeof balanceSchema>;

export function csvTable(input: string) {
  const parsed = Papa.parse<string[]>(input.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (parsed.errors.length) throw new LedgerError('csvSyntax');
  const header = parsed.data.shift()?.map(v => v.trim()) ?? [];
  // Merrill Portfolio exports a trailing unnamed, empty column.
  if (!header.at(-1) && parsed.data.every(r => r.length === header.length && !r.at(-1)?.trim())) {
    header.pop(); parsed.data.forEach(r => r.pop());
  }
  if (header.some(h => !h) || new Set(header).size !== header.length) throw new LedgerError('csvHeaders');
  if (!parsed.data.length) throw new LedgerError('emptyCsv');
  const rows = parsed.data.map((r, i) => {
    if (r.length !== header.length) throw new LedgerError('csvWidth', i + 2);
    return Object.fromEntries(header.map((h, n) => [h, r[n]]));
  });
  return { header, rows };
}
export function detectDocument(input: string): DocumentKind {
  const { header } = csvTable(input);
  const has = (...keys: string[]) => keys.every(k => header.includes(k));
  const dated = has('COB Date') || has('Date', 'Time');
  const matches: DocumentKind[] = [];
  if (has('Trade Date', 'Settlement Date', 'Symbol/CUSIP #', 'Amount ($)', 'Type')) matches.push('activity');
  if (dated && has('Account #', 'Symbol', 'Security Description', 'Quantity', 'Price ($)', 'Value ($)')) matches.push('holdings');
  if (dated && has('Account #', 'Cash Balance ($)', 'Money Accounts ($)', 'Priced Investments ($)', 'Net Value ($)')) matches.push('portfolio');
  if (matches.length !== 1) throw new LedgerError('documentType');
  return matches[0];
}
export function balanceRow(raw: Record<string, string>, sourceId: string, row: number, kind: Balance['kind']): Balance {
  const required = kind === 'holdings' ? ['Account #', 'Symbol', 'Security Description', 'Quantity', 'Price ($)', 'Value ($)'] : ['Account #', 'Cash Balance ($)', 'Money Accounts ($)', 'Priced Investments ($)', 'Net Value ($)'];
  if (required.some(k => typeof raw[k] !== 'string') || !(typeof raw['COB Date'] === 'string' || (typeof raw.Date === 'string' && typeof raw.Time === 'string'))) throw new LedgerError('missingColumns', row);
  const issues: string[] = [];
  const basis = 'COB Date' in raw ? 'cob' : 'realtime';
  const date = dateValue(raw[basis === 'cob' ? 'COB Date' : 'Date']);
  if (!date) issues.push('date');
  if (!raw['Account #'].trim()) issues.push('account');
  const n = (key: string) => {
    try { const value = numberValue(raw[key] ?? ''); if (value === null) issues.push(key); return value; }
    catch { issues.push(key); return null; }
  };
  const holding = kind === 'holdings';
  if (holding && !raw.Symbol.trim() && !raw['CUSIP #']?.trim()) issues.push('symbol');
  return { id: `${sourceId}:${row}`, sourceId, row, broker: 'merrill', kind, basis, date,
    time: basis === 'realtime' ? raw.Time : null, account: raw['Account #'].trim(),
    symbol: holding ? raw.Symbol.trim() || raw['CUSIP #']?.trim() || '' : '', description: raw['Security Description'] ?? '', currency: 'USD',
    quantity: holding ? n('Quantity') : null, price: holding ? n('Price ($)') : null, value: holding ? n('Value ($)') : null,
    cash: holding ? null : n('Cash Balance ($)'), moneyAccounts: holding ? null : n('Money Accounts ($)'),
    investments: holding ? null : n('Priced Investments ($)'), netValue: holding ? null : n('Net Value ($)'), raw, issues };
}
export function parseBalances(input: string, sourceId: string, kind: Balance['kind']) {
  return csvTable(input).rows.map((raw, i) => balanceRow(raw, sourceId, i + 2, kind));
}
