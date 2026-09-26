// Public market directory only. Never reads a ledger or any personal CSV.
import { mkdir, writeFile, rename } from 'node:fs/promises';
const sources = [
  'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt',
  'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt',
];
function parse(input, exchange) {
  const lines = input.trim().split(/\r?\n/);
  const fields = lines.shift().split('|');
  for (const field of ['Security Name', 'Test Issue', exchange === 'NASDAQ' ? 'Symbol' : 'ACT Symbol']) {
    if (!fields.includes(field)) throw new Error(`Directory column missing: ${field}`);
  }
  return lines.filter(l => l && !l.startsWith('File Creation Time:')).map(line => Object.fromEntries(line.split('|').map((v, i) => [fields[i], v])))
    .filter(r => r['Test Issue'] === 'N' && (exchange === 'NASDAQ' || r.Exchange === 'N'))
    .map(r => ({ symbol: r.Symbol ?? r['ACT Symbol'], name: r['Security Name'], exchange }));
}
const inputs = await Promise.all(sources.map(async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Directory request failed: ${response.status}`);
  return response.text();
}));
const instruments = [...parse(inputs[0], 'NASDAQ'), ...parse(inputs[1], 'NYSE')];
if (instruments.length < 1000 || instruments.some(i => !i.name || !i.symbol)) throw new Error('Unexpected instrument directory; existing file unchanged');
const catalog = { version: 1, fetchedAt: new Date().toISOString(), sources, instruments };
await mkdir('public', { recursive: true });
await writeFile('public/instruments.json.tmp', JSON.stringify(catalog));
await rename('public/instruments.json.tmp', 'public/instruments.json');
console.log(`Saved ${instruments.length} instruments to public/instruments.json (local use; redistribution terms not verified).`);
