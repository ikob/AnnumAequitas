import { costInput, saleGain } from './sale-cost.ts';
import { toJpy } from './fx.ts';
import type { Ledger, Transaction } from './ledger.ts';
import { annualByInstrument, annualSummary, saleValuation, transactionValue } from './annual.ts';
import { translate } from './i18n.ts';
import type { Locale, MessageKey } from './i18n.ts';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function annualDisplay(ledger: Ledger, year: string, locale: Locale, currency: 'USD' | 'JPY' = 'USD'): string {
  const tr = (key: MessageKey, params = {}) => translate(locale, key, params);
  const result = annualSummary(ledger, year, currency);
  const card = (label: MessageKey, value: typeof result.vest) => `<article class="${label === 'saleReference' ? 'reference-loss' : ''}"><h3>${tr(label)}</h3><strong>${value.value === null ? tr('unknown') : esc(value.value)}</strong><p>${tr('yearCounts', { known: value.count - value.missing, total: value.count, missing: value.missing })}</p>${value.candidates ? `<p>${tr('yearCandidates', { count: value.candidates })}</p>` : ''}${value.missing ? `<p class="amber">${tr('yearPartial')}</p>` : ''}</article>`;
  const cell = (value: typeof result.vest) => `<td class="numeric">${value.value === null ? tr('unknown') : esc(value.value)}${value.missing ? `<small>${tr('yearUnresolved', { count: value.missing })}</small>` : ''}${value.candidates ? `<small>${tr('yearCandidates', { count: value.candidates })}</small>` : ''}</td>`;
  const groups = annualByInstrument(ledger, year, currency);
  const unresolved = groups.flatMap(group => group.rows).filter(t => t.kind === 'sale').map(t => ({t, g:saleGain(ledger,t,currency)})).filter(({g}) => g.reference && g.value === null);
  const missingDetails = unresolved.map(({t,g}) => {
    const instrument=ledger.mappings.find(m=>m.key===t.instrumentKey)?.instrument;
    const reason=!instrument?'saleMissingInstrument':g.allocation?.uncertain?'saleMissingActivity':!g.basisDate?'saleMissingOpening':!g.unitPrice?'saleMissingQuote':currency==='JPY'&&!g.fxRate?'saleMissingFx':'saleMissingInputs';
    return `<p class="reference-loss"><button class="text-button" data-detail="${esc(t.id)}">${esc(t.tradeDate ?? tr('unknownDate'))} · ${esc(instrument ? `${instrument.exchange}:${instrument.symbol}` : t.instrumentKey)}</button> · ${tr(reason)}${g.basisDate ? ` · Opening: ${esc(g.basisDate)}` : ''}</p>`;
  }).join('');
  return `<section class="panel annual-summary" aria-label="${tr('yearSummary')}"><h2>${esc(year === 'all' ? tr('all') : year === 'unknown' ? tr('unknownDate') : year)} · ${tr('yearSummary')} · ${currency}</h2><p class="muted">${tr(currency === 'JPY' ? 'fxConversionHint' : 'yearSummaryHint')}</p>
    <h3>${tr('yearEmployment')}</h3><div class="annual-cards">${card('yearVest', result.vest)}</div>
    <h3>${tr('yearInvestments')}</h3><div class="annual-cards">${card('yearGain', result.gain)}${result.referenceGain.count ? card('saleReference',result.referenceGain) : ''}${card('yearDividends', result.dividend)}</div>${missingDetails}<p class="muted">${tr('yearSeparationHint')} ${tr('saleAllocationHint')}</p>
    <details><summary>${tr('yearCashDetails')}</summary><div class="annual-cards">${card('yearProceeds', result.proceeds)}${card('yearWithholding', result.withholding)}</div><p class="muted">${tr('yearGainHint')}</p></details>
    <details><summary>${tr('yearByInstrument')} · ${groups.length}</summary><div class="table-wrap"><table><thead><tr><th>${tr('instrument')}</th><th>${tr('yearVest')}</th><th>${tr('yearGain')}</th><th>${tr('saleReference')}</th><th>${tr('yearDividends')}</th><th>${tr('yearProceeds')}</th><th>${tr('yearWithholding')}</th><th>${tr('detail')}</th></tr></thead><tbody>${groups.map(g => `<tr><td><strong>${esc(g.name)}</strong><small>${esc(g.symbol)} · ${esc(g.exchange ?? tr('awaitingInstrument'))}</small></td>${cell(g.summary.vest)}${cell(g.summary.gain)}<td class="numeric reference-loss">${g.summary.referenceGain.count ? (g.summary.referenceGain.value ?? tr('unknown')) : '—'}</td>${cell(g.summary.dividend)}${cell(g.summary.proceeds)}${cell(g.summary.withholding)}<td><details><summary>${g.rows.length} ${tr('recordsUnit')}</summary>${g.rows.map(t => `<p><button class="text-button" data-detail="${esc(t.id)}">${esc(t.tradeDate ?? tr('unknownDate'))} · ${tr(t.kind)} ↗</button></p>`).join('')}</details></td></tr>`).join('')}</tbody></table></div></details>
    ${result.unknownDates ? `<p class="amber">${tr('yearUnknownDates', { count: result.unknownDates })}</p>` : ''}${result.duplicates ? `<p class="amber">${tr('yearDuplicateRows', { count: result.duplicates })}</p>` : ''}</section>`;

}
export function computedCell(ledger: Ledger, t: Transaction, locale: Locale, currency: 'USD' | 'JPY' = 'USD'): string {
  const tr = (key: MessageKey) => translate(locale, key);
  let value: string | null = null; let note: string = '';
  if (t.kind === 'vest') {
    const estimate = transactionValue(ledger, t); value = estimate.value;
    note = tr(estimate.candidate ? 'ledgerPriceCandidate' : 'ledgerPriceReviewed');
  } else if (t.kind === 'sale') {
    const sale = saleValuation(ledger, t); value = costInput(ledger,t)?.proceeds ?? sale?.proceeds ?? t.amount;
  } else value = t.amount;
  if (currency === 'JPY') value = toJpy(ledger, t, value);
  const gain=t.kind==='sale'?saleGain(ledger,t,currency):null;
  return `<td class="numeric">${value === null ? tr('unknown') : `${esc(value)} ${currency}`}${note ? `<small>${note}</small>` : ''}${gain ? `<small class="${gain.reference ? 'reference-loss' : ''}">${tr(gain.reference?'saleReference':'saleCalculated')}: ${gain.value === null ? tr('unknown') : esc(gain.value)} ${currency}</small>` : ''}</td>`;
}
