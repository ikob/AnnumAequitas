import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyLedger, importCsv, readLedger, setSaleValuation } from '../src/ledger.ts';
import { makeFxSeries, mergeFxSeries, fxObservation, toJpy } from '../src/fx.ts';
import { annualSummary } from '../src/annual.ts';
import { annualDisplay, computedCell } from '../src/annual-display.ts';
const brokerage = readFileSync(new URL('../data/sample-ml/demo.csv', import.meta.url), 'utf8');
// Entirely fictional FX observations, not real downloaded market data.
const csv = 'observation_date,DEXJPUS\n2023-12-28,100.25\n2023-12-29,101\n2024-06-14,120\n2024-09-20,150\n2025-02-07,140\n2025-04-11,.\n';
const fixture = async () => mergeFxSeries((await importCsv(emptyLedger(), brokerage, 'fictional.csv')).ledger, [await makeFxSeries(csv, '2026-09-26T00:00:00.000Z')]);
test('FRED parser fixes pair direction and rate type, preserves null days and rejects malformed input', async () => {
  const s = await makeFxSeries(csv);
  assert.equal(s.base, 'USD'); assert.equal(s.quote, 'JPY'); assert.equal(s.rateType, 'ny-noon-buying');
  assert.equal(s.observations.at(-1)?.rate, null);
  assert.equal(s.sha256.length, 64);
  for (const bad of [csv.replace('DEXJPUS', 'DEXUSEU'), csv.replace('100.25', '0'), csv.replace('100.25', '-1'), csv.replace('2023-12-28', '2023-02-29'), csv + '2023-12-28,100\n', '<html>challenge</html>']) await assert.rejects(makeFxSeries(bad));
});
test('same-day first conversion keeps sign and decimal precision; vest uses lapse date', async () => {
  const l = await fixture();
  assert.equal(toJpy(l, l.transactions[0], '510'), '51127.5');
  assert.equal(toJpy(l, l.transactions[3], '-1.94'), '-291');
  assert.equal(toJpy(l, l.transactions[5], '350'), null);
  assert.equal(toJpy(l, { ...l.transactions[0], lapseDate: '2023-12-30' }, '510'), '61200');
  assert.equal(toJpy(l, l.transactions[0], null), null);
  assert.match(computedCell(l, l.transactions[0], 'en', 'JPY'), /51127.5 JPY/);
  assert.equal(annualSummary(l, '2024', 'JPY').vest.value, '86850');
  assert.equal(annualSummary(l, '2024', 'JPY').dividend.value, '1215');
  assert.match(annualDisplay(l, '2024', 'en', 'JPY'), /86850/);
});
test('JPY gain subtracts separately recorded JPY cost, never converts the USD gain at sale-date FX', async () => {
  let l = await fixture(); const sale = l.transactions[4];
  l = setSaleValuation(l, sale.id, { proceeds: '299', cost: '212.50', evidence: 'fictional allocation' });
  assert.equal(annualSummary(l, '2025', 'JPY').gain.value, null);
  l = setSaleValuation(l, sale.id, { proceeds: '299', cost: '212.50', costJpy: '21250', evidence: 'fictional historical JPY allocation' });
  assert.equal(annualSummary(l, '2025').gain.value, '86.5');
  assert.equal(annualSummary(l, '2025', 'JPY').gain.value, '20610');
  assert.throws(() => setSaleValuation(l, sale.id, { proceeds: '299', cost: '212.50', costJpy: '-1', evidence: 'fixture' }));
});
test('merge is idempotent, revisions and explicit missing observations supersede prior values, saves migrate', async () => {
  let l = await fixture(); const initial = l.fxRates[0];
  l = mergeFxSeries(l, [initial]); assert.equal(l.fxRates.length, 1);
  const revision = await makeFxSeries(csv.replace('100.25', ''), '2026-09-27T00:00:00.000Z');
  l = mergeFxSeries(l, [revision]); assert.equal(fxObservation(l, '2023-12-28')?.rate, '101');
  assert.equal(fxObservation(l, '2023-12-28')?.date, '2023-12-29');
  assert.equal(l.fxRates[0].observations[0].rate, '100.25');
  l = readLedger(JSON.stringify(l)); assert.equal(l.fxRates.length, 2);
  const old = JSON.parse(JSON.stringify(l)); delete old.fxRates;
  assert.deepEqual(readLedger(JSON.stringify(old)).fxRates, []);
});
test('FX collector validates before replacing its cache', async () => {
  const { mkdtemp, writeFile, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url'); const { spawnSync } = await import('node:child_process');
  const cwd = await mkdtemp(join(tmpdir(), 'rsu-fx-test-')); const input = join(cwd, 'fictional.csv');
  const args = [fileURLToPath(new URL('../scripts/collect-fx.ts', import.meta.url)), '--csv', input];
  await writeFile(input, csv); assert.equal(spawnSync(process.execPath, args, { cwd }).status, 0);
  const before = await readFile(join(cwd, 'public/fx.json'), 'utf8');
  await writeFile(input, '<html>blocked</html>'); assert.equal(spawnSync(process.execPath, args, { cwd }).status, 1);
  assert.equal(await readFile(join(cwd, 'public/fx.json'), 'utf8'), before);
});

test('FX fallback uses the earliest later nonmissing date across batches and year boundaries', async () => {
  let l = emptyLedger();
  l = mergeFxSeries(l, [await makeFxSeries('observation_date,DEXJPUS\n2024-12-27,100\n2024-12-30,101\n2024-12-31,.\n2025-01-01,\n2025-01-02,102\n')]);
  assert.equal(fxObservation(l, '2024-12-27')?.datePolicy, 'exact');
  assert.equal(fxObservation(l, '2024-12-28')?.date, '2024-12-30');
  const choice = fxObservation(l, '2024-12-31');
  assert.equal(choice?.targetDate, '2024-12-31');
  assert.equal(choice?.date, '2025-01-02');
  assert.equal(choice?.datePolicy, 'next-available');
  assert.equal(fxObservation(l, '2025-01-03'), null);
  assert.equal(fxObservation(l, null), null);
  assert.equal(fxObservation(l, 'invalid'), null);
  const restored = readLedger(JSON.stringify(l));
  assert.deepEqual(fxObservation(restored, '2024-12-31'), choice);
});
