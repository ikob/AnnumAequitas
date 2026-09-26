// This collector reads only public price CSV, never brokerage statements or ledgers.
import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { makePriceSeries, priceBundleSchema, stooqUrl } from '../src/market.ts';
const { values } = parseArgs({ options: {
  symbol: { type: 'string' }, exchange: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' },
  'provider-symbol': { type: 'string' }, csv: { type: 'string' }, help: { type: 'boolean' },
} });
async function main() {
  if (values.help) { console.log('npm run prices -- --symbol AAPL --exchange NASDAQ --from 2024-01-01 --to 2024-12-31 [--provider-symbol aapl.us] [--csv /path/to/download.csv]'); return; }
  const { symbol, exchange, from, to } = values;
  if (!symbol || !['NYSE', 'NASDAQ', 'OTHER'].includes(exchange ?? '') || !from || !to) throw new Error('Provide --symbol, --exchange NYSE|NASDAQ|OTHER, --from YYYY-MM-DD, and --to YYYY-MM-DD. Use --help for an example.');
  const providerSymbol = values['provider-symbol'] ?? `${symbol.toLowerCase()}.us`;
  const url = stooqUrl(providerSymbol, from, to);
  let csv: string;
  if (values.csv) csv = await readFile(values.csv, 'utf8');
  else {
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error(`Stooq returned HTTP ${response.status}. Download ${url} in a browser, then use --csv.`);
    csv = await response.text();
  }
  const series = await makePriceSeries(csv, { symbol: symbol.toUpperCase(), exchange: exchange as 'NYSE' | 'NASDAQ' | 'OTHER', providerSymbol, start: from, end: to });
  let bundle: ReturnType<typeof priceBundleSchema.parse> = { format: 'annum-aequitas-prices', version: 1, series: [] };
  try { bundle = priceBundleSchema.parse(JSON.parse(await readFile('public/prices.json', 'utf8'))); }
  catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; }
  if (!bundle.series.some(s => s.symbol === series.symbol && s.exchange === series.exchange && s.sha256 === series.sha256 && s.sourceUrl === series.sourceUrl)) bundle.series.push(series);
  priceBundleSchema.parse(bundle);
  await mkdir('data/cache/prices', { recursive: true });
  await mkdir('public', { recursive: true });
  await writeFile(`data/cache/prices/${series.sha256}.csv`, csv);
  await writeFile('public/prices.json.tmp', JSON.stringify(bundle));
  await rename('public/prices.json.tmp', 'public/prices.json');
  console.log(`Saved ${series.bars.length} daily observations for ${series.exchange}:${series.symbol}. Adjustment basis and redistribution rights are unverified. Refresh Market data in the app.`);
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Price collection failed'); console.error('Existing prices.json was not replaced. No private records were sent.'); process.exitCode = 1; });
