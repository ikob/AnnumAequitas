# UNCONFIRMED — missing features and unverified behavior

English | [日本語](UNCONFIRMED.ja.md)

A handoff list for contributors, as of 2026-09-26. **Passing tests does not establish compatibility with every provider's actual CSV format or correctness for every calculation.**

- **UNCONFIRMED / Not implemented**: functionality is missing or incomplete.
- **UNCONFIRMED / Unverified**: code or a hypothetical format exists, but comparison with real documents or independent evidence is incomplete.
- On completion, record the date, evidence, and test links, then move the item to a resolved section.

## Imports and balances

| ID | Status | Current behavior and open question | Evidence and completion criteria |
| --- | --- | --- | --- |
| ML-01 | Unverified | Merrill sale CSVs: fictional Sale rows have not been compared with real sale exports. Sale entries in an official PDF do not establish CSV syntax. | Verify sale/fee fields, trade and settlement dates, and quantity signs; add independently fictional parser fixtures. |
| ML-02 | Not implemented / Unverified | Splits and reverse splits: actual CSV representation is unknown. Hypothetical Stock Split rows stop gain and balance reconstruction as unsupported. Missing event rows cannot be detected. | Establish effective dates, ratios, and meanings of added/post-event quantities. Verify shares, total cost, average price, and adjusted market data together. |
| ML-03 | Not implemented | Historical Money Accounts, sweeps, unknown receipts/deliveries and transfers. Unknown movements are not zero. | Reconcile movements with balance documents and rule out cash/fund double counting. |
| ML-04 | Not implemented | Reconstruction of fully sold instruments absent from Holdings; document completeness. Absence does not prove zero balance. | Verify against complete account-wide snapshots and acquisition/full-sale histories. |
| COMMON-01 | Partially implemented | Abstract base class, provider subclasses, and registry exist. Saved schemas and shared calculations retain provider-specific assumptions. | Complete provider-independent records and regression coverage for mixed imports and saved-file compatibility. |
| COMMON-02 | Not implemented | OCR imports of historical documents. | Add confirmation for dates, quantities, currencies, amounts, and source pages, with recognition-error detection. |

## GMO and crypto

| ID | Status | Current behavior and open question | Evidence and completion criteria |
| --- | --- | --- | --- |
| GMO-01 | Unverified | Buys, outgoing crypto transfers, and JPY deposits have reverse-direction handling but no comparison with actual examples. Checked categories are incoming transfers, dealer sales, and JPY withdrawals. | Verify categories, signs, fees, and settlement amounts; add fictional regressions. |
| GMO-02 | Not implemented / Unverified | Actual crypto-exchange CSV syntax is unknown. `DEMO_CRYPTO_SWAP` and extra source/destination columns are a test-only extension, not an official format or proof that a pair is offered. | Identify the provider, pair, and export syntax; retain both assets and fees. Non-JPY/USD exchanges remain outside the user-selected calculation scope. |
| GMO-03 | Not implemented | Exchange-platform trades, leverage, and unknown categories retain raw rows and remain unclassified. | Verify official descriptions, actual formats, and balance/gain semantics for each category. |
| CRYPTO-01 | Partially implemented / Unverified | Buys and manually costed deposits feed a reference moving average. Earlier disposals consume the pool; missing history/quantity triggers 5%. Sale-specific manual costs take precedence. Method selection, cross-account pooling, and equal-timestamp ordering are incomplete. | Independently verify the chosen period/method against complete acquisitions/opening balances. Excluding exchanges is a scope choice, not complete costing. |
| CRYPTO-02 | Not implemented | Matching transfers between own accounts/wallets and carrying acquisition costs forward. Deposits are not purchases or income. | Match both ends, quantities, and fees; verify that moving assets does not create a new cost or gain. |
| CRYPTO-03 | Not implemented | Opening, year-end/latest, and complete fee-inclusive balances. Displayed movements are not holdings. | Reconcile balance documents with complete flows, including exchanges, transfer fees, and missing periods. |
| CRYPTO-04 | Not implemented | Multiple GMO accounts, networks/contracts, and USD-denominated crypto transactions. Current GMO amount fields are JPY-specific. | Identify accounts/assets/currencies explicitly; test that USD and identically named tokens are not mistaken for JPY/BTC. |
| CRYPTO-05 | Partially implemented | Individual duplicate acceptance is missing; detection/exclusion exists. CSV timezone is unverified. | Persist duplicate decisions; establish timezone evidence and test date boundaries. |

## Market data, valuations, and UI

| ID | Status | Current behavior and open question | Evidence and completion criteria |
| --- | --- | --- | --- |
| DATA-01 | Unverified | Automatic Stooq retrieval returned 403. Adjustment and redistribution terms remain unverified. | Confirm permitted retrieval, dates, split adjustments, and provenance. Do not call fictional OHLC actual market data. |
| DATA-02 | Not implemented | BTC and other crypto market downloads and holdings valuations. | Establish pairs, timestamps/daily boundaries, sources, and usage terms; verify missing/revised data. |
| VALUE-02 | Unverified | Date/FX selection depends on intended use. Current FRED NY-noon rates are reference values, not TTM/TTB. | Establish the required basis and documents; show original dates, selected dates, and sources. |
| VALUE-03 | Unverified | Stock average costs from imported Activity and provisional opening-price estimates are not a complete acquisition-cost calculation. | Independently verify cross-account history, earlier costs, same-day ordering, and manual overrides. |
| UI-01 | Not reproduced | A report said changing Review candidates did not take effect. Round-trip selection, persistence, and fictional Chrome E2E pass; selected-state display was added. | Reproduce with browser/version, steps, and a fictional fixture; record the root cause and fix. Display improvements alone do not close it. |
| UI-02 | Unverified | Safari workflows for GMO, cost forms/columns, collapsible sections and preferences, preceding-year openings, manual mappings, and Review changes. | Use fictional records to verify import → edit → save → reopen. |

The USD 100,000 color threshold and 5% provisional cost are application reference-display conventions. See [GMO](GMO.md) for calculation details.

## How to help

Reference an ID in your issue/PR and state the provider, document type/version, observations, expected behavior, evidence, fictional fixtures, and verification results.

**Never attach personal CSVs, names, accounts, actual holdings/amounts, wallet addresses, or transaction IDs to issues, PRs, or public fixtures.** Share format descriptions or official public references. Invent public test values independently; replacing names alone is insufficient. Use FICT / OTHER for stock fixtures.

See [HANDOFF](HANDOFF.md), [GMO](GMO.md), and [REFACTOR](REFACTOR.md) for implementation details. Maintaining this list does not imply that the repository or any source documents have already been published.

## Distribution and consent

| ID | Status | Current behavior and open question | Completion criteria |
| --- | --- | --- | --- |
| DIST-01 | Unverified | GitHub-hosted CI and source installation. Local checks and the first GitHub CI run pass; a fresh end-user installation remains unverified. | Verify npm install and npm start from the public repository and pass remote CI. |
| DIST-02 | Out of scope (2026-09-26) | Prebuilt application and Release bundles are discontinued in favor of source installation with npm. | CI artifacts remain for verification reports only. |
| CONSENT-01 | Unverified | Safari consent, cookie refusal, expiry, and version upgrades. Pure functions/rendering and Chrome acceptance, cookie persistence, reload, and old-version renewal are tested. | Verify initial/restarted sessions, renewed consent, language switching, and preservation of current records on local HTTP. |
| CONSENT-02 | Unverified | Legal effectiveness of the disclaimer. | Obtain specialist review appropriate to intended use and applicable law. |
