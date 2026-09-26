# Fictional Merrill-format test set

English | [日本語](README.ja.md)

**All values are fictional. They were not copied or anonymized from personal statements.** The instrument is Fictional Cloud Corporation / FICT and the account is DEMO-MULTI-0001. These records do not represent an actual issuer, price/FX/dividend history, or personal holdings.

## Provenance and format verification

These independently authored fixtures mimic column layouts and descriptions observed in local Merrill documents. They are not copies or adaptations of an official publicly released Merrill sample CSV.

Public references reviewed on 2026-09-26 provide format context, not the numeric values in this set:

- [Merrill statement sample PDF](https://oaui.fs.ml.com/Publish/Content/application/pdf/GWMOL/A_Guide_to_Your_Merrill_Edge_Statement.pdf) includes Sale entries, but PDF fields do not establish Activity CSV export syntax.
- [Public Holdings CSV example](https://www.bogleheads.org/forum/viewtopic.php?start=100&t=394456) provides a third-party column example, not an official CSV specification.
- [Merrill stock split explanation](https://education.ml.com/Publish/Content/application/pdf/GWMOL/StockSplits.pdf) describes share/price adjustments, not an Activity CSV example for splits.

Actual Activity examples covering sales and splits are insufficient. Event names, quantity signs, split ratios, and effective-date encoding remain unverified. In particular, `split-unsupported/` uses an invented Stock Split row with no evidence that Merrill exports it that way. These tests verify application logic, not completed compatibility with actual sale/split CSVs.

## Ticker and market data

The set explicitly maps FICT to a fictional instrument and includes fictional prices in the supported OHLC format. FICT and the alternative name DUMM are not reserved symbols guaranteed to remain unused in actual markets. Use the demo flag and explicit mapping rather than the symbol alone to identify a demo. The exchange is OTHER, with no real listing association.

A separately documented real-price scenario could specify the actual source, retrieval date, and adjustments while keeping its transactions fictional. This set uses no real market history. New contributed stock fixtures must use FICT / OTHER under [CONTRIBUTING](../../../CONTRIBUTING.md).

## Open in the app

Save current personal records, then choose **Open records → fictional-ledger.json**, using a separate tab or an already-saved session. It opens in demo mode with instrument mappings, prices, FX, and coverage periods configured. Five years of Activity and only the latest Holdings/Portfolio reconstruct earlier year ends.

Provider/URL metadata in price/FX batches is synthetic and exercises supported formats. Values were not downloaded from Stooq/FRED and do not prove actual rates or provenance. Prices and FX exist only on required fixture dates, not as a continuous market history.

## Test CSV imports

- `activity-2022.csv` through `activity-2026.csv`: 37 rows across five years, including 10 RSU receipts, 10 dividends, 10 withholding entries, and 7 sales.
- `activity-all.csv`: the same history combined. **Use either this file or the yearly files.** Importing both intentionally exercises duplicate detection.
- `holdings-2022.csv` through `holdings-2026.csv`: year-end shares/values, with the current-year snapshot dated 2026-09-25.
- `portfolio-2022.csv` through `portfolio-2026.csv`: same-date cash, investments, and net assets; includes a trailing empty column matching the observed layout.
- `prices-fictional.csv` / `fx-fictional.csv`: optional synthetic price/FX imports.

Normally import all Activity plus `holdings-2026.csv` and `portfolio-2026.csv`. Earlier snapshots are independent checks for reconstruction, not a requirement that users obtain one every year. For standalone CSVs, map FICT with a fictional company name and OTHER before importing prices. Alternatively use the preconfigured demo JSON.

## Scenario and expected values

At the start of 2022, the account has 40 shares acquired before Activity and USD 100 cash. The 40 shares reconstructed from Holdings appear as an inferred opening at 2021-12-31. The included USD 40 price gives USD 1,600 value. Fictional Federal Backup Withholding is 24% of dividends, rounded to cents, solely as a fixture assumption.

Sale Amount is net proceeds after fictional USD 1–2 fees noted in descriptions. **The specific sale CSV representation is hypothetical and has not been compared with actual Merrill sale exports.**

| Date | Shares | Cash USD | Stock value USD | Net assets USD |
| --- | ---: | ---: | ---: | ---: |
| End of 2022 | 120 | 1,145.36 | 5,760.00 | 6,905.36 |
| End of 2023 | 50 | 8,180.36 | 2,600.00 | 10,780.36 |
| End of 2024 | 100 | 9,319.26 | 6,800.00 | 16,119.26 |
| End of 2025 | 125 | 12,674.26 | 9,250.00 | 21,924.26 |
| 2026-09-25 | 175 | 13,641.66 | 14,700.00 | 28,341.66 |

The large 2023 sale exceeds imported acquisitions by 10 shares. Filling that shortage with the opening-reference price produces a provisional USD 1,798 gain. Later sales include losses calculable from the Activity average cost.

`expected.json` contains balance and annual-flow checks derived from the generator's cash/quantity carry-forward, not copied from application output.

## Unsupported split case

Import `split-unsupported/` alone into empty records, not together with the standard set. The fictional sequence is acquire 10 shares → 2-for-1 split → sell 4 → hold 16. Total cost remains USD 1,000; unit cost becomes USD 50. Once implemented, the independently expected sale gain would be USD 39.

**The app currently does not adjust ratios, effective dates, or acquisition prices for splits.** Expected current behavior is an `other` / review-required Stock Split row and unconfirmed sale gains/reconstruction across the event. Observed Holdings/Portfolio still display. A split omitted from the CSV cannot be detected. Importing adjusted prices alone does not implement quantity/cost adjustments.

## Regenerate and verify

Run `npm run fixtures` to regenerate and `npm test` to verify. The generator never reads `data/real-*`. The smaller `../demo.csv` remains a regression fixture.
