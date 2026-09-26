import { brokerAdapters } from './brokers/registry.ts';
import type { BrokerSelection } from './brokers/adapter.ts';
import { pageWindow, pagination } from './pagination.ts';
import { hasConsent, consentCookie, consentDisplay } from './consent.ts';
import { assetSection } from './asset-section.ts';
import { cryptoEnteredCost, setCryptoCost } from './crypto-cost.ts';
import { cryptoDuplicateIds } from './brokers/gmo.ts';
import { cryptoDisplay } from './crypto-display.ts';
import { setCostInput } from './sale-cost.ts';
import { saleCostDisplay } from './sale-cost-display.ts';
import { portfolioDisplay } from './portfolio-display.ts';
import { portfolioYears } from './portfolio.ts';
import { balancesDisplay } from './balances-display.ts';
import { FX_CSV, FX_SOURCE, fxBundleSchema, fxDate, fxObservation, makeFxSeries, mergeFxSeries } from './fx.ts';
import { annualDisplay, computedCell } from './annual-display.ts';
import { saleValuation } from './annual.ts';
import { ledgerPriceCells } from './price-display.ts';
import { parsePriceCsv, priceDownloadPlan, mergedPriceCache, choosePrice, estimatedValue, isSelectedPrice, makePriceSeries, mergePriceSeries, priceBundleSchema, priceCandidates, reviewedPrice, reviewIssues, stooqUrl } from './market.ts';
import { defaultLocale, parseLocale, translate, translateIssue } from './i18n.ts';
import type { Locale, MessageKey, Params } from './i18n.ts';

let locale: Locale = defaultLocale;
try { locale = parseLocale(localStorage.getItem('annum-aequitas.locale')); } catch { /* Storage may be unavailable. */ }
let consentAccepted=false,showDisclaimer=false,consentChecked=false;
try {consentAccepted=hasConsent(document.cookie,location.protocol==='https:');}catch { /* Ask this session if cookies are blocked. */ }
const tr = (key: MessageKey, params: Params = {}) => translate(locale, key, params);
function errorText(error: unknown): string {
  const keys: Record<string, MessageKey> = {
    documentType: 'documentType', number: 'error.number', references: 'error.references', missingColumns: 'error.missingColumns',
    csvSyntax: 'error.csvSyntax', csvHeaders: 'error.csvHeaders', emptyCsv: 'error.emptyCsv',
    csvWidth: 'error.csvWidth', fileTooLarge: 'fileTooLarge',
  };
  return error instanceof LedgerError && keys[error.code]
    ? tr(keys[error.code], { row: error.row ?? '' }) : tr('importFailed');
}

import demoCsv from '../data/sample-ml/demo.csv?raw';
import { LedgerError, instrumentSchema, addOpening, catalogSchema, displayYear, duplicateIds, emptyLedger, importCsv, numberValue, readLedger, resolveKnownSymbols, searchInstruments, setCoverage, setSaleValuation } from './ledger.ts';
import type { Instrument, Transaction } from './ledger.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;

