import { pageWindow, pagination } from './pagination.ts';
import { cryptoEnteredCost, cryptoGain, cryptoGainYears } from './crypto-cost.ts';
import type { Ledger } from './ledger.ts';
import { cryptoDuplicateIds } from './brokers/gmo.ts';
import { sumDecimals } from './annual.ts';
import { translate } from './i18n.ts';
import type { Locale } from './i18n.ts';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export function cryptoDisplay(ledger:Ledger,year:string,locale:Locale,page=1) {
 if(!ledger.sources.some(s=>s.broker==='gmo')) return '';
 const tr=(key:Parameters<typeof translate>[1])=>translate(locale,key);
 const rows=ledger.cryptoTransactions.filter(t=>year==='all'||(t.date?.slice(0,4)??'unknown')===year);
 const currentPage=pageWindow(rows,page);
 const dupes=cryptoDuplicateIds(ledger.cryptoTransactions);
 const good=rows.filter(r=>!dupes.has(r.id) && r.issues.every(i=>i==='acquisition-history'));
 const sum=(values:(string|null)[])=>values.length && values.every(v=>v!==null)?sumDecimals(values as string[]):'—';
 const assets=[...new Set(rows.map(r=>r.asset))];
 const gains=cryptoGainYears(ledger,year);
 const summary=gains.map(g=>`<article class="${g.color}"><h3>${esc(g.year)} · ${tr('cryptoGainTitle')}</h3><strong>${esc(g.jpy??tr('unknown'))} JPY</strong>${g.usd!==null?`<p>${esc(g.usd)} USD · ${tr('cryptoThreshold')}</p>`:''}${g.provisional?`<p>${tr('cryptoFivePercent')}</p>`:''}${g.missing?`<p>${tr('yearPartial')}</p>`:''}${g.fxMissing?`<p class="amber">${tr('cryptoFxMissing')}</p>`:''}</article>`).join('');
 const costCell=(r:typeof rows[number])=>{
  if(!['buy','deposit','sell'].includes(r.kind))return '<td>—</td>';
  const entered=cryptoEnteredCost(ledger,r),gain=r.kind==='sell'?cryptoGain(ledger,r):null;
  const cost=gain?gain.cost:entered?.amountJpy??(r.kind==='buy'&&r.cashJpy?.startsWith('-')?r.cashJpy.slice(1):null);
  const label=gain?gain.provisional?'cryptoFivePercent':gain.method==='activity'?'cryptoActivityCost':'cryptoManual':entered?'cryptoManual':cost!==null?'cryptoCsvCost':'cryptoCostUnknown';
  return `<td class="numeric ${cost===null||gain?.provisional?'amber':''}"><strong>${esc(cost??tr('unknown'))}${cost!==null?' JPY':''}</strong><small>${tr(label)}</small><small>${tr(r.kind==='sell'?'cryptoSoldCostScope':'cryptoReceivedCostScope')}</small></td>`;
 };
 const costForm=(r:typeof rows[number])=>{
  if(r.kind==='deposit'||r.kind==='buy') {
   const entered=cryptoEnteredCost(ledger,r);
   const csvCost=r.kind==='buy'&&r.cashJpy?.startsWith('-')?r.cashJpy.slice(1):null;
   return `${csvCost!==null?`<p>${tr('cryptoBuyCost')}: <strong>${esc(csvCost)} JPY</strong></p>`:''}<form data-crypto-cost="${esc(r.id)}" class="form-grid"><label>${tr('cryptoAcquisitionTotal')}<input name="amount" inputmode="decimal" value="${esc(entered?.amountJpy??'')}" placeholder="${csvCost!==null?tr('cryptoUseCsv'):tr('unknown')}"></label><button class="button secondary">${tr('save')}</button></form><p>${tr('cryptoAcquisitionHelp')}</p>`;
  }
  if(r.kind!=='sell')return '';
  const g=cryptoGain(ledger,r),entered=ledger.cryptoCosts.find(v=>v.transactionId===r.id);
  return `<div class="${g.provisional?'amber':''}"><p>${tr('cryptoGainTitle')}: ${esc(g.gain??tr('unknown'))} JPY</p><p>${tr('cryptoCostTotal')}: ${esc(g.cost??tr('unknown'))} JPY · ${tr(g.provisional?'cryptoFivePercent':g.method==='activity'?'cryptoActivityCost':'cryptoManual')}</p><p>${tr('fxUsedDate')}: ${esc(g.fx?.date??tr('unknownDate'))} · ${esc(g.fx?.rate??'—')} JPY / USD</p></div><form data-crypto-cost="${esc(r.id)}" class="form-grid"><label>${tr('cryptoCostTotal')}<input name="amount" inputmode="decimal" value="${esc(entered?.amountJpy??'')}" placeholder="${tr('cryptoAutoFive')}"></label><button class="button secondary">${tr('save')}</button></form><p>${tr('cryptoCostHelp')}</p>`;
 };

 return `<section class="panel"><div class="panel-title"><div><h2>${tr('cryptoTitle')} · GMO Coin</h2><p>${tr('cryptoHint')}</p></div><span class="pill">JPY</span></div><div class="inset"><div class="annual-cards">${summary}</div><p>${tr('cryptoScope')}</p><p>${tr('cryptoDuplicates')}</p><table><thead><tr><th>${tr('instrument')}</th><th>${tr('cryptoFlow')}</th><th>${tr('cryptoCash')}</th></tr></thead><tbody>${assets.map(asset=>{const items=good.filter(r=>r.asset===asset);return `<tr><td>${esc(asset)}</td><td>${asset==='JPY'?'—':sum(items.map(r=>r.quantity))}</td><td>${sum(items.filter(r=>!['deposit','withdrawal'].includes(r.kind)).map(r=>r.cashJpy))}</td></tr>`;}).join('')}</tbody></table></div>${pagination(currentPage,'crypto',locale)}<div class="table-wrap crypto-transactions"><table><thead><tr><th>${tr('tradeDate')}</th><th>${tr('instrument')}</th><th>${tr('kind')}</th><th>${tr('quantity')}</th><th>${tr('cryptoCash')}</th><th>${tr('cryptoCostColumn')}</th><th>${tr('detail')}</th></tr></thead><tbody>${currentPage.rows.map(r=>`<tr><td>${esc(r.timestamp)}</td><td>${esc(r.asset)}</td><td>${tr(`cryptoKind.${r.kind}`)}</td><td>${esc(r.quantity??'—')}</td><td>${esc(r.cashJpy??'—')}</td>${costCell(r)}<td><details data-crypto-detail="${esc(r.id)}"><summary>${dupes.has(r.id)?tr('duplicates'):r.kind==='swap'?tr('cryptoSwapExcluded'):['sell','deposit','buy'].includes(r.kind)?tr('cryptoEditCost'):r.issues.length?tr('needsConfirmation'):tr('detail')}</summary><p>${esc(ledger.sources.find(s=>s.id===r.sourceId)?.name??'')} · ${r.row}</p>${r.issues.map(i=>`<p>${i==='acquisition-history'?tr(cryptoEnteredCost(ledger,r)?'cryptoManual':'cryptoCostUnknown'):i==='out-of-scope'?tr('cryptoSwapExcluded'):i==='unsupported'?tr('cryptoUnsupported'):esc(i)}</p>`).join('')}${costForm(r)}<dl class="raw">${Object.entries(r.raw).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v||'—')}</dd>`).join('')}</dl></details></td></tr>`).join('')}</tbody></table></div></section>`;
}
