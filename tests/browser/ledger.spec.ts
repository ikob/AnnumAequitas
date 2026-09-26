import type { Page, TestInfo } from '@playwright/test';
import type { Ledger } from '../../src/ledger.ts';
import { test, expect, reloadWithCoverage } from './coverage.ts';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Public, fictional fixtures only. Never load data/real-* or local market caches.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4178') return route.abort();
    if (/\/(instruments|prices|fx)\.json$/.test(url.pathname))
      return route.fulfill({ status: 404, body: 'No test cache' });
    return route.continue();
  });
  await page.goto('/');
});

async function accept(page: Page) {
  await expect(page.locator('#consent-accept')).toBeDisabled();
  await page.locator('#consent-check').check();
  await page.locator('#consent-accept').click();
  await expect(page.locator('#upload')).toBeVisible();
}

async function downloadFile(page: Page, button: string, path: string) {
  const pending = page.waitForEvent('download');
  await page.locator(button).click();
  await (await pending).saveAs(path);
  return path;
}

async function saveLedger(page: Page, info: TestInfo, name = 'saved-ledger.json') {
  const path = await downloadFile(page, '#save', info.outputPath(name));
  return { path, ledger: JSON.parse(await readFile(path, 'utf8')) as Ledger };
}

const csvFile = (name: string, csv: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });

async function importFx(page: Page, csv: string) {
  await page.locator('nav [data-view="market"]').click();
  await page.locator('[data-market-tab="fx"]').click();
  await page.locator('#fx-csv').setInputFiles(csvFile('fictional-fx.csv', csv));
  await expect(page.locator('#fx-export')).toBeEnabled();
}

test('consent is explicit, persists, and an outdated version asks again', async ({ page, context }) => {
  await accept(page);
  const cookie = (await context.cookies()).find(c => c.name === 'shikob.net.annum-aequitas-consent-dev')!;
  expect(cookie.domain).toBe('127.0.0.1');
  expect(cookie.sameSite).toBe('Lax');
  await reloadWithCoverage(page);
  await expect(page.locator('#upload')).toBeVisible();
  await context.addCookies([{ ...cookie, value: 'old-version' }]);
  await reloadWithCoverage(page);
  await expect(page.locator('#consent-accept')).toBeDisabled();
  await expect(page.locator('#upload')).toHaveCount(0);
});

test('GMO cost editing updates gain, preserves settlement, and survives save/open', async ({ page }, info) => {
  await accept(page);
  await page.locator('#csv-file').setInputFiles(resolve('data/sample-gmo/demo.csv'));
  await page.locator('nav [data-view="review"]').click();
  const deposit = page.locator('tr').filter({ has: page.locator('td', { hasText: /^2022\/02\/15 10:30$/ }) });
  await deposit.locator('summary').click();
  await deposit.locator('input[name="amount"]').fill('3000000');
  await deposit.locator('form button').click();
  await expect(deposit.locator('td').nth(4)).toHaveText('—');
  await expect(deposit.locator('td').nth(5)).toContainText('3000000 JPY');
  const sale = page.locator('tr').filter({ has: page.locator('td', { hasText: /^2024\/04\/12 12:00$/ }) });
  await expect(sale.locator('td').nth(5)).toContainText('800000 JPY');
  await expect(page.locator('.annual-cards')).toContainText('400000 JPY');
  const downloaded = page.waitForEvent('download');
  await page.locator('#save').click();
  const path = info.outputPath('fictional-ledger.json');
  await (await downloaded).saveAs(path);
  expect(JSON.parse(await readFile(path, 'utf8')).cryptoCosts[0].amountJpy).toBe('3000000');
  await reloadWithCoverage(page);
  await expect(page.locator('#save')).toBeDisabled();
  await page.locator('#json-file').setInputFiles(path);
  await expect(page.locator('.annual-cards')).toContainText('400000 JPY');
  await expect(sale.locator('td').nth(5)).toContainText('800000 JPY');
});

