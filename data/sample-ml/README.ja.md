# Merrill sample fixtures

[English](README.md) | 日本語

公開・テスト用の架空データを置くディレクトリです。`demo.csv` は全項目を架空にした 2023〜2025 年の 6 行です。
Merrill の資料で確認した形式を模倣した自作fixtureであり、Merrill公式の公開サンプルCSVではありません。作成元・公開参考資料・未確認の形式は [multi-year/README.md](multi-year/README.ja.md#作成元と形式の確認範囲) に記載しています。
RSU 入庫・配当・源泉徴収・仮形式の売却を含みます。売却形式は実資料で未確認です。
FICT と DEMO-CUSIP はデモ用の架空表記です。実在銘柄の取引を意味しません。
実際の明細は ../real-ml/ に保存し、Git の対象外にしています。
実データをfixtureとして提出したり、氏名と口座番号だけを伏せて公開したりしないでください。数量・金額・日時・IDも独立した架空値にし、株式fixtureはFICT / OTHERを使用してください。

数年分の取り込み・残高・損益テストには [multi-year/README.md](multi-year/README.ja.md) を参照。
2022〜2026年の Activity / Holdings / Portfolio、架空相場、すぐ開けるデモ記録、分割の未対応テストを用意しています。
