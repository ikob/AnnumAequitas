import type { Ledger, Transaction } from './ledger.ts';
import { priceCandidates, reviewedPrice } from './market.ts';
import { translate } from './i18n.ts';
import type { Locale } from './i18n.ts';
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Shared by the ledger and detail view, so a successful price import is visible immediately.
export function ledgerPriceCells(ledger: Ledger, t: Transaction, locale: Locale): string {
  const tr = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const candidates = priceCandidates(ledger, t);
  const daily = candidates.find(c => c.origin === 'daily-close');
  const selected = reviewedPrice(ledger, t);
  const reference = selected ?? daily ?? candidates[0];
  const unit = t.kind === 'vest'
    ? reference ? `<strong>${esc(reference.unitPrice)} USD</strong><small>${tr(selected ? 'ledgerPriceReviewed' : 'ledgerPriceCandidate')}</small><small>${tr(`priceOrigin.${reference.origin}`)}</small>` : `<span class="muted">${tr('unknown')}</span>`
    : t.price !== null ? `${esc(t.price)} USD<small>${tr('ledgerSourcePrice')}</small>` : '—';
  let close = '—';
  if (t.kind === 'vest') {
    close = daily ? `<strong>${esc(daily.unitPrice)} USD</strong><small>${esc(daily.priceDate!)} · Stooq</small><small>${tr(`adjustment.${daily.adjustment}`)}</small>`
      : `<span class="muted">${tr(ledger.mappings.some(m => m.key === t.instrumentKey) ? 'ledgerNoDailyPrice' : 'awaitingInstrument')}</span><small>${esc(t.lapseDate ?? t.tradeDate ?? tr('unknownDate'))}</small>`;
  }
  return `<td class="numeric">${unit}</td><td class="numeric">${close}</td>`;
}
