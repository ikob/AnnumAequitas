# Fictional GMO Coin-format fixtures

English | [日本語](README.ja.md)

Every transaction, timestamp, quantity, amount, and ID in `demo.csv` is fictional. No real values were copied. Only GMO's 23-column history layout is mimicked.

- Includes an incoming BTC transfer, a later dealer sale, and a JPY withdrawal.
- The incoming transfer does not establish cost and is not treated as income or a purchase.
- Source addresses and transaction IDs are invented strings, not real addresses.
- Incoming transfers, dealer sales, and JPY withdrawals were observed in examples. Reverse-direction purchases, outgoing transfers, and JPY deposits are supported from the column/category model but remain unverified against real examples.
- Unsupported exchange-platform, leverage, and other categories are retained as unclassified rows.

Import through Add CSV using auto-detection or GMO Coin. Native JPY and quantity movements appear separately from stocks. Movement subtotals include only valid imported rows; they are not holdings or gains.

## Multi-year data

`multi-year.csv` contains 22 events from 2022–2026: 7 buys, 6 sells, 3 BTC/ETH exchanges, 4 JPY deposits/withdrawals, and 2 crypto transfers. Regenerate with `node scripts/generate-gmo-fixtures.ts`. This is independent of the three-row demo; import it into empty test records.

Buys have positive quantities and negative JPY payments. The set covers reverse-direction sales, fees, and rising/falling prices. All values are invented. Purchase costs feed the reference moving average over imported history; sale-specific manual entries override it, and insufficient history falls back to provisional 5% cost.

### Test-only exchange extension

GMO's actual crypto-to-crypto CSV syntax is unverified. The three exchange rows are a **test-only extension, not an official GMO format**. They use `DEMO_CRYPTO_SWAP` as settlement category and extra columns `交換元資産 / 交換元数量 / 交換先資産 / 交換先数量` (source/destination assets and quantities). This does not imply the service actually offers those pairs.

Exchanges without JPY/USD are excluded from gains and movement subtotals under the current user-selected scope, while preserving both sides and quantities in the raw row. The interface labels them outside this calculation scope. If JPY/USD appears in the exchange columns, or the actual syntax is unknown, retain it as unsupported instead of applying this exclusion.

Never contribute real data as a fixture. Invent amounts, dates, addresses, and IDs independently; replacing names alone is insufficient. BTC/ETH are asset symbols used to exercise crypto parsing, while contributed stock fixtures use FICT / OTHER.
