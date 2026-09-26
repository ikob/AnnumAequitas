# AnnumAequitas

[English](README.md) | 日本語

株式・RSU・暗号資産の取引履歴、取得費、残高を暦年ごとに整理するローカルアプリです。RSUは **Restricted Stock Unit** の略で、株式報酬の一種です。
CSVを読み込み、価格・為替の出典とともに年次の参考評価や損益を確認できます。TypeScript製。画面は英語・日本語に対応しています。

## なぜ作ったか

RSUの記録を照合する手間を減らすために作り始め、現在は株式・暗号資産の取引にも対応しています。取引履歴・取得費・株価・為替・残高が別々の資料に分かれていると、全体を把握するのに手間がかかります。株式・暗号資産の記録を暦年ごとにまとめ、金額と根拠を確認し、原資料を保持したまま不足を補えるようにするために作りました。

計算は取り込んだ資料に基づく参考値です。原資料と照合し、不足や未対応項目は [UNCONFIRMED](docs/UNCONFIRMED.ja.md) を確認してください。

## 対応資料とできること

| 金融機関 | 資料 | 主な機能 |
| --- | --- | --- |
| Merrill | Activity、Holdings、Portfolio Summary | RSUの年次評価、売却損益、配当等の年次集計、USD / JPY表示、年末・最新残高 |
| GMO Coin | CSV取引履歴 | 販売所売買・入出庫・円入出金の整理、取得費の入力、参考損益 |

- CSVの期間から暦年を自動作成。重複候補や不足情報はReviewで確認します。
- 原行・採用単価・手入力・出典を記録JSONに保存し、後から再開できます。
- 株式と暗号資産は別々に折りたためます。取引一覧は各50件ずつ表示し、集計と保存は全対象件数を使います。
- 銘柄は名称の一部・ティッカーから検索し、NYSE / NASDAQ / OTHERに対応付けます。

株式分割、Merrill売却の実形式、GMOの未確認形式などには制限があります。対応済みの操作と実資料で確認済みの形式は区別しています。

## 入手と起動

### ソースから起動する

Node.js 24以降とGitを用意してください。

```sh
git clone https://github.com/ikob/AnnumAequitas.git annum-aequitas
cd annum-aequitas
npm install
npm start
```

`npm install`で依存関係を準備し、`npm start`でビルドしてローカルサーバーを起動します。Pythonや別のHTTPサーバーは不要です。終了はCtrl+C。開発時は `npm run dev` を利用できます。

表示されたローカルURL（通常 http://127.0.0.1:4173/ ）を開きます。

公開銘柄一覧が必要なら `npm run catalog` を実行します。取得できなくてもCSV取り込みと銘柄の手入力は利用できます。株価・為替は [相場データの説明](docs/MARKET_DATA.ja.md) を参照してください。

## まず架空データで試す

起動画面の **Try fictional demo / 架空データで試す** から、資料なしで操作できます。数年分の資料は [Merrill](data/sample-ml/multi-year/README.ja.md) と [GMO Coin](data/sample-gmo/README.ja.md) にあります。

[Merrillの架空デモ記録](data/sample-ml/multi-year/fictional-ledger.json) をダウンロードし、**Open records / 記録を開く** でも試せます。FICT / OTHERと架空の株価・為替を設定済みです。既存の記録は先に保存してください。

## Merrillで用意する3つのCSV

| 資料 | 取得する範囲 | 用途・見分け方 |
|---|---|---|
| **Activity / Settled Activity（取引履歴）** | 取得できる過去分から、下の残高資料の基準日まで。複数ファイルでも可 | RSU・株式入庫・売却・配当・源泉徴収。`Trade Date`、`Settlement Date`、`Symbol/CUSIP #`、`Amount ($)` の列。 |
| **Holdings（保有明細）** | 直近の残高。可能ならCOB（営業日終了時点） | 銘柄ごとの株数と評価額。`COB Date`、`Symbol`、`Quantity`、`Price ($)`、`Value ($)` の列。 |
| **Portfolio Summary（口座残高概要）** | Holdingsと同じ基準日の直近残高 | 現金・Money Accounts・投資評価額・純資産。`Cash Balance ($)`、`Money Accounts ($)`、`Priced Investments ($)`、`Net Value ($)` の列。 |

Merrillの各資料の画面からCSVをエクスポートします。ファイル名を変更する必要はありません。列構成で判別します。Realtime版にも対応しますが、過去残高の逆算にはCOB資料を使用してください。画面名称は契約サービスによって異なる場合があります。

過年度のHoldings/Portfolioを毎年集める必要はありません。**過去Activity＋直近Holdings＋直近Portfolio**で、履歴が足りる範囲の過去年末を逆算します。たとえば昨年分を計算する場合も、昨年の取引だけでなく、直近残高までの今年の取引が必要です。

## 最短の操作手順（Happy path）

