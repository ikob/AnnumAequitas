import { z } from 'zod';
import type { Ledger } from './ledger.ts';
import type { CryptoRow } from './brokers/gmo.ts';
import { cryptoDuplicateIds } from './brokers/gmo.ts';
import { estimatedValue } from './market.ts';
import { sumDecimals } from './annual.ts';
import { fxObservation } from './fx.ts';
export const cryptoCostSchema=z.object({transactionId:z.string(),fingerprint:z.string(),amountJpy:z.string().regex(/^\d+(\.\d+)?$/),recordedAt:z.string().datetime()}).strict();
export function setCryptoCost(ledger:Ledger,id:string,amountJpy:string|null):Ledger {
 const row=ledger.cryptoTransactions.find(t=>t.id===id && ['sell','deposit','buy'].includes(t.kind));
 if(!row) throw new Error('Missing cost target');
 const kept=ledger.cryptoCosts.filter(v=>v.transactionId!==id);
 return {...ledger,cryptoCosts:amountJpy===null?kept:[...kept,cryptoCostSchema.parse({transactionId:id,fingerprint:row.fingerprint,amountJpy,recordedAt:new Date().toISOString()})]};
}
function divide(value:string,rate:string) {
 const [a,b='']=value.replace(/^-/,'').split('.'), [c,d='']=rate.split('.');
 const numerator=BigInt(a+b)*10n**BigInt(d.length+8), denominator=BigInt(c+d)*10n**BigInt(b.length);
 const n=(numerator+denominator/2n)/denominator, digits=n.toString().padStart(9,'0');
 const out=(digits.slice(0,-8)+'.'+digits.slice(-8)).replace(/\.?0+$/,'');
 return value.startsWith('-')&&n!==0n?'-'+out:out;
}
export function cryptoEnteredCost(ledger:Ledger,row:CryptoRow) {
 return ledger.cryptoCosts.find(v=>v.transactionId===row.id && v.fingerprint===row.fingerprint);
}
// Reference moving average within imported GMO history; unknown pools never become zero-cost.
export function cryptoAllocatedCost(ledger:Ledger,sale:CryptoRow):string|null {
 if(!sale.date || !sale.quantity)return null;
 const dupes=cryptoDuplicateIds(ledger.cryptoTransactions);
 const rows=ledger.cryptoTransactions.filter(r=>r.asset===sale.asset || r.raw['交換元資産']===sale.asset || r.raw['交換先資産']===sale.asset);
 if(rows.some(r=>!r.date))return null;
 const order=(r:CryptoRow)=>`${r.date}T${r.timestamp.split(' ')[1]}`;
 rows.sort((a,b)=>order(a).localeCompare(order(b))||a.id.localeCompare(b.id));
 let quantity='0',cost:string|null='0';
 for(const row of rows) {
  if(order(row)>order(sale))break;
  if(row.kind==='swap')continue; // Explicitly excluded by the current user-defined calculation scope.
  if(dupes.has(row.id)||row.kind==='other'||row.issues.some(i=>i!=='acquisition-history')) {cost=null;if(row.id===sale.id)return null;continue;}
  if(row.kind==='buy'||row.kind==='deposit') {
   const entered=cryptoEnteredCost(ledger,row);
   const added=entered?.amountJpy ?? (row.kind==='buy'&&row.cashJpy?.startsWith('-')?row.cashJpy.slice(1):null);
   if(row.quantity===null||row.quantity.startsWith('-'))return null;
   quantity=sumDecimals([quantity,row.quantity]);
   cost=cost!==null&&added!==null?sumDecimals([cost,added]):null;
  } else if(row.kind==='sell'||row.kind==='withdrawal') {
   if(row.quantity===null)return null;
   const sold=row.quantity.replace(/^-/,'');
   const remaining=sumDecimals([quantity,'-'+sold]);
   const allocated:string|null=cost!==null&&!remaining.startsWith('-')&&/[1-9]/.test(quantity)?divide(estimatedValue(cost,sold)!,quantity):null;
   if(row.id===sale.id)return allocated;
   quantity=remaining.startsWith('-')?'0':remaining;
   cost=cost!==null&&allocated!==null?sumDecimals([cost,'-'+allocated]):null;
   if(row.kind==='withdrawal' && row.transferFee!==null && /[1-9]/.test(row.transferFee))cost=null;
   if(quantity==='0')cost='0';
  }
 }
 return null;
}
export function cryptoGain(ledger:Ledger,row:CryptoRow) {
 const manual=cryptoEnteredCost(ledger,row);
 const allocated=manual?null:cryptoAllocatedCost(ledger,row);
 const provisional=!manual && allocated===null;
 const gross=row.tradeAmountJpy;
 const cost=manual?.amountJpy ?? allocated ?? (gross!==null&&!gross.startsWith('-')?estimatedValue(gross,'0.05'):null);
 const blocked=row.kind!=='sell'||row.issues.length>0||cryptoDuplicateIds(ledger.cryptoTransactions).has(row.id);
 const gain=!blocked && row.cashJpy!==null && cost!==null?sumDecimals([row.cashJpy,'-'+cost]):null;
 const fx=fxObservation(ledger,row.date);
 return {cost,gain,provisional,method:manual?'manual':allocated!==null?'activity':'five-percent',fx,usd:gain!==null&&fx?.rate?divide(gain,fx.rate):null};
}
export function cryptoGainYears(ledger:Ledger,year:string) {
 const rows=ledger.cryptoTransactions.filter(r=>r.kind==='sell'&&(year==='all'||(r.date?.slice(0,4)??'unknown')===year));
 return [...new Set(rows.map(r=>r.date?.slice(0,4)??'unknown'))].sort().map(y=>{
  const results=rows.filter(r=>(r.date?.slice(0,4)??'unknown')===y).map(r=>cryptoGain(ledger,r));
  const missing=results.some(g=>g.gain===null), fxMissing=results.some(g=>g.usd===null);
  const jpy=results.some(g=>g.gain!==null)?sumDecimals(results.flatMap(g=>g.gain===null?[]:[g.gain])):null;
  const usd=fxMissing?null:sumDecimals(results.map(g=>g.usd!));
  const above=usd!==null&&!sumDecimals([usd,'-100000']).startsWith('-')&&sumDecimals([usd,'-100000'])!=='0';
  return {year:y,jpy,usd,missing,fxMissing,provisional:results.some(g=>g.provisional),color:above?'reference-loss':missing||results.some(g=>g.provisional)?'amber':''};
 });
}
