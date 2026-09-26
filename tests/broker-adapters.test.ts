import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { BrokerAdapter, type BrokerSelection } from '../src/brokers/adapter.ts';
import { MerrillAdapter } from '../src/brokers/merrill.ts';
import { GmoAdapter } from '../src/brokers/gmo-adapter.ts';
import { brokerAdapters, getBrokerAdapter, selectBrokerAdapter } from '../src/brokers/registry.ts';
import { emptyLedger, importCsv, readLedger } from '../src/ledger.ts';
import { LedgerError } from '../src/values.ts';
const fixture = (path: string) => readFileSync(new URL(`../data/${path}`, import.meta.url), 'utf8');
const activity = fixture('sample-ml/demo.csv');
const holdings = fixture('sample-ml/multi-year/holdings-2026.csv');
const portfolio = fixture('sample-ml/multi-year/portfolio-2026.csv');
const crypto = fixture('sample-gmo/demo.csv');
const documentError = (error: unknown) => error instanceof LedgerError && error.code === 'documentType';

test('registered derived adapters detect document families and reject wrong explicit selection', async () => {
  assert.deepEqual(brokerAdapters.map(a => a.id), ['merrill', 'gmo']);
  for (const adapter of brokerAdapters) assert.ok(adapter instanceof BrokerAdapter);
  assert.ok(getBrokerAdapter('merrill') instanceof MerrillAdapter);
  assert.ok(getBrokerAdapter('gmo') instanceof GmoAdapter);
  for (const [csv, kind] of [[activity, 'activity'], [holdings, 'holdings'], [portfolio, 'portfolio']] as const) {
    assert.equal(getBrokerAdapter('merrill').detect(csv), kind);
    assert.equal(selectBrokerAdapter(csv, 'auto').id, 'merrill');
    assert.equal(selectBrokerAdapter(csv, 'merrill').id, 'merrill');
    assert.throws(() => selectBrokerAdapter(csv, 'gmo'), documentError);
  }
  assert.equal(selectBrokerAdapter(crypto, 'auto').id, 'gmo');
  assert.equal(selectBrokerAdapter(crypto, 'gmo').id, 'gmo');
  assert.throws(() => selectBrokerAdapter(crypto, 'merrill'), documentError);
  assert.throws(() => getBrokerAdapter('unknown'), documentError);
  assert.throws(() => selectBrokerAdapter('unknown\nrow', 'auto'), documentError);
  assert.throws(() => getBrokerAdapter('gmo').parse(activity, 'demo'), documentError);
  await assert.rejects(importCsv(emptyLedger(), activity, 'demo.csv', 'unknown' as BrokerSelection), documentError);
});

test('auto detection rejects ambiguous headers while explicit selection disambiguates', () => {
  const ml = Papa.parse<string[]>(activity.trim()).data;
  const gmo = Papa.parse<string[]>(crypto.trim()).data;
  const ambiguous = Papa.unparse([[...ml[0], ...gmo[0]], [...ml[1], ...gmo[1]]]);
  assert.throws(() => selectBrokerAdapter(ambiguous, 'auto'), documentError);
  assert.equal(selectBrokerAdapter(ambiguous, 'merrill').id, 'merrill');
  assert.equal(selectBrokerAdapter(ambiguous, 'gmo').id, 'gmo');
});

test('adapters preserve mixed documents through raw-row reconstruction without changing saved format', async () => {
  let records = emptyLedger();
  for (const input of [activity, holdings, portfolio, crypto]) records = (await importCsv(records, input, 'fictional.csv')).ledger;
  assert.deepEqual(records.sources.map(s => s.documentKind), ['activity', 'holdings', 'portfolio', 'crypto-activity']);
  assert.deepEqual(readLedger(JSON.stringify(records)), records);
  const changed = structuredClone(records);
  changed.transactions[0].amount = '999999';
  changed.balances[0].quantity = '999999';
  changed.cryptoTransactions[0].quantity = '999999';
  assert.deepEqual(readLedger(JSON.stringify(changed)), records);
  const mismatch = structuredClone(records);
  mismatch.sources[0].broker = 'gmo';
  assert.throws(() => readLedger(JSON.stringify(mismatch)), documentError);
  const mismatchBalance = structuredClone(records);
  mismatchBalance.sources[1].broker = 'gmo';
  assert.throws(() => readLedger(JSON.stringify(mismatchBalance)), documentError);
});

test('base class rejects unsupported restoration families', () => {
  assert.throws(() => getBrokerAdapter('gmo').restoreTransaction({}, 'demo', 2), documentError);
  assert.throws(() => getBrokerAdapter('gmo').restoreBalance({}, 'demo', 2, 'holdings'), documentError);
  assert.throws(() => getBrokerAdapter('merrill').restoreCrypto({}, 'demo', 2), documentError);
});