1. アプリを開き、言語を選び、免責事項を確認して同意します。初期表示は英語です。ローカル起動方法は上記の「入手と起動」を参照してください。
2. **Add CSV / CSVを追加**で上の3種類を読み込みます。Brokerは自動判定かMerrillを選択。Activityの年ごとの分割は不要で、年の選択肢は自動で作られます。
3. **Review / 確認すること**で銘柄を正式名称・ティッカーの候補から選びます。重複候補がある場合は内容を確認します。
4. **Market data / 株価データ**で銘柄を選び、提案された期間の株価CSVを取得・取り込みます。手元CSVは「株価CSVを取り込む」で指定できます。取得費不明の開始保有がある場合はOpening前年末の株価も必要です。CSVは参照元に合わせた形式が必要です。[相場の説明](docs/MARKET_DATA.ja.md)を参照。
5. 同画面の **USD / JPY** で為替CSV/JSONを読み込みます。ローカル収集ツールで用意した場合は「Load local FX cache / ローカル為替を読み込む」を使います。これは端末の任意ファイルを選ぶボタンではありません。
6. **Overview / 概要**で対象の暦年とJPYを選び、株式ブロックを開きます。冒頭の評価額・売却損益・配当等の集計を確認し、ポートフォリオ・取引一覧へ進みます。StockとCryptoは個別に折りたためます。
7. 不足・参考計算はReviewや行のDetailsで確認します。参考単価は「Select estimate / 参考単価を採用」で選び、売却取得費は必要に応じて入力。取得費不明を補った数値は確定値と区別して表示します。
8. **Save / 保存する**で記録JSONをダウンロードします。再開時は **Open records / 記録を開く**。閉じる・再読み込みの前にも保存してください。


## GMO Coinで使う

**Add CSV**で取引履歴を取り込みます。自動判定またはBrokerの **GMO Coin** を選択できます。JPYでの購入はCSVの支払額を取得費に使い、預入など履歴が不足する分はReviewの **Edit acquisition cost / 取得費を入力・編集** で補えます。

取得費とJPY受渡額は別項目です。履歴が足りない売却は5%の暫定取得費を使い、参考値として表示します。JPY/USDを伴わない暗号資産間交換は今回の集計対象外です。[対応形式と制限](docs/GMO.ja.md)を確認してください。

## プライバシーと保存

取引資料の解析・計算はブラウザ内で行い、外部サービスに送信しません。**閉じる・再読み込みの前にSaveで記録JSONを保存してください。** JSONには原資料の内容も含まれるため、個人資料として管理してください。

Cookieには免責に同意した版だけを保存します。`shikob.net` はCookie名の識別子であり、ホスティング先ではありません。言語とブロックの開閉状態はlocalStorageに保存します。Cookieが使えない場合の同意はセッション内だけ有効です。[配布とCookieの詳細](docs/PUBLISHING.ja.md)を参照してください。

## 金融機関の追加・開発への協力

**金融機関の追加PRを歓迎します。PRにあたっては [CONTRIBUTING.md](CONTRIBUTING.ja.md) に沿って、テストとセットでお願いします。** `BrokerAdapter` を継承する会社別クラスを登録し、資料判定・解析・原行保持・保存復元を実装する構成です。

Issueで金融機関の追加を依頼されても対応できません。実装とテストをご自身で用意し、PRを作成してください。既存機能の不具合報告はIssueで受け付けます。

公開fixtureの値は独立した架空データにしてください。氏名・口座だけでなく、実際の数量・金額・日時・アドレス・取引IDも公開しないでください。株式fixtureのティッカーは **FICT**、取引所は **OTHER**を使用してください。FICTは世界的に予約された記号ではありません。

- [CONTRIBUTING](CONTRIBUTING.ja.md)：PR基準、データの扱い、Codexへの依頼例
- [会社別アダプターの追加手順](docs/BROKER_ADAPTERS.ja.md)：派生クラスの契約、登録、保存モデルの制約
- [UNCONFIRMED](docs/UNCONFIRMED.ja.md)：未実装・未検証項目と完了条件

Node.js 24以降で検証します。

```sh
npm ci
npm run test:coverage
npm run build
npx playwright install chrome
npm run test:e2e
```

CIも単体カバレッジ、ビルド、ヘッドレスChrome E2Eを実行します。最低ラインは単体の行95%・分岐80%・関数90%。main.tsはE2Eで別計測します。[計測範囲と限界](docs/TEST_COVERAGE.ja.md)を参照してください。個人資料や外部相場取得はテストに不要です。

## 詳細ドキュメント

- [操作と参考計算](docs/USAGE.ja.md)：年次集計、ポートフォリオ、取得費、ページ分割、JSON形式
- [株価・為替](docs/MARKET_DATA.ja.md)：CSVの取得・取り込み、価格や為替の採用方法
- [配布方法](docs/PUBLISHING.ja.md)：ソースからの起動、CI、Cookie
- [開発引き継ぎ](docs/HANDOFF.ja.md)：現在の構成と作業上の制約

英語を標準ドキュメントとし、日本語版は `.ja.md` に置いて相互リンクします。仕様や手順の変更は両言語へ反映し、コードコメントと標準PR説明は英語にします。

## ライセンス

本プロジェクトはKatsushi Kobayashiの個人プロジェクトであり、勤務先とは関係ありません。勤務先による支援・推奨を示すものではありません。

Copyright 2026 Katsushi Kobayashi <ikob@acm.org>。
コードとドキュメントは [Apache License 2.0](LICENSE)。個人の取引資料、第三者の相場データ等は対象外です。
