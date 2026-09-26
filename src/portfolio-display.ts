import type { Ledger } from './ledger.ts';
import { sumDecimals } from './annual.ts';
import { inferredOpenings, portfolioAt, portfolioValue } from './portfolio.ts';
import { translate } from './i18n.ts';
import type { Locale, MessageKey } from './i18n.ts';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function portfolioDisplay(ledger: Ledger, year: string, locale: Locale, today = new Date().toISOString().slice(0,10), currency: 'USD' | 'JPY' = 'USD') {
  const tr = (key: MessageKey) => translate(locale, key);
  const label = (key: MessageKey) => tr(key).replaceAll('USD', currency);
  const converted = (usd: string | null, date: string) => portfolioValue(ledger, usd, date, currency);
  const money = (usd: string | null, date: string) => val(converted(usd, date).value);
  if (!ledger.balances.length) return '';
  const selected = year === 'all' ? today.slice(0,4) : year;
  const latest = selected === today.slice(0,4);
  const rows = portfolioAt(ledger, selected, today);
  const opening = inferredOpenings(ledger,today).some(r => r.target === `${selected}-12-31`);
  const val = (v: string | null) => esc(v ?? tr('unknown'));
  const totals = [...new Set(rows.map(r => r.account))].map(account => {
    const parts = rows.filter(r => r.account === account);
    const cash = parts.find(r => r.asset === 'cash');
    if (latest && cash?.anchor) return `<p>${esc(account)} · ${label('balanceNet')}: <strong>${money(cash.anchor.netValue, cash.target)}</strong> · ${esc(cash.anchor.date)} · ${esc(cash.anchor.basis)} <small>${tr('portfolioNetSource')}</small></p>`;
    const complete = parts.length > 0 && parts.every(r => r.value !== null) && new Set(parts.map(r => r.target)).size === 1;
    return `<p>${esc(account)} · ${label('portfolioSubtotal')}: <strong>${complete ? money(sumDecimals(parts.map(r => r.value!)), parts[0].target) : tr('unknown')}</strong></p>`;
  }).join('');
  return `<section class="panel"><div class="panel-title"><div><h2>${tr('portfolioTitle')} · ${latest ? tr('portfolioLatest') : esc(selected+'-12-31')}${opening ? ' · Opening' : ''}</h2><p>${tr('portfolioHint')}${currency === 'JPY' ? ' ' + tr('portfolioFxHint') : ''}</p></div><span class="pill">${currency}</span></div><div class="inset">${opening ? `<p>${tr('inferredOpeningHint')}</p>` : ''}${totals}</div><div class="table-wrap"><table><thead><tr><th>${tr('balanceSource')}</th><th>${tr('instrument')}</th><th>${tr('asOfDate')}</th><th>${tr('quantity')}</th><th>${label('balanceValue')}</th><th>${tr('status')}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.account)}</td><td>${r.asset === 'cash' ? label('balanceCash') : r.asset === 'money' ? label('balanceMoney') : esc(r.asset)}</td><td>${esc(r.target)}<small>${r.priceDate ? tr('priceDate') + ': ' + esc(r.priceDate) : ''}</small></td><td>${r.asset === 'cash' || r.asset === 'money' ? '—' : val(r.quantity)}</td><td>${money(r.value, r.target)}</td><td><details><summary>${r.issues.length || (currency === 'JPY' && !converted(r.value, r.target).fx) ? tr('portfolioProvisional') : tr('portfolioObserved')}</summary>${r.issues.map(issue => `<p>${tr(('portfolioIssue.'+issue) as MessageKey)}</p>`).join('')}<p>${tr('balanceSource')}: ${esc(ledger.sources.find(s => s.id === r.anchor?.sourceId)?.name ?? tr('unknown'))} · ${esc(r.anchor?.date)} · ${esc(r.anchor?.basis)} ${esc(r.anchor?.time)}</p>${currency === 'JPY' ? `<p>${tr('fxTitle')}: ${esc(converted(r.value, r.target).fx?.rate ?? tr('unknown'))} JPY / USD · ${tr('fxUsedDate')}: ${esc(converted(r.value, r.target).fx?.date ?? tr('unknownDate'))}</p>` : ''}<p>${tr('portfolioMovementDate')}</p>${r.transactions.map(id => { const t=ledger.transactions.find(t=>t.id===id)!; return `<p><button class="text-button" data-detail="${esc(id)}">${esc(t.settlementDate ?? tr('unknownDate'))} · ${tr(t.kind)} · ${esc(t.quantity ?? t.amount ?? tr('unknown'))}</button></p>`; }).join('')}</details></td></tr>`).join('') || `<tr><td colspan="6">${tr('balanceEmpty')}</td></tr>`}</tbody></table></div></section>`;
}
