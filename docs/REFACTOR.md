# Balance reconstruction and import refactoring

English | [日本語](REFACTOR.ja.md)

Design direction and acceptance criteria as of 2026-09-26. Balance parsing, the abstract adapter base, Merrill/GMO subclasses, and a local registry are implemented. A fully provider-independent saved model is not. See [BROKER_ADAPTERS](BROKER_ADAPTERS.md) for current extension instructions and [HANDOFF](HANDOFF.md) for current behavior.

## 1. Reconstruct annual opening and closing balances from recent snapshots

The primary inputs are Activity, latest Holdings, and latest Portfolio Summary. Do not require historical Portfolio Summary exports for every year. Acquisition-lot and vesting details are supporting evidence when reconciling costs or differences. Historical OCR and evidence-backed manual entry are separate extensions.

- Store Holdings quantities by account/instrument and Portfolio cash by account/currency as dated observations. Avoid double counting; distinguish Cash, Money Accounts, Investments, and Net Value components from totals.
- Prefer matching COB dates. Do not mix unsettled realtime and settled snapshots. Different dates require separate reference points and coverage periods.
- Activity must span the beginning of January 1 through each snapshot date. Transactions from only the selected year cannot reconstruct balances from a later snapshot.
- Opening balance = observed balance − signed movements from opening through observation. Closing = opening + annual movements. Reconstruct quantities/native-currency balances separately from price/FX valuation. Splits need inverse transformations, not simple addition/subtraction.
- Cash movements include purchases/sales, deposits/withdrawals, dividends, withholding, fees, and transfers. Do not simply sum every Amount field or treat transfers between own accounts as income.
- Preserve vest/receipt and trade/settlement dates. Separate movement dates from income dates according to the meaning of each source balance.
- Missing instruments imply zero only when a complete account-wide Holdings snapshot is established. Fully sold instruments also need reconstruction from Activity.
- Earliest/latest transaction dates do not establish complete coverage. Surface coverage uncertainty, unsupported events, duplicates, and negative reconstructed quantities.
- Show annual opening, movement, and closing values by account/asset, distinguishing observations from reconstruction and linking to evidence. Past year-end refers to December 31.
- A difference between cash and Activity totals does not alone imply inconsistency: opening cash is not necessarily zero. Reversing then replaying flows tests arithmetic, not history completeness.
- Reconstructing balances does not reconstruct historical acquisition costs. Keep opening quantities, costs, dates, and evidence distinct; preserve unknown costs.

Acceptance uses fictional data for previous-year closing/next-year opening agreement, year-crossing settlement, mismatched snapshot dates, duplicates, missing documents, fully sold instruments, cash transfers, splits, and saved-file compatibility.

## 2. Provider-specific import adapters

- Merrill column/description parsing is now in `src/brokers/merrill-activity.ts`. Remove remaining provider-specific saved-schema and raw-column assumptions from common calculations.
- Adapters own format/version detection, raw preservation, normalization, and unsupported-row reporting. Filenames alone cannot establish document type or coverage.
- Shared code owns accounts, assets, transactions, balance snapshots, coverage, provenance, review, and persistence.
- Ambiguous detection requires confirmation. Preserve unknown rows and the basis for automatic/manual classification.
- Use locally registered adapters; no need for remote dynamic code loading.
- Keep reference calculations and market retrieval outside parsers. Saved-format migrations must preserve originals and review decisions.

## 3. Shared records supporting crypto

- Separate asset class (stock, fiat, crypto) from provider. NYSE/NASDAQ and tickers are not universal identifiers.
- Support networks/contracts to distinguish identically named assets, and wallets as well as accounts.
- Model exchanges as multiple movements: outgoing asset, incoming asset, and fee asset. Preserve timestamps, timezone evidence, and decimal precision.
- Match transfers between own accounts/wallets and carry acquisition history. Do not reset cost to the receiving-date market price. Unmatched incoming transfers retain unknown costs.
- Separate custody balances from the grouping required by a valuation method. Do not permanently constrain cost pools to individual providers.
- Opening balances alone do not establish earlier costs, regardless of provider location. Accept historical documents or evidence-backed opening costs.
- Prioritize document organization, balances, and acquisition-history preservation.
- Keep valuation methods separate from parsers and record the selected method and evidence.

Implementation direction: common balance/provenance model and Merrill extraction → three-document import and calendar-year balances → additional provider/crypto adapters. Some of these steps are already implemented; the unresolved model work remains above.
