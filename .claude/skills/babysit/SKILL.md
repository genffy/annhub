---
name: babysit
description: How to drive a pull request in this repository to green CI. Read before reacting to CI failures or review comments on a PR.
---

# Driving a PR to green

CI lives in `.github/workflows/`. The merge gate is the `ci-pass` status plus the CodeQL, dependency-review,
actionlint and zizmor checks. See `docs/releasing.md` for the full map.

## Reproduce a failure locally first

| Failing job                                             | Reproduce with                                                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extension` — format / lint / types / unit / docs links | `npm run verify` (`npm run format` fixes formatting)                                                                                                                                                                |
| `extension` — Swift fixtures drift                      | `scripts/sync-interop-fixtures.sh`, then commit the copied files. If `fixtures/interop` itself must change: `WRITE_FIXTURES=1 npx vitest run learning-core/__tests__/interop-fixtures.test.ts` first                |
| `extension` — E2E                                       | `npm run build`, then `npx playwright test <spec>`; set `CHROMIUM_EXECUTABLE_PATH` if the pinned Chromium is missing. The report is the `playwright-report` artifact                                                |
| `website`                                               | `cd website && npm ci && npx tsc --noEmit && npm run build`                                                                                                                                                         |
| `swift-format`                                          | `cd app && swift format --configuration .swift-format --recursive --in-place Sources Tests Desktop Package.swift`                                                                                                   |
| `macos`                                                 | Only reproducible on macOS: `cd app && swift test`, `xcodegen generate`, `xcodebuild … build CODE_SIGNING_ALLOWED=NO`. Elsewhere, read the `xcodebuild-log` artifact and fix from the compiler output; do not guess |
| workflow-lint                                           | `actionlint` and `zizmor .github` on the changed workflow                                                                                                                                                           |

## Rules

- Never skip, disable, loosen or quarantine a test to get green, and never push an empty commit to re-run CI. A test that
  fails once and passes alone is a race: find it (the E2E service-worker race was found by repeating the specs with
  `--repeat-each`).
- Do not hand-edit `package-lock.json`, `fixtures/`, or the generated Xcode project; a hook blocks it and says which command regenerates them.
- Add or change a dependency only with a reason, and keep `npm audit --omit=dev` clean.
- Workflow changes: pin every action to a full commit SHA with the version in a comment, keep `permissions` minimal per job, and pass
  `${{ }}` values through `env:` instead of interpolating them into `run:`.
- The Desktop views can only be compiled on macOS. A macOS-job failure is real information about SwiftUI code nobody could build
  locally; treat it as the first compile of that code.
