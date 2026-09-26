# 金融機関別アダプターの追加手順

[English](BROKER_ADAPTERS.md) | 日本語

この文書は現在の実装に新しい資料形式を追加するためのガイドです。PRの採用条件とデータの扱いは [CONTRIBUTING](../CONTRIBUTING.ja.md) を参照してください。

## 現在の構成

| 役割 | 実装 |
| --- | --- |
| 抽象基底クラス・戻り値の型 | [src/brokers/adapter.ts](../src/brokers/adapter.ts) |
| 派生クラスの登録・選択 | [src/brokers/registry.ts](../src/brokers/registry.ts) |
| Merrill派生クラス / Activity解析 | [merrill.ts](../src/brokers/merrill.ts) / [merrill-activity.ts](../src/brokers/merrill-activity.ts) |
| GMO派生クラス | [gmo-adapter.ts](../src/brokers/gmo-adapter.ts) |
| 取り込み・記録スキーマ・保存復元 | [src/ledger.ts](../src/ledger.ts) |
| Merrill Holdings / Portfolioの判定・解析 | [src/balances.ts](../src/balances.ts) |
| GMO Coinの判定・解析、暗号資産行スキーマ・重複判定 | [src/brokers/gmo.ts](../src/brokers/gmo.ts) |
| 数値・日付の共通読み取り | [src/values.ts](../src/values.ts) |
| 会社選択、ファイル取り込み、画面連携 | [src/main.ts](../src/main.ts) |
| 英語・日本語の表示文言 | [src/i18n.ts](../src/i18n.ts) |

`BrokerAdapter` を一段継承し、`MerrillAdapter` と `GmoAdapter` を実装しています。`registry.ts` のローカル配列が取り込み・保存復元・画面の会社選択に使われます。外部コードをダウンロードして実行する仕組みではありません。会社IDと保存スキーマは引き続き明示的な拡張が必要です。

## 派生クラスの契約

- `id` / `label`: 保存に用いる会社IDと画面の会社名。
- `detect(input)`: 対応資料なら `DocumentKind`、対象外なら `null`。検出は完全な検証の代わりにはなりません。
- `parse(input, sourceId)`: 必須列などを検証し、`ParsedDocument`（`documentKind`、`transactions`、`balances`、`cryptoTransactions`）を返します。該当しない配列は空です。
- `restoreTransaction(raw, sourceId, row)` / `restoreBalance(raw, sourceId, row, kind)` / `restoreCrypto(raw, sourceId, row)`: 対応する種類だけオーバーライドし、保存された原行を同じ解析処理で復元します。基底クラスは未対応の種類をエラーにします。

会社の自動選択は全登録クラスを判定し、一致が1社の場合だけ採用します。0社または複数社ならエラーになり、利用者が会社を指定できます。明示指定した会社でも `detect` が失敗すれば拒否します。解析・再構築は状態を持たせず、計算・相場取得・レビュー保存は共通側に置きます。

GMOの `cryptoRowSchema` は `broker: 'gmo'` とJPY項目に依存し、株式側もMerrillの原列やUSDを前提とする箇所があります。他社のデータをGMOと偽ったり、原行を架空のMerrill列へ置き換えたりせず、必要な共通モデルと復元経路を先に整えてください。

## 実装の順序

