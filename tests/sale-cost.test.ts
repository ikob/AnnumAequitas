import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import { columns, emptyLedger, importCsv, readLedger } from '../src/ledger.ts';
import { saleGain, setCostInput } from '../src/sale-cost.ts';
import { annualSummary, annualByInstrument } from '../src/annual.ts';
import { computedCell } from '../src/annual-display.ts';
import { makePriceSeries } from '../src/market.ts';
import { makeFxSeries } from '../src/fx.ts';
import { saleCostDisplay } from '../src/sale-cost-display.ts';
const row=(date:string,kind:string,quantity:string,amount:string,cb='')=>[date,date,'Settled','Demo','Fictional','DEMO','SecurityTransactions',kind,kind==='vest'?`RSU ACTIVITY CB ${cb}`:kind,'FICT',quantity,'--',amount];
async function fixture() {
 const csv=Papa.unparse([columns,row('1/1/2024','vest','5','0','10'),row('2/1/2024','vest','5','0','20'),row('3/1/2024','Sold','-4','60'),row('4/1/2024','Sold','-8','100'),row('5/1/2024','vest','100','0','999')]);
 let l=(await importCsv(emptyLedger(),csv,'fictional.csv')).ledger;
 l.mappings.push({key:'symbol:FICT',instrument:{symbol:'FICT',exchange:'NASDAQ',name:'Fictional'}});
 l=(await importCsv(l,'COB Date,Account #,Symbol,Security Description,Quantity,Price ($),Value ($)\n6/1/2024,DEMO,FICT,Fictional,100,10,1000','holdings.csv')).ledger;
 l.marketPrices.push(await makePriceSeries('Date,Open,High,Low,Close\n2023-12-29,7,7,7,7',{symbol:'FICT',exchange:'NASDAQ',providerSymbol:'fict.us',start:'2023-12-29',end:'2024-01-01'}));
 return l;
}
test('Activity average cost, preserve losses, consume prior sales and only baseline shortfall',async()=>{
 const l=await fixture(), sales=l.transactions.filter(t=>t.kind==='sale');
 const first=saleGain(l,sales[0],'USD');
 assert.equal(first.cost,'60');assert.equal(first.value,'0');assert.equal(first.reference,false);
 assert.equal(first.allocation?.average,'15');
 assert.ok(!computedCell(l,sales[0],'ja').includes('reference-loss'));
 const second=saleGain(l,sales[1],'USD');
 // Six shares at average 15 remain; two need baseline 7.
 assert.equal(second.allocation?.remaining,'2');assert.equal(second.cost,'104');assert.equal(second.value,'-4');assert.equal(second.reference,true);
 assert.ok(computedCell(l,sales[1],'ja').includes('reference-loss'));
 assert.equal(second.basisDate,'2023-12-31');assert.equal(second.priceDate,'2023-12-29');
 const total=annualSummary(l,'2024');assert.equal(total.gain.value,'0');assert.equal(total.referenceGain.value,'-4');
 assert.equal(annualByInstrument(l,'2024')[0].summary.referenceGain.value,'-4');
});
test('JPY cost converts each acquisition separately and baseline separately from sale proceeds',async()=>{
 const l=await fixture();
 l.fxRates.push(await makeFxSeries('observation_date,DEXJPUS\n2024-01-01,100\n2024-02-01,110\n2024-03-01,120\n2024-04-01,130'));
 const sales=l.transactions.filter(t=>t.kind==='sale');
 assert.equal(saleGain(l,sales[0],'JPY').value,'800');
 const g=saleGain(l,sales[1],'JPY');assert.equal(g.cost,'11000');assert.equal(g.value,'2000');assert.equal(g.fxRate,'100');
});
test('manual total, average and history accept no evidence, preserve metadata and support JPY-only cost',async()=>{
 let l=await fixture();const sale=l.transactions[2];
 l=setCostInput(l,sale.id,{proceeds:'60',method:'total',currency:'JPY',amount:'9000',history:[],note:''});
 l.fxRates.push(await makeFxSeries('observation_date,DEXJPUS\n2024-03-01,120'));
 assert.equal(saleGain(l,sale,'JPY').value,'-1800');assert.equal(saleGain(l,sale,'USD').value,null);
 l=setCostInput(l,sale.id,{proceeds:'60',method:'average',currency:'USD',amount:'12.5',history:[],note:''});
 assert.equal(saleGain(l,sale,'USD').value,'10');
 l=setCostInput(l,sale.id,{proceeds:'60',method:'history',currency:'USD',amount:null,history:[{date:'2023-01-01',quantity:'4',cost:'20'},{date:'2023-02-01',quantity:'4',cost:'60'}],note:'<script>'});
 assert.equal(saleGain(l,sale,'USD').cost,'40');
 assert.deepEqual(readLedger(JSON.stringify(l)).costInputs,l.costInputs);
 assert.ok(saleCostDisplay(l,sale,'ja','USD').includes('&lt;script&gt;'));
 assert.throws(()=>setCostInput(l,sale.id,{proceeds:'60',method:'history',currency:'USD',amount:null,history:[{date:'2025-01-01',quantity:'8',cost:'80'}],note:''}));
 const saved=JSON.parse(JSON.stringify(l));delete saved.costInputs;assert.deepEqual(readLedger(JSON.stringify(saved)).costInputs,[]);
});
test('unresolved duplicate acquisition is not used twice; missing baseline quote stays unknown',async()=>{
 let l=await fixture();const sale=l.transactions[3];
 l.marketPrices=[];assert.equal(saleGain(l,sale,'USD').value,null);
 const raw=Papa.unparse([columns,columns.map(k=>l.transactions[0].raw[k])]);
 l=(await importCsv(l,raw,'duplicate.csv')).ledger;
 assert.equal(saleGain(l,l.transactions[2],'USD').value,null);
});

