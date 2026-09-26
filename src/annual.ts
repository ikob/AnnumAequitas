import { saleGain, costInput } from './sale-cost.ts';
import { toJpy } from './fx.ts';
import { displayYear, duplicateIds } from './ledger.ts';
import type { Ledger, Transaction } from './ledger.ts';
import { estimatedValue, instrumentId, priceCandidates, reviewedPrice } from './market.ts';

// Exact decimal addition/subtraction; values are rounded only for presentation.
export function sumDecimals(values: string[]): string {
  const scale = values.reduce((max, v) => Math.max(max, v.split('.')[1]?.length ?? 0), 0);
  const total = values.reduce((sum, v) => {
    const negative = v.startsWith('-'); const [whole, fraction = ''] = v.replace(/^-/, '').split('.');
    const integer = BigInt(whole + fraction.padEnd(scale, '0'));
    return sum + (negative ? -integer : integer);
  }, 0n);
  const sign = total < 0n ? '-' : ''; const digits = (total < 0n ? -total : total).toString().padStart(scale + 1, '0');
  return sign + (scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '') : digits);
}
export function saleValuation(ledger: Ledger, t: Transaction) {
  return ledger.saleValuations.find(v => v.transactionId === t.id && v.fingerprint === t.fingerprint && v.instrumentId === instrumentId(ledger, t));
}
export function transactionValue(ledger: Ledger, t: Transaction): { value: string | null; candidate: boolean } {
  if (t.excluded) return { value: null, candidate: false };
  if (t.kind === 'vest') {
    const selected = reviewedPrice(ledger, t); const choices = priceCandidates(ledger, t);
    const price = selected ?? choices.find(c => c.origin === 'daily-close') ?? choices[0];
    return { value: price ? estimatedValue(t.quantity, price.unitPrice) : null, candidate: !selected };
  }
  return { value: t.amount, candidate: false };
}
export type Total = { value: string | null; count: number; missing: number; candidates: number };
export function annualSummary(ledger: Ledger, year: string, currency: 'USD' | 'JPY' = 'USD', selectedIds?: Set<string>) {
  const duplicates = duplicateIds(ledger);
  const rows = ledger.transactions.filter(t => !t.excluded && (!selectedIds || selectedIds.has(t.id)) && (year === 'all' || displayYear(t) === year));
  const total = (kind: Transaction['kind'], calculate: (t: Transaction) => { value: string | null; candidate?: boolean }, include: (t: Transaction) => boolean = () => true): Total => {
    const entries = rows.filter(t => t.kind === kind && include(t)).map(t => duplicates.has(t.id) ? { value: null } : calculate(t));
    const known = entries.filter((v): v is { value: string; candidate?: boolean } => v.value !== null);
    return { value: entries.length && !known.length ? null : sumDecimals(known.map(v => v.value)), count: entries.length, missing: entries.length - known.length, candidates: known.filter(v => v.candidate).length };
  };
  const convert = (t: Transaction, value: string | null) => currency === 'JPY' ? toJpy(ledger, t, value) : value;
  const summary = {
    vest: total('vest', t => { const v = transactionValue(ledger, t); return { ...v, value: convert(t, v.value) }; }),
    proceeds: total('sale', t => ({ value: convert(t, costInput(ledger,t)?.proceeds ?? saleValuation(ledger, t)?.proceeds ?? (t.amount !== null && !t.amount.startsWith('-') ? t.amount : null)) })),
    gain: total('sale', t => { const g=saleGain(ledger,t,currency); return {value:g.value,candidate:g.reason==='activity'}; }, t => !saleGain(ledger,t,currency).reference),
    referenceGain: total('sale', t => { const g=saleGain(ledger,t,currency); return {value:g.value, candidate:true}; }, t => saleGain(ledger,t,currency).reference),
    dividend: total('dividend', t => ({ value: t.issues.includes('cash-sign') ? null : convert(t, t.amount) })),
    withholding: total('tax', t => ({ value: t.issues.includes('cash-sign') ? null : convert(t, t.amount) })),
    unknownDates: ledger.transactions.filter(t => !t.excluded && !t.tradeDate).length,
    duplicates: rows.filter(t => duplicates.has(t.id)).length,
  };
  return summary;
}

export function annualByInstrument(ledger: Ledger, year: string, currency: 'USD' | 'JPY' = 'USD') {
  const groups = new Map<string, { name: string; symbol: string; exchange: string | null; rows: Transaction[] }>();
  for (const t of ledger.transactions) {
    if (t.excluded || (year !== 'all' && displayYear(t) !== year)) continue;
    const instrument = ledger.mappings.find(m => m.key === t.instrumentKey)?.instrument;
    const key = instrument ? `resolved:${instrument.exchange}:${instrument.symbol}` : `unresolved:${t.instrumentKey}`;
    const group = groups.get(key) ?? { name: instrument?.name ?? t.instrumentKey.replace(/^(symbol|description):/, ''), symbol: instrument?.symbol ?? t.raw['Symbol/CUSIP #'], exchange: instrument?.exchange ?? null, rows: [] };
    group.rows.push(t); groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group, summary: annualSummary(ledger, year, currency, new Set(group.rows.map(t=>t.id))) }))
    .sort((a,b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}
