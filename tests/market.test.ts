import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyLedger, importCsv, parseCsv, readLedger, resolveKnownSymbols } from '../src/ledger.ts';
import { choosePrice, estimatedValue, makePriceSeries, mergePriceSeries, parsePriceCsv, priceCandidates, reviewedPrice, reviewIssues, stooqUrl } from '../src/market.ts';
const csv = readFileSync(new URL('../data/sample-ml/demo.csv', import.meta.url), 'utf8');
// Entirely fictional observations. These are not downloaded market data.
const quotes = 'Date,Open,High,Low,Close,Volume\n2023-12-28,40,44,39,43.125,1000\n2023-12-29,44,45,41,42,2000\n';
const options = { symbol: 'FICT', exchange: 'NASDAQ' as const, providerSymbol: 'fict.us', start: '2023-12-01', end: '2023-12-31', fetchedAt: '2026-09-26T00:00:00.000Z' };
async function fixture() {
  return resolveKnownSymbols((await importCsv(emptyLedger(), csv, 'fictional.csv')).ledger, [{ name: 'Fictional Cloud', symbol: 'FICT', exchange: 'NASDAQ' }]);
}
test('daily CSV retains decimal strings, provenance and a content digest', async () => {
  const s = await makePriceSeries(quotes, options);
  assert.equal(s.bars[0].close, '43.125');
  assert.equal(s.adjustment, 'unknown');
  assert.equal(s.sha256.length, 64);
  assert.equal(s.sourceUrl, 'https://stooq.com/q/d/l/?s=fict.us&i=d&d1=20231201&d2=20231231');
  assert.equal(parsePriceCsv(quotes.replace(',Volume', '').replace(',1000', '').replace(',2000', ''))[0].volume, null);
});
test('HTML challenges, malformed CSV, impossible dates, OHLC and out-of-range data are rejected', async () => {
  for (const bad of ['<html>Verify your browser</html>', 'No data', quotes + '2023-12-28,40,44,39,43,1\n', quotes.replace('2023-12-28', '2023-02-29'), quotes.replace('43.125', 'NaN'), quotes.replace('1000', '1,000')]) assert.throws(() => parsePriceCsv(bad));
  await assert.rejects(makePriceSeries(quotes.replace('43.125', '99'), options));
  await assert.rejects(makePriceSeries(quotes, { ...options, start: '2023-12-29' }));
  assert.throws(() => stooqUrl('fict.us&other=1', options.start, options.end));
  assert.throws(() => stooqUrl('fict.us', options.end, options.start));
});
test('CB and exact lapse-date close are separate; no previous-day or sale substitutes', async () => {
  let l = await fixture();
  l = mergePriceSeries(l, [await makePriceSeries(quotes, options)]);
  const t = l.transactions[0]; const original = JSON.stringify(t.raw);
  const candidates = priceCandidates(l, t);
  assert.deepEqual(candidates.map(c => [c.origin, c.unitPrice]), [['csv-cb', '42.50'], ['daily-close', '43.125']]);
  assert.equal(candidates[1].targetDate, '2023-12-28');
  assert.equal(candidates[0].priceDate, null);
  assert.equal(priceCandidates(l, { ...t, lapseDate: '2023-12-30' }).length, 1);
  assert.equal(priceCandidates(l, { ...t, excluded: true }).length, 0);
  for (const kind of ['sale', 'tax', 'dividend'] as const) assert.deepEqual(priceCandidates(l, { ...t, kind }), []);
  l = choosePrice(l, t.id, 1);
  assert.deepEqual(reviewIssues(l, t), []);
  assert.equal(JSON.stringify(t.raw), original);
  assert.equal(t.amount, '0.00');
  assert.equal(t.cb, '42.50');
});
test('selected prices survive saves and later downloads; changing instrument invalidates the selection', async () => {
  let l = await fixture();
  const s = await makePriceSeries(quotes, options);
  l = choosePrice(mergePriceSeries(l, [s]), l.transactions[0].id, 1);
  l = mergePriceSeries(l, [s, await makePriceSeries(quotes.replace('43.125', '43.5'), { ...options, fetchedAt: '2026-09-27T00:00:00.000Z' })]);
  assert.equal(l.marketPrices.length, 2);
  l = readLedger(JSON.stringify(l));
  assert.equal(reviewedPrice(l, l.transactions[0])?.unitPrice, '43.125');
  assert.equal(priceCandidates(l, l.transactions[0])[1].unitPrice, '43.5');
  l.mappings[0].instrument.symbol = 'OTHER';
  assert.equal(reviewedPrice(l, l.transactions[0]), undefined);
  assert.ok(reviewIssues(l, l.transactions[0]).includes('vest'));
});
test('old saves default to empty price collections and invalid selection references reject restore', async () => {
  const l = await fixture();
  const old = JSON.parse(JSON.stringify(l)); delete old.marketPrices; delete old.priceChoices;
  assert.deepEqual(readLedger(JSON.stringify(old)).marketPrices, []);
  const selected = choosePrice(l, l.transactions[0].id, 0);
  selected.priceChoices[0].transactionId = 'missing';
  assert.throws(() => readLedger(JSON.stringify(selected)));
});
test('ordinary cash rows require no review, missing or reversed amounts do', () => {
  assert.deepEqual(parseCsv(csv, 'f')[2].issues, []);
  assert.deepEqual(parseCsv(csv, 'f')[3].issues, []);
  assert.ok(parseCsv(csv.replace('8.10', '--'), 'f')[2].issues.includes('cash-amount'));
  assert.ok(parseCsv(csv.replace('8.10', '(8.10)'), 'f')[2].issues.includes('cash-sign'));
  assert.ok(parseCsv(csv.replace('(1.94)', '1.94'), 'f')[3].issues.includes('cash-sign'));
});
test('estimated totals use exact decimal multiplication and preserve unknown quantity', () => {
  assert.equal(estimatedValue('12', '43.125'), '517.5');
  assert.equal(estimatedValue('0.1', '0.2'), '0.02');
  assert.equal(estimatedValue('0', '42.50'), '0');
  assert.equal(estimatedValue('100', '10.00'), '1000');
  assert.equal(estimatedValue(null, '10'), null);
  assert.equal(estimatedValue('-1', '10'), null);
});

