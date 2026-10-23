## What and why

<!-- What changes, and the reason. Link the roadmap item or issue. -->

## How it was verified

<!-- Paste evidence, not claims: command output, test names, a screenshot. -->

- [ ] `npm run verify`
- [ ] `npm run build` and the relevant `npx playwright test <spec>` (browser-visible changes)
- [ ] Shared contracts changed: TypeScript and `docs/product/` are updated together
- [ ] New or changed behaviour: the owning docs in `docs/product/` (contract, user story and acceptance, metrics) change in this PR; a feature that crosses the not-doing list in `product.md` §2.3 changes that row here
- [ ] Environment, dependency, build, deploy or CI settings changed: every related place was searched for and updated in this PR (AGENTS.md「联动一致性」); list the `git grep` commands and the files they hit

## Checklist

- [ ] No secrets, page content or attachment bytes in logs, fixtures or screenshots
- [ ] No test was skipped, disabled or loosened to get green
- [ ] Docs describe what the code in this PR does; delivery status is only in `docs/product/roadmap.md`
