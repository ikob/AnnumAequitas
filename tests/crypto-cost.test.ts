import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyLedger,importCsv,readLedger} from '../src/ledger.ts';
import {cryptoGain,cryptoGainYears,setCryptoCost} from '../src/crypto-cost.ts';
import {makeFxSeries} from '../src/fx.ts';
const fixture=async()=> (await importCsv(emptyLedger(),readFileSync(new URL('../data/sample-gmo/demo.csv',import.meta.url),'utf8'),'demo.csv')).ledger;
test('crypto sale uses gross 5% until manual cost is entered; blank restores fallback and zero is explicit',async()=>{
 let l=await fixture();const sale=l.cryptoTransactions[1];
 sale.cashJpy='1199000'; // net after a fictional fee; 5% basis stays gross
 assert.equal(cryptoGain(l,sale).cost,'60000');assert.equal(cryptoGain(l,sale).gain,'1139000');
 assert.equal(cryptoGainYears(l,'2024')[0].color,'amber');
 l=setCryptoCost(l,sale.id,'1200000');assert.equal(cryptoGain(l,sale).gain,'-1000');assert.equal(cryptoGain(l,sale).provisional,false);
 l=setCryptoCost(l,sale.id,'0');assert.equal(cryptoGain(l,sale).cost,'0');
 assert.deepEqual(readLedger(JSON.stringify(l)).cryptoCosts,l.cryptoCosts);
 l=setCryptoCost(l,sale.id,null);assert.equal(cryptoGain(l,sale).cost,'60000');
 assert.throws(()=>setCryptoCost(l,sale.id,'-1'));
});
test('crypto annual threshold is strictly above 100k USD, stays separate by year, and missing FX is amber',async()=>{
 let l=await fixture();const sale=l.cryptoTransactions[1];
 l=setCryptoCost(l,sale.id,'0');
 assert.equal(cryptoGainYears(l,'2024')[0].usd,null);
 l.fxRates.push(await makeFxSeries('observation_date,DEXJPUS\n2024-04-12,12'));
 assert.equal(cryptoGainYears(l,'2024')[0].usd,'100000');assert.equal(cryptoGainYears(l,'2024')[0].color,'');
 sale.cashJpy='1200001';assert.equal(cryptoGainYears(l,'2024')[0].color,'reference-loss');
 assert.deepEqual(cryptoGainYears(l,'2022'),[]);
 l.cryptoTransactions.push({...sale,id:'duplicate'});assert.equal(cryptoGain(l,sale).gain,null);
});

test('deposit cost entered in Review feeds later sales proportionally and clears back to 5%',async()=>{
 let l=await fixture();const deposit=l.cryptoTransactions[0],sale=l.cryptoTransactions[1];
 const {cryptoDisplay}=await import('../src/crypto-display.ts');
 assert.ok(cryptoDisplay(l,'all','ja').includes(`data-crypto-cost="${deposit.id}"`));
 l=setCryptoCost(l,deposit.id,'3000000'); // 0.75 BTC, so 0.2 BTC uses 800,000 JPY
 assert.equal(cryptoGain(l,sale).cost,'800000');assert.equal(cryptoGain(l,sale).gain,'400000');
 assert.equal(cryptoGain(l,sale).method,'activity');assert.equal(cryptoGain(l,sale).provisional,false);
 l=readLedger(JSON.stringify(l));assert.equal(cryptoGain(l,l.cryptoTransactions[1]).cost,'800000');
 l=setCryptoCost(l,sale.id,'900000');assert.equal(cryptoGain(l,sale).cost,'900000');
 l=setCryptoCost(l,sale.id,null);assert.equal(cryptoGain(l,sale).cost,'800000');
 l=setCryptoCost(l,deposit.id,null);assert.equal(cryptoGain(l,sale).cost,'60000');
});
test('acquisition pool consumes prior sales and includes BUY cost without double allocation',async()=>{
 let l=await fixture();const deposit=l.cryptoTransactions[0],sale=l.cryptoTransactions[1];
 l=setCryptoCost(l,deposit.id,'3000000');
 const second={...sale,id:'second',timestamp:'2024/04/13 12:00',quantity:'-0.6',fingerprint:'second',raw:{...sale.raw,'約定ID':'SECOND'}};
 l.cryptoTransactions.push(second);
 assert.equal(cryptoGain(l,second).provisional,true); // only 0.55 BTC remains
 l.cryptoTransactions[0]={...deposit,kind:'buy',cashJpy:'-1500000',issues:[]};
 l.cryptoCosts=[];
 assert.equal(cryptoGain(l,sale).cost,'400000');
});

test('JPY-funded 2022 acquisition is known without FX; only the USD check needs FX',async()=>{
 const l=(await importCsv(emptyLedger(),readFileSync(new URL('../data/sample-gmo/multi-year.csv',import.meta.url),'utf8'),'multi-year.csv')).ledger;
 const sale=l.cryptoTransactions.find(r=>r.kind==='sell'&&r.date?.startsWith('2022'))!;
 const g=cryptoGain(l,sale);assert.equal(g.cost,'150000');assert.equal(g.gain,'-10000');assert.equal(g.provisional,false);
 const year=cryptoGainYears(l,'2022')[0];assert.equal(year.color,'');assert.equal(year.fxMissing,true);assert.equal(year.missing,false);
 const {cryptoDisplay}=await import('../src/crypto-display.ts');
 const html=cryptoDisplay(l,'2022','ja');assert.ok(html.includes('CSVの円支払額から取得済み'));assert.ok(html.includes('600000 JPY'));assert.ok(!html.includes('未確認 USD'));
 assert.ok(!html.includes('取得費未入力：売却価額の5%'));
});
