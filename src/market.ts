import Papa from 'papaparse';
import { z } from 'zod';
import type { Ledger, Transaction } from './ledger.ts';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(s + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
});
const positive = z.string().max(80).regex(/^\d+(\.\d+)?$/).refine(s => /[1-9]/.test(s) && Number.isFinite(Number(s)));
const timestamp = z.string().datetime();
export const adjustmentSchema = z.enum(['unknown', 'unadjusted', 'split-adjusted', 'split-dividend-adjusted']);
const barSchema = z.object({ date, open: positive, high: positive, low: positive, close: positive, volume: z.string().regex(/^\d+$/).nullable() }).strict();
export const priceSeriesSchema = z.object({
  version: z.literal(1), symbol: z.string().regex(/^[A-Z0-9][A-Z0-9.\-]{0,19}$/), exchange: z.enum(['NYSE', 'NASDAQ', 'OTHER']),
  provider: z.literal('stooq'), providerSymbol: z.string().regex(/^[a-z0-9][a-z0-9.\-]{0,29}$/), currency: z.literal('USD'),
  sourceUrl: z.string().url().refine(s => new URL(s).hostname === 'stooq.com' && new URL(s).protocol === 'https:'),
  fetchedAt: timestamp, sha256: z.string().regex(/^[a-f0-9]{64}$/), interval: z.literal('1d'),
  adjustment: adjustmentSchema, redistribution: z.literal('unverified'),
  requestedStart: date, requestedEnd: date,
  bars: z.array(barSchema).min(1).max(30_000),
}).strict().superRefine((s, ctx) => {
  if (s.requestedStart > s.requestedEnd) ctx.addIssue({ code: 'custom', message: 'Invalid requested range' });
  if (new Set(s.bars.map(b => b.date)).size !== s.bars.length) ctx.addIssue({ code: 'custom', message: 'Duplicate price dates' });
  for (const b of s.bars) {
    if (b.date < s.requestedStart || b.date > s.requestedEnd || Number(b.low) > Number(b.high) || Number(b.open) < Number(b.low) || Number(b.open) > Number(b.high) || Number(b.close) < Number(b.low) || Number(b.close) > Number(b.high)) ctx.addIssue({ code: 'custom', message: 'Invalid OHLC or date range' });
  }
});
export type PriceSeries = z.infer<typeof priceSeriesSchema>;
export const priceBundleSchema = z.object({ format: z.literal('annum-aequitas-prices'), version: z.literal(1), series: z.array(priceSeriesSchema).max(500) }).strict();
export function stooqUrl(symbol: string, start: string, end: string): string {
  if (!/^[a-z0-9][a-z0-9.\-]{0,29}$/.test(symbol)) throw new Error('Invalid Stooq symbol');
  date.parse(start); date.parse(end);
  if (start > end) throw new Error('Invalid date range');
  const url = new URL('https://stooq.com/q/d/l/');
  url.search = new URLSearchParams({ s: symbol, i: 'd', d1: start.replaceAll('-', ''), d2: end.replaceAll('-', '') }).toString();
  return url.href;
}
export function parsePriceCsv(input: string): z.infer<typeof barSchema>[] {
  if (/<(?:!doctype|html|script)/i.test(input)) throw new Error('Provider returned a browser-verification page, not CSV. Download the CSV in your browser and import it.');
  const parsed = Papa.parse<string[]>(input.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  const header = parsed.data.shift()?.map(v => v.trim()) ?? [];
  if (parsed.errors.length || !['Date', 'Open', 'High', 'Low', 'Close'].every(h => header.includes(h)) || new Set(header).size !== header.length || !parsed.data.length) throw new Error('Expected nonempty daily OHLC CSV from Stooq');
  const bars = parsed.data.map(cells => {
    if (cells.length !== header.length) throw new Error('CSV column count mismatch');
    const r = Object.fromEntries(header.map((h, i) => [h, cells[i].trim()]));
    return barSchema.parse({ date: r.Date, open: r.Open, high: r.High, low: r.Low, close: r.Close, volume: r.Volume || null });
  }).sort((a, b) => a.date.localeCompare(b.date));
  if (new Set(bars.map(b => b.date)).size !== bars.length) throw new Error('Duplicate dates in price CSV');
  return bars;
}
export async function makePriceSeries(input: string, options: { symbol: string; exchange: 'NYSE' | 'NASDAQ' | 'OTHER'; providerSymbol: string; start: string; end: string; fetchedAt?: string }): Promise<PriceSeries> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return priceSeriesSchema.parse({ version: 1, symbol: options.symbol, exchange: options.exchange,
    provider: 'stooq', providerSymbol: options.providerSymbol, currency: 'USD', interval: '1d', adjustment: 'unknown', redistribution: 'unverified',
    sourceUrl: stooqUrl(options.providerSymbol, options.start, options.end), fetchedAt: options.fetchedAt ?? new Date().toISOString(),
    sha256: [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join(''), requestedStart: options.start, requestedEnd: options.end,
    bars: parsePriceCsv(input),
  });
}
export const priceChoiceSchema = z.object({
  transactionId: z.string(), fingerprint: z.string(), instrumentId: z.string().nullable(),
  origin: z.enum(['csv-cb', 'csv-price', 'daily-close']), unitPrice: positive, currency: z.literal('USD'),
  targetDate: date.nullable(), priceDate: date.nullable(), dateBasis: z.enum(['lapse', 'trade', 'unknown']),
  source: z.string().max(2000), fetchedAt: timestamp.nullable(), adjustment: adjustmentSchema,
  sha256: z.string().nullable(), reviewedAt: timestamp,
}).strict();
export type PriceChoice = z.infer<typeof priceChoiceSchema>;
export type PriceCandidate = Omit<PriceChoice, 'reviewedAt'>;
export function instrumentId(ledger: Ledger, t: Transaction): string | null {
  const m = ledger.mappings.find(m => m.key === t.instrumentKey)?.instrument;
  return m ? `${m.exchange}:${m.symbol}` : null;
}
export function priceCandidates(ledger: Ledger, t: Transaction): PriceCandidate[] {
  if (t.kind !== 'vest' || t.excluded) return [];
  const id = instrumentId(ledger, t);
  const targetDate = t.lapseDate ?? t.tradeDate;
  const dateBasis = t.lapseDate ? 'lapse' : t.tradeDate ? 'trade' : 'unknown';
  const base = { transactionId: t.id, fingerprint: t.fingerprint, instrumentId: id, currency: 'USD' as const, targetDate, dateBasis: dateBasis as PriceChoice['dateBasis'] };
  const candidates: PriceCandidate[] = [];
  for (const [origin, value] of [['csv-cb', t.cb], ['csv-price', t.price]] as const) {
    if (value !== null && positive.safeParse(value).success) candidates.push({ ...base, origin, unitPrice: value, priceDate: null, source: `${t.sourceId} / record ${t.row} / ${origin === 'csv-cb' ? 'Description: CB' : 'Price ($)'}`, fetchedAt: null, adjustment: 'unknown', sha256: null });
  }
  // The candidate uses the merged cache; already reviewed snapshots remain unchanged.
  const entry = mergedPriceCache(ledger.marketPrices.filter(s => `${s.exchange}:${s.symbol}` === id))
    .filter(p => p.bar.date === targetDate).sort((a, b) => b.series.fetchedAt.localeCompare(a.series.fetchedAt))[0];
  if (entry) {
    const { series, bar } = entry;
    candidates.push({ ...base, origin: 'daily-close', unitPrice: bar.close, priceDate: bar.date, source: series.sourceUrl, fetchedAt: series.fetchedAt, adjustment: series.adjustment, sha256: series.sha256 });
  }
  return candidates;
}
export function reviewedPrice(ledger: Ledger, t: Transaction): PriceChoice | undefined {
  return ledger.priceChoices.find(p => p.transactionId === t.id && p.fingerprint === t.fingerprint && p.instrumentId === instrumentId(ledger, t));
}
export function isSelectedPrice(selected:PriceChoice|undefined,candidate:PriceCandidate) {
  if(!selected) return false;
  const {reviewedAt,...snapshot}=selected;
  return Object.entries(candidate).every(([key,value])=>snapshot[key as keyof typeof snapshot]===value);
}
export function choosePrice(ledger: Ledger, transactionId: string, candidateIndex: number): Ledger {
  const t = ledger.transactions.find(t => t.id === transactionId);
  const candidate = t && priceCandidates(ledger, t)[candidateIndex];
  if (!candidate) throw new Error('Price candidate is no longer available');
  const choice = priceChoiceSchema.parse({ ...candidate, reviewedAt: new Date().toISOString() });
  return { ...ledger, priceChoices: [...ledger.priceChoices.filter(p => p.transactionId !== transactionId), choice] };
}
export function reviewIssues(ledger: Ledger, t: Transaction): string[] {
  return t.issues.filter(code => code !== 'vest' || !reviewedPrice(ledger, t));
}
export function mergePriceSeries(ledger: Ledger, series: PriceSeries[]): Ledger {
  const checked = series.map(s => priceSeriesSchema.parse(s));
  const current = [...ledger.marketPrices];
  for (const next of checked) if (!current.some(s => s.symbol === next.symbol && s.exchange === next.exchange && s.sha256 === next.sha256 && s.sourceUrl === next.sourceUrl)) current.push(next);
  priceBundleSchema.parse({ format: 'annum-aequitas-prices', version: 1, series: current });
  return { ...ledger, marketPrices: current };
}
// Decimal multiplication without binary floating-point rounding. Estimate only.
export function estimatedValue(quantity: string | null, unitPrice: string): string | null {
  if (quantity === null || !/^\d+(\.\d+)?$/.test(quantity)) return null;
  const digits = (v: string) => v.replace('.', '');
  const scale = (quantity.split('.')[1]?.length ?? 0) + (unitPrice.split('.')[1]?.length ?? 0);
  let value = (BigInt(digits(quantity)) * BigInt(digits(unitPrice))).toString().padStart(scale + 1, '0');
  if (scale) value = `${value.slice(0, -scale)}.${value.slice(-scale)}`.replace(/\.?0+$/, '');
  return value;
}

export type DateRange = { start: string; end: string };
export type PriceInstrument = { symbol: string; exchange: 'NYSE' | 'NASDAQ' | 'OTHER' };
const sameInstrument = (s: PriceInstrument, i: PriceInstrument) => s.symbol === i.symbol && s.exchange === i.exchange;
export function requiredPriceRange(ledger: Ledger, instrument: PriceInstrument): DateRange | null {
  const keys = new Set(ledger.mappings.filter(m => sameInstrument(m.instrument, instrument)).map(m => m.key));
  const dates = ledger.transactions.filter(t => !t.excluded && keys.has(t.instrumentKey))
    .flatMap(t => [t.lapseDate, t.tradeDate, t.settlementDate].filter((d): d is string => d !== null));
  dates.push(...ledger.openings.filter(o => keys.has(o.instrumentKey)).map(o => o.date));
  if (dates.length && ledger.balances.some(b => b.kind === 'holdings' && keys.has(`symbol:${b.symbol.toUpperCase()}`))) {
    const first = [...dates].sort()[0];
    dates.push(`${Number(first.slice(0,4))-1}-12-24`); // Include a prior trading week for Opening valuation.
  }
  dates.sort();
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
}
function nextDay(value: string, delta: number): string {
  const d = new Date(value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10);
}
// Coverage uses observed bounds, never an unverified requested end date.
// Interior absent dates remain absent; an exchange holiday calendar is not assumed.
export function missingPriceRanges(required: DateRange, series: PriceSeries[]): DateRange[] {
  date.parse(required.start); date.parse(required.end);
  if (required.start > required.end) throw new Error('Invalid range');
  const spans = series.map(s => {
    const days = s.bars.map(b => b.date).sort(); return { start: days[0], end: days[days.length - 1] };
  }).sort((a, b) => a.start.localeCompare(b.start));
  const result: DateRange[] = []; let cursor = required.start;
  for (const span of spans) {
    if (span.end < cursor || span.start > required.end) continue;
    if (span.start > cursor) result.push({ start: cursor, end: nextDay(span.start, -1) });
    if (span.end >= required.end) return result;
    cursor = nextDay(span.end, 1);
  }
  if (cursor <= required.end) result.push({ start: cursor, end: required.end });
  return result;
}
export function priceDownloadPlan(ledger: Ledger, instrument: PriceInstrument, providerSymbol = `${instrument.symbol.toLowerCase()}.us`) {
  const required = requiredPriceRange(ledger, instrument);
  const cached = ledger.marketPrices.filter(s => sameInstrument(s, instrument) && s.providerSymbol === providerSymbol && s.adjustment === 'unknown');
  return { required, missing: required ? missingPriceRanges(required, cached) : [] };
}
export type CachedPrice = { bar: PriceSeries['bars'][number]; series: PriceSeries; revisions: { bar: PriceSeries['bars'][number]; series: PriceSeries }[]; conflict: boolean };
function barValue(bar: PriceSeries['bars'][number]): string {
  const normalized = (v: string | null) => v === null ? null : v.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return JSON.stringify([bar.open, bar.high, bar.low, bar.close, bar.volume].map(normalized));
}
// A merged daily view, while immutable source batches retain all original observations.
// Different adjustment bases/provider symbols must never be combined into one history.
export function mergedPriceCache(series: PriceSeries[]): CachedPrice[] {
  const days = new Map<string, CachedPrice>();
  const sorted = series.map((s, index) => ({ s, index })).sort((a, b) => a.s.fetchedAt.localeCompare(b.s.fetchedAt) || a.index - b.index);
  for (const { s } of sorted) for (const bar of s.bars) {
    const key = JSON.stringify([s.exchange, s.symbol, s.provider, s.providerSymbol, s.currency, s.adjustment, bar.date]);
    const old = days.get(key); const revisions = [...(old?.revisions ?? []), { bar, series: s }];
    days.set(key, { bar, series: s, revisions, conflict: new Set(revisions.map(r => barValue(r.bar))).size > 1 });
  }
  return [...days.values()].sort((a, b) => a.bar.date.localeCompare(b.bar.date));
}
