# Contributing

English | [日本語](CONTRIBUTING.ja.md)

Contributions adding providers, fixing bugs, and resolving unverified behavior are welcome. Provider additions require your own implementation and tests in a PR following this guide; we cannot implement them in response to issue requests. Bug reports for existing functionality are welcome in issues. Include the relevant [UNCONFIRMED](docs/UNCONFIRMED.md) ID or document type.

## Adding a financial institution

Follow the [broker adapter guide](docs/BROKER_ADAPTERS.md) for implementation order and affected files. Register a `BrokerAdapter` subclass and update the saved schema, restoration paths, and tests together.

1. Identify the provider, service, document type, and format, with supporting evidence. Do not detect formats from filenames alone.
2. Separate provider-specific parsing and preserve original rows, provenance, timestamps, currencies, and decimal precision. Never silently drop unknown transactions.
3. Include fictional fixtures and tests. Cover valid imports, missing/invalid rows, duplicates, signs, fees, save/restore, and coexistence with Merrill/GMO as applicable. Derive expected results independently, rather than copying application output.
4. For UI changes, update English and Japanese strings and report workflow verification.
5. Add unsupported or unverified behavior to UNCONFIRMED. New calculations require a stated period, method, sources, and independent verification.

## Asking Codex to work on this project

Follow this repository's `AGENTS.md` and begin by reading `README.md` and `docs/HANDOFF.md`. A request should specify the documents, supported operations, expected results, and exclusions. Replace the bracketed text in this example:

```text
Add support for [provider/service] [document type and format].
First read AGENTS.md, README.md, docs/HANDOFF.md, CONTRIBUTING.md,
and docs/BROKER_ADAPTERS.md.

Format evidence: [public specification URL or local document location]
In scope: [e.g. spot purchases, sales, and transfers; currencies and date formats]
Out of scope: [e.g. margin trades; retain original rows and mark unsupported]
Expected results: [fictional input and independently checked counts, quantities, amounts]

Treat real documents as read-only. Do not copy their values into code, fixtures,
logs, or public documentation. Create independent fictional fixtures using only
the column structure as a reference. Preserve raw rows, sources, and open questions.
Implement auto-detection, explicit provider selection, mixed imports, and save/restore.
Record unresolved format questions in docs/UNCONFIRMED.md rather than guessing.
Add relevant unit tests and Chrome E2E for UI changes.
Run the CONTRIBUTING.md checks and report changes, results, and remaining limitations.
Committing, pushing, and publishing are outside this request.
```

For bug fixes, provide reproduction steps, actual and expected behavior, and a fictional reproducer. You do not need to paste personal documents into an issue or request. Review generated changes against the same PR criteria; coverage alone does not prove calculations or real-format compatibility.

## Data handling

**Never submit real data as a test fixture. This is a requirement for acceptance.** Before submitting test code, anonymize the fixture completely: replace names, accounts, quantities, amounts, timestamps, addresses, and IDs with independently invented values. Renaming a person or account alone is not sufficient. Do not attach the original CSV, personal records JSON, screenshots, or backups to a PR or issue. Use **FICT / OTHER** for stock fixtures; do not retain a real holding's ticker.

`data/real-*` is local-only and Git-ignored. Never force-add it. Do not include real documents, saved personal records, names, accounts, quantities, amounts, timestamps, transfer addresses, or transaction IDs in PRs, issues, screenshots, or logs.

Public fixtures may mimic column layouts, but all values must be invented independently. Check provenance and redistribution terms before using third-party public samples. For stock fixtures, use the fictional ticker **FICT**, exchange **OTHER**, and DEMO account names. Crypto symbols such as BTC are fine for format tests; addresses and transaction IDs must be fictional.

## Language and documentation

Use English for default Markdown files, code comments, developer-facing messages, and the default PR template. Keep Japanese translations in adjacent `.ja.md` files and add reciprocal language links at the top. Use `ja`, the application's locale code, rather than `jp` in filenames. Localized documents should link to the same-language document where available.

Keep Japanese UI translations, original CSV field names and values, and language-specific test assertions intact. They are part of the supported formats and interface, not comments to translate. Update both documentation versions when behavior changes.

## Verification

Use Node.js 24:

```sh
npm ci
npm run test:coverage
npm run build
npx playwright install chrome # If Chrome is absent; add --with-deps on Linux CI.
npm run test:e2e
```

CI is defined in `.github/workflows/ci.yml`. Public PRs use GitHub-hosted runners with read-only permissions and no personal data or secrets. A local build copies `public/` caches into `dist/`; do not publish that directory without inspection. The application is distributed as source; CI uploads verification reports only. Playwright uses `npm start` to exercise the build and local startup.

## PR acceptance criteria

- Tests and build pass, with aggregate measured unit coverage of **95% lines, 80% branches, and 90% functions**. CI enforces these minimums; meeting them does not guarantee acceptance.
- New parsers and calculations include tests. Confirm every new module appears in the coverage report: unimported files do not appear in Node's report, so aggregate percentages alone are insufficient.
- Changed parsers and calculations cover applicable missing values, zero, signs, rounding, date boundaries, duplicates, unsupported rows, and saved-file compatibility. Explain independently derived expected results.
- Bug fixes normally include a regression that fails before the fix and passes afterward. Low-impact wording/layout changes may use manual verification.
- UI event changes include fictional-data Playwright regressions and workflow results. `main.ts` is absent from unit coverage; a high module coverage rate cannot substitute for browser coverage.
- Do not mark an unverified real format as supported. Reference implementations must state their scope and retain an UNCONFIRMED entry. No personal records or secrets in PRs.

See [coverage scope and current results](docs/TEST_COVERAGE.md). Lowering thresholds or adding exclusions requires a separately explained review.

Browser E2E maps Chrome V8 coverage to TypeScript in `coverage/e2e/index.html`, including `main.ts`. Do not combine it numerically with unit coverage. Review uncovered branches when changing UI behavior.

## Review and merge flow

1. Submit the implementation, independently fictional fixtures, and tests together.
2. CI runs `npm run test:coverage`. All three aggregate unit thresholds must be met: **lines ≥95%, branches ≥80%, functions ≥90%**. A lower result fails CI. Build, startup, and Chrome E2E must also pass in `test-and-build`.
3. Maintainers approve only after the latest revision passes CI and the code, source evidence, fixture privacy, and independent expected values have been reviewed. Coverage alone never grants automatic approval. Threshold reductions or new exclusions require explicit review.
4. Merge requires both the successful required check and a human approval. New commits must be checked again and stale approvals dismissed under the repository rule.

GitHub required checks block merging, not the act of submitting an Approve review. Waiting for green CI before approving is the maintainer policy. Enforcement at merge time additionally requires repository-side branch protection; workflow YAML alone does not enable it. See [repository configuration](docs/PUBLISHING.md#required-checks-and-review) for the setup and its current status.
