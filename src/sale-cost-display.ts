import type { Ledger, Transaction } from './ledger.ts';
import { saleValuation } from './annual.ts';
import { costInput, saleGain } from './sale-cost.ts';
import { translate } from './i18n.ts';
import type { Locale, MessageKey } from './i18n.ts';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export function saleCostDisplay(ledger:Ledger,t:Transaction,locale:Locale,currency:'USD'|'JPY') {
 const tr=(k:MessageKey)=>translate(locale,k), input=costInput(ledger,t), old=saleValuation(ledger,t), g=saleGain(ledger,t,currency);
 return `<section class="source"><h3 class="${g.reference?'reference-loss':''}">${tr(g.reference?'saleReference':'saleCalculated')} (${currency}): ${esc(g.value??tr('unknown'))}</h3><p>${tr(g.reason==='activity'?'saleAllocationHint':g.reason==='baseline'?'saleBaselineHint':'saleManualHint')}</p><dl class="raw"><dt>${tr('saleFormula')}</dt><dd>${esc(g.proceeds??tr('unknown'))} − ${esc(g.cost??tr('unknown'))} = ${esc(g.value??tr('unknown'))} ${currency}</dd>${g.reference?`<dt>${tr('saleBasisDate')}</dt><dd>${esc(g.basisDate??tr('unknownDate'))}</dd><dt>${tr('ledgerUnitPrice')}</dt><dd>${esc(g.unitPrice??tr('unknown'))} USD · ${esc(g.priceDate??tr('unknownDate'))}</dd><dt>${tr('fxTitle')}</dt><dd>${esc(g.fxRate??'—')} · ${esc(g.fxDate??'—')}</dd>`:''}</dl>
 ${g.allocation?`<details><summary>${tr('saleAllocation')}</summary><p>${tr('saleAverage')}: ${esc(g.allocation.average ?? tr('unknown'))} ${currency} · ${tr('saleAvailable')}: ${esc(g.allocation.available)}</p>${g.allocation.used.map(a=>`<p><button class="text-button" data-detail="${esc(a.id)}">${esc(ledger.transactions.find(t=>t.id===a.id)?.tradeDate)} · ${esc(a.quantity)} × ${esc(a.unit)} ${currency}</button></p>`).join('')}<p>${tr('saleShortage')}: ${esc(g.allocation.remaining??tr('unknown'))}</p></details>`:''}
 <form id="sale-valuation" class="form-grid"><label>${tr('saleNetProceeds')}<input name="proceeds" inputmode="decimal" value="${esc(input?.proceeds??old?.proceeds??(t.amount?.startsWith('-')?'':t.amount))}" required></label>
 <label>${tr('saleInputMethod')}<select name="method">${(['total','average','history'] as const).map(m=>`<option value="${m}" ${input?.method===m?'selected':''}>${tr(`saleMethod.${m}`)}</option>`).join('')}</select></label>
 <label>${tr('costCurrency')}<select name="currency"><option value="USD" ${input?.currency==='USD'?'selected':''}>USD</option><option value="JPY" ${input?.currency==='JPY'||(!input&&currency==='JPY')?'selected':''}>JPY</option></select></label>
 <label>${tr('saleInputAmount')}<input name="amount" inputmode="decimal" value="${esc(input?.amount??(currency==='JPY'?old?.costJpy:old?.cost))}"></label>
 <label class="wide">${tr('saleHistory')}<textarea name="history" rows="4" placeholder="2023-01-10, 10, 450">${esc(input?.history.map(h=>`${h.date}, ${h.quantity}, ${h.cost}`).join('\n')??'')}</textarea></label>
 <label class="wide">${tr('saleNoteOptional')}<input name="note" maxlength="2000" value="${esc(input?.note??old?.evidence)}"></label><p class="wide muted">${tr('saleManualHint')} ${tr('saleHistoryHint')}</p><button class="button primary" type="submit">${tr('saleSave')}</button>${input||old?`<button class="button secondary" id="clear-sale" type="button">${tr('saleClear')}</button>`:''}</form></section>`;
}
