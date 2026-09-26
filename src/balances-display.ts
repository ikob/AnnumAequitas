import type { Ledger } from './ledger.ts';
import { translate } from './i18n.ts';
import type { Locale, MessageKey } from './i18n.ts';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function balancesDisplay(ledger: Ledger, locale: Locale): string {
  const tr = (key: MessageKey) => translate(locale, key);
  const value = (v: string | null) => esc(v ?? tr('unknown'));
  return `<section class="panel"><div class="panel-title"><div><h2>${tr('balanceTitle')}</h2><p>${tr('balanceHint')}</p></div></div><div class="inset">${ledger.balances.map(b => {
    const source = ledger.sources.find(s => s.id === b.sourceId);
    const fields: [string, string | null][] = b.kind === 'holdings'
      ? [[tr('quantity'), b.quantity], [tr('ledgerUnitPrice') + ' (USD)', b.price], [tr('balanceValue'), b.value]]
      : [[tr('balanceCash'), b.cash], [tr('balanceMoney'), b.moneyAccounts], [tr('balanceInvestments'), b.investments], [tr('balanceNet'), b.netValue]];
    return `<article class="source"><h3>${esc(b.kind === 'holdings' ? b.symbol || b.description || tr('unknownInstrument') : tr('doc.portfolio'))}</h3><p>${tr('asOfDate')}: ${value(b.date)} ${esc(b.time)} · ${b.basis === 'cob' ? 'COB' : 'Realtime'}</p><p>${tr('balanceSource')}: ${esc(source?.name)} / ${esc(b.account)} · Merrill · ${tr(`doc.${b.kind}`)}</p><dl class="raw">${fields.map(([label, v]) => `<dt>${esc(label)}</dt><dd>${value(v)}</dd>`).join('')}</dl>${b.issues.length ? `<p class="notice">${esc(translate(locale, 'balanceIssues', { fields: b.issues.join(', ') }))}</p>` : ''}<details><summary>${tr('viewSource')} · ${tr('record')} ${b.row}</summary><dl class="raw">${Object.entries(b.raw).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || tr('blank'))}</dd>`).join('')}</dl></details></article>`;
  }).join('') || `<p>${tr('balanceEmpty')}</p>`}</div></section>`;
}