test('Merrill import, estimate selection, and mixed asset folding', async ({ page }) => {
  await accept(page);
  await page.locator('#csv-file').setInputFiles(resolve('data/sample-ml/demo.csv'));
  await expect(page.locator('[data-year="2023"]')).toBeVisible();
  await page.locator('nav [data-view="market"]').click();
  const mapping = page.locator('[data-market-mapping]').first();
  await mapping.locator('input[name="name"]').fill('Fictional Company');
  await mapping.locator('button').click();
  await page.locator('#price-csv').setInputFiles({
    name: 'fictional-prices.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Date,Open,High,Low,Close,Volume\n2023-12-28,40,40,40,40,100\n'),
  });
  await page.locator('nav [data-view="review"]').click();
  const price = page.locator('article.source').filter({ hasText: '2023-12-29' });
  const choices = price.locator('[data-price-row]');
  await expect(choices).toHaveCount(2);
  for (const index of [0, 1, 0]) {
    await choices.nth(index).click();
    await expect(choices.nth(index)).toHaveAttribute('aria-pressed', 'true');
    await expect(choices.nth(1-index)).toHaveAttribute('aria-pressed', 'false');
  }
  await page.locator('[data-clear-price]').first().click();
  await expect(choices.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#csv-file').setInputFiles(resolve('data/sample-gmo/demo.csv'));
  const stock = page.locator('[data-asset-section="stocks"]');
  await stock.locator(':scope > summary').click();
  await expect(stock).not.toHaveAttribute('open', '');
  await page.locator('nav [data-view="overview"]').click();
  await expect(stock).not.toHaveAttribute('open', '');
  await expect(page.locator('[data-asset-section="crypto"]')).toHaveAttribute('open', '');
  await stock.locator(':scope > summary').click();
  await expect(stock).toHaveAttribute('open', '');
});

test('Holdings and Portfolio uploads convert to JPY, reject malformed FX, and restore caches', async ({ page }, info) => {
  await accept(page);
  await page.locator('#broker').selectOption('merrill');
  await page.locator('#csv-file').setInputFiles([
    resolve('data/sample-ml/multi-year/holdings-2025.csv'),
    resolve('data/sample-ml/multi-year/portfolio-2025.csv'),
  ]);
  await expect(page.locator('article.source').filter({ hasText: 'holdings-2025.csv' }).filter({ has: page.locator('dl.raw') })).toContainText('9250');
  await expect(page.locator('article.source').filter({ hasText: 'portfolio-2025.csv' }).filter({ has: page.locator('dl.raw') })).toContainText('21924.26');
  await page.locator('nav [data-view="review"]').click();
  await expect(page.locator('article.mapping')).toContainText('FICT');
  await importFx(page, 'observation_date,DEXJPUS\n2025-12-31,150\n');
  await page.locator('#fx-csv').setInputFiles(csvFile('older-fx.csv', 'observation_date,DEXJPUS\n2020-01-01,100\n'));
  await expect(page.locator('#fx-export')).toBeEnabled();
  const fxPath = await downloadFile(page, '#fx-export', info.outputPath('fx.json'));
  await page.locator('#fx-csv').setInputFiles(csvFile('broken.csv', 'bad,header\nwrong,value\n'));
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await page.locator('#fx-json').setInputFiles(fxPath);
  await expect(page.locator('[role="status"].error')).toHaveCount(0);
  await page.locator('nav [data-view="overview"]').click();
  await page.locator('#display-currency').selectOption('JPY');
  const position = page.locator('tr').filter({ has: page.locator('td', { hasText: /^FICT$/ }) });
  // 125 shares × USD 74 × JPY 150. Original net value × 150 = 3,288,639.
  await expect(position.locator('td').nth(4)).toHaveText('1387500');
  await expect(page.locator('[data-asset-section="stocks"]')).toContainText('3288639');
  const saved = await saveLedger(page, info);
  expect(saved.ledger.balances).toHaveLength(2);
  expect(saved.ledger.fxRates).toHaveLength(2);
  await reloadWithCoverage(page);
  await page.locator('#json-file').setInputFiles(saved.path);
  await page.locator('#display-currency').selectOption('JPY');
  await expect(position.locator('td').nth(4)).toHaveText('1387500');
});

