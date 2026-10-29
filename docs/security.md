# Security

- Security review runs in CI: `pnpm audit` plus a Semgrep SAST scan.
- Dependabot version updates are off for now (removed to keep the single branch quiet
  before the MVP). `pnpm audit` still guards dependency vulnerabilities.
- Secrets are never committed. Tokens live in `.env.local` only (see `.env.example`).
- `pnpm audit` ignores exactly two advisories, both in Expo's development CLI
  (`@expo/cli`), which runs on a developer's machine and is never part of the app,
  the server or the npm package: GHSA-86w9-cpqp-85rv (node-forge, no fixed version,
  used only to read iOS signing certificates for `expo run:ios`) and
  GHSA-mrhx-c7xc-m3w5 (zod 3, used to validate Expo dev tools plugins; Garry's own
  packages use the fixed zod 4). The list is `pnpm.auditConfig` in `package.json`;
  drop an entry as soon as Expo ships a fixed version.
- The terminal in Files is a shell on the computer running Garry, so only that
  computer may open one: paired devices get 403, writes from another site are
  refused, at most 8 run at once, and they end when Garry stops.
  `GARRY_TERMINAL=off` turns it off for everyone.
- `garry serve` listens on `127.0.0.1` only. Phones and other computers connect after
  pairing with a one-time QR code and send a per-device token; see
  [Phones and other computers](./cli-more.md#phones-and-other-computers).
- Before the MVP the project uses a single branch (`main`) with direct commits. Branch
  protection and a pull request only flow come later, when `main` and `develop` are
  split. CI still runs the security review on every push.
- Copilot reviews pull requests following [`.github/copilot-instructions.md`](../.github/copilot-instructions.md).
