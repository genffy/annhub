## What and why

<!-- What changes, and the reason. Link the roadmap item or issue. -->

## How it was verified

<!-- Paste evidence, not claims: command output, test names, a screenshot. -->

- [ ] `npm run verify`
- [ ] `npm run build` and the relevant `npx playwright test <spec>` (browser-visible changes)
- [ ] `cd app && swift test` (Core, SQLite or wire changes) and a Desktop build on macOS (UI changes)
- [ ] Shared contracts changed: TypeScript, Swift, fixtures and `docs/v2/` are updated together

## Checklist

- [ ] No secrets, page content or attachment bytes in logs, fixtures or screenshots
- [ ] No test was skipped, disabled or loosened to get green
- [ ] Docs describe the target contract; delivery status is only in `docs/v2/roadmap.md`