const demoInstruments: Instrument[] = [
  { name: 'Fictional Cloud Corporation (fictional)', symbol: 'FICT', exchange: 'OTHER' },
  { name: 'Demo Orchard Technologies (fictional)', symbol: 'DORC', exchange: 'OTHER' },
];
let ledger = emptyLedger();
let catalog: Instrument[] = [];
let catalogState: 'loading' | 'ready' | 'unavailable' = 'loading';
let catalogDate = '';
const catalogInfo = () => catalogState === 'ready' ? tr('catalogReady', { count: catalog.length.toLocaleString(locale), date: catalogDate }) : tr(catalogState === 'loading' ? 'catalogLoading' : 'catalogUnavailable');
let demo = false, dirty = false, busy = false;
let listPages = { stocks: 1, crypto: 1 };
const resetPages = () => { listPages = { stocks: 1, crypto: 1 }; };
let displayCurrency: 'USD' | 'JPY' = 'USD';
let marketTab = 'prices';
let broker: BrokerSelection = 'auto';
let year = 'all', view = 'overview', query = '', error = false;
let notice: (() => string) | null = null;
let detailId: string | null = null;
let marketDraft = { instrument: '0', providerSymbol: '', start: '', end: '' };
let marketManual = false;
let preparedPrice: { symbol: string; exchange: 'NYSE' | 'NASDAQ' | 'OTHER'; providerSymbol: string; start: string; end: string } | null = null;
let duplicateCache = new Set<string>();
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const amount = (v: string | null) => v === null ? `<span class="muted">${tr('unknown')}</span>` : esc(v);
const selectedInstrument = (key: string) => ledger.mappings.find(m => m.key === key)?.instrument;
const instruments = () => demo ? demoInstruments : catalog;
const activeRows = () => ledger.transactions.filter(t => !t.excluded);
const rowLabel = (t: Transaction) => selectedInstrument(t.instrumentKey)?.symbol ?? (t.raw['Symbol/CUSIP #'] || tr('unknownInstrument'));
function changed() { preparedPrice = null; dirty = true; render(); }
function tell(message: () => string, isError = false) { notice = message; error = isError; render(); }
function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function issueCount() {
  const cryptoDupes=cryptoDuplicateIds(ledger.cryptoTransactions);
  return ledger.cryptoTransactions.filter(t=>t.issues.some(i=>i!=='out-of-scope' && !(i==='acquisition-history' && cryptoEnteredCost(ledger,t))) || cryptoDupes.has(t.id)).length + activeRows().filter(t => reviewIssues(ledger, t).length || !selectedInstrument(t.instrumentKey) || duplicateCache.has(t.id)).length;
}
function render() {
  document.documentElement.lang = locale;
  document.title = tr('documentTitle');
  if(!consentAccepted || showDisclaimer) {
    app.innerHTML=consentDisplay(locale,consentChecked,consentAccepted);
    document.querySelector<HTMLSelectElement>('#consent-language')!.onchange=e=>{locale=parseLocale((e.target as HTMLSelectElement).value);try{localStorage.setItem('annum-aequitas.locale',locale);}catch{}render();};
    document.querySelector<HTMLInputElement>('#consent-check')!.onchange=e=>{consentChecked=(e.target as HTMLInputElement).checked;document.querySelector<HTMLButtonElement>('#consent-accept')!.disabled=!consentChecked;};
    document.getElementById('consent-accept')!.onclick=()=>{
      if(!consentChecked)return;
      consentAccepted=true;showDisclaimer=false;consentChecked=false;
      try{document.cookie=consentCookie(location.protocol==='https:');if(!hasConsent(document.cookie,location.protocol==='https:'))notice=()=>tr('consentSessionOnly');}catch{notice=()=>tr('consentSessionOnly');}
      render();
    };
    document.getElementById('consent-back')?.addEventListener('click',()=>{showDisclaimer=false;consentChecked=false;render();});
    return;
  }

  duplicateCache = duplicateIds(ledger);
  const rows = activeRows();
  const years = [...new Set([...rows.map(displayYear), ...ledger.cryptoTransactions.map(t=>t.date?.slice(0,4)??'unknown'), ...portfolioYears(ledger)])].sort().reverse();
  if (year !== 'all' && !years.includes(year)) year = 'all';
  app.innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="#" aria-label="${tr('home')}"><span class="brand-mark">A</span><span class="brand-name">AnnumAequitas</span></a>
    <div class="workspace-label">PERSONAL WORKSPACE</div>
    <nav aria-label="${tr('mainNav')}"><button data-view="overview" class="${view === 'overview' ? 'active' : ''}"><span>▦</span> ${tr('ledger')}</button><button data-view="review" class="${view === 'review' ? 'active' : ''}"><span>◎</span> ${tr('review')} <b>${issueCount()}</b></button><button data-view="sources" class="${view === 'sources' ? 'active' : ''}"><span>▤</span> ${tr('sources')}</button><button data-view="market" class="${view === 'market' ? 'active' : ''}"><span>↗</span> ${tr('market')}</button></nav>
    <div class="sidebar-note"><span class="privacy-dot"></span> ${tr('localProcessing')}<br><small>${tr('privacy')}<br>${tr('saveReminder')}</small></div>
    <label class="language-picker" for="locale">${tr('language')}
      <select id="locale"><option value="en" lang="en" ${locale === 'en' ? 'selected' : ''}>English</option><option value="ja" lang="ja" ${locale === 'ja' ? 'selected' : ''}>日本語</option></select>
    </label>
    <div class="version">v0.1 · ${tr('preview')}</div>
  </aside>
  <main>
    <header class="topbar"><span>WORKSPACE <span class="slash">/</span> ${demo ? tr('demoWorkspace') : tr('yourLedger')}</span><span class="save-state">${dirty ? tr('unsaved') : tr('savedState')}</span></header>
    <section class="page-heading"><div><p class="eyebrow">YOUR ASSETS, YEAR BY YEAR</p><h1>${view === 'overview' ? tr('overviewTitle') : view === 'review' ? tr('reviewTitle') : view === 'market' ? tr('marketTitle') : tr('sourcesTitle')}</h1><p class="subtitle">${view === 'overview' ? tr('overviewSubtitle') : view === 'review' ? tr('reviewSubtitle') : view === 'market' ? tr('marketSubtitle') : tr('sourcesSubtitle')}</p></div>
      <div class="actions"><label>${tr('broker')}<select id="broker"><option value="auto" ${broker === 'auto' ? 'selected' : ''}>${tr('brokerAuto')}</option>${brokerAdapters.map(adapter => `<option value="${adapter.id}" ${broker === adapter.id ? 'selected' : ''}>${esc(adapter.label)}</option>`).join('')}</select></label><button id="restore" class="button secondary">${tr('openLedger')}</button><button id="save" class="button secondary" ${!ledger.sources.length && !ledger.openings.length && !ledger.marketPrices.length && !ledger.fxRates.length ? 'disabled' : ''}>${tr('save')} ↓</button><button id="upload" class="button primary" ${busy ? 'disabled' : ''}>＋ ${tr('addCsv')}</button></div>
    </section>
    ${notice ? `<div class="notice ${error ? 'error' : ''}" role="status">${esc(notice())}</div>` : ''}
    ${demo ? `<div class="demo-banner">${tr('demoBanner')}<button id="leave-demo">${tr('exitDemo')}</button></div>` : ''}
    ${view === 'overview' ? overview(years, rows) : view === 'review' ? review() : view === 'market' ? market() : sources()}
    <footer>${tr('footer')} <button id="show-disclaimer" class="text-button">${tr('consentTitle')}</button></footer>
  </main>
  <input id="csv-file" type="file" accept=".csv,text/csv" multiple hidden><input id="json-file" type="file" accept=".json,application/json" hidden>
  ${detailId ? detail() : ''}`;
  bind();
  if (busy) app.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button, input, select').forEach(el => el.disabled = true);
}
const assetOpen={stocks:true,crypto:true};
try { const saved=JSON.parse(localStorage.getItem('annum-aequitas.sections')??'{}'); for(const key of ['stocks','crypto'] as const) if(typeof saved[key]==='boolean')assetOpen[key]=saved[key]; } catch { /* Optional UI preference only. */ }
const section=(kind:'stocks'|'crypto',selectedYear:string,content:string)=>assetSection(ledger,kind,selectedYear,locale,displayCurrency,assetOpen[kind],content);
function overview(years: string[], rows: Transaction[]) {
  const filtered = rows.filter(t => (year === 'all' || displayYear(t) === year) && `${rowLabel(t)} ${t.raw['Description 1']} ${t.raw['Description 2']}`.toLowerCase().includes(query.toLowerCase()));
  const stockPage = pageWindow(filtered, listPages.stocks);
  return `<div class="import-meta"><span>${tr('filesCount', { count: ledger.sources.length })}</span><span>${tr('importedTransactions')}: ${rows.length + ledger.cryptoTransactions.length}</span><span>${tr('needsReview')}: ${issueCount()}</span></div>
  <div class="toolbar overview-controls"><label>${tr('fxDisplayCurrency')}<select id="display-currency"><option value="USD" ${displayCurrency === 'USD' ? 'selected' : ''}>USD</option><option value="JPY" ${displayCurrency === 'JPY' ? 'selected' : ''}>JPY</option></select></label><div class="years" aria-label="${tr('filterYear')}"><button data-year="all" class="${year === 'all' ? 'selected' : ''}">${tr('all')}</button>${years.map(y => `<button data-year="${esc(y)}" class="${year === y ? 'selected' : ''}">${esc(y === 'unknown' ? tr('unconfirmedDate') : y)}</button>`).join('')}</div></div>
  ${section('crypto',year,cryptoDisplay(ledger, year, locale, listPages.crypto))}
  ${section('stocks',year,`
  ${rows.length ? annualDisplay(ledger, year, locale, displayCurrency) : ''}
  ${portfolioDisplay(ledger, year, locale, undefined, displayCurrency)}
  ${!rows.length && ledger.sources.some(s=>s.broker==='gmo') ? '' : `<section class="panel transaction-list"><div class="panel-title"><div><h2>${tr('transactions')}</h2><p>${tr('dashboardAmountHint')}</p></div><span class="pill">${filtered.length} RECORDS</span></div>
  <div class="toolbar"><input id="filter" aria-label="${tr('searchTransactions')}" placeholder="${tr('searchPlaceholder')}" value="${esc(query)}"></div>
  ${pagination(stockPage, 'stocks', locale)}${!rows.length ? `<div class="empty"><div class="empty-icon">↥</div><h3>${tr('emptyTitle')}</h3><p>${tr('emptyHint')}<br>${tr('emptyHintMore')}</p><button class="button primary" id="empty-upload">${tr('chooseCsv')}</button><div class="demo-links"><button id="demo">${tr('tryDemo')} →</button><button id="download-demo">${tr('sampleCsv')} ↓</button></div></div>` : `<div class="table-wrap"><table><thead><tr><th>${tr('tradeDate')}</th><th>${tr('instrument')}</th><th>${tr('kind')}</th><th class="numeric">${tr('quantity')}</th><th class="numeric">${tr('fxAmount')} (${displayCurrency})</th><th>${tr('status')}</th><th></th></tr></thead><tbody>${stockPage.rows.map(t => `<tr><td class="date">${esc(t.tradeDate ?? tr('unknown'))}</td><td><strong>${esc(rowLabel(t))}</strong><small>${esc(selectedInstrument(t.instrumentKey)?.exchange ?? tr('awaitingInstrument'))}</small></td><td><span class="type ${t.kind}">${tr(t.kind)}</span></td><td class="numeric">${t.quantity === null && (t.kind === 'dividend' || t.kind === 'tax') ? '—' : amount(t.quantity)}</td>${computedCell(ledger, t, locale, displayCurrency)}<td><span class="status">${duplicateCache.has(t.id) ? tr('duplicates') : reviewIssues(ledger, t).length || !selectedInstrument(t.instrumentKey) ? tr('needsConfirmation') : tr('parsed')}</span></td><td><button class="text-button" data-detail="${esc(t.id)}" aria-label="${esc(t.tradeDate)} ${esc(rowLabel(t))} · ${tr('detail')}">${tr('detail')} ↗</button></td></tr>`).join('') || `<tr><td colspan="7">${tr('noTransactions')}</td></tr>`}</tbody></table></div>`}
  </section>`}`)}${!ledger.sources.length ? `<section class="panel inset"><button class="button primary" id="empty-upload">${tr('chooseCsv')}</button><button id="demo" class="button secondary">${tr('tryDemo')}</button><button id="download-demo" class="button secondary">${tr('sampleCsv')}</button></section>` : ''}<div class="bottom-note"><span>ⓘ</span><p>${tr('yearNote')}</p></div>`;
}
function review() {
  const reviewPage = pageWindow(ledger.transactions, listPages.stocks);
  const reviewRows = reviewPage.rows.filter(t => !t.excluded);
  const keys = [...new Set([...activeRows().map(t => t.instrumentKey), ...ledger.openings.map(o => o.instrumentKey), ...ledger.balances.filter(b => b.kind === 'holdings' && b.symbol).map(b => `symbol:${b.symbol.toUpperCase()}`)])];
  const dupes = duplicateCache;
  return `${section('crypto','all',cryptoDisplay(ledger, 'all', locale, listPages.crypto))}${section('stocks','all',`<section class="panel"><div class="panel-title"><div><h2>${tr('confirmInstrument')}</h2><p>${tr('instrumentHint')}</p></div><span class="pill">NYSE / NASDAQ</span></div><div class="catalog-note">${esc(demo ? tr('demoCatalog') : catalogInfo())}</div>
  <div class="mapping-list">${keys.map((key, i) => { const item = selectedInstrument(key); return `<article class="mapping"><div><span class="eyebrow">${tr('sourceSymbol')}</span><h3>${esc(key.replace(/^(symbol|description):/, ''))}</h3>${item ? `<p class="resolved">✓ ${esc(item.name)} · ${esc(item.symbol)} · ${item.exchange}</p>` : `<p class="muted">${tr('notSelected')}</p>`}</div><div class="lookup"><label for="lookup-${i}">${item ? tr('changeSelection') : tr('searchInstrument')}</label><input id="lookup-${i}" data-lookup="${i}" autocomplete="off" placeholder="${tr('instrumentPlaceholder')}" aria-controls="results-${i}"><div id="results-${i}" class="suggestions" aria-live="polite"></div></div></article>`; }).join('') || `<p class="inset muted">${tr('importToReview')}</p>`}</div></section>
  ${pagination(reviewPage,'stocks',locale)}<section class="panel"><div class="panel-title"><div><h2>${tr('duplicates')}</h2><p>${tr('duplicateHint')}</p></div></div><div class="inset">${reviewPage.rows.filter(t => dupes.has(t.id)).map(t => `<div class="review-row"><div><strong>${esc(t.tradeDate)} · ${esc(rowLabel(t))} · ${tr(t.kind)}</strong><small>${esc(ledger.sources.find(s => s.id === t.sourceId)?.name)} / ${tr('record')} ${t.row}</small></div><div class="actions"><button class="button secondary" data-keep="${esc(t.id)}">${tr('keepSeparate')}</button><button class="button secondary" data-exclude="${esc(t.id)}">${tr('exclude')}</button></div></div>`).join('') || `<p class="muted">${tr('noDuplicates')}</p>`}${reviewPage.rows.filter(t => t.excluded).map(t => `<div class="review-row muted"><span>${tr('excluded')}${esc(t.tradeDate)} · ${esc(rowLabel(t))} / ${esc(ledger.sources.find(s => s.id === t.sourceId)?.name)}</span><button class="text-button" data-include="${esc(t.id)}">${tr('undo')}</button></div>`).join('')}</div></section>
  ${priceReview(reviewRows)}<p class="notice">${tr('cashReviewNote')}</p>
  <section class="panel"><div class="panel-title"><div><h2>${tr('checkStatements')}</h2><p>${tr('checkStatementsHint')}</p></div></div><div class="inset">${reviewRows.filter(t => reviewIssues(ledger, t).length).map(t => `<div class="review-row"><div><strong>${esc(t.tradeDate ?? tr('unknownDate'))} · ${esc(rowLabel(t))}</strong><small>${reviewIssues(ledger, t).map(issue => esc(translateIssue(locale, issue))).join(' / ')}</small></div><button class="text-button" data-detail="${esc(t.id)}">${tr('viewSource')} ↗</button></div>`).join('') || `<p class="muted">${tr('noIssues')}</p>`}</div></section>`)}`;
}
function marketMappingKeys() {
  return [...new Set([...activeRows().map(t => t.instrumentKey), ...ledger.openings.map(o => o.instrumentKey), ...ledger.balances.filter(b => b.kind === 'holdings' && b.symbol).map(b => `symbol:${b.symbol.toUpperCase()}`)])];
}
function manualMarketMappings() {
  return marketMappingKeys().map((key, i) => `<form data-market-mapping="${i}" class="form-grid"><p>${esc(key.replace(/^(symbol|description):/, ''))}</p><label>${tr('manualSymbol')}<input name="symbol" value="${esc(selectedInstrument(key)?.symbol ?? (key.startsWith('symbol:') ? key.slice(7) : ''))}" required maxlength="40"></label><label>${tr('manualName')}<input name="name" value="${esc(selectedInstrument(key)?.name ?? '')}" required maxlength="500"></label><label>${tr('manualExchange')}<select name="exchange">${['OTHER', 'NASDAQ', 'NYSE'].map(exchange => `<option value="${exchange}" ${(selectedInstrument(key)?.exchange ?? 'OTHER') === exchange ? 'selected' : ''}>${exchange === 'OTHER' ? tr('otherExchange') : exchange}</option>`).join('')}</select></label><button class="button secondary">${tr('manualMap')}</button></form>`).join('');
}
function marketInstruments() {
  return [...new Map(ledger.mappings.map(m => [`${m.instrument.exchange}:${m.instrument.symbol}`, m.instrument])).values()];
}
function market() {
  const nav = `<div class="years market-tabs"><button data-market-tab="prices" class="${marketTab === 'prices' ? 'selected' : ''}">${tr('fxStocks')}</button><button data-market-tab="fx" class="${marketTab === 'fx' ? 'selected' : ''}">USD / JPY</button></div>`;
  return nav + (marketTab === 'fx' ? fxMarket() : stockMarket());
}
function fxMarket() {
  const dates = activeRows().flatMap(t => fxDate(t) ? [fxDate(t)!] : []).sort();
  const observations = new Map<string, string | null>();
  for (const s of [...ledger.fxRates].sort((a,b) => a.fetchedAt.localeCompare(b.fetchedAt))) for (const o of s.observations) observations.set(o.date, o.rate);
  const cached = [...observations.keys()].sort();
  const substituted = activeRows().filter(t => fxObservation(ledger, fxDate(t))?.datePolicy === 'next-available').length;
  const missing = activeRows().filter(t => !fxObservation(ledger, fxDate(t))?.rate).length;
  return `<section class="panel"><div class="panel-title"><div><h2>${tr('fxTitle')}</h2><p>${tr('fxHint')}</p></div></div><div class="inset"><p>${tr('priceNeeded')}: ${esc(dates[0] ?? tr('unknown'))} — ${esc(dates.at(-1) ?? tr('unknown'))}</p><p>${tr('priceRange')}: ${esc(cached[0] ?? '—')} — ${esc(cached.at(-1) ?? '—')} · ${observations.size} ${tr('observations')}</p><p>${tr('fxMissing', { count: missing })} ${tr('fxSubstituted', { count: substituted })}</p><div class="actions"><button id="fx-local" class="button primary">${tr('fxLoadLocal')}</button><a class="button secondary" href="${FX_CSV}" target="_blank" rel="noopener noreferrer">${tr('fxDownload')}</a><label class="button secondary">${tr('fxImport')}<input id="fx-csv" type="file" accept=".csv,text/csv" hidden></label><label class="button secondary">${tr('fxImportJson')}<input id="fx-json" type="file" accept=".json,application/json" hidden></label><button id="fx-export" class="button secondary" ${!ledger.fxRates.length ? 'disabled' : ''}>${tr('fxExport')}</button></div><p class="muted">${tr('fxCacheHint')}</p><a href="${FX_SOURCE}" target="_blank" rel="noopener noreferrer">FRED · DEXJPUS</a>${ledger.fxRates.map(s => `<p>${tr('fetchedAt')}: ${esc(s.fetchedAt)} · ${s.observations.length} ${tr('observations')}</p>`).join('')}</div></section>`;
}
async function loadFx(file?: File, csv = false) {
  if (busy) return;
  busy = true; render();
  try {
    if (file && file.size > 50 * 1024 * 1024) throw new Error('File too large');
    let series;
    if (csv && file) series = [await makeFxSeries(await file.text())];
    else if (file) series = fxBundleSchema.parse(JSON.parse(await file.text())).series;
    else { const response = await fetch(`${import.meta.env.BASE_URL}fx.json`, { cache: 'no-store' }); if (!response.ok) throw new Error('No local FX cache'); series = fxBundleSchema.parse(await response.json()).series; }
    ledger = mergeFxSeries(ledger, series); dirty = true; error = false; notice = () => tr('fxLoaded');
  } catch { error = true; notice = () => tr('fxError'); }
  finally { busy = false; render(); }
}
function stockMarket() {
  const items = marketInstruments();
  if (!items[Number(marketDraft.instrument)]) marketDraft.instrument = '0';
  const instrument = items[Number(marketDraft.instrument)];
  const provider = marketDraft.providerSymbol || (instrument ? `${instrument.symbol.toLowerCase()}.us` : '');
  const plan = instrument ? priceDownloadPlan(ledger, instrument, provider) : null;
  if (!marketManual) {
    marketDraft.start = plan?.missing[0]?.start ?? plan?.required?.start ?? '';
    marketDraft.end = plan?.missing[0]?.end ?? plan?.required?.end ?? '';
  }
  const cache = mergedPriceCache(ledger.marketPrices);
  return `<section class="panel"><div class="panel-title"><div><h2>${tr('market')}</h2><p>${tr('marketHint')}</p></div></div><div class="inset">
    <p class="muted">${tr('priceAutoRange')}</p>${marketMappingKeys().length ? `<p>${tr('manualMarketHint')}</p><button data-view="review" class="button secondary">${tr('confirmInstrument')}</button>${manualMarketMappings()}` : ''}
    ${plan?.required ? `<p>${tr('priceNeeded')}: ${esc(plan.required.start)} — ${esc(plan.required.end)}</p><p>${tr('priceMissing')}: ${plan.missing.map(r => `${esc(r.start)} — ${esc(r.end)}`).join(' / ') || tr('priceCovered')}</p>` : ''}
    ${items.length ? `<form id="price-request" class="form-grid"><label>${tr('instrument')}<select id="price-instrument">${items.map((m, i) => `<option value="${i}" ${marketDraft.instrument === String(i) ? 'selected' : ''}>${esc(m.name)} · ${esc(m.symbol)} · ${m.exchange}</option>`).join('')}</select></label><label>${tr('providerSymbol')}<input id="provider-symbol" value="${esc(marketDraft.providerSymbol || items[Number(marketDraft.instrument) || 0]?.symbol.toLowerCase() + '.us')}" required></label><label>${tr('fromDate')}<input id="price-start" type="date" value="${esc(marketDraft.start)}" required></label><label>${tr('toDate')}<input id="price-end" type="date" value="${esc(marketDraft.end)}" required></label><button class="button secondary" type="submit">${tr('prepareDownload')}</button><button id="auto-price-range" class="button secondary" type="button">${tr('priceUseSuggested')}</button></form>` : `<p>${tr('marketNoInstrument')}</p>`}
    ${preparedPrice ? `<div id="prepared-price"><p>${esc(preparedPrice.exchange)}:${esc(preparedPrice.symbol)} · ${esc(preparedPrice.start)} — ${esc(preparedPrice.end)}</p><div class="actions"><a class="button secondary" href="${esc(stooqUrl(preparedPrice.providerSymbol, preparedPrice.start, preparedPrice.end))}" target="_blank" rel="noopener noreferrer">${tr('downloadPrices')} ↗</a></div></div>` : ''}
    ${instrument ? `<label class="button secondary">${tr('importPriceCsv')}<input id="price-csv" type="file" accept=".csv,text/csv" hidden></label>` : ''}<p>${tr('priceCacheSummary', { days: cache.length, conflicts: cache.filter(p => p.conflict).length })}</p><p class="muted">${tr('priceCacheHint')}</p>
    ${cache.filter(p => p.conflict).map(p => `<details><summary>${esc(p.series.symbol)} · ${esc(p.bar.date)} · ${tr('priceConflict')}</summary>${p.revisions.map(r => `<p>${esc(r.bar.close)} USD · ${esc(r.series.fetchedAt)} · ${esc(r.series.sourceUrl)}</p>`).join('')}</details>`).join('')}
    <div class="actions"><button id="export-prices" class="button secondary" ${!ledger.marketPrices.length ? 'disabled' : ''}>${tr('exportPrices')}</button><button id="refresh-prices" class="button secondary">${tr('refreshPrices')}</button><label class="button secondary">${tr('importPriceJson')}<input id="price-json" type="file" accept=".json,application/json" hidden></label></div><p class="muted">${tr('priceRights')}</p>
    ${ledger.marketPrices.map(s => `<article class="source"><h3>${esc(s.exchange)}:${esc(s.symbol)} · ${s.bars.length} ${tr('observations')} · USD</h3><p>${tr('priceRange')}: ${esc(s.bars.map(b => b.date).sort()[0])} — ${esc(s.bars.map(b => b.date).sort().at(-1))}</p><p>${tr('fetchedAt')}: ${esc(s.fetchedAt)} · ${tr('adjustment')}: ${tr(`adjustment.${s.adjustment}`)}</p><a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">${tr('priceSource')} · Stooq</a></article>`).join('') || `<p class="muted">${tr('noPrices')}</p>`}
  </div></section>`;
}
function priceReview(rows = activeRows()) {
  return `<section class="panel"><div class="panel-title"><div><h2>${tr('priceCandidates')}</h2><p>${tr('priceCandidateHint')}</p></div></div><div class="inset">${rows.filter(t => t.kind === 'vest').map(t => {
    const selected = reviewedPrice(ledger, t); const candidates = priceCandidates(ledger, t);
    return `<article class="source"><h3>${esc(rowLabel(t))} · ${esc(t.tradeDate)}</h3><p>${tr('targetDate')}: ${esc(t.lapseDate ?? t.tradeDate ?? tr('unknown'))} · ${tr(t.lapseDate ? 'dateBasis.lapse' : t.tradeDate ? 'dateBasis.trade' : 'dateBasis.unknown')}</p>
    ${selected ? `<div class="notice">${tr('estimateSelected')}: ${esc(selected.unitPrice)} USD · ${tr(`priceOrigin.${selected.origin}`)}<br>${tr('estimateTotal', { value: estimatedValue(t.quantity, selected.unitPrice) ?? tr('unknown') })}<br>${tr('estimateOnly')}<br><small>${esc(selected.source)} · ${esc(selected.priceDate ?? tr('unknownDate'))} · ${tr(`adjustment.${selected.adjustment}`)}</small><button class="text-button" data-clear-price="${esc(t.id)}">${tr('clearEstimate')}</button></div>` : ''}
    ${candidates.map((c, i) => `<div class="review-row"><div><strong>${tr(`priceOrigin.${c.origin}`)} · ${esc(c.unitPrice)} USD</strong><small>${tr('priceDate')}: ${esc(c.priceDate ?? tr('unknownDate'))} · ${tr('adjustment')}: ${tr(`adjustment.${c.adjustment}`)}</small><small>${esc(c.source)}${c.fetchedAt ? ` · ${esc(c.fetchedAt)}` : ''}</small></div><button type="button" class="button ${isSelectedPrice(selected,c) ? 'primary' : 'secondary'}" aria-pressed="${isSelectedPrice(selected,c)}" data-price-row="${esc(t.id)}" data-price-index="${i}">${tr(isSelectedPrice(selected,c) ? 'estimateActive' : 'selectEstimate')}</button></div>`).join('') || `<p>${tr('noCandidate')}</p>`}
    ${!candidates.some(c => c.origin === 'daily-close') ? `<p class="muted">${tr('noExactPrice')}</p>` : ''}</article>`;
  }).join('') || `<p>${tr('noVest')}</p>`}</div></section>`;
}
function sources() {
  return `${balancesDisplay(ledger, locale)}<section class="panel"><div class="panel-title"><div><h2>${tr('importedSources')}</h2><p>${tr('coverageHint')}</p></div></div><div class="inset">${ledger.sources.map((s, i) => {
    if(s.broker==='gmo') return `<article class="source"><h3>${esc(s.name)}</h3><p>GMO Coin · ${tr('cryptoTitle')} · ${ledger.cryptoTransactions.filter(t=>t.sourceId===s.id).length} ${tr('recordsUnit')}</p></article>`;
    if (s.documentKind !== 'activity') return `<article class="source"><h3>${esc(s.name)}</h3><p>Merrill · ${tr(`doc.${s.documentKind}`)} · ${ledger.balances.filter(b => b.sourceId === s.id).length} ${tr('recordsUnit')}</p></article>`;
    const dates = ledger.transactions.filter(t => t.sourceId === s.id).flatMap(t => t.tradeDate ? [t.tradeDate] : []).sort();
    return `<article class="source"><h3>${esc(s.name)}</h3><p class="muted">${tr('tradeRange')}${esc(dates[0] ?? tr('unknown'))} 〜 ${esc(dates.at(-1) ?? tr('unknown'))} · ${ledger.transactions.filter(t => t.sourceId === s.id).length} ${tr('recordsUnit')}</p><form data-coverage="${i}" class="form-grid"><label>${tr('coverageStart')}<input name="start" type="date" value="${esc(s.coverage?.start)}" required></label><label>${tr('coverageEnd')}<input name="end" type="date" value="${esc(s.coverage?.end)}" required></label><label class="wide">${tr('evidenceNote')}<input name="note" placeholder="${tr('coveragePlaceholder')}" value="${esc(s.coverage?.note)}" required maxlength="2000"></label><button class="button secondary" type="submit">${tr('saveCoverage')}</button><span class="muted">${s.coverage ? tr('recorded') : tr('coverageUnknown')}</span></form></article>`;
  }).join('') || `<p class="muted">${tr('noSources')}</p>`}</div></section>
  <section class="panel"><div class="panel-title"><div><h2>${tr('openingBalances')}</h2><p>${tr('openingHint')}</p></div></div><div class="inset">${ledger.openings.map(o => `<div class="review-row"><div><strong>${esc(o.date)} · ${esc(o.instrumentKey.replace(/^symbol:/, ''))} · ${esc(o.quantity)} ${tr('sharesUnit')}</strong><small>${tr('totalCost')}${o.cost === null ? tr('unknown') : `${esc(o.cost)} ${esc(o.currency)}`} / ${esc(o.evidence)}</small></div><button class="text-button" data-remove-opening="${esc(o.id)}">${tr('delete')}</button></div>`).join('')}
  <form id="opening" class="form-grid opening"><label>${tr('asOfDate')}<input type="date" name="date" required></label><label>${tr('instrumentReference')}<input name="symbol" placeholder="${tr('instrumentReferencePlaceholder')}" required maxlength="400"></label><label>${tr('heldQuantity')}<input name="quantity" inputmode="decimal" placeholder="${tr('quantityPlaceholder')}" required></label><label>${tr('costOptional')}<input name="cost" inputmode="decimal" placeholder="${tr('unknown')}"></label><label>${tr('costCurrency')}<input name="currency" value="USD" pattern="[A-Za-z]{3}" maxlength="3" required></label><label class="wide">${tr('evidenceUnknown')}<input name="evidence" placeholder="${tr('evidencePlaceholder')}" required maxlength="2000"></label><button type="submit" class="button primary">${tr('addOpening')}</button></form><p class="muted">${tr('openingMappingHint')}</p></div></section>`;
}
function saleForm(t: Transaction) {
  if (t.kind !== 'sale' || t.excluded) return '';
  return `${notice ? `<p role="status" class="notice ${error ? 'error' : ''}">${esc(notice())}</p>` : ''}${saleCostDisplay(ledger,t,locale,displayCurrency)}`;
}
function detail() {
  const t = ledger.transactions.find(t => t.id === detailId);
  if (!t) return '';
  const fx = fxObservation(ledger, fxDate(t));
  return `<dialog id="detail-dialog" aria-labelledby="detail-title"><div class="dialog-heading"><div><p class="eyebrow">SOURCE RECORD</p><h2 id="detail-title">${esc(rowLabel(t))} / ${tr(t.kind)}</h2></div><button class="button secondary" id="close-detail">${tr('close')}</button></div><p class="muted">${esc(ledger.sources.find(s => s.id === t.sourceId)?.name)} / CSV ${tr('record')} ${t.row}</p><div class="notice">${reviewIssues(ledger, t).map(issue => esc(translateIssue(locale, issue))).join(' / ') || tr('sourceReading')}<br>${esc(tr('cbNote', { value: t.cb ?? tr('unknown') }))}</div><div class="table-wrap"><table><thead><tr><th>${tr('ledgerUnitPrice')}</th><th>${tr('ledgerDailyClose')}</th></tr></thead><tbody><tr>${ledgerPriceCells(ledger, t, locale)}</tr></tbody></table></div><p>${tr('fxTitle')}: ${tr('targetDate')}: ${esc(fxDate(t) ?? tr('unknownDate'))} → ${tr('fxUsedDate')}: ${esc(fx?.date ?? tr('unknownDate'))} · ${esc(fx?.rate ?? tr('unknown'))} JPY / USD</p><p class="muted">${tr('fxHint')}${fx ? ` · FRED DEXJPUS · ${esc(fx.series.fetchedAt)}` : ''}</p>${saleForm(t)}<dl class="raw">${Object.entries(t.raw).map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value || tr('blank'))}</dd>`).join('')}</dl></dialog>`;
}
async function ingest(files: FileList | File[]) {
  if(!consentAccepted || showDisclaimer)return;
  if (busy) return;
  if (demo) { tell(() => tr('exitDemoFirst'), true); return; }
  busy = true; render();
  let next = ledger, count = 0, repeated = 0;
  try {
    for (const f of Array.from(files)) {
      if (f.size > 10 * 1024 * 1024) throw new LedgerError('fileTooLarge');
      const result = await importCsv(next, await f.text(), f.name, broker);
      next = result.ledger; result.repeated ? repeated++ : count++;
    }
    if (next.balances.length > ledger.balances.length) view = 'sources';
    resetPages(); ledger = resolveKnownSymbols(next, instruments()); if (count) dirty = true;
    notice = () => tr('importSummary', { count, repeated }); error = false;
  } catch (e) { notice = () => `${errorText(e)} ${tr('importUnchanged')}`; error = true; }
  busy = false; render();
}
async function loadPrices(file?: File) {
  if (busy) return;
  busy = true; render();
  try {
    if (file && file.size > 50 * 1024 * 1024) throw new Error('Too large');
    const response = file ? null : await fetch(`${import.meta.env.BASE_URL}prices.json`, { cache: 'no-store' });
    if (response && !response.ok) throw new Error('No cache');
    const bundle = priceBundleSchema.parse(file ? JSON.parse(await file.text()) : await response!.json());
    ledger = mergePriceSeries(ledger, bundle.series); marketManual = false; preparedPrice = null; dirty = true;
    notice = () => tr('priceLoaded', { count: bundle.series.length }); error = false;
  } catch { notice = () => tr(file ? 'priceError' : 'cacheMissing'); error = true; }
  finally { busy = false; render(); }
}
function bind() {
  document.querySelectorAll<HTMLButtonElement>('[data-page-group]').forEach(b => b.onclick = () => {
    listPages[b.dataset.pageGroup as 'stocks' | 'crypto'] = Number(b.dataset.page); render();
    document.querySelector(`[data-page-group="${b.dataset.pageGroup}"]`)?.closest('nav')?.scrollIntoView({ block: 'nearest' });
  });
  document.getElementById('show-disclaimer')?.addEventListener('click',()=>{showDisclaimer=true;consentChecked=false;render();});
  document.querySelectorAll<HTMLDetailsElement>('[data-asset-section]').forEach(d=>d.ontoggle=()=>{
    assetOpen[d.dataset.assetSection as 'stocks'|'crypto']=d.open;
    try {localStorage.setItem('annum-aequitas.sections',JSON.stringify(assetOpen));}catch { /* Optional UI preference. */ }
  });
  document.querySelectorAll<HTMLFormElement>('[data-crypto-cost]').forEach(form=>form.onsubmit=e=>{
    e.preventDefault();
    try {const value=numberValue(String(new FormData(form).get('amount')));ledger=setCryptoCost(ledger,form.dataset.cryptoCost!,value);const id=form.dataset.cryptoCost!,scroll=window.scrollY;changed();document.querySelectorAll<HTMLDetailsElement>('[data-crypto-detail]').forEach(d=>{if(d.dataset.cryptoDetail===id)d.open=true;});window.scrollTo(0,scroll);}catch{tell(()=>tr('cryptoCostError'),true);}
  });

  document.querySelector<HTMLSelectElement>('#broker')!.onchange = e => { broker = (e.target as HTMLSelectElement).value as typeof broker; }; 
  document.querySelectorAll<HTMLButtonElement>('[data-market-tab]').forEach(b => b.onclick = () => { marketTab = b.dataset.marketTab!; render(); });
  const currency = document.querySelector<HTMLSelectElement>('#display-currency');
  if (currency) currency.onchange = () => { displayCurrency = currency.value === 'JPY' ? 'JPY' : 'USD'; render(); };
  document.getElementById('fx-local')?.addEventListener('click', () => { void loadFx(); });
  for (const [id, csv] of [['fx-csv', true], ['fx-json', false]] as const) document.getElementById(id)?.addEventListener('change', e => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) void loadFx(file, csv); });
  document.getElementById('fx-export')?.addEventListener('click', () => download('annum-aequitas-fx.json', JSON.stringify({ format: 'annum-aequitas-fx', version: 1, series: ledger.fxRates }, null, 2), 'application/json'));

  const sale = document.querySelector<HTMLFormElement>('#sale-valuation');
  if (sale) sale.onsubmit = e => { e.preventDefault(); try {
    const data = Object.fromEntries(new FormData(sale)) as Record<string, string>;
    const history = data.method === 'history' ? data.history.split(/\r?\n/).filter(line=>line.trim()).map(line=>{
      const cells=line.split(',').map(s=>s.trim()); if(cells.length!==3) throw new Error('history');
      return {date:cells[0],quantity:numberValue(cells[1])!,cost:numberValue(cells[2])!};
    }) : [];
    ledger = setCostInput(ledger,detailId!,{proceeds:numberValue(data.proceeds)!,method:data.method as 'total'|'average'|'history',currency:data.currency as 'USD'|'JPY',amount:data.method==='history'?null:numberValue(data.amount),history,note:data.note});
    dirty = true; tell(() => tr('saleSaved'));
  } catch { tell(() => tr('saleInvalid'), true); } };
  document.getElementById('clear-sale')?.addEventListener('click', () => { ledger.saleValuations = ledger.saleValuations.filter(v => v.transactionId !== detailId); ledger.costInputs = ledger.costInputs.filter(v => v.transactionId !== detailId); changed(); });
  document.querySelectorAll<HTMLFormElement>('[data-market-mapping]').forEach(form => form.onsubmit = e => {
    e.preventDefault();
    const data = new FormData(form);
    const key = marketMappingKeys()[Number(form.dataset.marketMapping)];
    try {
      const instrument = instrumentSchema.parse({ symbol: String(data.get('symbol')).trim().toUpperCase(), name: String(data.get('name')).trim(), exchange: data.get('exchange') });
      if (!key) return;
      ledger.mappings = [...ledger.mappings.filter(m => m.key !== key), { key, instrument }];
      marketManual = false; preparedPrice = null; changed();
    } catch { tell(() => tr('priceError'), true); }
  });
  const priceRequest = document.querySelector<HTMLFormElement>('#price-request');
  const captureMarket = () => {
    marketDraft = { instrument: document.querySelector<HTMLSelectElement>('#price-instrument')!.value, providerSymbol: document.querySelector<HTMLInputElement>('#provider-symbol')!.value.trim().toLowerCase(), start: document.querySelector<HTMLInputElement>('#price-start')!.value, end: document.querySelector<HTMLInputElement>('#price-end')!.value };
  };
  if (priceRequest) {
    priceRequest.oninput = () => { marketManual = true; captureMarket(); preparedPrice = null; document.getElementById('prepared-price')?.remove(); };
    document.querySelector<HTMLSelectElement>('#price-instrument')!.onchange = () => {
      document.querySelector<HTMLInputElement>('#provider-symbol')!.value = `${marketInstruments()[Number(document.querySelector<HTMLSelectElement>('#price-instrument')!.value)].symbol.toLowerCase()}.us`;
      captureMarket(); marketManual = false; preparedPrice = null; render();
    };
    priceRequest.onsubmit = e => {
      e.preventDefault(); captureMarket();
      try {
        stooqUrl(marketDraft.providerSymbol, marketDraft.start, marketDraft.end);
        const item = marketInstruments()[Number(marketDraft.instrument)];
        preparedPrice = { symbol: item.symbol, exchange: item.exchange, providerSymbol: marketDraft.providerSymbol, start: marketDraft.start, end: marketDraft.end }; render();
      } catch { tell(() => tr('priceError'), true); }
    };
  }
  document.getElementById('auto-price-range')?.addEventListener('click', () => { marketManual = false; preparedPrice = null; render(); });
  document.getElementById('export-prices')?.addEventListener('click', () => download('annum-aequitas-prices.json', JSON.stringify({ format: 'annum-aequitas-prices', version: 1, series: ledger.marketPrices }, null, 2), 'application/json'));
  document.getElementById('refresh-prices')?.addEventListener('click', () => { void loadPrices(); });
  document.getElementById('price-json')?.addEventListener('change', e => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) void loadPrices(file); });
  document.getElementById('price-csv')?.addEventListener('change', e => { void (async () => {
    const file = (e.target as HTMLInputElement).files?.[0];
    captureMarket();
    const item = marketInstruments()[Number(marketDraft.instrument)];
    const request = item ? { symbol: item.symbol, exchange: item.exchange, providerSymbol: marketDraft.providerSymbol, start: marketDraft.start, end: marketDraft.end } : null;
    if (!file || !request || busy) return;
    busy = true; render();
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Too large');
      const csv = await file.text();
      const bars = parsePriceCsv(csv);
      const series = await makePriceSeries(csv, { ...request, start: bars[0].date, end: bars.at(-1)!.date });
      ledger = mergePriceSeries(ledger, [series]); marketManual = false; preparedPrice = null; dirty = true; notice = () => tr('priceLoaded', { count: 1 }); error = false;
    } catch { notice = () => tr('priceError'); error = true; }
    finally { busy = false; render(); }
  })(); });
  document.querySelectorAll<HTMLButtonElement>('[data-price-row]').forEach(b => b.onclick = () => { const scroll=window.scrollY; ledger = choosePrice(ledger, b.dataset.priceRow!, Number(b.dataset.priceIndex)); dirty = true; tell(() => tr('priceSelectedNotice')); window.scrollTo(0,scroll); });
  document.querySelectorAll<HTMLButtonElement>('[data-clear-price]').forEach(b => b.onclick = () => { ledger.priceChoices = ledger.priceChoices.filter(p => p.transactionId !== b.dataset.clearPrice); changed(); });

  document.querySelector<HTMLSelectElement>('#locale')!.onchange = event => {
    // A locale change must not discard unsubmitted coverage, opening, or search inputs.
    const drafts = [...app.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('main input, main textarea, main select')].map(input => input.value);
    const scroll = window.scrollY;
    locale = parseLocale((event.target as HTMLSelectElement).value);
    try { localStorage.setItem('annum-aequitas.locale', locale); } catch { /* Preference stays in memory. */ }
    render();
    app.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('main input, main textarea, main select').forEach((input, index) => {
      input.value = drafts[index] ?? input.value;
      if (input.dataset.lookup !== undefined) input.dispatchEvent(new Event('input'));
    });
    window.scrollTo(0, scroll);
    document.getElementById('locale')?.focus();
  };
  const on = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('click', fn);
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view!; resetPages(); render(); });
  document.querySelectorAll<HTMLButtonElement>('[data-year]').forEach(b => b.onclick = () => { year = b.dataset.year!; resetPages(); render(); });
  on('upload', () => document.getElementById('csv-file')!.click());
  on('empty-upload', () => document.getElementById('csv-file')!.click());
  on('restore', () => document.getElementById('json-file')!.click());
  on('save', () => { download(`annum-aequitas${demo ? '-demo' : ''}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(ledger, null, 2), 'application/json'); dirty = false; tell(() => tr('savedNotice')); });
  on('download-demo', () => download('fictional-merrill.csv', demoCsv, 'text/csv'));
  on('demo', () => { void (async () => { if (ledger.sources.length || ledger.openings.length) return; ledger = (await importCsv(emptyLedger(), demoCsv, 'fictional-merrill.csv')).ledger; ledger.mode = 'demo'; demo = true; dirty = true; tell(() => tr('demoNotice')); })(); });
  on('leave-demo', () => { if (dirty && !confirm(tr('discardDemo'))) return; ledger = emptyLedger(); demo = false; dirty = false; notice = null; render(); });
  document.querySelector<HTMLInputElement>('#csv-file')!.onchange = e => { const files = (e.target as HTMLInputElement).files; if (files) void ingest(files); };
  document.querySelector<HTMLInputElement>('#json-file')!.onchange = e => { void (async () => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0]; if (!file) return;
    input.value = ''; // Re-selecting the same file after cancellation must trigger change.
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error(tr('saveTooLarge'));
      const next = readLedger(await file.text());
      if (dirty && !confirm(tr('replaceLedger'))) return;
      marketManual = false; preparedPrice = null; marketDraft = { instrument: '0', providerSymbol: '', start: '', end: '' }; resetPages(); ledger = next; demo = next.mode === 'demo'; dirty = false; year = 'all'; query = ''; tell(() => tr('openedNotice'));
    } catch { tell(() => tr('restoreError'), true); }
  })(); };
  const filter = document.querySelector<HTMLInputElement>('#filter');
  if (filter) filter.oninput = () => { const pos = filter.selectionStart; query = filter.value; listPages.stocks = 1; render(); const next = document.querySelector<HTMLInputElement>('#filter')!; next.focus(); next.setSelectionRange(pos, pos); };
  document.querySelectorAll<HTMLButtonElement>('[data-detail]').forEach(b => b.onclick = () => { detailId = b.dataset.detail!; render(); });
  on('close-detail', () => { detailId = null; render(); });
  const dialog = document.querySelector<HTMLDialogElement>('#detail-dialog');
  if (dialog) { dialog.showModal(); dialog.oncancel = e => { e.preventDefault(); detailId = null; render(); }; }
  for (const [selector, fn] of [
    ['keep', (t: Transaction) => { t.duplicateReviewed = true; }],
    ['exclude', (t: Transaction) => { t.excluded = true; }],
    ['include', (t: Transaction) => { t.excluded = false; t.duplicateReviewed = false; }],
  ] as const) document.querySelectorAll<HTMLButtonElement>(`[data-${selector}]`).forEach(b => b.onclick = () => { fn(ledger.transactions.find(t => t.id === b.dataset[selector])!); changed(); });
  const keys = [...new Set([...activeRows().map(t => t.instrumentKey), ...ledger.openings.map(o => o.instrumentKey), ...ledger.balances.filter(b => b.kind === 'holdings' && b.symbol).map(b => `symbol:${b.symbol.toUpperCase()}`)])];
  document.querySelectorAll<HTMLInputElement>('[data-lookup]').forEach(input => {
    input.oninput = () => {
      const index = Number(input.dataset.lookup); const results = document.getElementById(`results-${index}`)!;
      const matches = searchInstruments(instruments(), input.value);
      results.innerHTML = matches.map((m, n) => `<button type="button" data-candidate="${n}"><strong>${esc(m.name)}</strong><span>${esc(m.symbol)} <small>${m.exchange}</small></span></button>`).join('') || (input.value.trim() ? `<p class="muted">${tr('noCandidates')}</p>` : '');
      results.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => { const key = keys[index]; ledger.mappings = [...ledger.mappings.filter(m => m.key !== key), { key, instrument: matches[Number(b.dataset.candidate)] }]; changed(); });
    };
    input.onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); document.querySelector<HTMLButtonElement>(`#results-${input.dataset.lookup} button`)?.focus(); } if (e.key === 'Escape') document.getElementById(`results-${input.dataset.lookup}`)!.innerHTML = ''; };
  });
  document.querySelectorAll<HTMLFormElement>('[data-coverage]').forEach(form => form.onsubmit = e => { e.preventDefault(); try { const data = Object.fromEntries(new FormData(form)); ledger = setCoverage(ledger, ledger.sources[Number(form.dataset.coverage)].id, data); dirty = true; tell(() => tr('coverageSaved')); } catch { tell(() => tr('coverageError'), true); } });
  const opening = document.querySelector<HTMLFormElement>('#opening');
  if (opening) opening.onsubmit = e => { e.preventDefault(); try {
    const data = Object.fromEntries(new FormData(opening)) as Record<string, string>;
    ledger = addOpening(ledger, { id: crypto.randomUUID(), instrumentKey: `symbol:${data.symbol.trim().toUpperCase()}`, date: data.date, quantity: numberValue(data.quantity), cost: numberValue(data.cost), currency: data.currency.toUpperCase(), evidence: data.evidence.trim() });
    dirty = true; tell(() => tr('openingSaved'));
  } catch { tell(() => tr('openingError'), true); } };
  document.querySelectorAll<HTMLButtonElement>('[data-remove-opening]').forEach(b => b.onclick = () => { if (!confirm(tr('removeOpening'))) return; ledger.openings = ledger.openings.filter(o => o.id !== b.dataset.removeOpening); changed(); });
}
window.addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });
document.addEventListener('dragover', e => { e.preventDefault(); });
document.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer?.files.length) void ingest(e.dataTransfer.files); });
render();
void (async () => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}instruments.json`);
    if (!response.ok) throw new Error('No catalog');
    const data = catalogSchema.parse(await response.json()); catalog = data.instruments;
    catalogState = 'ready'; catalogDate = data.fetchedAt.slice(0, 10);
  } catch { catalogState = 'unavailable'; }
  if (!demo) {
    const resolved = resolveKnownSymbols(ledger, catalog);
    if (resolved.mappings.length !== ledger.mappings.length) { ledger = resolved; dirty = true; }
  }
  render();
})();
