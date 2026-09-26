import type { Ledger } from './ledger.ts';
import { annualSummary, sumDecimals } from './annual.ts';
import { portfolioAt, portfolioValue } from './portfolio.ts';
import { duplicateIds } from './ledger.ts';
import { reviewIssues } from './market.ts';
import { cryptoDuplicateIds } from './brokers/gmo.ts';
import { cryptoEnteredCost, cryptoGainYears } from './crypto-cost.ts';
import { translate } from './i18n.ts';
import type { Locale } from './i18n.ts';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export function assetSection(ledger:Ledger,kind:'stocks'|'crypto',year:string,locale:Locale,currency:'USD'|'JPY',open:boolean,content:string) {
 const present=kind==='crypto'?ledger.sources.some(s=>s.broker==='gmo'):ledger.sources.some(s=>s.broker==='merrill')||ledger.openings.length>0;
 if(!present)return '';
 const tr=(key:Parameters<typeof translate>[1])=>translate(locale,key);
 const stats:string[]=[];
 let issues=0;
 if(kind==='crypto') {
  const dupes=cryptoDuplicateIds(ledger.cryptoTransactions);
  const rows=ledger.cryptoTransactions.filter(r=>year==='all'||(r.date?.slice(0,4)??'unknown')===year);
  issues=rows.filter(r=>dupes.has(r.id)||r.issues.some(i=>i!=='out-of-scope'&&!(i==='acquisition-history'&&cryptoEnteredCost(ledger,r)))).length;
  for(const g of cryptoGainYears(ledger,year))stats.push(`<span class="${g.color}">${esc(g.year)} · ${tr('cryptoGainTitle')}: ${esc(g.jpy??tr('unknown'))} JPY${g.missing?' · '+tr('yearPartial'):''}</span>`);
  if(!stats.length)stats.push(`<span>${tr('cryptoGainTitle')}: —</span>`);
 } else {
  const dupes=duplicateIds(ledger),rows=ledger.transactions.filter(r=>!r.excluded&&(year==='all'||(r.tradeDate?.slice(0,4)??'unknown')===year));
  issues=rows.filter(r=>dupes.has(r.id)||reviewIssues(ledger,r).length||!ledger.mappings.some(m=>m.key===r.instrumentKey)).length;
  const annual=annualSummary(ledger,year,currency);
  for(const [label,value] of [['yearVest',annual.vest],['yearGain',annual.gain],['saleReference',annual.referenceGain]] as const)if(value.count)stats.push(`<span class="${label==='saleReference'?'reference-loss':''}">${tr(label)}: ${esc(value.value??tr('unknown'))} ${currency}${value.missing?' · '+tr('yearPartial'):''}</span>`);
  const today=new Date().toISOString().slice(0,10);
  const holdings=portfolioAt(ledger,year==='all'?today.slice(0,4):year,today).filter(r=>r.anchor?.kind==='holdings');
  const values=holdings.map(r=>portfolioValue(ledger,r.value,r.target,currency).value);
  if(values.length)stats.push(`<span>${tr('stockValuation')}: ${values.every(v=>v!==null)?esc(sumDecimals(values as string[])):tr('unknown')} ${currency}</span>`);
 }
 return `<details class="asset-section" data-asset-section="${kind}" ${open?'open':''}><summary><strong>${tr(kind==='stocks'?'stockSection':'cryptoTitle')}</strong><span class="asset-section-stats">${stats.join('')}<span>${tr('needsReview')}: ${issues}</span></span></summary><div class="asset-section-body">${content}</div></details>`;
}