test('stock cost total, average, history and JPY forms update the annual gain and persist', async ({ page }, info) => {
  await accept(page);
  await page.locator('#csv-file').setInputFiles(resolve('data/sample-ml/demo.csv'));
  await importFx(page, 'observation_date,DEXJPUS\n2023-12-28,100\n2024-06-14,120\n2025-02-07,150\n');
  await page.locator('nav [data-view="overview"]').click();
  await page.locator('[data-year="2025"]').click();
  const row = page.locator('tr').filter({ has: page.locator('td.date', { hasText: /^2025-02-07$/ }) });
  await row.locator('[data-detail]').click();
  const form = page.locator('#sale-valuation');
  const result = page.locator('#detail-dialog section.source > h3');
  await expect(form.locator('[name="proceeds"]')).toHaveValue('299.00');
  await form.locator('[name="amount"]').fill('200');
  await form.locator('[type="submit"]').click();
  await expect(result).toHaveText(/\(USD\): 99$/);
  await form.locator('[name="method"]').selectOption('average');
  await form.locator('[name="amount"]').fill('30');
  await form.locator('[type="submit"]').click();
  await expect(result).toHaveText(/\(USD\): 149$/); // 299 − 5 × 30.
  await form.locator('[name="method"]').selectOption('history');
  await form.locator('[name="history"]').fill('not,a,valid,history');
  await form.locator('[type="submit"]').click();
  await expect(page.locator('#detail-dialog [role="status"].error')).toBeVisible();
  await expect(result).toHaveText(/\(USD\): 149$/); // Invalid input must not replace prior decision.
  await form.locator('[name="method"]').selectOption('history');
  await form.locator('[name="history"]').fill('2023-12-28, 2, 80\n2024-06-14, 3, 150');
  await form.locator('[type="submit"]').click();
  await expect(result).toHaveText(/\(USD\): 69$/); // 299 − (80 + 150).
  await page.locator('#close-detail').click();
  await expect(page.locator('.annual-summary .annual-cards article').filter({ hasText: 'Realized gain' }).locator('strong')).toHaveText('69');
  await page.locator('#display-currency').selectOption('JPY');
  await row.locator('[data-detail]').click();
  await expect(result).toHaveText(/\(JPY\): 18850$/); // 299×150 − (80×100 + 150×120).
  await form.locator('[name="method"]').selectOption('total');
  await form.locator('[name="currency"]').selectOption('JPY');
  await form.locator('[name="amount"]').fill('30000');
  await form.locator('[name="note"]').fill('Fictional opening cost');
  await form.locator('[type="submit"]').click();
  await expect(result).toHaveText(/\(JPY\): 14850$/);
  await page.locator('#close-detail').click();
  const saved = await saveLedger(page, info);
  expect(saved.ledger.costInputs[0]).toMatchObject({ method: 'total', currency: 'JPY', amount: '30000' });
  await reloadWithCoverage(page);
  await page.locator('#json-file').setInputFiles(saved.path);
  await page.locator('#display-currency').selectOption('JPY');
  await row.locator('[data-detail]').click();
  await expect(form.locator('[name="amount"]')).toHaveValue('30000');
  await expect(result).toHaveText(/\(JPY\): 14850$/);
  await page.locator('#clear-sale').click();
  await expect(page.locator('#clear-sale')).toHaveCount(0);
  await page.locator('#close-detail').click();
  expect((await saveLedger(page, info, 'cleared.json')).ledger.costInputs).toHaveLength(0);
});

test('source coverage and opening forms validate, preserve language drafts, and save/remove', async ({ page }, info) => {
  await accept(page);
  await page.locator('#csv-file').setInputFiles(resolve('data/sample-ml/demo.csv'));
  await page.locator('nav [data-view="sources"]').click();
  const coverage = page.locator('[data-coverage]').first();
  await coverage.locator('[name="start"]').fill('2025-12-31');
  await coverage.locator('[name="end"]').fill('2023-01-01');
  await coverage.locator('[name="note"]').fill('Fictional coverage note');
  await coverage.locator('button').click();
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await coverage.locator('[name="start"]').fill('2023-01-01');
  await coverage.locator('[name="end"]').fill('2025-12-31');
  await coverage.locator('[name="note"]').fill('Fictional coverage note');
  await coverage.locator('button').click();
  await expect(page.locator('[role="status"].error')).toHaveCount(0);
  const opening = page.locator('#opening');
  await opening.locator('[name="date"]').fill('2022-12-31');
  await opening.locator('[name="symbol"]').fill('FICT');
  await opening.locator('[name="quantity"]').fill('10');
  await opening.locator('[name="cost"]').fill('400');
  await opening.locator('[name="evidence"]').fill('Fictional opening');
  await page.locator('#locale').selectOption('ja');
  await expect(opening.locator('[name="evidence"]')).toHaveValue('Fictional opening');
  await opening.locator('[type="submit"]').click();
  await expect(page.locator('[data-remove-opening]')).toHaveCount(1);
  const saved = await saveLedger(page, info);
  expect(saved.ledger.sources[0].coverage).toMatchObject({ start: '2023-01-01', end: '2025-12-31' });
  expect(saved.ledger.openings[0]).toMatchObject({ quantity: '10', cost: '400', currency: 'USD' });
  await reloadWithCoverage(page);
  await page.locator('#json-file').setInputFiles(saved.path);
  await page.locator('nav [data-view="sources"]').click();
  await expect(coverage.locator('[name="note"]')).toHaveValue('Fictional coverage note');
  await expect(page.locator('[data-remove-opening]')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-remove-opening]').click();
  expect((await saveLedger(page, info, 'removed.json')).ledger.openings).toHaveLength(0);
});

