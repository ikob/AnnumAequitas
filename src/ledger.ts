import { cryptoCostSchema } from './crypto-cost.ts';
import { cryptoRowSchema } from './brokers/gmo.ts';
import { brokerAdapters, getBrokerAdapter, selectBrokerAdapter } from './brokers/registry.ts';
import type { BrokerSelection } from './brokers/adapter.ts';
export { columns, instrumentKey, parseCsv } from './brokers/merrill-activity.ts';
import { costInputSchema, validateInput } from './sale-cost.ts';
import { balanceSchema } from './balances.ts';
import { fxSeriesSchema } from './fx.ts';
import { instrumentId, priceSeriesSchema, priceChoiceSchema } from './market.ts';
import { z } from 'zod';

import { LedgerError, dateValue, numberValue } from './values.ts';
export { LedgerError, dateValue, numberValue } from './values.ts';
const text = z.string().max(100_000);
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);
const date = z.string().refine(v => dateValue(v) === v, 'Invalid ISO date');
export const instrumentSchema = z.object({
  symbol: z.string().min(1).max(40), name: z.string().min(1).max(500),
  exchange: z.enum(['NYSE', 'NASDAQ', 'OTHER']),
}).strict();
export type Instrument = z.infer<typeof instrumentSchema>;
export const catalogSchema = z.object({
  version: z.literal(1), fetchedAt: z.string(), sources: z.array(z.string()),
  instruments: z.array(instrumentSchema).max(30_000),
}).strict();
const rowSchema = z.object({
  id: text, sourceId: text, row: z.number().int().positive(),
  raw: z.record(z.string(), text), fingerprint: text, instrumentKey: text,
  tradeDate: date.nullable(), settlementDate: date.nullable(), grantDate: date.nullable(), lapseDate: date.nullable(),
  kind: z.enum(['vest', 'sale', 'dividend', 'tax', 'other']),
  quantity: decimal.nullable(), price: decimal.nullable(), amount: decimal.nullable(), cb: decimal.nullable(),
  issues: z.array(text), excluded: z.boolean(), duplicateReviewed: z.boolean(),
}).strict();
export type Transaction = z.infer<typeof rowSchema>;
const coverageSchema = z.object({ start: date, end: date, note: z.string().min(1).max(2000) }).strict()
  .refine(v => v.start <= v.end, 'Check the coverage start and end dates');
