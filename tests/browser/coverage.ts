import MCR from 'monocart-coverage-reports';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test as base, type Page } from '@playwright/test';

export const report = () => MCR({
  name: 'Browser E2E coverage',
  outputDir: 'coverage/e2e',
  reports: ['v8', 'v8-json', 'console-details', 'lcovonly'],
  sourceFilter: source => /(?:^|\/)src\/.*\.ts$/.test(source),
});

async function collect(page: Page) {
  const entries = await page.coverage.stopJSCoverage();
  const appEntries = entries.filter(entry => /^http:\/\/127\.0\.0\.1:4178\/assets\/[^/]+\.js$/.test(entry.url));
  if (!appEntries.length) throw new Error('No application coverage was collected');
  for (const entry of appEntries) {
    const file = resolve('dist', new URL(entry.url).pathname.slice(1));
    const sourceMap = JSON.parse(await readFile(`${file}.map`, 'utf8'));
    await report().add([{ ...entry, sourceMap }]);
  }
}

// Flush before navigation: Chrome can discard coverage when documents change.
export async function reloadWithCoverage(page: Page) {
  await collect(page);
  await page.coverage.startJSCoverage();
  await page.reload();
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.coverage.startJSCoverage();
    try { await use(page); } finally { await collect(page); }
  },
});
export { expect } from '@playwright/test';