test('file chooser, instrument search and price forms keep prior data on invalid imports', async ({ page }, info) => {
  await page.route('**/instruments.json', route => route.fulfill({ json: {
    version: 1, fetchedAt: '2026-09-26T00:00:00Z', sources: [],
    instruments: [{ symbol: 'FICT', name: 'Fictional Cloud Corporation', exchange: 'OTHER' }],
  } }));
  await reloadWithCoverage(page);
  await accept(page);
  const choosing = page.waitForEvent('filechooser');
  await page.locator('#upload').click();
  await (await choosing).setFiles(resolve('data/sample-ml/demo.csv'));
  await page.locator('nav [data-view="review"]').click();
  const mapping = page.locator('article.mapping').filter({ hasText: 'DEMO-CUSIP' });
  await mapping.locator('input').fill('Fictional Cloud');
  const candidate = mapping.locator('[data-candidate]').first();
  await expect(candidate).toContainText('FICT');
  await mapping.locator('input').press('ArrowDown');
  await expect(candidate).toBeFocused();
  await candidate.press('Enter');
  await expect(mapping.locator('.resolved')).toContainText('Fictional Cloud Corporation');
  await page.locator('nav [data-view="market"]').click();
  await page.locator('#price-start').fill('2023-12-28');
  await page.locator('#price-end').fill('2023-12-29');
  await page.locator('#price-request [type="submit"]').click();
  await expect(page.locator('#prepared-price a')).toHaveAttribute('href', /d1=20231228.*d2=20231229/);
  await page.locator('#price-start').fill('2023-12-27');
  await expect(page.locator('#prepared-price')).toHaveCount(0);
  await page.locator('#auto-price-range').click();
  await expect(page.locator('#price-start')).toHaveValue('2023-12-28');
  await page.locator('#price-csv').setInputFiles(csvFile('prices.csv', 'Date,Open,High,Low,Close,Volume\n2023-12-28,40,40,40,40,100\n'));
  await expect(page.locator('#export-prices')).toBeEnabled();
  const path = await downloadFile(page, '#export-prices', info.outputPath('prices.json'));
  await page.locator('#price-json').setInputFiles(path);
  await expect(page.locator('[role="status"].error')).toHaveCount(0);
  const before = await saveLedger(page, info, 'before-invalid.json');
  await page.locator('#price-csv').setInputFiles(csvFile('invalid-price.csv', 'Date,Close\nwrong,zero\n'));
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await page.locator('#csv-file').setInputFiles(csvFile('invalid-activity.csv', 'bad,header\nwrong,value\n'));
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await page.locator('#json-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.locator('[role="status"].error')).toBeVisible();
  const after = await saveLedger(page, info, 'after-invalid.json');
  expect(after.ledger).toEqual(before.ledger);
  expect(after.ledger.marketPrices).toHaveLength(1);
  expect(after.ledger.mappings).toHaveLength(2);
});

test('large mixed ledgers paginate independently without changing totals or saved records', async ({ page }, info) => {
  await accept(page);
  const stock = (await readFile(resolve('data/sample-ml/demo.csv'), 'utf8')).trim().split(/\r?\n/);
  const crypto = (await readFile(resolve('data/sample-gmo/demo.csv'), 'utf8')).trim().split(/\r?\n/);
  await page.locator('#csv-file').setInputFiles([
    csvFile('many-stocks.csv', [stock[0], ...Array.from({ length: 121 }, (_, i) => stock[1].replace('BATCH A', `BATCH ${i}`))].join('\n')),
    csvFile('many-crypto.csv', [crypto[0], ...Array.from({ length: 121 }, (_, i) => crypto[1].replace('DEMO-TRANSFER', `DEMO-${i}`))].join('\n')),
  ]);
  const stockRows = page.locator('.transaction-list tbody tr');
  const cryptoRows = page.locator('.crypto-transactions tbody tr');
  const stockNav = page.getByRole('navigation', { name: 'Stock transaction pages' });
  const cryptoNav = page.getByRole('navigation', { name: 'Crypto transaction pages' });
  await expect(stockRows).toHaveCount(50);
  await expect(cryptoRows).toHaveCount(50);
  const totals = await page.locator('.annual-summary').innerText();
  await expect(page.locator('.annual-summary')).toContainText('61710'); // 121 × 12 × 42.50.
  await stockNav.getByRole('button', { name: 'Next' }).click();
  await stockNav.getByRole('button', { name: 'Next' }).click();
  await expect(stockRows).toHaveCount(21);
  await expect(stockNav.getByRole('button', { name: 'Next' })).toBeDisabled();
  await expect(cryptoRows).toHaveCount(50);
  await cryptoNav.getByRole('button', { name: 'Next' }).click();
  await cryptoNav.getByRole('button', { name: 'Next' }).click();
  await expect(cryptoRows).toHaveCount(21);
  expect(await page.locator('.annual-summary').innerText()).toBe(totals);
  await page.locator('#filter').fill('BATCH 120');
  await expect(stockRows).toHaveCount(1);
  await expect(stockNav).toHaveCount(0);
  await page.locator('#filter').fill('nothing-matches');
  await expect(stockRows).toContainText('No matching transactions');
  await page.locator('#filter').fill('');
  await expect(stockRows).toHaveCount(50);
  await page.locator('[data-year="2022"]').click();
  await expect(cryptoRows).toHaveCount(50);
  const saved = await saveLedger(page, info);
  expect(saved.ledger.transactions).toHaveLength(121);
  expect(saved.ledger.cryptoTransactions).toHaveLength(121);
  await page.locator('nav [data-view="review"]').click();
  await expect(cryptoRows).toHaveCount(50);
  await expect(page.locator('[data-price-row]')).toHaveCount(50);
  await stockNav.getByRole('button', { name: 'Next' }).click();
  await stockNav.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('[data-price-row]')).toHaveCount(21);
  await cryptoNav.getByRole('button', { name: 'Next' }).click();
  await expect(cryptoNav).toContainText('51–100 of 121');
  await cryptoNav.getByRole('button', { name: 'Previous' }).click();
  await expect(cryptoNav).toContainText('1–50 of 121');
});