1. **資料形式と範囲を確定する。** 会社・サービス・資料種類、形式の版、文字コード、区切り、必須列、日時とタイムゾーン、通貨、数量・金額の符号、手数料の含まれ方を記録します。株式分割や暗号資産交換など未確認の形式は対応済みにしません。実資料が不足する箇所は [UNCONFIRMED](UNCONFIRMED.ja.md) に根拠と制約を残します。
2. **架空fixtureを作る。** 列形式だけを参考に、口座・数量・金額・日時・IDを独立した架空値にします。株式fixtureはFICT / OTHERを使用してください。正常系に加え、欠損、不正行、未知の取引、重複、日付境界を用意します。出典と再配布条件、独自に補った形式をfixtureの説明に記載します。
3. **会社別パーサーを分離する。** `src/brokers/<company>.ts` に `BrokerAdapter` の派生クラスを作ります。複数の資料形式はクラス内部から個別パーサーへ委譲できます。判定はヘッダーや内容を使い、ファイル名だけに依存しません。判定成功後も必須列・重複ヘッダー・列数・各値を検証します。未知の取引は原行と未対応理由を残します。資料全体が不正な場合は既存記録を変更せずエラーを返します。
4. **モデルと取り込み経路を接続する。** `adapter.ts` の会社ID・必要な資料型と `src/ledger.ts` の保存スキーマを拡張し、`registry.ts` の `brokerAdapters` に派生クラスのインスタンスを登録します。取り込みと会社選択肢は登録配列を利用します。自動判定と明示した会社の不一致を拒否し、複数社に一致する形式は黙って先勝ちにせず選択できるようにします。現在のファイル内容による重複取り込み防止と、行単位の重複判定の両方を検証します。
5. **保存復元を同時に実装する。** `readLedger` は保存済みの正規化値をそのまま信頼せず、原行から再構築します。追加会社も会社・資料種類に応じた再構築を行い、出典ID・行ID・指紋・レビュー情報の参照を検証します。現在の形式は `format: "annum-aequitas"`, `version: 1`。保存形式を変える場合は互換性と移行方針を明記し、単にスキーマの判定を緩めて通さないでください。
6. **画面と計算へ接続する。** `src/main.ts` の資料表示・会社固有の分岐、`src/i18n.ts` の自動判定の説明を含む英日文言を更新します。既存の会社名や列名への依存も確認します。解析と計算を分け、決済額と取得費、観測残高と取引増減を混同しないでください。対応しない行がどの集計から除かれるかを画面と文書で示します。
7. **テストと文書を完成させる。** 以下の検証を行い、READMEの対応資料、必要な操作、UNCONFIRMED、HANDOFFを変更範囲に合わせて更新します。

正規化後も原行・出典・行番号を保持してください。小数の保存表現は既存の文字列形式に合わせ、未記載値をゼロに変換しません。日時・通貨の推測や参考評価が必要な場合は、原資料の値と分け、採用根拠と未確認事項を残します。ファイルの文字コード対応を追加する場合は、現在の画面側の `File.text()` による読み取りも見直す必要があります。

## 検証すること

| 対象 | 最低限確認する結果 |
| --- | --- |
| 資料判定 | 正しい会社・資料、会社の誤指定、未知の形式、曖昧な形式 |
| CSV解析 | BOM、引用符、必須列不足、重複列、列数不一致、空ファイル・ヘッダーのみの扱い |
| 正規化 | 原行保持、ゼロと欠損の区別、符号、小数、手数料、日時境界、未知の取引 |
| 重複・混在 | 同一ファイル再取り込み、別ファイル内の同一取引、Merrill/GMOとの混在 |
| 保存復元 | 正規化値の再構築、レビュー・手入力の保持、不正な参照の拒否 |
| 計算 | 架空値を独立して検算した取得費・損益・残高、資料不足時の表示 |
| UI | 会社選択、取り込み、Review、保存・再読み込み、失敗時の既存記録保持 |

参考は [アダプターの契約テスト](../tests/broker-adapters.test.ts)、[GMOのテスト](../tests/gmo.test.ts)、[記録のテスト](../tests/ledger.test.ts)、[残高のテスト](../tests/balances.test.ts)、[Chrome E2E](../tests/browser/ledger.spec.ts) です。既存GMOの架空交換形式を、他社やGMOの公式仕様の根拠として流用しないでください。

検証コマンドと閾値は [CONTRIBUTING](../CONTRIBUTING.ja.md#検証)、計測範囲は [TEST_COVERAGE](TEST_COVERAGE.ja.md) を参照してください。テストでは実資料・秘密情報・外部通信を使わず、新規モジュールがカバレッジ対象に載ることも確認します。
