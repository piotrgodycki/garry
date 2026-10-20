# Security policy

Garry runs agents that read and write code in your repositories, so security
reports matter to us.

## Reporting a vulnerability

Do not open a public issue. Report it privately through GitHub:
**Security** tab, then **Report a vulnerability** (private vulnerability reporting).

Please include what is affected, how to reproduce it and the impact you expect. We
aim to acknowledge a report within 7 days and to agree on a disclosure date with you.

## Supported versions

Garry is before its first release. Only the latest commit on `main` gets fixes.

## Running Garry safely

- The server binds to `127.0.0.1` by default. To reach it from a phone or another
  device, set `GARRY_ACCESS_TOKEN` and start it with `--host 0.0.0.0`, or put it
  behind a private network or an identity aware proxy. See "Use from a phone" in
  the README.
- The server refuses to listen on a non loopback address without an access token.
- The GitHub token (`GARRY_GITHUB_TOKEN`) should be a fine grained token limited to
  the repositories Garry manages. Keep it in `.env`, which is never committed.