test('duplicate exclusion, undo and keeping separate survive save/open', async ({ page }, info) => {
  await accept(page);
  const csv = await readFile(resolve('data/sample-ml/demo.csv'), 'utf8');
  const lines = csv.trim().split(/\r?\n/);
  await page.locator('#csv-file').setInputFiles([csvFile('original.csv', csv), csvFile('overlap.csv', lines.slice(0, 2).join('\n'))]);
  await page.locator('nav [data-view="review"]').click();
  await expect(page.locator('[data-exclude]')).toHaveCount(2);
  await page.locator('[data-exclude]').first().click();
  await expect(page.locator('[data-include]')).toHaveCount(1);
  await page.locator('[data-include]').click();
  await expect(page.locator('[data-exclude]')).toHaveCount(2);
  await page.locator('[data-exclude]').first().click();
  const saved = await saveLedger(page, info);
  expect(saved.ledger.transactions.filter(t => t.excluded)).toHaveLength(1);
  await reloadWithCoverage(page);
  const choosing = page.waitForEvent('filechooser');
  await page.locator('#restore').click();
  await (await choosing).setFiles(saved.path);
  await page.locator('nav [data-view="review"]').click();
  await page.locator('[data-include]').click();
  await page.locator('[data-keep]').first().click();
  if (await page.locator('[data-keep]').count()) await page.locator('[data-keep]').first().click();
  await expect(page.locator('[data-exclude]')).toHaveCount(0);
  expect((await saveLedger(page, info, 'kept.json')).ledger.transactions.some(t => t.duplicateReviewed)).toBe(true);
});

