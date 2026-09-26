# AnnumAequitas

English | [日本語](README.ja.md)

A local app for organizing stock, RSU, and crypto transactions, acquisition costs, and balances by calendar year. RSU stands for **Restricted Stock Unit**, a form of equity compensation. Import CSV records, add prices and exchange rates, and review annual estimates with their sources. Built with TypeScript, with English and Japanese interfaces.

## Why this exists

The project started with the work of reconciling RSU (restricted stock unit) records and now also covers broader stock and crypto activity. Transaction history, acquisition costs, market prices, exchange rates, and balances are often scattered across separate exports. AnnumAequitas brings stock and crypto records together by calendar year so you can inspect amounts, trace their sources, and fill gaps without losing the original data.

Calculations are estimates based on imported records. Check them against the original documents and consult [UNCONFIRMED](docs/UNCONFIRMED.md) for missing features and unverified formats.

## Supported records and features

| Provider | Records | Main features |
| --- | --- | --- |
| Merrill | Activity, Holdings, Portfolio Summary | Annual RSU valuations, sale gains/losses, dividends and other cash items; USD / JPY display; year-end and latest balances |
| GMO Coin | Transaction-history CSV | Dealer buys/sells, crypto transfers, JPY deposits/withdrawals, acquisition-cost entry, estimated gains/losses |

- Calendar years are created from imported dates. Review highlights duplicate candidates and missing information.
- Save original rows, selected prices, manual entries, and evidence in a records JSON file to resume later.
- Stock and crypto sections collapse independently. Each transaction list shows 50 rows per page; totals and saved records include all applicable rows.
- Search instruments by partial name or ticker and map them to NYSE, NASDAQ, or OTHER.

Stock splits, actual Merrill sale exports, and some GMO formats have limitations. Implemented workflows and formats verified against real documents are tracked separately.

## Get started

### Run from source

Install Node.js 24 or later and Git.

```sh
git clone https://github.com/ikob/AnnumAequitas.git annum-aequitas
cd annum-aequitas
npm install
npm start
```

`npm install` prepares dependencies; `npm start` builds the app and starts its local server. No Python or separate HTTP server is needed. Stop with Ctrl+C. For development, use `npm run dev`.

Open the local URL printed in the terminal, usually http://127.0.0.1:4173/ .

Run `npm run catalog` if you want the public instrument directory. CSV import and manual instrument mapping also work without it. See [Market data](docs/MARKET_DATA.md) for prices and exchange rates.

## Try fictional data first

Choose **Try fictional demo** on the start screen to explore without your own documents. Multi-year fixtures are available for [Merrill](data/sample-ml/multi-year/README.md) and [GMO Coin](data/sample-gmo/README.md).

You can also download the [fictional Merrill records](data/sample-ml/multi-year/fictional-ledger.json) and use **Open records**. They include FICT / OTHER mappings and fictional prices and exchange rates. Save any existing records first.

## The three Merrill CSV files

| Document | Date range to obtain | Purpose and identifying columns |
| --- | --- | --- |
| **Activity / Settled Activity** | Available history through the date of the balance documents below; multiple files are fine | RSU/share receipts, sales, dividends, and withholding. Columns include `Trade Date`, `Settlement Date`, `Symbol/CUSIP #`, and `Amount ($)`. |
| **Holdings** | Latest balance, preferably COB (close of business) | Shares and valuations by instrument. Columns include `COB Date`, `Symbol`, `Quantity`, `Price ($)`, and `Value ($)`. |
| **Portfolio Summary** | Latest balance on the same date as Holdings | Cash, Money Accounts, investments, and net assets. Columns include `Cash Balance ($)`, `Money Accounts ($)`, `Priced Investments ($)`, and `Net Value ($)`. |

Export each CSV from the corresponding Merrill screen. Filenames do not need to change: detection uses the columns. Realtime exports are also supported, but use COB records for historical reconstruction. Screen names can differ by service.

You do not need Holdings and Portfolio for every past year. **Historical Activity + latest Holdings + latest Portfolio** reconstruct past year-end balances where the available history permits. For last year's figures, include this year's transactions through the latest balance date as well.

## Happy path

