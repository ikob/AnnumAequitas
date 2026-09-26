import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { addOpening, dateValue, displayYear, duplicateIds, emptyLedger, importCsv, numberValue, parseCsv, readLedger, resolveKnownSymbols, searchInstruments, setCoverage } from '../src/ledger.ts';
const csv = readFileSync(new URL('../data/sample-ml/demo.csv', import.meta.url), 'utf8');

test('arbitrary periods yield calendar years without conflating settlement and lapse dates', () => {
  const rows = parseCsv(csv, 'fixture');
  assert.equal(rows.length, 6);
  assert.deepEqual([...new Set(rows.map(displayYear))], ['2023', '2024', '2025']);
  assert.equal(rows[0].tradeDate, '2023-12-29');
  assert.equal(rows[0].settlementDate, '2024-01-02');
  assert.equal(rows[0].lapseDate, '2023-12-28');
  assert.equal(rows[0].grantDate, '2022-01-10');
  assert.equal(rows[0].price, null);
  assert.equal(rows[0].amount, '0.00');
  assert.equal(rows[0].cb, '42.50');
  assert.ok(rows[0].issues.includes('vest'));
  assert.equal(rows[3].amount, '-1.94');
  assert.equal(rows[4].quantity, '-5');
  assert.equal(rows[4].kind, 'sale');
});

test('decimal parsing preserves precision, zero and missingness', () => {
  assert.equal(numberValue('1,234.56000000001'), '1234.56000000001');
  assert.equal(numberValue('(1,234.50)'), '-1234.50');
  assert.equal(numberValue('0.00'), '0.00');
  assert.equal(numberValue('--'), null);
  assert.equal(numberValue(''), null);
  for (const bad of ['1,2', 'NaN', '1e3', '$50', '(--)', '1.2.3']) assert.throws(() => numberValue(bad));
});

test('invalid dates are not rolled over into another year or month', () => {
  assert.equal(dateValue('02/29/2024'), '2024-02-29');
  for (const bad of ['02/29/2023', '13/01/2024', '--', '12/31/24', '2024-04-31']) assert.equal(dateValue(bad), null);
  assert.equal(displayYear(parseCsv(csv.replace('12/29/2023', 'bad date'), 'bad')[0]), 'unknown');
});

test('CSV quoting, BOM, header whitespace, embedded newlines, and untrusted descriptions are preserved', () => {
  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: true }).data;
  parsed[1][8] = 'A, "quoted"\n<script>alert(1)</script>';
  parsed[1][10] = '1,234.125';
  const rows = parseCsv('\uFEFF' + Papa.unparse(parsed), 'quoted');
  assert.equal(rows[0].raw['Description 2'], parsed[1][8]);
  assert.equal(rows[0].quantity, '1234.125');
  assert.equal(rows[0].kind, 'other');
});

test('malformed headers, column counts and quotes reject the import', () => {
  assert.throws(() => parseCsv('a,b\n1,2', 'bad'));
  assert.throws(() => parseCsv(csv.replace(',Amount ($)', ',Quantity'), 'bad'));
  assert.throws(() => parseCsv(csv.replace('12,--,0.00', '12,--'), 'bad'));
  assert.throws(() => parseCsv(csv + '"unterminated', 'bad'));
});

test('same file is idempotent; overlapping files retain both rows for review', async () => {
  const first = await importCsv(emptyLedger(), csv, 'one.csv');
  const same = await importCsv(first.ledger, csv, 'renamed.csv');
  assert.equal(same.repeated, true);
  assert.equal(same.ledger.transactions.length, 6);
  const partial = csv.split('\n').slice(0, 2).join('\n');
  const overlap = (await importCsv(first.ledger, partial, 'overlap.csv')).ledger;
  assert.equal(overlap.transactions.length, 7);
  assert.equal(duplicateIds(overlap).size, 2);
  overlap.transactions[6].excluded = true;
  assert.equal(duplicateIds(overlap).size, 0);
  assert.equal(overlap.transactions.length, 7);
});