test('demo, disclaimer revisit, escape, dirty replacement cancel and leave protection', async ({ page }, info) => {
  await page.locator('#consent-language').selectOption('ja');
  await accept(page);
  await page.locator('#locale').selectOption('en');
  await downloadFile(page, '#download-demo', info.outputPath('sample.csv'));
  await page.locator('#demo').click();
  await expect(page.locator('.demo-banner')).toBeVisible();
  await page.locator('#show-disclaimer').click();
  await page.locator('#consent-back').click();
  await expect(page.locator('.demo-banner')).toBeVisible();
  await page.locator('.transaction-list [data-detail]').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#detail-dialog')).toHaveCount(0);
  await page.locator('#csv-file').setInputFiles(resolve('data/sample-gmo/demo.csv'));
  await expect(page.locator('[role="status"].error')).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#leave-demo').click();
  await expect(page.locator('.demo-banner')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#leave-demo').click();
  await expect(page.locator('.demo-banner')).toHaveCount(0);
  const choosing = page.waitForEvent('filechooser');
  await page.locator('#empty-upload').click();
  await (await choosing).setFiles(resolve('data/sample-ml/demo.csv'));
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#json-file').setInputFiles(resolve('data/sample-ml/multi-year/fictional-ledger.json'));
  await expect(page.locator('.transaction-list .pill')).toContainText('6 RECORDS');
  const leaving = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const dialog = await leaving;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await expect(page.locator('#save')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#json-file').setInputFiles(resolve('data/sample-ml/multi-year/fictional-ledger.json'));
  await expect(page.locator('.transaction-list .pill')).toContainText('37 RECORDS');
});

test('drag/drop imports, local caches, revised quotes and missing caches are handled offline', async ({ page }, info) => {
  const csv = await readFile(resolve('data/sample-ml/demo.csv'), 'utf8');
  const drop = async () => {
    const transfer = await page.evaluateHandle(text => { const data = new DataTransfer(); data.items.add(new File([text], 'drop.csv', { type: 'text/csv' })); return data; }, csv);
    await page.dispatchEvent('body', 'dragover', { dataTransfer: transfer });
    await page.dispatchEvent('body', 'drop', { dataTransfer: transfer });
    await transfer.dispose();
  };
  await drop();
  await expect(page.locator('#consent-accept')).toBeDisabled();
  await accept(page);
  await expect(page.locator('#save')).toBeDisabled();
  await drop();
  await expect(page.locator('.transaction-list .pill')).toContainText('6 RECORDS');
  await drop();
  await expect(page.locator('.transaction-list .pill')).toContainText('6 RECORDS');
  await page.locator('nav [data-view="market"]').click();
  await page.locator('#refresh-prices').click();
  await expect(page.locator('[role="status"].error')).toBeVisible();
  const fictional = JSON.parse(await readFile(resolve('data/sample-ml/multi-year/fictional-ledger.json'), 'utf8')) as Ledger;
  await page.route('**/prices.json', route => route.fulfill({ json: { format: 'annum-aequitas-prices', version: 1, series: fictional.marketPrices } }));
  await page.locator('#refresh-prices').click();
  await expect(page.locator('#export-prices')).toBeEnabled();
  const mapping = page.locator('[data-market-mapping]').first();
  await mapping.locator('[name="name"]').fill('Fictional Cloud');
  await mapping.locator('button').click();
  await page.locator('#price-csv').setInputFiles(csvFile('revision.csv', 'Date,Open,High,Low,Close,Volume\n2023-12-29,99,99,99,99,100\n'));
  await expect(page.locator('#export-prices')).toBeEnabled();
  // Fixture cache is unadjusted; imported CSV is unknown. Only like bases conflict.
  await expect(page.locator('details').filter({ hasText: '2023-12-29' })).toHaveCount(0);
  await page.locator('#price-csv').setInputFiles(csvFile('revision-2.csv', 'Date,Open,High,Low,Close,Volume\n2023-12-29,98,98,98,98,100\n'));
  await expect(page.locator('details').filter({ hasText: '2023-12-29' })).toContainText('99');
  await page.locator('#price-csv').setInputFiles(csvFile('complete-range.csv', 'Date,Open,High,Low,Close\n2023-12-28,40,40,40,40\n2025-02-10,60,60,60,60\n'));
  await expect(page.locator('main')).toContainText('Cached date spans cover this range');
  await page.locator('#price-start').fill('2025-12-31');
  await page.locator('#price-end').fill('2020-01-01');
  await page.locator('#price-request [type="submit"]').click();
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await page.locator('[data-market-tab="fx"]').click();
  await page.locator('#fx-local').click();
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await page.route('**/fx.json', route => route.fulfill({ json: { format: 'annum-aequitas-fx', version: 1, series: fictional.fxRates } }));
  await page.locator('#fx-local').click();
  await expect(page.locator('#fx-export')).toBeEnabled();
  const saved = await saveLedger(page, info);
  expect(saved.ledger.marketPrices.length).toBeGreaterThan(1);
  expect(saved.ledger.fxRates.length).toBeGreaterThan(0);
});

test('blocked cookie and storage allow session use, with no implicit persistent consent', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'cookie', { get: () => '', set: () => {} });
    Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('Storage blocked for test'); } });
  });
  await reloadWithCoverage(page);
  await accept(page);
  await expect(page.locator('[role="status"]')).toContainText('session');
  await page.locator('#locale').selectOption('ja');
  await page.locator('#csv-file').setInputFiles(resolve('data/sample-gmo/demo.csv'));
  await page.locator('[data-asset-section="crypto"] > summary').click();
  await page.locator('[data-asset-section="crypto"] > summary').click();
  await downloadFile(page, '#save', info.outputPath('blocked-storage-ledger.json'));
  await reloadWithCoverage(page);
  await expect(page.locator('#consent-accept')).toBeDisabled();
});

