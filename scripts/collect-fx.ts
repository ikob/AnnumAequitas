// Fetches public FX history only; never reads brokerage records.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { FX_CSV, fxBundleSchema, makeFxSeries } from '../src/fx.ts';
const { values } = parseArgs({ options: { csv: { type: 'string' } } });
try {
  const csv = values.csv ? await readFile(values.csv, 'utf8') : await (async () => { const r = await fetch(FX_CSV, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })();
  const series = await makeFxSeries(csv);
  let bundle: ReturnType<typeof fxBundleSchema.parse> = { format: 'annum-aequitas-fx', version: 1, series: [] };
  try { bundle = fxBundleSchema.parse(JSON.parse(await readFile('public/fx.json', 'utf8'))); } catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; }
  if (!bundle.series.some(s => s.sha256 === series.sha256)) bundle.series.push(series);
  fxBundleSchema.parse(bundle);
  await mkdir('data/cache/fx', { recursive: true }); await mkdir('public', { recursive: true });
  await writeFile(`data/cache/fx/${series.sha256}.csv`, csv);
  await writeFile('public/fx.json.tmp', JSON.stringify(bundle)); await rename('public/fx.json.tmp', 'public/fx.json');
  console.log(`Saved ${series.observations.length} USD/JPY observations (including missing dates). FRED DEXJPUS; NY noon buying rate, not TTM.`);
} catch(e) { console.error(e instanceof Error ? e.message : 'FX collection failed'); process.exitCode = 1; }
