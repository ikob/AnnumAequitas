# Usage and reference calculations

English | [日本語](USAGE.ja.md)

See [README](../README.md) for initial startup and the Merrill import workflow.

## Available operations

- Add CSV detects Merrill Activity, Holdings, and Portfolio Summary from columns. Broker allows auto-detection or explicit Merrill selection.
- Holdings/Portfolio support dated and realtime formats. Sources & balances shows snapshot dates, accounts, quantities, cash, Money Accounts, investment values, net assets, and original rows. Snapshots stay separate in this source view and survive save/restore.
- Import multiple Merrill CSVs, drag and drop files, select years derived from Trade Date, search, and inspect original details.
- Preserve missing vs zero, parenthesized negatives, comma-separated numbers, multiple dates, and CB fields. Store numeric values as decimal strings without losing input precision.
- Prevent identical-file reimports and display identical-row duplicate candidates. Exclude/undo or retain them as separate stock transactions.
- Search full names, tickers, and exchanges. A unique exact ticker match in the current directory is mapped automatically and can be changed manually.
- Record coverage periods and evidence, opening balances, and unknown acquisition costs.
- Save and restore JSON, including raw CSV rows. Treat the saved file as a personal financial document.

Imported transaction data is processed in memory, not sent to servers/external APIs or stored in persistent browser storage. Save before closing; resume with Open records. Automatic development reloads are disabled. Save before manually reloading to see code changes.

## Interface language

English is the initial language. Use **Language** in the sidebar to select English or Japanese. Only the language and stock/crypto expansion preferences use localStorage; the browser's language does not choose the default.

Switching languages preserves records, searches, and form drafts. Original descriptions and user notes are not translated. Calculation methods do not change.

Translations live in `src/i18n.ts`. English keys define the type contract; tests check matching keys and placeholders. Add another language with a matching dictionary, Locale type, and selector entry. Review issues use language-independent codes. Older saved rows are rebuilt from their originals.

## Instrument directory

`npm run catalog` downloads NYSE/NASDAQ instruments from Nasdaq Trader and saves source and retrieval information to `public/instruments.json`. It does not read personal records. Search runs locally over that static directory; query text is not sent externally. Run the same command to refresh it.

