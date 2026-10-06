## What and why

<!-- What changes, and the reason. Link the roadmap item or issue. -->

## How it was verified

<!-- Paste evidence, not claims: command output, test names, a screenshot. -->

- [ ] `npm run verify`
- [ ] `npm run build` and the relevant `npx playwright test <spec>` (browser-visible changes)
- [ ] Shared contracts changed: TypeScript and `docs/v2/` are updated together
- [ ] Environment, dependency, build, deploy or CI settings changed: every related place was searched for and updated in this PR (AGENTS.md「联动一致性」); list the `git grep` commands and the files they hit

## Checklist

- [ ] No secrets, page content or attachment bytes in logs, fixtures or screenshots
- [ ] No test was skipped, disabled or loosened to get green
- [ ] Docs describe the target contract; delivery status is only in `docs/v2/roadmap.md`