test('invalid manual inputs and oversized files leave the ledger intact', async ({ page }, info) => {
  // Exercise browser File size guards without allocating multiple 51 MB buffers.
  await page.addInitScript(() => {
    Object.defineProperty(File.prototype, 'size', { get() { return this.name.startsWith('oversize') ? 51 * 1024 * 1024 : 1; } });
  });
  await reloadWithCoverage(page);
  await accept(page);
  await page.locator('#csv-file').setInputFiles([resolve('data/sample-gmo/demo.csv'), resolve('data/sample-ml/demo.csv')]);
  await page.locator('nav [data-view="review"]').click();
  const detail = page.locator('[data-crypto-detail]').first();
  await detail.locator('summary').click();
  await detail.locator('[name="amount"]').fill('-1');
  await detail.locator('form button').click();
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await page.locator('nav [data-view="sources"]').click();
  const opening = page.locator('#opening');
  for (const [name, value] of Object.entries({date: '2022-12-31', symbol: 'FICT', quantity: '-1', cost: '400', evidence: 'Fictional invalid entry'}))
    await opening.locator(`[name="${name}"]`).fill(value);
  await opening.locator('[type="submit"]').click();
  await expect(page.locator('[role="status"].error')).toBeVisible();
  const before = await saveLedger(page, info, 'before-errors.json');
  await page.locator('#csv-file').setInputFiles(csvFile('oversize.csv', 'ignored'));
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await page.locator('#json-file').setInputFiles({ name: 'oversize.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await page.locator('nav [data-view="market"]').click();
  const mapping = page.locator('[data-market-mapping]').first();
  await mapping.locator('[name="name"]').fill('Fictional Company');
  await mapping.locator('button').click();
  const mapped = await saveLedger(page, info, 'mapped.json');
  await page.locator('#price-csv').setInputFiles(csvFile('oversize-price.csv', 'ignored'));
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await page.locator('#price-json').setInputFiles({ name: 'oversize-price.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.locator('[role="status"].error')).toBeVisible();
  await page.locator('[data-market-tab="fx"]').click();
  await page.locator('#fx-csv').setInputFiles(csvFile('oversize-fx.csv', 'ignored'));
  await expect(page.locator('[role="status"].error')).toBeVisible();
  const after = await saveLedger(page, info, 'after-errors.json');
  expect(after.ledger).toEqual(mapped.ledger);
  expect(before.ledger.openings).toHaveLength(0);
  expect(before.ledger.cryptoCosts).toHaveLength(0);
});

test('empty sources, missing fields, unmatched search and alternate instrument forms', async ({ page }) => {
  await accept(page);
  await page.locator('nav [data-view="sources"]').click();
  await expect(page.locator('#opening')).toBeVisible();
  const csv = await readFile(resolve('data/sample-ml/demo.csv'), 'utf8');
  const lines = csv.trim().split(/\r?\n/);
  const incomplete = lines[1].replace('12/29/2023', '').replace('01/02/2024', '').replace(' LAPSE DATE 12/28/2023 CB 42.50', '').replace(',12,--,', ',--,--,');
  await page.locator('#csv-file').setInputFiles(csvFile('incomplete.csv', lines[0] + '\n' + incomplete));
  await page.locator('nav [data-view="overview"]').click();
  await expect(page.locator('[data-year="unknown"]')).toBeVisible();
  await page.locator('nav [data-view="review"]').click();
  await expect(page.locator('[data-price-row]')).toHaveCount(0);
  await page.locator('[data-lookup]').fill('no such fictional instrument');
  await expect(page.locator('.suggestions')).not.toBeEmpty();
  await page.locator('#locale').selectOption('ja');
  await expect(page.locator('[data-lookup]')).toHaveValue('no such fictional instrument');
  await page.locator('[data-lookup]').press('Escape');
  await expect(page.locator('.suggestions')).toBeEmpty();
  await page.locator('#csv-file').setInputFiles(resolve('data/sample-ml/demo.csv'));
  await page.locator('nav [data-view="market"]').click();
  const mappings = page.locator('[data-market-mapping]');
  await mappings.nth(0).locator('[name="name"]').fill('   ');
  await mappings.nth(0).locator('button').click();
  await expect(page.locator('[role="status"].error')).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await mappings.nth(i).locator('[name="name"]').fill(`Fictional Company ${i}`);
    await mappings.nth(i).locator('button').click();
  }
  await page.locator('#price-instrument').selectOption('1');
  await expect(page.locator('#provider-symbol')).toHaveValue('demo-cusip.us');
});

test('throwing cookie access still allows explicit session consent', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'cookie', {
      get: () => { throw new Error('Cookie access blocked'); },
      set: () => { throw new Error('Cookie access blocked'); },
    });
  });
  await reloadWithCoverage(page);
  await accept(page);
  await expect(page.locator('[role="status"]')).toContainText('session');
});