test('covered losses are normal-colored; a subsequent acquisition changes the remaining average without reusing sold cost',async()=>{
 let l=await fixture();
 const first=l.transactions[2];first.amount='50';
 assert.equal(saleGain(l,first,'USD').value,'-10');
 assert.ok(!computedCell(l,first,'ja').includes('reference-loss'));
 // Before the second sale, 6 shares at 15 remain. Add 2 shares at 30 -> cost 150 / 8.
 l=(await importCsv(l,Papa.unparse([columns,row('3/15/2024','vest','2','0','30')]),'extra.csv')).ledger;
 const second=saleGain(l,l.transactions[3],'USD');
 assert.equal(second.allocation?.average,'18.75');assert.equal(second.cost,'150');assert.equal(second.value,'-50');assert.equal(second.reference,false);
 assert.ok(!computedCell(l,l.transactions[3],'ja').includes('reference-loss'));
});

 test('unknown Activity cost uses Opening quote in the average and stays red across earlier sales',async()=>{
 const l=await fixture();
 l.transactions[0].cb=null;
 const first=saleGain(l,l.transactions[2],'USD');
 assert.equal(first.cost,'54'); // (5 * 7 + 5 * 20) / 10 * 4
 assert.equal(first.value,'6');assert.equal(first.reference,true);
 assert.ok(computedCell(l,l.transactions[2],'ja').includes('reference-loss'));
 const next=saleGain(l,l.transactions[3],'USD');
 assert.equal(next.cost,'95');assert.equal(next.value,'5');assert.equal(next.reference,true);
 l.fxRates.push(await makeFxSeries('observation_date,DEXJPUS\n2024-01-01,100\n2024-02-01,110\n2024-03-01,120'));
 assert.equal(saleGain(l,l.transactions[2],'JPY').cost,'5800');
 assert.equal(saleGain(l,l.transactions[2],'JPY').value,'1400');
 });
 test('Activity start supplies Opening baseline without a Holdings document',async()=>{
 const l=await fixture(); l.balances=[];
 const result=saleGain(l,l.transactions[3],'USD');
 assert.equal(result.basisDate,'2024-01-01');assert.equal(result.value,'-4');assert.equal(result.reference,true);
 });