1. Open the app, choose a language, and read and accept the disclaimer. English is the default; local startup instructions are above.
2. Use **Add CSV** to import the three document types. Choose auto-detection or Merrill under **Broker**. Activity does not need to be split by year; year choices are created automatically.
3. In **Review**, select instruments from full-name and ticker suggestions. Inspect any duplicate candidates.
4. In **Market data**, select an instrument, download prices for the suggested period, and use **Import price CSV**. Unknown opening acquisition costs also need prices at the preceding year-end opening date. The CSV must match the supported provider format; see [Market data](docs/MARKET_DATA.md).
5. On the **USD / JPY** tab, import exchange-rate CSV/JSON. If you used the local collector, choose **Load local FX cache**; that button loads the prepared app cache, rather than opening an arbitrary local file.
6. In **Overview**, select a calendar year and JPY, then open the stock section. Review valuations, gains/losses, and dividends first, followed by the portfolio and transaction list. Stock and crypto sections collapse independently.
7. Review missing information and estimates in **Review** or row **Details**. Choose a reference price with **Select estimate** and enter sale acquisition costs when needed. Estimates used to fill missing costs remain distinct from confirmed values.
8. Use **Save** to download the records JSON. Resume with **Open records**. Save before closing or reloading the page.

## Using GMO Coin

Import transaction history with **Add CSV**, using auto-detection or **GMO Coin** under Broker. JPY purchases use the CSV payment amount as acquisition cost. For incoming transfers or other missing history, use **Edit acquisition cost** in Review.

Acquisition cost and JPY settlement amount are separate fields. Sales with insufficient history use a provisional cost of 5% of the sale value and are marked as estimates. Crypto-to-crypto exchanges without JPY/USD are outside the current calculation scope. See [supported formats and limitations](docs/GMO.md).

## Privacy and saving

Transaction parsing and calculations run in your browser. Personal transaction records are not sent to external services. **Save the records JSON before closing or reloading.** It contains original source rows, so treat it as a personal financial document.

The consent cookie stores only the accepted disclaimer version. `shikob.net` is a cookie-name identifier, not a hosting destination. Language and section expansion preferences use localStorage. If cookies are unavailable, consent lasts for the current session only. See [distribution and cookie details](docs/PUBLISHING.md).

## Contributing and adding providers

**PRs adding financial institutions are welcome. Please follow [CONTRIBUTING.md](CONTRIBUTING.md) and include tests with your PR.** Register a provider class derived from `BrokerAdapter`, implementing detection, parsing, original-row preservation, and restoration.

We cannot implement additional providers in response to issue requests. Please submit your own implementation and tests as a PR. Issues remain welcome for bugs in existing functionality.

Public fixtures must use independently invented values. Do not publish real names, accounts, quantities, amounts, timestamps, addresses, or transaction IDs. Use **FICT** and exchange **OTHER** for stock fixtures. FICT is not a globally reserved symbol.

- [CONTRIBUTING](CONTRIBUTING.md): PR criteria, data handling, and example Codex requests
- [Broker adapter guide](docs/BROKER_ADAPTERS.md): subclass contract, registration, and remaining model constraints
- [UNCONFIRMED](docs/UNCONFIRMED.md): missing features, unverified behavior, and completion criteria

Validate with Node.js 24 or later:

```sh
npm ci
npm run test:coverage
npm run build
npx playwright install chrome
npm run test:e2e
```

CI runs unit coverage, a build, and headless Chrome E2E. Minimum unit coverage is 95% lines, 80% branches, and 90% functions. E2E measures `main.ts` separately. See [coverage scope and limitations](docs/TEST_COVERAGE.md). Tests need neither personal records nor live market downloads.

## Documentation

- [Usage and reference calculations](docs/USAGE.md): annual totals, portfolios, acquisition costs, pagination, and JSON formats
- [Market data](docs/MARKET_DATA.md): obtaining and importing CSVs, price and exchange-rate selection
- [Distribution](docs/PUBLISHING.md): source installation, CI, and cookies
- [Development handoff](docs/HANDOFF.md): current architecture and working constraints

English is the default documentation language. Japanese versions use `.ja.md` and link back to their English counterparts. Keep both versions aligned when changing behavior or instructions; code comments and default PR descriptions use English.

## License

This is a personal project by Katsushi Kobayashi and is not affiliated with, sponsored by, or endorsed by his employer.

Copyright 2026 Katsushi Kobayashi <ikob@acm.org>.
Code and documentation are licensed under [Apache License 2.0](LICENSE). Personal transaction records and third-party market data are excluded.
