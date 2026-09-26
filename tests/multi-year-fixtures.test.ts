import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyLedger, importCsv, numberValue, readLedger, duplicateIds } from '../src/ledger.ts';
import { annualSummary, sumDecimals } from '../src/annual.ts';
import { portfolioAt, portfolioYears, inferredOpenings } from '../src/portfolio.ts';
import { saleGain } from '../src/sale-cost.ts';
const read=(name:string)=>readFileSync(new URL('../data/sample-ml/multi-year/'+name,import.meta.url),'utf8');
const expected=JSON.parse(read('expected.json'));
const ready=()=>readLedger(read('fictional-ledger.json'));
test('five-year fictional fixture reconciles flows to latest and every year-end stock/cash snapshot',async()=>{
 const l=ready();
 assert.equal(l.mode,'demo');assert.equal(l.transactions.length,37);assert.equal(l.transactions.filter(t=>t.kind==='sale').length,7);
 assert.equal(duplicateIds(l).size,0);
 let cash=expected.opening.cash, quantity=expected.opening.quantity;
 for(const snapshot of expected.snapshots) {
   const y=String(snapshot.year), tx=l.transactions.filter(t=>t.tradeDate?.startsWith(y));
   cash=sumDecimals([cash,...tx.map(t=>t.amount!)]);
   quantity=sumDecimals([quantity,...tx.filter(t=>t.kind==='vest'||t.kind==='sale').map(t=>t.quantity!)]);
   assert.equal(cash,sumDecimals([snapshot.cash]));assert.equal(quantity,snapshot.quantity);
   const summary=annualSummary(l,y);
   assert.equal(summary.vest.value,sumDecimals([snapshot.vested]));
   assert.equal(summary.dividend.value,sumDecimals([snapshot.dividends]));
   assert.equal(summary.withholding.value,sumDecimals([numberValue(snapshot.withholding)!]));
   assert.equal(summary.proceeds.value,sumDecimals([snapshot.proceeds]));
   const rows=portfolioAt(l,y,'2026-09-26');
   assert.equal(rows.find(r=>r.asset==='FICT')?.quantity,snapshot.quantity);
   assert.equal(sumDecimals([rows.find(r=>r.asset==='FICT')!.value!]),sumDecimals([snapshot.investments]));
   assert.equal(sumDecimals([rows.find(r=>r.asset==='cash')!.value!]),sumDecimals([snapshot.cash]));
   let isolated=emptyLedger();
   for(const kind of ['holdings','portfolio']) isolated=(await importCsv(isolated,read(`${kind}-${y}.csv`),`${kind}-${y}.csv`)).ledger;
   assert.equal(isolated.balances[0].quantity,snapshot.quantity);
   assert.equal(isolated.balances[1].netValue,snapshot.net);
 }
 assert.deepEqual(readLedger(JSON.stringify(l)),l);
});
test('fixture exercises covered profit/loss, prehistory shortage and JPY computation',()=>{
 const l=ready(), sales=l.transactions.filter(t=>t.kind==='sale');
 const outcomes=sales.map(t=>saleGain(l,t,'USD'));
 assert.ok(outcomes.some(g=>!g.reference && Number(g.value)>0));
 assert.ok(outcomes.some(g=>!g.reference && Number(g.value)<0));
 assert.equal(outcomes.filter(g=>g.reference).length,1);
 assert.equal(outcomes.find(g=>g.reference)?.allocation?.remaining,'10');
 assert.equal(outcomes.find(g=>g.reference)?.value,'1798');
 assert.ok(sales.every(t=>saleGain(l,t,'JPY').value!==null));
});
test('combined and annual fixture files are alternatives, with overlap detected if both are imported',async()=>{
 let l=(await importCsv(emptyLedger(),read('activity-all.csv'),'all.csv')).ledger;
 assert.equal(l.transactions.length,37);
 l=(await importCsv(l,read('activity-2022.csv'),'2022.csv')).ledger;
 assert.equal(duplicateIds(l).size,14);
});
test('unsupported split fixture retains source balances but blocks sale gain and cross-split reconstruction',async()=>{
 let l=emptyLedger();
 for(const name of ['activity','holdings','portfolio']) l=(await importCsv(l,read(`split-unsupported/${name}.csv`),`${name}.csv`)).ledger;
 const split=l.transactions.find(t=>t.raw['Description 1']==='Stock Split')!;
 assert.equal(split.kind,'other');assert.ok(split.issues.includes('other'));
 const sale=l.transactions.find(t=>t.kind==='sale')!;
 assert.equal(saleGain(l,sale,'USD').value,null);
 assert.equal(portfolioAt(l,'2023','2026-09-26').find(r=>r.asset==='FICT')?.quantity,null);
 assert.equal(l.balances.find(b=>b.kind==='holdings')?.quantity,'16');
});

test('residual Holdings creates a prior-year Opening without adding taxable Activity',()=>{
 const l=ready();
 const opening=inferredOpenings(l,'2026-09-26')[0];
 assert.equal(opening.target,'2021-12-31');assert.equal(opening.quantity,'40');assert.equal(opening.value,'1600');
 assert.ok(portfolioYears(l,'2026-09-26').includes('2021'));
 assert.equal(annualSummary(l,'2021').vest.count,0);
 const sale=l.transactions.find(t=>t.kind==='sale'&&saleGain(l,t,'USD').reference)!;
 const gain=saleGain(l,sale,'USD');assert.equal(gain.basisDate,'2021-12-31');assert.equal(gain.value,'1798');
 l.balances=[];assert.equal(inferredOpenings(l,'2026-09-26').length,0);
 assert.ok(!portfolioYears(l,'2026-09-26').includes('2021'));
});
