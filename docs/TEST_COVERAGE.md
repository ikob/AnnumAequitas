# Test coverage

English | [日本語](TEST_COVERAGE.ja.md)

Measured on 2026-09-26 with Node.js v26.5.0 built-in V8 coverage: 81 tests passed. CI uses Node.js 24; use its execution log for remote figures. [The first Node.js 24 GitHub CI run](https://github.com/ikob/AnnumAequitas/actions/runs/36248005208) passed all checks.

```sh
npm run test:coverage
```

## Current unit results

| Measured source | Lines | Branches | Functions |
| --- | ---: | ---: | ---: |
| All reported src modules | 99.44% | 87.93% | 94.13% |
| Records: ledger.ts | 97.53% | 96.35% | 96.97% |
| Adapter base, subclasses, and registry (four modules) | 100.00% | 100.00% | 100.00% |
| Merrill parser: brokers/merrill-activity.ts | 100.00% | 88.46% | 100.00% |
| Balance CSV: balances.ts | 100.00% | 87.34% | 100.00% |
| GMO parser: brokers/gmo.ts | 100.00% | 81.43% | 100.00% |
| Stock cost: sale-cost.ts | 100.00% | 90.98% | 82.86% |
| Crypto cost: crypto-cost.ts | 98.73% | 85.71% | 100.00% |
| Annual calculations: annual.ts | 98.44% | 91.46% | 100.00% |
| Portfolio: portfolio.ts | 100.00% | 92.71% | 92.00% |
| Market data: market.ts | 98.37% | 93.01% | 96.61% |
| FX: fx.ts | 100.00% | 98.15% | 100.00% |
| Consent cookie/rendering: consent.ts | 100.00% | 100.00% | 100.00% |
| Annual display: annual-display.ts | 92.50% | 70.83% | 93.33% |
| Sale-cost form: sale-cost-display.ts | 100.00% | 33.33% | 85.71% |

## Scope and limitations

- `--test-coverage-include='src/**'` excludes tests, dependencies, and scripts. Currently 25 of 26 src TypeScript files appear in the unit report.
- **main.ts is not imported by unit tests and is absent from the denominator. The 99.44% figure is not whole-app coverage.** Browser workflows are measured separately below, not combined with unit percentages.
- Some scripts have subprocess tests but are outside this src-only report. CSS, HTML, GitHub Actions, and actual external retrieval need separate verification.
- One-line templates can reach 100% lines with many untouched conditions. Inspect branch and function coverage as well. Translation dictionaries contribute to the aggregate line count.
- Real-document compatibility, independent expected values, and evidence are separate acceptance criteria.

## Priorities for further coverage

1. Combine missing inputs, old saved formats, market adjustment types, and alternate browsers.
2. Exercise display branches, including sale-cost form methods, currencies, and missing states; annual-display and sale-cost-display have lower branch coverage.
3. Cover remaining direct paths such as Holdings-only instrument resolution and market download ranges including the preceding opening year-end.
4. Expand GMO missing/unknown categories, fees, and date boundaries. Keep unverified real formats in UNCONFIRMED.

## CI minimums

CI requires aggregate measured unit coverage of 95% lines, 80% branches, and 90% functions, not per-file minimums. Test or threshold failure fails the job. Reports are retained for 30 days. Reviewers must still check new-module inclusion and important changed branches; see [CONTRIBUTING](../CONTRIBUTING.md).

## Headless Chrome E2E

All 17 local scenarios passed on 2026-09-26 in about 18 seconds, excluding build/browser setup. The 81 unit tests and build also passed.

Playwright serves the built app on dedicated `127.0.0.1:4178` with isolated contexts. It does not use the user's browser or records. External traffic and local market-cache reads are blocked; all inputs are public fictional fixtures or mocked fixture responses.

Core workflows cover explicit consent, actual cookie persistence, reload and old-version renewal; GMO import → cost entry → gain display → downloaded JSON restoration; Merrill prices, candidate switching/clearing, mixed stock/crypto sections, and navigation.

Run `npm run test:e2e`. Playwright invokes `npm start`, which builds through prestart before serving the app; no separate CI build is needed. Install Chrome with `npx playwright install chrome` if needed; Linux CI uses `--with-deps`. CI requires unit checks, build, and E2E to pass, and retains HTML reports/failure screenshots/traces for 30 days. Open local results with `npx playwright show-report`.

Configuration follows [Playwright's CI guidance](https://playwright.dev/docs/ci). Local Chrome success does not establish Safari or all-workflow compatibility. [Remote CI has passed](https://github.com/ikob/AnnumAequitas/actions/runs/36248005208).

## E2E execution coverage

Playwright captures Chrome V8 coverage and maps it to TypeScript using build source maps. It collects before reloads and merges results, excluding tests/dependencies. All 26 src modules appear; missing `main.ts` fails report validation.

| E2E scope | Lines | Branches | Functions |
| --- | ---: | ---: | ---: |
| src/main.ts | 94.48% | 93.25% | 99.08% |
| All src | 89.10% | 81.13% | 93.92% |

Outputs: `coverage/e2e/index.html`, `coverage-report.json`, and `lcov.info`, also included in the browser-tests artifact. E2E validates report inclusion but currently has no percentage gate.

These figures describe reachability across 17 scenarios, not every input combination. Unit and browser reports differ in denominators/line accounting; do not add or average them. The aggregate, including translations, does not substitute for inspecting main.ts. Coverage does not cover every CSS state or browser.

## Form verification details

- Import multiple Holdings/Portfolio CSVs, FX CSV/JSON, and restore saved records. A fictional 125 shares × USD 74 × JPY 150/USD produces JPY 1,387,500.
- Stock sale cost methods and currencies: USD 299 proceeds minus USD 200 total gives USD 99; unit cost USD 30 × 5 gives USD 149; history costs USD 80 + 150 give USD 69. Acquisition rates 100/120 and sale rate 150 produce JPY 18,850. A JPY 30,000 manual cost gives JPY 14,850. Exercise method changes, save/reopen, and Clear.
- Invalid acquisition history must preserve the prior calculation. Check invalid/valid coverage periods, opening-balance entry/deletion, draft preservation during language changes, and persistence.
- Exercise actual file chooser events, partial-name/keyboard instrument selection, suggested/edited price periods, and price CSV/JSON imports.
- Invalid price/transaction CSVs and saved JSON must leave existing saved records unchanged. No live external retrieval is performed.
- Crypto: enter JPY 3,000,000 for a fictional incoming transfer, allocate JPY 800,000 to a sale, and show JPY 400,000 gain. Its deposit settlement remains blank; saved/reopened records retain the result.

Tests are in `tests/browser/ledger.spec.ts` and use independently computed expectations. Successfully traversing a form is distinct from covering every error condition.

## Offline workflows and pagination

- 121 stock and 121 crypto rows: 50/50/21 pages, previous/next, disabled terminal controls, independent sections, Review pagination, search/year reset, full totals, and complete saved records.
- Duplicate exclusion/undo/separate adoption and persistence; drag/drop, pre-consent rejection, repeated-file import.
- Demo start/end/cancel, disclaimer reopening, Escape, replacement cancel/accept, unsaved-leave prompts. Regression for selecting the same saved file after cancelling replacement.
- Mocked local price/FX caches and failures, multiple FX histories, revised observations, adjustment separation, and covered periods.
- Cookie/storage refusal and exceptions, session-only consent, empty fields, unknown dates, empty search results, language changes during drafts, different instruments, and delayed catalogs.
- Invalid crypto cost, opening balance, instrument name, dates, and oversized-file rejection. Size is mocked to 51 MB rather than allocating a huge buffer.
- Legacy sale-cost restoration/clearing and download-URL revocation.

Network access is blocked and cached responses come from fictional fixtures. These tests broaden ordinary and failure paths without claiming 100% branch or combination coverage.
