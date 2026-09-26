# GitHubでの配布

[English](PUBLISHING.md) | 日本語

[ikob/AnnumAequitas](https://github.com/ikob/AnnumAequitas) からソースを配布します。ビルド済みアプリやRelease bundleは配布しません。**shikob.netやそのサブドメインにアプリをホスティングしません。**

## インストールとローカル起動

Node.js 24以降とGitを用意し、READMEの clone → `npm install` → `npm start` に従ってください。prestartでビルドし、startでループバックのローカルサーバーを起動します。通常は http://127.0.0.1:4173/ 、終了はCtrl+Cです。Pythonや別のサーバーは不要です。`file://` の直接起動には対応しません。開発時は `npm run dev` を使用できます。

## CI

CIはNode.js 24と `npm ci` で依存関係を再現可能にインストールし、単体カバレッジとヘッドレスChrome E2Eを実行します。Playwrightが `npm start` を起動するため、製品ビルドと通常利用と同じ起動経路も自動検証します。ビルドや起動に失敗した場合、E2Eは失敗します。

CI artifactは検証レポートだけです。単体カバレッジ、ブラウザレポート、失敗時のtrace・画像、E2Eカバレッジを30日保存します。アプリの `dist/` はアップロードしません。公開PRは読み取り権限のGitHub-hosted runnerで実行し、個人資料・認証情報を渡しません。ローカル成功とリモート成功は区別し、[Actions](https://github.com/ikob/AnnumAequitas/actions)で確認してください。

ローカルbuildは任意の公開相場キャッシュをdistへコピーします。distと取得済みキャッシュはローカル専用・Git対象外としてください。real-*を公開fixtureへ移したり、個人CSV・保存記録・取得済み相場をコミットしたりしないでください。

## Cookieの識別子

`shikob.net`はCookie名の名前空間として使うだけで、CookieのDomain属性には使わない。

- HTTPローカル起動：`shikob.net.annum-aequitas-consent-dev`
- HTTPS起動：`__Host-shikob.net.annum-aequitas-consent`
- Path=/、SameSite=Lax、Max-Age=180日。HTTPSではSecureも付ける。Domainなしなので起動したホストだけで有効。Cookieはポート別には分離されない。
- 内容は `src/consent.ts` の `DISCLAIMER_VERSION` だけ。ユーザーIDや金融資料を保存しない。
- 未同意・期限切れ・版不一致は明示チェックと同意ボタンを表示。未同意のCSVドロップも拒否。Cookie不許可はセッション内同意となる。
- フッターから本文を読み返し、記録を破棄せず戻れる。
- ブラウザ内の確認用であり、本人認証や改ざん耐性のある同意証跡ではない。Cookieは利用者が削除・変更できる。

参考：[MDN Cookie属性](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)、[GitHub公開PR/self-hostedの説明](https://docs.github.com/en/actions/reference/security/secure-use)。免責の法的有効性、Safariでの初回/再同意/Cookie不許可操作はUNCONFIRMED。

プロジェクト表示名はAnnumAequitas、npmパッケージ名・テストレポートartifactの接頭辞はannum-aequitas。JSONの形式識別子、同意Cookie、localStorageキーもannum-aequitasへ統一する。旧識別子のJSONはformatの変換が必要。ローカルの作業ディレクトリ名は変更しない。

## 必須チェックとレビュー

初回CI実行後、`main` の保護を次のように設定します。

- PR経由と1名以上のApproveを必須にします。
- GitHub Actionsの `test-and-build` を必須チェックにし、マージ前にベースブランチへの追従を要求します。
- 追加コミット時に古い承認を無効にします。
- 通常の貢献でこれらの条件を迂回しない設定にします。

単体カバレッジ未達、テスト・ビルド・起動失敗でworkflowが失敗する設定は実装済みです。リポジトリ側の保護は **未設定・未確認** です。workflowのコミットだけでは有効になりません。CI成功後のApproveは運用で守り、マージ時はGitHubでチェックと承認の両方を要求します。

参考：[GitHubのブランチ保護](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。
