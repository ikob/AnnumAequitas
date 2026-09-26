# Merrill sample fixtures

English | [日本語](README.ja.md)

This directory contains fictional data for public examples and tests. `demo.csv` has six rows spanning 2023–2025, with every value invented.

These are independently authored fixtures that mimic observed Merrill document formats, not official public Merrill CSV samples. See [provenance and verification scope](multi-year/README.md#provenance-and-format-verification) for sources, references, and unverified representations.

The small fixture includes RSU receipts, dividends, withholding, and a hypothetical sale. The sale format has not been verified against real exports. FICT and DEMO-CUSIP are fictional demo identifiers, not real holdings.

Personal documents belong under the Git-ignored `../real-ml/`. Never submit real data as fixtures or publish records after hiding only names and accounts. Use independently fictional quantities, amounts, timestamps, and IDs, with FICT / OTHER for stock fixtures.

For multi-year imports, balances, and gain/loss tests, see [multi-year fixtures](multi-year/README.md): 2022–2026 Activity / Holdings / Portfolio, fictional market data, a ready-to-open demo, and unsupported-split tests.
