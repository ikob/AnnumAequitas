import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import { columns, emptyLedger, importCsv } from '../src/ledger.ts';
import { portfolioAt, portfolioYears } from '../src/portfolio.ts';
import { portfolioDisplay } from '../src/portfolio-display.ts';
import { makePriceSeries } from '../src/market.ts';
const h = 'COB Date,Account #,Symbol,Security Description,Quantity,Price ($),Value ($)\n9/25/2026,DEMO,FICT,Fictional,20,10,200';
const p = 'COB Date,Account #,Cash Balance ($),Money Accounts ($),Priced Investments ($),Net Value ($),\n9/25/2026,DEMO,100,0,200,300,';
function activity(quantity='5', desc='RSU ACTIVITY', amount='0', date='1/2/2026') {
 return Papa.unparse([columns, ['12/31/2025',date,'Settled','Demo','Fictional','DEMO','SecurityTransactions','Transfer / Adjustment',desc,'FICT',quantity,'--',amount]]);
}
async function setup(csv=activity()) {
 let ledger=emptyLedger();
 for(const text of [h,p,csv]) ledger=(await importCsv(ledger,text,'fixture.csv')).ledger;
 return ledger;
}
test('All and current year display latest source balances without adding COB and realtime',async()=>{
 let l=await setup();
 const rt=h.replace('COB Date','Date,Time').replace('9/25/2026','9/26/2026,12:00 ET').replace('20,10,200','21,10,210');
 l=(await importCsv(l,rt,'realtime.csv')).ledger;
 const rows=portfolioAt(l,'2026','2026-09-26');
 assert.equal(rows.filter(r=>r.asset==='FICT').length,1);
 assert.equal(rows[0].quantity,'21'); assert.equal(rows[0].value,'210');
 assert.ok(rows[0].issues.includes('different-dates'));
 assert.equal(portfolioDisplay(l,'all','en','2026-09-26'),portfolioDisplay(l,'2026','en','2026-09-26'));
 assert.ok(portfolioYears(l,'2026-09-26').includes('2025'));
});
test('year end reverses post-year settlement quantities and cash and reprices at prior close',async()=>{
 const l=await setup();
 l.mappings.push({key:'symbol:FICT',instrument:{symbol:'FICT',name:'Fictional',exchange:'NASDAQ'}});
 l.marketPrices.push(await makePriceSeries('Date,Open,High,Low,Close\n2025-12-30,8,8,8,8',{symbol:'FICT',exchange:'NASDAQ',providerSymbol:'fict.us',start:'2025-12-30',end:'2025-12-31'}));
 const rows=portfolioAt(l,'2025','2026-09-26');
 assert.equal(rows[0].quantity,'15'); assert.equal(rows[0].value,'120'); assert.equal(rows[0].priceDate,'2025-12-30');
 assert.ok(rows[0].issues.includes('coverage'));
 assert.equal(rows.find(r=>r.asset==='cash')?.value,'100');
 // Matching year-end movements must not be subtracted.
 const same=await setup(activity('5','RSU ACTIVITY','0','12/31/2025'));
 assert.equal(portfolioAt(same,'2025','2026-09-26')[0].quantity,'20');
});
test('sales reverse signed quantity and cash; duplicates and unknown movements block affected balances',async()=>{
 let l=await setup(activity('-2','Sold','30'));
 let rows=portfolioAt(l,'2025','2026-09-26');
 assert.equal(rows[0].quantity,'22');assert.equal(rows.find(r=>r.asset==='cash')?.value,'70');
 l=(await importCsv(l,activity('-2','Sold','30')+'\r\n','duplicate.csv')).ledger;
 assert.equal(portfolioAt(l,'2025','2026-09-26')[0].quantity,null);
 const other=await setup(activity('2','Stock split','0'));
 assert.equal(portfolioAt(other,'2025','2026-09-26')[0].quantity,null);
});
test('absent holdings, missing historical prices and older anchors remain unknown',async()=>{
 const l=await setup(activity('5','RSU ACTIVITY','0').replace('FICT','MISSING'));
 const rows=portfolioAt(l,'2025','2026-09-26');
 assert.equal(rows.find(r=>r.asset==='MISSING')?.quantity,null);
 assert.equal(rows.find(r=>r.asset==='FICT')?.value,null);
 const older=await setup(); older.balances.forEach(b=>b.date='2024-12-31');
 assert.ok(portfolioAt(older,'2025','2026-09-26').every(r=>r.anchor===null));
});

test('year-end valuation accepts the last available earlier close without a seven-day limit and never uses a future price', async () => {
 const l = await setup();
 l.mappings.push({key:'symbol:FICT',instrument:{symbol:'FICT',name:'Fictional',exchange:'NASDAQ'}});
 l.marketPrices.push(await makePriceSeries('Date,Open,High,Low,Close\n2025-12-19,8,8,8,8\n2026-01-02,99,99,99,99', {symbol:'FICT',exchange:'NASDAQ',providerSymbol:'fict.us',start:'2025-12-19',end:'2026-01-02'}));
 const row = portfolioAt(l,'2025','2026-09-26')[0];
 assert.equal(row.priceDate,'2025-12-19');
 assert.equal(row.value,'120');
 assert.ok(!row.issues.includes('price'));
});

test('portfolio JPY converts shares, cash and reported net at the balance date with earlier FX, preserving unknowns', async () => {
 const { makeFxSeries } = await import('../src/fx.ts');
 const { portfolioValue } = await import('../src/portfolio.ts');
 const l = await setup();
 l.fxRates.push(await makeFxSeries('observation_date,DEXJPUS\n2026-09-24,150\n2026-09-25,.\n2026-09-28,200','2026-09-26T00:00:00Z'));
 assert.deepEqual(portfolioValue(l,'200','2026-09-25','JPY'),{value:'30000',fx:{date:'2026-09-24',rate:'150'}});
 assert.equal(portfolioValue(l,'-2.5','2026-09-25','JPY').value,'-375');
 assert.equal(portfolioValue(l,null,'2026-09-25','JPY').value,null);
 assert.equal(portfolioValue(l,'0','2026-09-25','JPY').value,'0');
 assert.equal(portfolioValue(l,'200','2025-12-31','JPY').value,null);
 const html=portfolioDisplay(l,'all','ja','2026-09-26','JPY');
 assert.ok(html.includes('30000')); assert.ok(html.includes('45000')); assert.ok(html.includes('15000'));
 assert.ok(html.includes('2026-09-24')); assert.ok(html.includes('評価額（JPY）'));
 assert.ok(!html.includes('評価額（USD）')); assert.ok(!html.includes('純資産（USD）'));
 l.fxRates.push(await makeFxSeries('observation_date,DEXJPUS\n2026-09-24,.','2026-09-26T01:00:00Z'));
 assert.equal(portfolioValue(l,'200','2026-09-25','JPY').value,null);
});
