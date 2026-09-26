import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultLocale, en, ja, parseLocale, translate, translateIssue } from '../src/i18n.ts';
import type { MessageKey } from '../src/i18n.ts';
import { emptyLedger, importCsv, readLedger } from '../src/ledger.ts';

test('English is the default and unsupported preferences fall back to English', () => {
  assert.equal(defaultLocale, 'en');
  for (const value of [null, undefined, '', 'jp', 'fr', 'en-US']) assert.equal(parseLocale(value), 'en');
  assert.equal(parseLocale('ja'), 'ja');
  assert.equal(translate('en', 'review'), 'Review');
  assert.equal(translate('ja', 'review'), '確認すること');
});

test('English and Japanese messages have matching keys and interpolation fields', () => {
  assert.deepEqual(Object.keys(ja).sort(), Object.keys(en).sort());
  const fields = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const key of Object.keys(en) as MessageKey[]) {
    assert.ok(ja[key].trim(), key);
    assert.deepEqual(fields(en[key]), fields(ja[key]), key);
    assert.doesNotMatch(en[key], /[ぁ-んァ-ヶ一-龠]/, key);
  }
  assert.equal(translate('en', 'importSummary', { count: 2, repeated: 1 }), 'Imported files: 2. Already imported: 1.');
});

test('old Japanese issue text is rebuilt as language-neutral codes without altering source data or decisions', async () => {
  const csv = readFileSync(new URL('../data/sample-ml/demo.csv', import.meta.url), 'utf8');
  const ledger = (await importCsv(emptyLedger(), csv, 'fictional.csv')).ledger;
  ledger.transactions[0].issues = ['vest の課税日・評価額・CB の意味を明細で確認'];
  ledger.transactions[0].duplicateReviewed = true;
  const restored = readLedger(JSON.stringify(ledger));
  assert.deepEqual(restored.transactions[0].raw, ledger.transactions[0].raw);
  assert.equal(restored.transactions[0].duplicateReviewed, true);
  assert.deepEqual(restored.transactions[0].issues, ['vest']);
  const before = JSON.stringify(restored);
  assert.match(translateIssue('en', restored.transactions[0].issues[0]), /Review a unit-price estimate/);
  assert.match(translateIssue('ja', restored.transactions[0].issues[0]), /評価方法/);
  assert.equal(translateIssue('en', 'date:Trade Date'), 'Trade Date is unconfirmed');
  assert.equal(JSON.stringify(restored), before);
});
