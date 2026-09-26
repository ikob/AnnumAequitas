# GMO Coin CSV imports

English | [日本語](GMO.ja.md)

## Format and supported scope

User-provided local CSVs were inspected read-only on 2026-09-26. The format has 23 UTF-8 columns, from `日時 / 精算区分 / 日本円受渡金額` through `トランザクションID`. Header-only documents are accepted. Filenames do not establish calendar years or complete coverage periods.

`GmoAdapter` delegates detection, raw-row preservation, and normalization to `src/brokers/gmo.ts`. The shared registry selects the provider. Records are stored separately from stocks in v1 `cryptoTransactions` (defaulting to an empty array when absent) and rebuilt from raw rows on restoration.

- Dealer trades normalize buy/sell quantities to incoming/outgoing movements. JPY settlement amounts retain their CSV signs.
- Crypto deposits/withdrawals are transfers. Incoming transfers require acquisition history from the source and are not treated as purchases or income.
- JPY deposits/withdrawals do not create sale gains.
- Unknown categories, invalid numbers, and unknown dates retain their original rows and are excluded from movement subtotals.
- Identical files cannot be imported twice. Duplicate candidates, identified by execution ID or identical raw rows, are all excluded from subtotals. Individual duplicate acceptance is not implemented.
- Order and transfer fees preserve the distinction between blank and zero. Do not subtract fees twice from settlement amounts. Complete balance reconstruction including transfer fees is not implemented.
- Preserve the original timestamp and parsed date. There is no timezone column; do not invent a UTC instant.
- The current format has no account field distinguishing multiple GMO accounts. Combining accounts needs an explicit model extension.

Incoming crypto transfers, dealer sales, and JPY withdrawals were checked against examples. Purchases, outgoing transfers, and JPY deposits have reverse-direction handling but have not been checked against real examples. Exchange-platform trades, leverage, and other unknown categories remain unclassified.

## Display and limitations

Overview and Review show a separate crypto section with calendar-year filtering, imported quantity movements, JPY settlement subtotals, raw rows, and sources. The stock USD/JPY display selector does not convert the original crypto JPY amounts.

Opening/year-end balances, BTC market downloads, and automatic transfer-cost continuity are not implemented. Stock opening-price cost estimates do not automatically apply to crypto.

## Public references

- [GMO: downloading CSV records](https://support.coin.z.com/hc/ja/articles/115007387148): transaction-history download instructions.
- [GMO: annual transaction information](https://support.coin.z.com/hc/ja/articles/13573383092761): annual statements provide year-end information; CSVs provide transaction details.

Public fixtures in `data/sample-gmo/` use independently fictional values. `data/real-gmo/` is Git-ignored, read-only, and excluded from serving. Never send personal documents externally.

## Manual sale costs and the 5% fallback

In sale Details, enter the **total acquisition cost in JPY for the quantity sold**. This is the allocation for that sale, not the cost of an entire incoming transfer. Manual values persist; saving a blank returns to automatic calculation. Explicit zero differs from blank.

If neither a manual cost nor usable acquisition history exists, use 5% of the gross sale value as provisional cost and subtract it from JPY net settlement proceeds. Do not double-count fees or derive profit from deposits/withdrawals. Missing sale value/proceeds, duplicates, and unsupported rows do not produce a gain estimate.

Colors are application review thresholds. Convert each sale's reference result to USD using its sale-date USD/JPY rate, then show red when the calendar-year total is strictly greater than USD 100,000. All-years view evaluates each year separately. The 5% fallback, missing values, and missing FX use amber indications. FX uses the same-day observation or the next available one, with the selected date shown.

## Multi-year purchase and exchange fixtures

`data/sample-gmo/multi-year.csv` contains 22 independent fictional events; its [README](../data/sample-gmo/README.md) explains regeneration. The actual exchange CSV format is unverified, so only the explicitly synthetic `DEMO_CRYPTO_SWAP` extension is recognized. Exchanges without JPY/USD are retained but excluded from totals. Do not ignore unknown real events simply because their JPY field is blank. Purchase costs feed the reference moving-average allocation.

## Enter incoming-transfer costs in Review

Deposit, buy, and sell detail links offer **Edit acquisition cost**. For a deposit, enter the total JPY cost carried with the entire quantity, rather than using its market value on receipt. Buys default to CSV JPY payments and allow overrides. Sale entries override the cost allocated to the sold quantity.

Precedence is sale-specific manual cost → reference moving average of imported acquisition history → 5% of sale value. Earlier sales and withdrawals consume quantities from the known purchase/deposit pool. Unknown costs or insufficient quantity trigger the fallback rather than inventing an average. Allocations round to eight decimal places. Excluding non-JPY/USD exchanges means the result is not a complete cost history. Automatic transfer matching and cross-account cost pooling are not implemented.

After saving, details stay open and inputs survive records save/restore. This supersedes earlier statements that only sales accepted inputs or purchase allocation was unimplemented.

A JPY purchase whose cost is known needs no manual input; Details shows its CSV payment. Missing USD/JPY affects only USD conversion and the USD 100,000 review threshold, not a known JPY acquisition cost. FX absence appears as a separate amber note.
