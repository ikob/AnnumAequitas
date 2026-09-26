import { inferredOpenings } from './portfolio.ts';
import { z } from 'zod';
import type { Ledger, Transaction } from './ledger.ts';
import { dateValue } from './values.ts';
import { duplicateIds } from './ledger.ts';
import { estimatedValue, instrumentId, mergedPriceCache, priceCandidates, reviewedPrice } from './market.ts';
import { fxObservation, toJpy } from './fx.ts';
import { sumDecimals, saleValuation } from './annual.ts';
const positive = z.string().regex(/^\d+(\.\d+)?$/);
const date = z.string().refine(v => dateValue(v) === v);
export const costInputSchema = z.object({
  transactionId: z.string(), fingerprint: z.string(), instrumentId: z.string().nullable(),
  proceeds: positive, method: z.enum(['total','average','history']), currency: z.enum(['USD','JPY']),
  amount: positive.nullable(), history: z.array(z.object({ date, quantity: positive.refine(v => /[1-9]/.test(v)), cost: positive }).strict()).max(1000),
  note: z.string().max(2000), recordedAt: z.string().datetime(),
}).strict();
export type CostInput = z.infer<typeof costInputSchema>;
export function costInput(ledger: Ledger, t: Transaction) {
  return ledger.costInputs.find(v => v.transactionId === t.id && v.fingerprint === t.fingerprint && v.instrumentId === instrumentId(ledger,t));
}
// Proportional cost rounded to 12 decimal places, with integer arithmetic.
function proportion(cost: string, sold: string, held: string): string {
  const scaled = (s: string) => { const [a,b='']=s.split('.'); return { n:BigInt(a+b), scale:b.length }; };
  const c=scaled(cost), q=scaled(sold), h=scaled(held);
  const numerator=c.n*q.n*10n**BigInt(h.scale+12), denominator=h.n*10n**BigInt(c.scale+q.scale);
  const n=(numerator+denominator/2n)/denominator;
  const s=n.toString().padStart(13,'0'); return (s.slice(0,-12)+'.'+s.slice(-12)).replace(/\.?0+$/,'');
}
export function setCostInput(ledger: Ledger, transactionId: string, input: Omit<CostInput,'transactionId'|'fingerprint'|'instrumentId'|'recordedAt'>): Ledger {
  const t=ledger.transactions.find(t=>t.id===transactionId && t.kind==='sale' && !t.excluded);
  if(!t) throw new Error('Missing sale');
  const v=costInputSchema.parse({...input,transactionId,fingerprint:t.fingerprint,instrumentId:instrumentId(ledger,t),recordedAt:new Date().toISOString()});
  validateInput(v,t);
  return {...ledger,costInputs:[...ledger.costInputs.filter(v=>v.transactionId!==transactionId),v]};
}
export function validateInput(v: CostInput, t: Transaction) {
  if(v.method==='history') {
    if(!v.history.length || !t.tradeDate || v.history.some(h=>h.date>t.tradeDate!) || !t.quantity || sumDecimals([sumDecimals(v.history.map(h=>h.quantity)), '-'+t.quantity.replace(/^-/,'')]).startsWith('-')) throw new Error('Invalid history');
  } else if(v.amount===null || (v.method==='average' && !t.quantity)) throw new Error('Missing cost');
}
function activityCost(ledger: Ledger, sale: Transaction, currency: 'USD'|'JPY', openingUnit: string|null) {
  const account=sale.raw['Account #'].trim(), id=instrumentId(ledger,sale), dupes=duplicateIds(ledger);
  const same=(t:Transaction)=>id ? instrumentId(ledger,t)===id : t.instrumentKey===sale.instrumentKey;
  const rows=ledger.transactions.filter(t=>!t.excluded && t.raw['Account #'].trim()===account && same(t) && t.tradeDate && sale.tradeDate && t.tradeDate<=sale.tradeDate)
    .sort((a,b)=>a.tradeDate!.localeCompare(b.tradeDate!) || (a.kind===b.kind ? a.id.localeCompare(b.id) : a.kind==='vest'?-1:b.kind==='vest'?1:a.id.localeCompare(b.id)));
  let quantity='0', totalCost='0', estimated=false;
  const used:{id:string;quantity:string;unit:string}[]=[];
  let uncertain=ledger.transactions.some(t=>!t.excluded && t.raw['Account #'].trim()===account && same(t) && !t.tradeDate && ['vest','sale','other'].includes(t.kind));
  for(const t of rows) {
    if(dupes.has(t.id)) {uncertain=true;continue;}
    if(t.kind==='vest') {
      const unit=reviewedPrice(ledger,t)?.unitPrice ?? priceCandidates(ledger,t).find(p=>p.origin==='daily-close')?.unitPrice ?? priceCandidates(ledger,t)[0]?.unitPrice;
      const value=unit?(currency==='JPY'?toJpy(ledger,t,unit):unit):openingUnit;
      if(!unit && value!==null) estimated=true;
      if(t.quantity && !t.quantity.startsWith('-') && value!==null) {
        quantity=sumDecimals([quantity,t.quantity]);totalCost=sumDecimals([totalCost,estimatedValue(t.quantity,value)!]);
        used.push({id:t.id,quantity:t.quantity,unit:value});
      } else uncertain=true;
    } else if(t.kind==='other') uncertain=true;
    else if(t.kind==='sale') {
      if(!t.quantity) {uncertain=true;continue;}
      const sold=t.quantity.replace(/^-/,'');
      const take=sumDecimals([quantity,'-'+sold]).startsWith('-')?quantity:sold;
      const cost=/[1-9]/.test(quantity)?proportion(totalCost,take,quantity):'0';
      const remaining=sumDecimals([sold,'-'+take]);
      const average=/[1-9]/.test(quantity)?proportion(totalCost,'1',quantity):null;
      if(t.id===sale.id) return {cost,remaining,used,uncertain,estimated,average,available:quantity};
      quantity=sumDecimals([quantity,'-'+take]);totalCost=sumDecimals([totalCost,'-'+cost]);
      if(!/[1-9]/.test(quantity)) {totalCost='0';used.length=0;estimated=false;}
    }
  }
  return {cost:'0',remaining:sale.quantity?.replace(/^-/,'')??null,used:[],uncertain:true,estimated:false,average:null,available:'0'};
}
export function saleGain(ledger: Ledger, t: Transaction, currency: 'USD'|'JPY') {
  const entered=costInput(ledger,t), legacy=saleValuation(ledger,t);
  const sold=t.quantity?.replace(/^-/,'') ?? null;
  const proceedsUsd=entered?.proceeds ?? legacy?.proceeds ?? (t.amount !== null && !t.amount.startsWith('-') ? t.amount : null);
  const proceeds=currency==='JPY'?toJpy(ledger,t,proceedsUsd):proceedsUsd;
  let cost: string|null=null, reference=false, basisDate: string|null=null, priceDate: string|null=null, unitPrice: string|null=null, fxDate: string|null=null, fxRate: string|null=null;
  let reason='manual';
  let allocation: ReturnType<typeof activityCost> | null=null;
  if(entered) {
    if(entered.currency===currency) {
      cost=entered.method==='total'?entered.amount:entered.method==='average'&&sold?estimatedValue(sold,entered.amount!):sold?proportion(sumDecimals(entered.history.map(h=>h.cost)),sold,sumDecimals(entered.history.map(h=>h.quantity))):null;
    } else if(entered.currency==='USD' && currency==='JPY' && entered.method==='history' && sold) {
      const values=entered.history.map(h=>{const fx=fxObservation(ledger,h.date);return fx?.rate?estimatedValue(h.cost,fx.rate):null;});
      if(values.every(v=>v!==null)) cost=proportion(sumDecimals(values as string[]),sold,sumDecimals(entered.history.map(h=>h.quantity)));
    }
  } else if(legacy) cost=currency==='JPY'?legacy.costJpy:legacy.cost;
  else {
    const account=t.raw['Account #'].trim();
    const opening=ledger.openings.filter(o=>o.instrumentKey===t.instrumentKey && t.tradeDate && o.date<=t.tradeDate).sort((a,b)=>a.date.localeCompare(b.date))[0];
    const dates=ledger.transactions.filter(r=>!r.excluded && r.raw['Account #'].trim()===account).flatMap(r=>r.tradeDate?[r.tradeDate]:[]);
    const coverage=ledger.sources.filter(s=>ledger.transactions.some(r=>r.sourceId===s.id && r.raw['Account #'].trim()===account)).flatMap(s=>s.coverage?[s.coverage.start]:[]);
    const inferred=inferredOpenings(ledger).find(r=>r.account===account && (r.asset.toUpperCase()===t.raw['Symbol/CUSIP #'].trim().toUpperCase() || r.anchor?.raw['CUSIP #']?.trim().toUpperCase()===t.raw['Symbol/CUSIP #'].trim().toUpperCase()));
    basisDate=opening?.date ?? inferred?.target ?? [...dates,...coverage].sort()[0]??null;
    const id=instrumentId(ledger,t);
    if(basisDate && t.tradeDate && basisDate<=t.tradeDate && id) {
      const quote=mergedPriceCache(ledger.marketPrices.filter(s=>`${s.exchange}:${s.symbol}`===id)).filter(p=>p.bar.date<=basisDate!).sort((a,b)=>b.bar.date.localeCompare(a.bar.date)||b.series.fetchedAt.localeCompare(a.series.fetchedAt))[0];
      unitPrice=quote?.bar.close??null;priceDate=quote?.bar.date??null;
      if(currency==='JPY') {const fx=fxObservation(ledger,basisDate);fxDate=fx?.date??null;fxRate=fx?.rate??null;}
    }
    const openingUnit=currency==='USD'?unitPrice:unitPrice!==null&&fxRate!==null?estimatedValue(unitPrice,fxRate):null;
    allocation=activityCost(ledger,t,currency,openingUnit);
    reference=allocation.remaining===null || /[1-9]/.test(allocation.remaining) || allocation.uncertain || allocation.estimated;
    reason=reference?'baseline':'activity';
    cost=allocation.remaining==='0'?'0':allocation.remaining!==null&&openingUnit!==null?estimatedValue(allocation.remaining,openingUnit):null;
  }
  if(allocation) {
    if(!reference) cost=allocation.cost;
    else if(cost!==null) cost=sumDecimals([allocation.cost,cost]);
    if(allocation.uncertain) cost=null;
  }
  const blocked=t.excluded || duplicateIds(ledger).has(t.id);
  return { value: !blocked && proceeds!==null && cost!==null?sumDecimals([proceeds,'-'+cost]):null, proceeds,cost,reference,basisDate,priceDate,unitPrice,fxDate,fxRate,reason,allocation,method:entered?.method??(legacy?'total':'baseline') };
}
