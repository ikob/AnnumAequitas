# Adding a broker adapter

English | [日本語](BROKER_ADAPTERS.ja.md)

This guide describes how to add a document format to the current implementation. See [CONTRIBUTING](../CONTRIBUTING.md) for acceptance criteria and data handling.

## Current structure

| Responsibility | Implementation |
| --- | --- |
| Abstract base class and result types | [adapter.ts](../src/brokers/adapter.ts) |
| Subclass registration and selection | [registry.ts](../src/brokers/registry.ts) |
| Merrill subclass and Activity parser | [merrill.ts](../src/brokers/merrill.ts) / [merrill-activity.ts](../src/brokers/merrill-activity.ts) |
| GMO subclass | [gmo-adapter.ts](../src/brokers/gmo-adapter.ts) |
| Import coordination, saved schema, and restoration | [ledger.ts](../src/ledger.ts) |
| Merrill Holdings / Portfolio detection and parsing | [balances.ts](../src/balances.ts) |
| GMO detection, normalization, crypto row schema, and duplicates | [gmo.ts](../src/brokers/gmo.ts) |
| Shared numeric and date parsing | [values.ts](../src/values.ts) |
| Provider selection, file loading, and UI integration | [main.ts](../src/main.ts) |
| English and Japanese UI strings | [i18n.ts](../src/i18n.ts) |

`MerrillAdapter` and `GmoAdapter` inherit directly from `BrokerAdapter`. The local array in `registry.ts` drives importing, restoration, and the provider selector. No external plugin code is downloaded or executed. Provider IDs and saved schemas still require explicit extension.

## Subclass contract

- `id` / `label`: provider identifier used in saved records and the displayed provider name.
- `detect(input)`: return a `DocumentKind` for recognized input, otherwise `null`. Detection is not a substitute for full validation.
- `parse(input, sourceId)`: validate the document and return a `ParsedDocument` with `documentKind`, `transactions`, `balances`, and `cryptoTransactions`. Unused arrays are empty.
- `restoreTransaction(raw, sourceId, row)` / `restoreBalance(raw, sourceId, row, kind)` / `restoreCrypto(raw, sourceId, row)`: override supported record families only, rebuilding saved raw rows through the same parser. The base class rejects unsupported families.

Auto-detection checks every registered class and accepts exactly one match. No match or multiple matches produces an error; the user can select a provider explicitly. Explicit selection still requires successful detection. Keep parsing and reconstruction stateless. Calculations, market downloads, and review persistence belong in shared application code.

The GMO `cryptoRowSchema` still assumes `broker: 'gmo'` and JPY fields. Stock code retains Merrill-column and USD assumptions. Do not label another provider's records as GMO or replace original rows with invented Merrill columns. Extend the common model and restoration paths where necessary.

## Implementation sequence

1. **Establish format evidence and scope.** Document the provider, service, document type/version, encoding, delimiter, required columns, dates/timezone, currencies, quantity/amount signs, and fee treatment. Do not claim support for unverified splits or exchanges. Record missing evidence in [UNCONFIRMED](UNCONFIRMED.md).
2. **Create fictional fixtures.** Use only the column structure as a reference; invent accounts, quantities, amounts, dates, and IDs independently. Use FICT / OTHER for stock fixtures. Include normal records, missing values, invalid rows, unknown events, duplicates, and date boundaries. Describe provenance, redistribution terms, and any invented format extensions.
3. **Create the subclass.** Add a `BrokerAdapter` subclass in `src/brokers/<company>.ts`. Delegate multiple document formats to separate parsers if useful. Detect from headers/content rather than filenames. After detection, validate required columns, duplicate headers, row widths, and values. Preserve unknown rows with an unsupported reason. Invalid documents must fail without changing existing records.
4. **Connect the model and registry.** Extend provider IDs and required types in `adapter.ts` and saved schemas in `src/ledger.ts`, then register an instance in `brokerAdapters`. Import and provider choices use that array. Reject explicit-provider mismatches. Ambiguous formats must require a selection rather than silently selecting the first match. Test both file-level repeat prevention and row-level duplicate detection.
5. **Implement restoration together with import.** `readLedger` rebuilds normalized values from raw rows rather than trusting saved derived values. Dispatch the new provider/document family appropriately and validate source IDs, row IDs, fingerprints, and review references. The current format is `format: "annum-aequitas"`, `version: 1`. Explain compatibility and migration when changing it; do not simply relax validation.
6. **Connect UI and calculations.** Review provider-specific source displays and branches in `main.ts`, and English/Japanese strings in `i18n.ts`, including the auto-detection description. Inspect existing assumptions about provider names and raw columns. Separate parsing from calculations, settlement amounts from acquisition costs, and observed balances from movements. Explain which totals exclude unsupported rows.
7. **Finish tests and documentation.** Verify the cases below and update supported documents in README, workflow instructions, UNCONFIRMED, and HANDOFF as needed.

Preserve original rows, sources, and row numbers after normalization. Use the existing decimal-string representation; never convert missing values to zero. If reference estimates are needed, keep them distinct from source values and record their basis and unresolved questions. Supporting additional encodings also requires reviewing the UI's current `File.text()` loading path.

## Verification checklist

| Area | Required outcomes |
| --- | --- |
| Detection | Correct provider/document, incorrect explicit provider, unknown and ambiguous formats |
| CSV parsing | BOM, quoting, missing/duplicate columns, width mismatch, empty and header-only files |
| Normalization | Raw-row preservation, zero vs missing, signs, decimals, fees, date boundaries, unknown events |
| Duplicates and mixing | Re-imported files, overlapping rows across files, coexistence with Merrill/GMO |
| Restoration | Rebuild derived fields, retain reviews/manual inputs, reject invalid references |
| Calculations | Independently checked fictional costs, gains/losses, balances, and incomplete-history displays |
| UI | Provider selection, import, Review, save/reopen, existing-record preservation on failure |

Examples: [adapter contract tests](../tests/broker-adapters.test.ts), [GMO tests](../tests/gmo.test.ts), [record tests](../tests/ledger.test.ts), [balance tests](../tests/balances.test.ts), and [Chrome E2E](../tests/browser/ledger.spec.ts). The fictional GMO exchange extension is not evidence of an official GMO or other-provider format.

See [verification commands](../CONTRIBUTING.md#verification) and [coverage scope](TEST_COVERAGE.md). Tests must not use personal records, secrets, or external communication. Confirm that each new module appears in the coverage report.
