import type { Ledger, Transaction } from './ledger.ts';
import { duplicateIds } from './ledger.ts';
import type { Balance } from './balances.ts';
import { sumDecimals } from './annual.ts';
import { estimatedValue, mergedPriceCache } from './market.ts';
export type PortfolioRow = { account: string; asset: string; quantity: string | null; value: string | null; priceDate: string | null; anchor: Balance | null; target: string; issues: string[]; transactions: string[] };
const neg = (v: string) => v.startsWith('-') ? v.slice(1) : '-' + v;
const zero = (v: string | null) => v !== null && /^-?0+(\.0+)?$/.test(v);
const dayAfter = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().slice(0,10);
function covered(ledger: Ledger, account: string, start: string, end: string) {
  let cursor = dayAfter(start);
  const ranges = ledger.sources.filter(s => s.documentKind === 'activity' && ledger.transactions.some(t => t.sourceId === s.id && t.raw['Account #'].trim() === account)).flatMap(s => s.coverage ? [s.coverage] : []).sort((a,b) => a.start.localeCompare(b.start));
  for (const r of ranges) { if (r.start <= cursor && r.end >= cursor) cursor = dayAfter(r.end); }
  return cursor > end;
}
// Derived observations, never synthetic Activity rows or confirmed acquisition costs.
export function inferredOpenings(ledger: Ledger, today = new Date().toISOString().slice(0,10)) {
  const accounts = [...new Set(ledger.transactions.filter(t => !t.excluded).map(t => t.raw['Account #'].trim()))];
  return accounts.flatMap(account => {
    const first = ledger.transactions.filter(t => !t.excluded && t.raw['Account #'].trim() === account && t.tradeDate && t.tradeDate <= today).map(t => t.tradeDate!).sort()[0];
    if (!first) return [];
    const year = String(Number(first.slice(0,4))-1);
    return portfolioAt(ledger, year, today).filter(r => r.account === account && r.anchor?.kind === 'holdings' && r.quantity !== null && !zero(r.quantity) && !r.quantity.startsWith('-'));
  });
}
export function portfolioYears(ledger: Ledger, today = new Date().toISOString().slice(0,10)) {
  const dates = [...inferredOpenings(ledger,today).map(r => r.target), ...ledger.openings.map(o => o.date), ...ledger.balances.flatMap(b => b.date ? [b.date] : []), ...ledger.transactions.flatMap(t => t.tradeDate ? [t.tradeDate] : [])].filter(d => d <= today);
  if (!dates.length) return [];
  const first = Math.min(...dates.map(d => Number(d.slice(0,4))));
  return Array.from({ length: Number(today.slice(0,4)) - first + 1 }, (_, i) => String(first+i)).reverse();
}
export function portfolioAt(ledger: Ledger, year: string, today = new Date().toISOString().slice(0,10)): PortfolioRow[] {
  if (!/^\d{4}$/.test(year) || year > today.slice(0,4)) return [];
  const current = year === today.slice(0,4), end = `${year}-12-31`, dupes = duplicateIds(ledger);
  const result: PortfolioRow[] = [];
  const accounts = new Set([...ledger.balances.map(b => b.account), ...ledger.transactions.filter(t => !t.excluded).map(t => t.raw['Account #'].trim())]);
  for (const account of accounts) {
    const activity = ledger.transactions.filter(t => !t.excluded && t.raw['Account #'].trim() === account);
    const candidates = ledger.balances.filter(b => b.account === account && b.date && b.date <= today);
    const pick = (kind: Balance['kind']) => {
      const all = candidates.filter(b => b.kind === kind && (current || b.date! >= end));
      // Historical reconstruction prefers settled close-of-business observations.
      const pool = !current && all.some(b => b.basis === 'cob') ? all.filter(b => b.basis === 'cob') : all;
      return pool.sort((a,b) => b.date!.localeCompare(a.date!) || (b.time ?? '').localeCompare(a.time ?? '') || (ledger.sources.find(s => s.id === b.sourceId)?.importedAt ?? '').localeCompare(ledger.sources.find(s => s.id === a.sourceId)?.importedAt ?? '') || b.sourceId.localeCompare(a.sourceId))[0];
    };
    const holding = pick('holdings'), cash = pick('portfolio');
    const holdings = holding ? candidates.filter(b => b.kind === 'holdings' && b.sourceId === holding.sourceId && b.date === holding.date && b.basis === holding.basis && b.time === holding.time) : [];
    const build = (anchor: Balance | null, asset: string, quantity: string | null, value: string | null, type: 'stock'|'cash'|'money') => {
      const target = current ? anchor?.date ?? today : end;
      const row: PortfolioRow = { account, asset, quantity, value, anchor, target, priceDate: anchor?.date ?? null, issues: [], transactions: [] };
      if (!anchor) { row.issues.push('no-anchor'); result.push(row); return; }
      if (anchor.issues.length) row.issues.push('source');
      if (candidates.some(b => b.kind === anchor.kind && b.date === anchor.date && b.basis === anchor.basis && b.time === anchor.time && b.sourceId !== anchor.sourceId)) row.issues.push('multiple');
      if (holding && cash && (holding.date !== cash.date || holding.basis !== cash.basis || holding.time !== cash.time)) row.issues.push('different-dates');
      if (target === anchor.date) { result.push(row); return; }
      row.issues.push('reconstructed');
      if (!covered(ledger, account, target, anchor.date!)) row.issues.push('coverage');
      if (anchor.basis === 'realtime') row.issues.push('realtime');
      let unknown = anchor.basis === 'realtime';
      const changes: string[] = [];
      for (const t of activity) {
        const date = t.settlementDate;
        if (date && (date <= target || date > anchor.date!)) continue;
        const symbol = t.raw['Symbol/CUSIP #'].trim().toUpperCase();
        const matches = type !== 'stock' || symbol === anchor.symbol.toUpperCase() || symbol === anchor.raw['CUSIP #']?.trim().toUpperCase();
        if (!matches && t.kind !== 'other') continue;
        if (type === 'stock' && (t.kind === 'dividend' || t.kind === 'tax')) continue;
        row.transactions.push(t.id);
        if (!date || dupes.has(t.id) || !/^settled$/i.test(t.raw['Pending/Settled'].trim())) { unknown = true; continue; }
        if (t.kind === 'other') { unknown = true; continue; }
        if (type === 'stock') {
          if (!t.quantity || (t.kind === 'sale' && !t.quantity.startsWith('-')) || (t.kind === 'vest' && t.quantity.startsWith('-'))) unknown = true;
          else changes.push(t.quantity);
        } else if (type === 'cash') {
          if (t.amount === null || (t.kind === 'vest' && !zero(t.amount)) || t.issues.includes('cash-sign') || (t.kind === 'sale' && t.amount.startsWith('-'))) unknown = true;
          else changes.push(t.amount);
        }
      }
      if (type === 'money') unknown = true; // Sweep/fund movements have no verified adapter yet.
      if (unknown) row.issues.push('movement');
      if (type === 'stock') {
        row.quantity = unknown || quantity === null ? null : sumDecimals([quantity,...changes.map(neg)]);
        if (row.quantity?.startsWith('-')) { row.quantity = null; row.issues.push('negative'); }
        const instrument = ledger.mappings.find(m => m.key === `symbol:${anchor.symbol.toUpperCase()}`)?.instrument;
        const quotes = instrument ? mergedPriceCache(ledger.marketPrices.filter(s => s.symbol === instrument.symbol && s.exchange === instrument.exchange)) : [];
        const quote = quotes.filter(q => q.bar.date <= target).sort((a,b) => b.bar.date.localeCompare(a.bar.date) || b.series.fetchedAt.localeCompare(a.series.fetchedAt))[0];
        row.priceDate = quote?.bar.date ?? null;
        row.value = zero(row.quantity) ? '0' : quote && row.quantity !== null ? estimatedValue(row.quantity, quote.bar.close) : null;
        if (!quote && !zero(row.quantity)) row.issues.push('price');
        if (quote && quote.series.adjustment !== 'unadjusted') row.issues.push('adjustment');
      } else { row.value = unknown || value === null ? null : sumDecimals([value,...changes.map(neg)]); row.priceDate = null; }
      result.push(row);
    };
    for (const h of holdings) build(h, h.symbol || h.description, h.quantity, h.value, 'stock');
    const missing = new Set(activity.filter(t => t.kind === 'vest' || t.kind === 'sale' || t.kind === 'other').map(t => t.raw['Symbol/CUSIP #'].trim()).filter(Boolean));
    for (const symbol of missing) if (!holdings.some(h => h.symbol.toUpperCase() === symbol.toUpperCase() || h.raw['CUSIP #']?.trim().toUpperCase() === symbol.toUpperCase())) build(null, symbol, null, null, 'stock');
    build(cash ?? null, 'cash', null, cash?.cash ?? null, 'cash');
    build(cash ?? null, 'money', null, cash?.moneyAccounts ?? null, 'money');
  }
  return result;
}

// Balance valuation uses the last observed FX rate on/before the valuation date.
// Income conversion retains its existing next-available policy.
export function portfolioValue(ledger: Ledger, usd: string | null, target: string, currency: 'USD' | 'JPY') {
  if (currency === 'USD') return { value: usd, fx: null };
  const days = new Map<string, { date: string; rate: string | null }>();
  for (const series of [...ledger.fxRates].sort((a,b) => a.fetchedAt.localeCompare(b.fetchedAt))) {
    for (const o of series.observations) if (o.date <= target) days.set(o.date, o);
  }
  const fx = [...days.values()].filter(o => o.rate !== null).sort((a,b) => b.date.localeCompare(a.date))[0] ?? null;
  if (usd === null || !fx?.rate) return { value: null, fx };
  const negative = usd.startsWith('-');
  const amount = estimatedValue(negative ? usd.slice(1) : usd, fx.rate);
  return { value: negative && amount !== '0' ? `-${amount}` : amount, fx };
}
