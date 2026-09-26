import Papa from 'papaparse';
import { z } from 'zod';
import type { Ledger, Transaction } from './ledger.ts';
import { estimatedValue } from './market.ts';
export const FX_SOURCE = 'https://fred.stlouisfed.org/series/DEXJPUS';
export const FX_CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXJPUS';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; });
const observation = z.object({ date, rate: z.string().max(40).regex(/^\d+(\.\d+)?$/).refine(v => /[1-9]/.test(v)).nullable() }).strict();
export const fxSeriesSchema = z.object({
  provider: z.literal('fred'), series: z.literal('DEXJPUS'), base: z.literal('USD'), quote: z.literal('JPY'),
  rateType: z.literal('ny-noon-buying'), sourceUrl: z.literal(FX_SOURCE), fetchedAt: z.string().datetime(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), observations: z.array(observation).min(1).max(50000),
}).strict().refine(s => new Set(s.observations.map(o => o.date)).size === s.observations.length, 'Duplicate FX dates');
export type FxSeries = z.infer<typeof fxSeriesSchema>;
export const fxBundleSchema = z.object({ format: z.literal('annum-aequitas-fx'), version: z.literal(1), series: z.array(fxSeriesSchema).max(500) }).strict();
export async function makeFxSeries(csv: string, fetchedAt = new Date().toISOString()): Promise<FxSeries> {
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  const header = parsed.data.shift()?.map(v => v.trim());
  if (parsed.errors.length || !header || header.length !== 2 || !['observation_date', 'DATE'].includes(header[0]) || header[1] !== 'DEXJPUS') throw new Error('Expected FRED DEXJPUS daily CSV');
  const observations = parsed.data.map(row => {
    if (row.length !== 2) throw new Error('Invalid FX row');
    const rate = row[1].trim(); return observation.parse({ date: row[0].trim(), rate: rate === '.' || rate === '' ? null : rate });
  }).sort((a,b) => a.date.localeCompare(b.date));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(csv));
  return fxSeriesSchema.parse({ provider: 'fred', series: 'DEXJPUS', base: 'USD', quote: 'JPY', rateType: 'ny-noon-buying', sourceUrl: FX_SOURCE, fetchedAt, sha256: [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join(''), observations });
}
export function mergeFxSeries(ledger: Ledger, series: FxSeries[]): Ledger {
  const current = [...ledger.fxRates];
  for (const input of series) { const s = fxSeriesSchema.parse(input); if (!current.some(old => old.sha256 === s.sha256)) current.push(s); }
  fxBundleSchema.parse({ format: 'annum-aequitas-fx', version: 1, series: current });
  return { ...ledger, fxRates: current };
}
export function fxDate(t: Transaction): string | null { return t.kind === 'vest' ? t.lapseDate ?? t.tradeDate : t.tradeDate; }
export function fxObservation(ledger: Ledger, targetDate: string | null) {
  if (targetDate === null || !date.safeParse(targetDate).success) return null;
  // Resolve revisions first, then select the earliest available date on or after target.
  // A newer null observation invalidates the older rate on that date.
  const days = new Map<string, { date: string; rate: string | null; series: FxSeries }>();
  for (const series of [...ledger.fxRates].reverse().sort((a,b) => b.fetchedAt.localeCompare(a.fetchedAt))) {
    for (const value of series.observations) {
      if (value.date >= targetDate && !days.has(value.date)) days.set(value.date, { ...value, series });
    }
  }
  const chosen = [...days.values()].filter(value => value.rate !== null).sort((a,b) => a.date.localeCompare(b.date))[0];
  return chosen ? { ...chosen, targetDate, datePolicy: chosen.date === targetDate ? 'exact' as const : 'next-available' as const } : null;
}

export function toJpy(ledger: Ledger, t: Transaction, usd: string | null): string | null {
  const rate = fxObservation(ledger, fxDate(t))?.rate;
  if (usd === null || !rate) return null;
  const negative = usd.startsWith('-'); const value = estimatedValue(negative ? usd.slice(1) : usd, rate);
  return negative && value !== '0' ? `-${value}` : value;
}
