# GitHub distribution

English | [日本語](PUBLISHING.ja.md)

Distribute the source through [ikob/AnnumAequitas](https://github.com/ikob/AnnumAequitas). There are no prebuilt application downloads or Release bundles. **Do not host the app on shikob.net or its subdomains.**

## Installation and local startup

Install Node.js 24 or later and Git, then follow README: clone → `npm install` → `npm start`. The prestart script builds the application; start serves it on loopback, normally http://127.0.0.1:4173/ . Stop with Ctrl+C. Python and a separate server are unnecessary. Direct `file://` startup remains unsupported. For development, use `npm run dev`.

## CI

CI uses Node.js 24 and `npm ci` for reproducible dependency installation. It runs unit coverage and headless Chrome E2E. Playwright launches `npm start`, so the production build and the same local startup path are checked automatically. A build or startup failure fails E2E.

Only verification reports are uploaded as CI artifacts: unit coverage, browser reports, failure traces/screenshots, and E2E coverage, retained for 30 days. The application `dist/` is not uploaded. Public PRs run on read-only GitHub-hosted runners without personal records or credentials. Local success and remote success remain separate; check [Actions](https://github.com/ikob/AnnumAequitas/actions).

Local builds copy optional public market caches into dist. Keep dist and downloaded caches local and Git-ignored. Never move `real-*` data into public fixtures or commit personal CSVs, saved records, or downloaded market data.

## Cookie namespace

`shikob.net` is a namespace in the cookie name only, never its Domain attribute.

- HTTP local startup: `shikob.net.annum-aequitas-consent-dev`.
- HTTPS: `__Host-shikob.net.annum-aequitas-consent`.
- Path=/, SameSite=Lax, Max-Age=180 days; Secure on HTTPS. No Domain attribute, so the cookie belongs to the host that launched the app. Cookies are not separated by port.
- The value is only `DISCLAIMER_VERSION` from `src/consent.ts`. No user identifier or financial records.
- Missing, expired, or outdated consent requires an explicit checkbox and acceptance. CSV drops are rejected before consent. Cookie refusal permits session-only acceptance.
- The footer reopens the disclaimer without discarding records.
- This is a browser-side acknowledgement, not authentication or tamper-resistant evidence. Users can remove or edit cookies.

References: [MDN cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) and [GitHub workflow security](https://docs.github.com/en/actions/reference/security/secure-use). Disclaimer effectiveness and Safari acceptance/renewal/cookie-refusal workflows remain UNCONFIRMED.

The display name is AnnumAequitas; npm and test-report artifact prefixes use annum-aequitas. JSON identifiers, cookies, and localStorage keys use the same namespace. Saved files with old identifiers require a format conversion. The existing local working-directory name is unchanged.

## Required checks and review

Required protection policy for `main`:

- Require a pull request with at least one approving review.
- Require the `test-and-build` status check from GitHub Actions and require the branch to be up to date before merging.
- Dismiss stale approvals when new commits are pushed.
- Do not allow bypassing these requirements for normal contributions.

The workflow already fails when unit coverage is below its thresholds or tests/build/startup fail. Repository-side protection must also be enabled in GitHub settings; committing the workflow alone does not enforce it. Reviewers wait for green CI before approval; GitHub enforces the required check and review together at merge time.

Reference: [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