const sourceSchema = z.object({ id: text, name: text, importedAt: text, coverage: coverageSchema.nullable(), broker: z.enum(['merrill','gmo']).default('merrill'), documentKind: z.enum(['activity', 'holdings', 'portfolio', 'crypto-activity']).default('activity') }).strict();
const openingSchema = z.object({
  id: text, instrumentKey: z.string().min(1).max(500), date,
  quantity: decimal.refine(v => !v.startsWith('-')), cost: decimal.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/), evidence: z.string().min(1).max(2000),
}).strict().refine(v => v.cost === null || !v.cost.startsWith('-'), 'Acquisition cost must be nonnegative');
export type Opening = z.infer<typeof openingSchema>;
const saleValuationSchema = z.object({
  transactionId: text, fingerprint: text, instrumentId: z.string().nullable(),
  proceeds: decimal.refine(v => !v.startsWith('-')), cost: decimal.refine(v => !v.startsWith('-')),
  costJpy: decimal.refine(v => !v.startsWith('-')).nullable().default(null), currency: z.literal('USD'), evidence: z.string().trim().min(1).max(2000), reviewedAt: z.string().datetime(),
}).strict();
export const ledgerSchema = z.object({
  format: z.literal('annum-aequitas'), version: z.literal(1), mode: z.enum(['personal', 'demo']),
  sources: z.array(sourceSchema).max(2000), transactions: z.array(rowSchema).max(100_000),
  cryptoCosts: z.array(z.lazy(()=>cryptoCostSchema)).default([]),
  cryptoTransactions: z.array(cryptoRowSchema).max(100_000).default([]),
  balances: z.array(balanceSchema).max(100_000).default([]),
  mappings: z.array(z.object({ key: text, instrument: instrumentSchema }).strict()),
  openings: z.array(openingSchema),
  marketPrices: z.array(priceSeriesSchema).max(500).default([]),
  priceChoices: z.array(priceChoiceSchema).default([]),
  costInputs: z.array(z.lazy(() => costInputSchema)).default([]),
  saleValuations: z.array(saleValuationSchema).default([]),
  fxRates: z.array(fxSeriesSchema).max(500).default([]),
}).strict();
export type Ledger = z.infer<typeof ledgerSchema>;
export const emptyLedger = (): Ledger => ({ format: 'annum-aequitas', version: 1, mode: 'personal', sources: [], transactions: [], cryptoTransactions: [], cryptoCosts: [], balances: [], mappings: [], openings: [], marketPrices: [], priceChoices: [], costInputs: [], saleValuations: [], fxRates: [] });
export function readLedger(input: string): Ledger {
  const ledger = ledgerSchema.parse(JSON.parse(input));
  const sourceIds = new Set(ledger.sources.map(s => s.id));
  if (sourceIds.size !== ledger.sources.length || new Set(ledger.transactions.map(t => t.id)).size !== ledger.transactions.length ||
      new Set(ledger.mappings.map(m => m.key)).size !== ledger.mappings.length ||
      ledger.transactions.some(t => !sourceIds.has(t.sourceId) || t.id !== `${t.sourceId}:${t.row}`)) throw new LedgerError('references');
  if(new Set(ledger.cryptoTransactions.map(t=>t.id)).size!==ledger.cryptoTransactions.length || ledger.cryptoTransactions.some(t=>t.id!==`${t.sourceId}:${t.row}` || !ledger.sources.some(s=>s.id===t.sourceId && s.broker==='gmo' && s.documentKind==='crypto-activity'))) throw new LedgerError('references');
  ledger.cryptoTransactions=ledger.cryptoTransactions.map(t=>getBrokerAdapter(ledger.sources.find(s=>s.id===t.sourceId)!.broker).restoreCrypto(t.raw,t.sourceId,t.row));
  if(new Set(ledger.cryptoCosts.map(v=>v.transactionId)).size!==ledger.cryptoCosts.length || ledger.cryptoCosts.some(v=>!ledger.cryptoTransactions.some(t=>t.id===v.transactionId && ['sell','deposit','buy'].includes(t.kind) && t.fingerprint===v.fingerprint))) throw new LedgerError('references');
  // Rebuild parsed fields from original rows: imported JSON cannot silently change their meaning.
  ledger.transactions = ledger.transactions.map(t => ({ ...getBrokerAdapter(ledger.sources.find(s=>s.id===t.sourceId)!.broker).restoreTransaction(t.raw, t.sourceId, t.row), excluded: t.excluded, duplicateReviewed: t.duplicateReviewed }));
  if (new Set(ledger.balances.map(b => b.id)).size !== ledger.balances.length || ledger.balances.some(b => !sourceIds.has(b.sourceId) || b.id !== `${b.sourceId}:${b.row}` || ledger.sources.find(s => s.id === b.sourceId)?.documentKind !== b.kind)) throw new LedgerError('references');
  ledger.balances = ledger.balances.map(b => getBrokerAdapter(ledger.sources.find(s=>s.id===b.sourceId)!.broker).restoreBalance(b.raw, b.sourceId, b.row, b.kind));
  const transactionIds = new Set(ledger.transactions.map(t => t.id));
  if (ledger.priceChoices.some(p => !transactionIds.has(p.transactionId)) || new Set(ledger.priceChoices.map(p => p.transactionId)).size !== ledger.priceChoices.length) throw new LedgerError('references');
  if (ledger.saleValuations.some(v => !ledger.transactions.some(t => t.id === v.transactionId && t.kind === 'sale')) || new Set(ledger.saleValuations.map(v => v.transactionId)).size !== ledger.saleValuations.length) throw new LedgerError('references');
  if (new Set(ledger.costInputs.map(v => v.transactionId)).size !== ledger.costInputs.length) throw new LedgerError('references');
  for (const v of ledger.costInputs) { const t = ledger.transactions.find(t => t.id === v.transactionId && t.kind === 'sale'); if (!t) throw new LedgerError('references'); validateInput(v,t); }
  return ledger;
}
export async function importCsv(ledger: Ledger, input: string, name: string, broker: BrokerSelection = 'auto'): Promise<{ ledger: Ledger; repeated: boolean }> {
  if (broker !== 'auto' && !brokerAdapters.some(adapter => adapter.id === broker)) throw new LedgerError('documentType');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const id = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  if (ledger.sources.some(s => s.id === id)) return { ledger, repeated: true };
  const adapter = selectBrokerAdapter(input, broker);
  const parsed = adapter.parse(input, id);
  return { ledger: { ...ledger,
    sources: [...ledger.sources, { id, name, importedAt: new Date().toISOString(), coverage: null, broker: adapter.id, documentKind: parsed.documentKind }],
    transactions: [...ledger.transactions, ...parsed.transactions],
    cryptoTransactions: [...ledger.cryptoTransactions, ...parsed.cryptoTransactions],
    balances: [...ledger.balances, ...parsed.balances],
  }, repeated: false };
}
export function duplicateIds(ledger: Ledger): Set<string> {
  const groups = new Map<string, Transaction[]>();
  for (const t of ledger.transactions.filter(t => !t.excluded)) {
    const group = groups.get(t.fingerprint);
    if (group) group.push(t); else groups.set(t.fingerprint, [t]);
  }
  return new Set([...groups.values()].filter(g => g.length > 1).flat().filter(t => !t.duplicateReviewed).map(t => t.id));
}
export function displayYear(t: Transaction): string { return t.tradeDate?.slice(0, 4) ?? 'unknown'; }
export function searchInstruments(items: Instrument[], query: string): Instrument[] {
  const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const q = normalize(query);
  if (!q) return [];
  const parts = q.split(/\s+/);
  const subsequence = (needle: string, haystack: string) => { let i = 0; for (const c of haystack) if (c === needle[i]) i++; return i === needle.length; };
  const score = (item: Instrument) => {
    const sym = normalize(item.symbol), name = normalize(item.name);
    if (sym === q) return 0;
    if (sym.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (parts.every(p => `${sym} ${name}`.includes(p))) return 3;
    if (q.length >= 3 && !q.includes(' ') && subsequence(q, sym)) return 4;
    return 99;
  };
  return items.map(item => ({ item, score: score(item) })).filter(v => v.score < 99)
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name)).slice(0, 12).map(v => v.item);
}
export function addOpening(ledger: Ledger, input: unknown): Ledger {
  return { ...ledger, openings: [...ledger.openings, openingSchema.parse(input)] };
}
export function setCoverage(ledger: Ledger, id: string, input: unknown): Ledger {
  const coverage = coverageSchema.parse(input);
  return { ...ledger, sources: ledger.sources.map(s => s.id === id ? { ...s, coverage } : s) };
}