Source/format: [Nasdaq Trader Symbol Directory Definitions](https://www.nasdaqtrader.com/Trader.aspx?id=SymbolDirDefs). This is a current directory; delistings, historical name changes, and ticker reuse need separate verification. Downloads are Git-ignored and redistribution terms remain unverified. Local builds copy the directory to dist; keep both local and Git-ignored. The app is distributed as source. CSV import/save and fictional demos work before downloading the directory.

## Daily stock prices

Market data creates key-free Stooq CSV download links and imports the resulting files. It suggests From / To from instrument-specific record dates, then missing periods outside the cache. Same-day observations merge with revisions and source history preserved. Save includes the cache; a price-only JSON export is also available.

Compare CB / Price / same-day close candidates and save selected reference prices with their sources. Dividends/withholding do not require blanket review; missing values, signs, and duplicates still do.

See `npm run prices -- --help` for collection. Stooq returned HTTP 403 in the development environment; actual automatic downloads have not succeeded. Adjustment methods and redistribution rights are unverified. See [Market data](MARKET_DATA.md) for operations, formats, and limits.

## Annual USD totals

Selecting an Overview year shows vest valuation, realized gain/loss, sale proceeds, dividends, and withholding separately. Vest compensation is separate from stock gains/losses and dividends; gains/losses and dividends also remain distinct. The app does not automatically offset or combine all categories.

Instrument breakdowns show each category and link to original details. Confirmed exchange/ticker pairs group together; unresolved source identifiers stay separate. Year classification currently uses Trade Date provisionally. Search does not alter annual totals.

- Vest valuation is quantity × reference unit price, preferring a reviewed selection, then same-day close, then CB / Price candidates. Unreviewed counts are shown.
- Sale Details accepts net proceeds, allocated acquisition cost in USD, and evidence. Their difference contributes to annual gains/losses. Without manual input, costs average acquisitions within imported Activity.
- Source amount stays unchanged. The transaction Amount column shows provisional vest value, sale proceeds, or original dividend/withholding amounts. Prices and sources are in Review / Details; gains/losses are shown separately in annual totals.
- Missing values and unresolved duplicates are excluded with partial totals and unconfirmed counts. Unknown is not zero; unknown dates are not assigned a year.
- Reference FX conversion is supported. Totals do not guarantee complete document coverage.

## USD / JPY

Use the **USD / JPY** tab in Market data.

```sh
npm run fx
```

The collector downloads public FRED DEXJPUS CSV data without an API key and stores provenance, timestamp, and hash in `public/fx.json`. To use a local FRED CSV, run `npm run fx -- --csv /path/to/file.csv`.

Choose **Load local FX cache**, then JPY under Overview's **Currency** to convert rows and annual estimates. UI CSV/JSON imports and FX-cache exports are also available. Save includes imported FX data.

[FRED DEXJPUS](https://fred.stlouisfed.org/series/DEXJPUS) is JPY per USD at the New York noon buying rate, not TTM. Vest uses LAPSE DATE, falling back to Trade Date. Dividends, withholding, and sale proceeds use Trade Date. Missing/holiday dates use the next available observation, with both requested and selected dates shown. If no later observation exists, conversion remains unconfirmed. Year grouping still uses Trade Date.

JPY sale gain/loss = converted net proceeds − allocated JPY acquisition cost. It uses imported acquisition history provisionally and allows manual corrections in Details. Missing inputs stay unconfirmed. It does not multiply the entire USD gain by the sale-date rate.

## Year-end and latest portfolios

All and the current year show the latest imported balances. Past years show December 31 portfolios in the selected USD/JPY currency. Year choices also appear with balance-only imports. Latest net assets are the Portfolio Summary value and are not added to stock/cash/Money Accounts components.

Historical balances reverse supported Activity using settlement dates from later COB snapshots. Unconfirmed coverage makes results conditional on complete history. Missing dates, unresolved duplicates, unsupported movements, or negative reconstructed quantities leave values unconfirmed. Historical Money Accounts remain unconfirmed because sweeps are unsupported.

Valuation uses the latest cached close on or before the valuation date for a confirmed instrument and shows its actual price date. Without a historical price, only quantity is shown. Unadjusted/unverified valuations remain provisional. JPY portfolios use the latest FRED observation on or before the balance valuation date, with the selected date in Details. Missing FX remains unconfirmed. Status details link to source snapshots and contributing transactions.

Below the shared year/currency controls, stocks appear as totals → portfolio → transaction list. Import and review counts are compact supplementary information. Search filters only the transaction list.

## Correcting stock acquisition costs and sale gains

Without manual costs, the app averages acquisitions for the same account/instrument before the sale within imported Activity. It does not allocate highest prices first. Acquisitions currently cover RSU vesting; unsupported purchases/transfers are not silently included. JPY calculations convert each acquisition on its own date before averaging, rather than converting the final USD gain at the sale-date rate.

Missing quantities use the latest available opening-reference price, and the entire affected sale appears separately in red as an estimated gain with unconfirmed cost. Prefer an explicit opening date, then the preceding year-end opening inferred from Holdings, otherwise the earliest Activity/recorded coverage start. Details shows reference date, price date, FX, average price, quantity, and formula. Missing prices/FX remain unconfirmed. A loss alone is not a warning-color condition.

Details offers total cost, average unit cost, and acquisition-history input in USD or JPY; sale proceeds remain USD. Notes/attachments are optional, with unevidenced manual entries labeled accordingly. History lists date, quantity, and total cost allocated to this sale and averages them. Total/average inputs establish costs only in their entered currency; USD history can be converted by acquisition date. Clear restores automatic calculation.

These are estimates over imported history, not complete cross-account costing or reconstruction of acquisitions before Activity. Same-day ordering is not established: acquisitions precede disposals. Allocations round to 12 decimal places while preserving the remaining pool's cost.

## GMO Coin crypto CSVs

Add CSV auto-detects GMO history; Broker can also specify GMO Coin. Incoming BTC, dealer buys/sells, and JPY transfers appear in a separate section with annual quantity movements, JPY settlement amounts, and original fee fields. Header-only CSVs are accepted. Incoming crypto is a transfer whose cost may be unknown.

Enter total JPY cost for a sale manually, otherwise use imported acquisition history, falling back to provisional 5% cost when history is insufficient. See [GMO details](GMO.md) and [fictional fixtures](../data/sample-gmo/README.md).

Overview/Review stock and crypto sections collapse separately while keeping gains, stock values, and review counts in their headings. Overview's year selection is shared. Crypto cost and settlement columns remain native JPY. Cost is a separate column with quantity scope and source: CSV, manual, moving average, or provisional 5%.

## Pagination

Stock and crypto transaction lists each show 50 rows per page with Previous / Next. Transaction-derived stock Review lists and crypto Review also paginate. Page number and displayed/total range are shown; sections page independently.

Changing year, view, search, importing CSVs, or reopening records returns to the first page. Stock search filters all rows before slicing. Annual totals, portfolios, review counts, and saved records always include all applicable rows. Pagination limits rendering, not import/calculation time or total memory use.

## Saved-file identifiers

Display name: AnnumAequitas. Machine name: `annum-aequitas`. Records use `format: "annum-aequitas"` and `version: 1`; prices use `annum-aequitas-prices`; FX uses `annum-aequitas-fx`. Files with old identifiers cannot be opened unchanged. The naming migration changes only the top-level format identifier, preserving other contents.

Downloads, npm, artifacts, consent cookies, and preference keys share the new namespace. Consent and preferences therefore need to be set again when moving from the old name.
