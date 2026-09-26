import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyLedger,importCsv} from '../src/ledger.ts';
import {assetSection} from '../src/asset-section.ts';
import {cryptoDisplay} from '../src/crypto-display.ts';
import {setCryptoCost} from '../src/crypto-cost.ts';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
test('mixed ledger sections keep independent collapsed state and summaries; absent sections are omitted',async()=>{
 let l=(await importCsv(emptyLedger(),read('../data/sample-gmo/demo.csv'),'crypto.csv')).ledger;
 assert.equal(assetSection(l,'stocks','all','en','USD',true,'body'),'');
 l=(await importCsv(l,read('../data/sample-ml/demo.csv'),'stock.csv')).ledger;
 const crypto=assetSection(l,'crypto','2024','en','USD',false,'CRYPTO BODY');
 assert.ok(crypto.includes('data-asset-section="crypto" >'));assert.ok(crypto.includes('1140000 JPY'));assert.ok(crypto.includes('CRYPTO BODY'));
 const stocks=assetSection(l,'stocks','all','ja','JPY',true,'STOCK BODY');
 assert.ok(stocks.includes('data-asset-section="stocks" open'));assert.ok(stocks.includes('株式'));assert.ok(stocks.includes('STOCK BODY'));
 assert.ok(!stocks.includes('CRYPTO BODY'));
});
test('deposit acquisition cost is visible outside details while its cash settlement remains absent',async()=>{
 let l=(await importCsv(emptyLedger(),read('../data/sample-gmo/demo.csv'),'crypto.csv')).ledger;
 const deposit=l.cryptoTransactions[0];l=setCryptoCost(l,deposit.id,'3000000');
 const html=cryptoDisplay(l,'2022','ja');
 const row=html.slice(html.indexOf('<td>2022/02/15'));
 const visible=row.split('<details')[0];
 assert.ok(visible.includes('<td>—</td>'));assert.ok(visible.includes('3000000 JPY'));assert.ok(visible.includes('手入力'));assert.ok(visible.includes('受入数量全体の取得費'));
 assert.equal(l.cryptoTransactions[0].cashJpy,null);
 const sale=cryptoDisplay(l,'2024','ja');assert.ok(sale.includes('800000 JPY'));assert.ok(sale.includes('売却数量分の取得費'));
});
