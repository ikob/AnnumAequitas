import Papa from 'papaparse';
import { LedgerError, dateValue, numberValue } from '../values.ts';
import type { Transaction } from '../ledger.ts';

export const columns = ['Trade Date', 'Settlement Date', 'Pending/Settled', 'Account Nickname', 'Account Registration', 'Account #', 'Type', 'Description 1', 'Description 2', 'Symbol/CUSIP #', 'Quantity', 'Price ($)', 'Amount ($)'];
export function instrumentKey(raw: Record<string, string>): string {
  const symbol = raw['Symbol/CUSIP #'].trim();
  return symbol ? `symbol:${symbol.toUpperCase()}` : `description:${raw['Description 1'].trim()}|${raw['Description 2'].trim()}`;
}
export function parseRow(raw: Record<string, string>, sourceId: string, row: number): Transaction {
  if (columns.some(c => typeof raw[c] !== 'string')) throw new LedgerError('missingColumns', row);
  const desc = `${raw['Description 1']} ${raw['Description 2']}`;
  const kind = /RSU ACTIVITY/i.test(desc) ? 'vest' : /withholding/i.test(desc) ? 'tax' : /dividend/i.test(desc) ? 'dividend' : /\b(sale|sell|sold)\b/i.test(desc) ? 'sale' : 'other';
  const issues: string[] = [];
  const readDate = (v: string, label: string) => {
    const result = dateValue(v);
    if (!result) issues.push(`date:${label}`);
    return result;
  };
  const descDate = (label: string) => {
    const m = new RegExp(`${label}\\s*[:=]?\\s*(\\d{1,2}/\\d{1,2}/\\d{4}|\\d{4}-\\d{2}-\\d{2})`, 'i').exec(desc);
    return m ? readDate(m[1], label) : null;
  };
  const readNumber = (v: string, label: string) => {
    try { return numberValue(v); } catch { issues.push(`number:${label}`); return null; }
  };
  const tradeDate = readDate(raw['Trade Date'], 'Trade Date');
  const settlementDate = readDate(raw['Settlement Date'], 'Settlement Date');
  const grantDate = descDate('GRANT DATE');
  const lapseDate = descDate('LAPSE DATE');
  if (kind === 'vest') issues.push('vest');
  if (kind === 'sale') issues.push('sale');
  if (kind === 'other') issues.push('other');

  if (!/^settled$/i.test(raw['Pending/Settled'].trim())) issues.push('settlement');
  const cbMatch = /\bCB\s*[:=]?\s*(\(?-?[\d,]+(?:\.\d+)?\)?)/i.exec(desc);
  const quantity = readNumber(raw.Quantity, 'Quantity');
  const price = readNumber(raw['Price ($)'], 'Price');
  const amount = readNumber(raw['Amount ($)'], 'Amount');
  const cb = cbMatch ? readNumber(cbMatch[1], 'CB') : null;
  if ((kind === 'dividend' || kind === 'tax') && amount === null) issues.push('cash-amount');
  if ((kind === 'dividend' && amount !== null && Number(amount) <= 0) || (kind === 'tax' && amount !== null && Number(amount) >= 0)) issues.push('cash-sign');
  return { id: `${sourceId}:${row}`, sourceId, row, raw,
    fingerprint: JSON.stringify(Object.entries(raw).sort(([a], [b]) => a.localeCompare(b))),
    instrumentKey: instrumentKey(raw), tradeDate, settlementDate, grantDate, lapseDate,
    kind, quantity, price, amount, cb, issues, excluded: false, duplicateReviewed: false };
}
export function parseCsv(input: string, sourceId: string): Transaction[] {
  const result = Papa.parse<string[]>(input.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (result.errors.length) throw new LedgerError('csvSyntax');
  const header = result.data.shift()?.map(s => s.trim()) ?? [];
  if (columns.some(c => !header.includes(c)) || new Set(header).size !== header.length) throw new LedgerError('csvHeaders');
  if (!result.data.length) throw new LedgerError('emptyCsv');
  return result.data.map((cells, i) => {
    if (cells.length !== header.length) throw new LedgerError('csvWidth', i + 2);
    return parseRow(Object.fromEntries(header.map((h, n) => [h, cells[n]])), sourceId, i + 2);
  });
}