test('collector imports public CSV and preserves the prior cache on a failed download response', async () => {
  const { mkdtemp, writeFile, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { spawnSync } = await import('node:child_process');
  const cwd = await mkdtemp(join(tmpdir(), 'rsu-price-test-'));
  const input = join(cwd, 'fictional.csv');
  await writeFile(input, quotes);
  const args = [fileURLToPath(new URL('../scripts/collect-prices.ts', import.meta.url)), '--symbol', 'FICT', '--exchange', 'NASDAQ', '--from', options.start, '--to', options.end, '--csv', input];
  assert.equal(spawnSync(process.execPath, args, { cwd, encoding: 'utf8' }).status, 0);
  const before = await readFile(join(cwd, 'public/prices.json'), 'utf8');
  assert.equal(JSON.parse(before).series[0].bars.length, 2);
  await writeFile(input, '<html>Browser verification required</html>');
  const failure = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /not CSV/);
  assert.equal(await readFile(join(cwd, 'public/prices.json'), 'utf8'), before);
});

test('price ranges are inferred per instrument and expand for older CSV or opening records', async () => {
  const { requiredPriceRange, priceDownloadPlan } = await import('../src/market.ts');
  let l = await fixture(); const instrument = { symbol: 'FICT', exchange: 'NASDAQ' as const };
  assert.deepEqual(requiredPriceRange(l, instrument), { start: '2023-12-28', end: '2025-02-10' });
  assert.equal(requiredPriceRange(l, { symbol: 'ABSENT', exchange: 'NYSE' }), null);
  l = mergePriceSeries(l, [await makePriceSeries(quotes, options)]);
  assert.deepEqual(priceDownloadPlan(l, instrument).missing, [{ start: '2023-12-30', end: '2025-02-10' }]);
  l.openings.push({ id: 'opening', instrumentKey: l.transactions[0].instrumentKey, date: '2022-01-01', quantity: '1', cost: null, currency: 'USD', evidence: 'fictional' });
  assert.deepEqual(priceDownloadPlan(l, instrument).missing, [{ start: '2022-01-01', end: '2023-12-27' }, { start: '2023-12-30', end: '2025-02-10' }]);
  l.transactions.forEach(t => t.excluded = true); l.openings = [];
  assert.equal(requiredPriceRange(l, instrument), null);
});
test('incremental planning handles disjoint, overlapping and truncated downloads', async () => {
  const { missingPriceRanges } = await import('../src/market.ts');
  const a = await makePriceSeries(quotes, options);
  const b = await makePriceSeries(quotes.replaceAll('2023-12-28', '2023-12-20').replaceAll('2023-12-29', '2023-12-21'), options);
  assert.deepEqual(missingPriceRanges({ start: '2023-12-20', end: '2023-12-31' }, [a, b, a]), [{ start: '2023-12-22', end: '2023-12-27' }, { start: '2023-12-30', end: '2023-12-31' }]);
  assert.deepEqual(missingPriceRanges({ start: '2023-12-28', end: '2023-12-29' }, [a]), []);
  assert.deepEqual(missingPriceRanges({ start: '2024-02-28', end: '2024-03-01' }, []), [{ start: '2024-02-28', end: '2024-03-01' }]);
});
test('daily cache merges overlap without doubling days and retains changed observations', async () => {
  const { mergedPriceCache } = await import('../src/market.ts');
  const a = await makePriceSeries(quotes, options);
  const b = await makePriceSeries(quotes.replace('43.125', '43.500').replace('2023-12-29', '2023-12-30'), { ...options, fetchedAt: '2026-09-27T00:00:00.000Z' });
  const merged = mergedPriceCache([b, a]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].bar.close, '43.500');
  assert.equal(merged[0].conflict, true);
  assert.equal(merged[0].revisions.length, 2);
  const equal = await makePriceSeries(quotes.replace('43.125', '43.1250'), options);
  assert.equal(mergedPriceCache([a, equal])[0].conflict, false);
  assert.equal(mergedPriceCache([a, { ...a, adjustment: 'split-adjusted' }]).length, 4);
  const l = readLedger(JSON.stringify(mergePriceSeries(await fixture(), [a, b])));
  assert.equal(mergedPriceCache(l.marketPrices).length, 3);
});

test('review selection switches both ways and survives save/restore without keeping the old choice',async()=>{
 const {isSelectedPrice}=await import('../src/market.ts');
 const {transactionValue}=await import('../src/annual.ts');
 let l=mergePriceSeries(await fixture(),[await makePriceSeries(quotes,options)]);
 const t=l.transactions[0], candidates=priceCandidates(l,t);
 for(const index of [0,1,0,1]) {
  l=readLedger(JSON.stringify(choosePrice(l,t.id,index)));
  assert.equal(l.priceChoices.filter(p=>p.transactionId===t.id).length,1);
  assert.equal(reviewedPrice(l,t)?.unitPrice,candidates[index].unitPrice);
  assert.ok(isSelectedPrice(reviewedPrice(l,t),candidates[index]));
  assert.ok(!isSelectedPrice(reviewedPrice(l,t),candidates[1-index]));
  assert.equal(transactionValue(l,t).value,estimatedValue(t.quantity,candidates[index].unitPrice));
 }
});
