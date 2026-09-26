import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Papa from 'papaparse';
import {emptyLedger,importCsv,readLedger} from '../src/ledger.ts';
import {gmoColumns,parseGmo,cryptoDuplicateIds} from '../src/brokers/gmo.ts';
import {cryptoDisplay} from '../src/crypto-display.ts';
import {annualSummary} from '../src/annual.ts';
const csv=readFileSync(new URL('../data/sample-gmo/demo.csv',import.meta.url),'utf8');
test('GMO auto-detect preserves native JPY, transfer cost unknown and decimal precision, separate from stock income',async()=>{
 const {ledger:l}=await importCsv(emptyLedger(),csv,'demo.csv');
 assert.equal(l.sources[0].broker,'gmo');assert.equal(l.transactions.length,0);
 const [deposit,sale,withdrawal]=l.cryptoTransactions;
 assert.equal(deposit.date,'2022-02-15');assert.equal(deposit.quantity,'0.75000000');assert.ok(deposit.issues.includes('acquisition-history'));
 assert.equal(sale.quantity,'-0.20000000');assert.equal(sale.cashJpy,'1200000');assert.equal(sale.priceJpy,'6000000');assert.equal(sale.orderFee,null);assert.deepEqual(sale.issues,[]);
 assert.equal(withdrawal.cashJpy,'-1000000');assert.equal(withdrawal.quantity,null);
 assert.equal(annualSummary(l,'2024').proceeds.count,0);
 const html=cryptoDisplay(l,'2024','ja');assert.ok(html.includes('200000'));assert.ok(!html.includes('2022/02/15'));
 assert.deepEqual(readLedger(JSON.stringify(l)),l);
 const forged=JSON.parse(JSON.stringify(l));forged.cryptoTransactions[1].cashJpy='999';assert.equal(readLedger(JSON.stringify(forged)).cryptoTransactions[1].cashJpy,'1200000');
 assert.equal((await importCsv(l,csv,'renamed.csv')).repeated,true);
 await assert.rejects(importCsv(emptyLedger(),csv,'demo.csv','merrill'));
});
test('GMO accepts header-only report and preserves unknown or malformed rows without counting them',async()=>{
 const l=(await importCsv(emptyLedger(),gmoColumns.join(','),'empty.csv','gmo')).ledger;
 assert.equal(l.sources.length,1);assert.equal(l.cryptoTransactions.length,0);
 assert.deepEqual(readLedger(JSON.stringify(l)),l);
 const row=Object.fromEntries(gmoColumns.map(c=>[c,'']));Object.assign(row,{'日時':'2024/02/30 12:00','精算区分':'未対応','銘柄名':'BTC'});
 const parsed=parseGmo(Papa.unparse([gmoColumns,gmoColumns.map(c=>row[c])]),'test');
 assert.equal(parsed[0].date,null);assert.ok(parsed[0].issues.includes('unsupported'));
 assert.throws(()=>parseGmo(gmoColumns.join(',')+'\nshort,row','test'));
});
test('GMO overlap is flagged, source text escaped, old ledgers default crypto to empty',async()=>{
 let l=(await importCsv(emptyLedger(),csv,'demo.csv')).ledger;
 const sale=l.cryptoTransactions[1];const overlap=Papa.unparse([gmoColumns,gmoColumns.map(c=>sale.raw[c])]);
 l=(await importCsv(l,overlap,'<script>')).ledger;
 assert.equal(cryptoDuplicateIds(l.cryptoTransactions).size,2);
 assert.ok(cryptoDisplay(l,'all','en').includes('&lt;script&gt;'));
 const saved=JSON.parse(JSON.stringify(emptyLedger()));delete saved.cryptoTransactions;assert.deepEqual(readLedger(JSON.stringify(saved)).cryptoTransactions,[]);
});

test('multi-year crypto fixture includes buys, sells and excluded crypto swaps, preserving all original legs',async()=>{
 const csv=readFileSync(new URL('../data/sample-gmo/multi-year.csv',import.meta.url),'utf8');
 const l=(await importCsv(emptyLedger(),csv,'multi-year.csv')).ledger;
 const rows=l.cryptoTransactions;
 assert.equal(rows.length,22);assert.equal(rows.filter(r=>r.kind==='buy').length,7);assert.equal(rows.filter(r=>r.kind==='sell').length,6);
 const swaps=rows.filter(r=>r.kind==='swap');assert.equal(swaps.length,3);
 assert.ok(rows.filter(r=>r.kind==='buy').every(r=>r.quantity!==null&&!r.quantity.startsWith('-')&&r.cashJpy?.startsWith('-')));
 assert.ok(swaps.every(r=>r.cashJpy===null&&r.issues.includes('out-of-scope')&&r.raw['交換先数量']));
 assert.ok(rows.every(r=>r.issues.every(i=>['acquisition-history','out-of-scope'].includes(i))));
 const {cryptoGainYears}=await import('../src/crypto-cost.ts');
 assert.deepEqual(cryptoGainYears(l,'all'),cryptoGainYears({...l,cryptoTransactions:rows.filter(r=>r.kind!=='swap')},'all'));
 assert.ok(cryptoDisplay(l,'all','ja').includes('JPY/USDなし：今回の集計対象外'));
 assert.deepEqual(readLedger(JSON.stringify(l)),l);
 // A fiat leg must never be silently classified as an excluded crypto-only swap.
 const raw={...swaps[0].raw,'交換先資産':'USD'};
 const invalid=parseGmo(Papa.unparse([Object.keys(raw),Object.values(raw)]),'fiat')[0];
 assert.equal(invalid.kind,'other');assert.ok(invalid.issues.includes('unsupported'));
});