test('catalog arriving after import resolves source symbols without replacing the ledger', async ({ page }, info) => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/instruments.json', async route => {
    await ready;
    await route.fulfill({ json: { version: 1, fetchedAt: '2026-09-26T00:00:00Z', sources: [], instruments: [{ symbol: 'FICT', name: 'Late Fictional Catalog', exchange: 'OTHER' }] } });
  });
  await reloadWithCoverage(page);
  await accept(page);
  await page.locator('#csv-file').setInputFiles(resolve('data/sample-ml/demo.csv'));
  await page.locator('nav [data-view="review"]').click();
  await expect(page.locator('.resolved')).toHaveCount(0);
  release();
  await expect(page.locator('.resolved')).toContainText('Late Fictional Catalog');
  const saved = await saveLedger(page, info);
  expect(saved.ledger.transactions).toHaveLength(6);
});

test('legacy saved sale costs can be cleared and download URLs are released', async ({ page }, info) => {
  await accept(page);
  await page.locator('#csv-file').setInputFiles(resolve('data/sample-ml/demo.csv'));
  const dividend = page.locator('tr').filter({ has: page.locator('span.type.dividend') });
  await dividend.locator('[data-detail]').click();
  await expect(page.locator('#detail-dialog')).toBeVisible();
  await page.locator('#close-detail').click();
  await page.evaluate(() => {
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = url => { document.documentElement.dataset.downloadReleased = 'true'; original.call(URL, url); };
  });
  const saved = await saveLedger(page, info);
  await expect(page.locator('html')).toHaveAttribute('data-download-released', 'true');
  const sale = saved.ledger.transactions.find(t => t.kind === 'sale')!;
  saved.ledger.saleValuations = [{ transactionId: sale.id, fingerprint: sale.fingerprint, instrumentId: null, proceeds: '299', cost: '200', costJpy: null, currency: 'USD', evidence: 'Fictional legacy cost', reviewedAt: '2026-09-26T00:00:00Z' }];
  await page.locator('#json-file').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved.ledger)) });
  await page.locator('tr').filter({ has: page.locator('span.type.sale') }).locator('[data-detail]').click();
  await expect(page.locator('#sale-valuation [name="amount"]')).toHaveValue('200');
  await page.locator('#clear-sale').click();
  await expect(page.locator('#clear-sale')).toHaveCount(0);
  await page.locator('#close-detail').click();
  expect((await saveLedger(page, info, 'legacy-cleared.json')).ledger.saleValuations).toHaveLength(0);
});
