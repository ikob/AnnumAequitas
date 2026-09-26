# Daily prices and reference unit values

English | [日本語](MARKET_DATA.ja.md)

As of 2026-09-26, the project prioritizes public CSV downloads that require no API key. It supports Stooq-style daily OHLC CSVs. Public download access does not imply an open redistribution license. Adjustment methods and redistribution rights remain unverified.

## Using the interface

1. Confirm an instrument in Review using full-name, ticker, and exchange suggestions.
2. Select it in Market data. From / To dates are suggested from Trade, LAPSE, and Settlement dates and opening balances. The first download covers the required period; later suggestions use the first missing interval outside cached observations. Choose Prepare download.
3. Open the Stooq link, then load the downloaded file with Import price CSV.
4. Overview uses imported same-day closes in provisional amounts. Price precedence is reviewed selection, same-day close, then CB / Price candidates. Compare prices and sources in Review / Details. An automatic candidate remains distinct from a reviewed selection.
5. Save the records JSON to retain market observations, selected values, and sources.

The provider symbol initially suggests the `.us` suffix; verify the instrument at the provider. The CSV itself has no instrument identifier, so make sure it matches the selected instrument. Opening a price URL sends the symbol and date range, not brokerage CSVs, holdings, or accounts. Do not bypass provider authentication.

## Incremental downloads and caches

- Required periods are instrument-specific. Excluded rows, other instruments, and Grant Date do not determine the period.
- Adding CSV records may extend either end of the required period. Multiple missing intervals are listed; the form selects the first.
- The end date is the latest relevant document date, not automatically today. You can edit dates and return with Use suggested dates.
- Coverage uses minimum/maximum validated observation dates, not merely requested ranges. Gaps within that range are not filled or assumed to be exchange holidays. Missing same-day valuation candidates remain unconfirmed.
- The merged cache distinguishes instrument, provider symbol, adjustment, currency, and date. A day is not counted twice; the newest fetched observation becomes the candidate. Earlier raw data and provenance remain, and revised prices/volume can be inspected.
- Save includes both the cache and source observations. Export price cache produces a price-only JSON file; Import price JSON can reuse it in another record set. No automatic browser persistence is used.
- Import advances the suggestion to the next missing interval. Covering the overall period does not guarantee every individual required date exists.

## Local collector

This example uses a public symbol and does not describe anyone's holdings:

```sh
npm run prices -- --symbol AAPL --exchange NASDAQ --from 2024-01-01 --to 2024-12-31
```

If automatic retrieval is refused, provide a CSV downloaded in your browser:

```sh
npm run prices -- --symbol AAPL --exchange NASDAQ --from 2024-01-01 --to 2024-12-31 --csv /path/to/aapl.csv
```

Use `--provider-symbol` when necessary. The collector does not read personal records. After validation, it saves raw CSVs under `data/cache/prices/` and normalized JSON in `public/prices.json`; both are Git-ignored. Load them through Market data's local-price button and save your records afterward.

You can also import the JSON through the UI without reloading the records page. A failed collection does not replace existing JSON. Authentication HTML is never interpreted as price data.

## Saved observations and candidate meaning

- Preserve daily OHLC/volume, USD currency, exchange (NYSE/NASDAQ/OTHER), provider symbol, period, source URL, import timestamp, and raw CSV SHA-256.
- `fetchedAt` is the collection time for automatic downloads or the import time for manual CSVs. It does not recover the original browser download time.
- Split/dividend adjustment remains `unknown`. Adjusted history is not assumed to be the original vest-date value.
- CB and Price are possible unit-price candidates; keep their original values and descriptions. Their price dates are not established by those fields alone.
- Prefer LAPSE DATE for comparison; explicitly fall back to Trade Date. This does not establish the correct date for every use.
- Only same-day closes become candidates. Holidays/missing dates do not automatically use the preceding trading day.
- A selection reviews a reference price, not the underlying date, valuation method, or acquisition-cost evidence. Price × quantity is also an estimate.
- Save selected candidates as independent snapshots. Later market updates do not overwrite them. Changing instrument mapping invalidates the previous selection and requires review again.
- Do not substitute a closing price for sale proceeds.
- Dividends and withholding with ordinary complete amounts/dates do not require blanket review. Unresolved instruments, missing fields, unusual signs, and duplicates still require attention.

## Research and verification

- [Stooq daily CSV endpoint](https://stooq.com/q/d/l/?s=aapl.us&i=d&d1=20240101&d2=20240110): returned browser-verification HTML or HTTP 403 in the development environment. Automatic retrieval of actual prices has not succeeded; manual browser retrieval is also unverified.
- [Nasdaq Historical Quotes](https://www.nasdaq.com/market-activity/quotes/historical) and [Nasdaq Legal](https://www.nasdaq.com/legal): public display and usage terms were reviewed, but Nasdaq was not adopted as a collector source.
- [IRS Backup Withholding](https://www.irs.gov/businesses/small-businesses-self-employed/backup-withholding): a primary reference supporting preservation of the source description instead of assuming every withholding category means the same thing.

Tests use fictional OHLC and brokerage CSVs. They cover validation, matching dates, selected-price save/restore, stable selections after updates, instrument changes, cash-row review conditions, and cache preservation on collection failure. Safari workflow verification remains incomplete.