export function resolveKnownSymbols(ledger: Ledger, items: Instrument[]): Ledger {
  const bySymbol = new Map<string, Instrument[]>();
  for (const item of items) {
    const key = item.symbol.toUpperCase();
    const group = bySymbol.get(key);
    if (group) group.push(item); else bySymbol.set(key, [item]);
  }
  const mappings = [...ledger.mappings];
  const known = new Set(mappings.map(m => m.key));
  for (const t of ledger.transactions) {
    if (known.has(t.instrumentKey)) continue;
    const symbol = t.raw['Symbol/CUSIP #'].trim().toUpperCase();
    const matches = bySymbol.get(symbol);
    if (matches?.length === 1) { mappings.push({ key: t.instrumentKey, instrument: matches[0] }); known.add(t.instrumentKey); }
  }
  for (const b of ledger.balances.filter(b => b.kind === 'holdings' && b.symbol)) {
    const symbol = b.symbol.toUpperCase(), key = `symbol:${symbol}`;
    const matches = bySymbol.get(symbol);
    if (!known.has(key) && matches?.length === 1) { mappings.push({ key, instrument: matches[0] }); known.add(key); }
  }
  return { ...ledger, mappings };
}

export function setSaleValuation(ledger: Ledger, transactionId: string, input: { proceeds: string | null; cost: string | null; costJpy?: string | null; evidence: string }): Ledger {
  const t = ledger.transactions.find(t => t.id === transactionId && t.kind === 'sale' && !t.excluded);
  if (!t) throw new LedgerError('references');
  const value = saleValuationSchema.parse({ ...input, transactionId, fingerprint: t.fingerprint, instrumentId: instrumentId(ledger, t), currency: 'USD', reviewedAt: new Date().toISOString() });
  return { ...ledger, saleValuations: [...ledger.saleValuations.filter(v => v.transactionId !== transactionId), value] };
}