test('save and restore preserve original rows, mapping, coverage, opening unknown cost and review decisions', async () => {
  let ledger = (await importCsv(emptyLedger(), csv, 'fictional.csv')).ledger;
  ledger.mappings.push({ key: 'symbol:FICT', instrument: { name: 'Fictional Corporation', symbol: 'FICT', exchange: 'NASDAQ' } });
  ledger.transactions[0].duplicateReviewed = true;
  ledger = setCoverage(ledger, ledger.sources[0].id, { start: '2023-01-01', end: '2025-12-31', note: 'Fictional download range' });
  ledger = addOpening(ledger, { id: 'opening-1', instrumentKey: 'symbol:FICT', date: '2023-01-01', quantity: '20', cost: null, currency: 'USD', evidence: 'Cost unavailable in fictional statement' });
  assert.deepEqual(readLedger(JSON.stringify(ledger)), ledger);
  assert.equal(ledger.openings[0].cost, null);
  assert.throws(() => setCoverage(ledger, ledger.sources[0].id, { start: '2025-12-31', end: '2023-01-01', note: 'bad' }));
});

test('untrusted save files cannot change parsed data, add unknown fields or reference missing sources', async () => {
  const ledger = (await importCsv(emptyLedger(), csv, 'fictional.csv')).ledger;
  assert.equal(ledger.format, 'annum-aequitas');
  assert.equal(ledger.version, 1);
  assert.throws(() => readLedger(JSON.stringify({ ...ledger, format: 'rsu-ledger' })));
  assert.throws(() => readLedger('{invalid'));
  assert.throws(() => readLedger(JSON.stringify({ ...ledger, version: 2 })));
  assert.throws(() => readLedger(JSON.stringify({ ...ledger, executable: 'bad' })));
  assert.throws(() => readLedger(JSON.stringify({ ...ledger, sources: [] })));
  ledger.transactions[0].amount = '9999';
  assert.equal(readLedger(JSON.stringify(ledger)).transactions[0].amount, '0.00');
});

test('search matches partial full names, ticker prefixes and multiple terms without selecting automatically', () => {
  const items = [
    { name: 'Fictional Cloud Corporation', symbol: 'FICT', exchange: 'NASDAQ' as const },
    { name: 'Demo Orchard Technologies', symbol: 'DORC', exchange: 'NYSE' as const },
  ];
  for (const q of ['fiction', 'cloud', 'FIC', 'ＦＩＣＴ', 'cloud corp', 'fct']) assert.equal(searchInstruments(items, q)[0]?.symbol, 'FICT');
  assert.equal(searchInstruments(items, 'orchard')[0].exchange, 'NYSE');
  assert.deepEqual(searchInstruments(items, ''), []);
  assert.deepEqual(searchInstruments(items, 'missing'), []);
});


test('exact ticker matching resolves unique symbols, preserves choices and leaves CUSIP or ambiguous symbols for review', async () => {
  const ledger = (await importCsv(emptyLedger(), csv, 'fictional.csv')).ledger;
  const item = { name: 'Fictional Cloud Corporation', symbol: 'FICT', exchange: 'NASDAQ' as const };
  const resolved = resolveKnownSymbols(ledger, [item]);
  assert.equal(resolved.mappings.length, 1);
  assert.equal(resolved.mappings[0].key, 'symbol:FICT');
  assert.equal(resolveKnownSymbols(ledger, [item, { ...item, exchange: 'NYSE' }]).mappings.length, 0);
  resolved.mappings[0].instrument = { ...item, symbol: 'MANUAL' };
  assert.equal(resolveKnownSymbols(resolved, [item]).mappings[0].instrument.symbol, 'MANUAL');
});

test('save files with forged record identities or negative opening cost are rejected', async () => {
  const ledger = (await importCsv(emptyLedger(), csv, 'fictional.csv')).ledger;
  ledger.transactions[0].id = 'forged';
  assert.throws(() => readLedger(JSON.stringify(ledger)));
  assert.throws(() => addOpening(emptyLedger(), { id: 'negative', instrumentKey: 'symbol:FICT', date: '2023-01-01', quantity: '10', cost: '-20', currency: 'USD', evidence: 'test' }));
});
