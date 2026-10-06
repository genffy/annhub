# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository
([private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).
Do not open a public issue for a security problem. You can expect an acknowledgement within a few days.

## Scope

- The browser extension (`entrypoints/`, `background-service/`, `learning-core/`).
- The build and release pipeline (`.github/`).

## What AnnHub is designed to protect

- Captured material stays on the device by default. Logs never contain provider keys, full pages or
  attachment bytes.
- Release artifacts carry a build-provenance attestation; see [docs/releasing.md](docs/releasing.md) for how to
  verify them.
