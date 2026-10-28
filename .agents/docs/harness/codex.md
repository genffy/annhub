# pstack in Codex

This file is written for this repository; pstack itself ships no Codex adapter. The pstack skills in `.agents/skills/` (`create-verification-skill`, `create-formal-verification-skill`) use Cursor names. In Codex, read this file once per session before you follow one of them, then map each Cursor name with the tables below. A name with no row: drop the step that needs it and say so in one line.

## Paths

| Cursor                                                      | Codex                                                                                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.cursor/skills/<name>/`                                    | `.agents/skills/<name>/`, then a link `.claude/skills/<name>` → `../../.agents/skills/<name>` so Claude Code loads the same skill (AGENTS.md「Agent skills」). Never two copies. |
| `.cursor/rules/*.mdc`, always-applied rules                 | `AGENTS.md`                                                                                                                                                                      |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | Read the local copy under `.agents/` when it exists; otherwise give the user the URL.                                                                                            |

## Invoking skills

| Cursor                                                | Codex                                                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/name`, when the skill tells the user to type it     | `$name`                                                                                                                     |
| Run another pstack skill yourself                     | Read `.agents/skills/<name>/SKILL.md` and follow it. If it is not in this repository, say which skill is missing and go on. |
| `disable-model-invocation: true` in a generated skill | Also write `agents/openai.yaml` with `policy: allow_implicit_invocation: false` next to its `SKILL.md`.                     |

## Tools

| Cursor                          | Codex                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `AskQuestion`                   | Ask in plain text and wait for the answer.                                                                         |
| Open a todolist                 | Keep the list in your reply and update it at each phase.                                                           |
| `Task` and other subagent steps | Do the step yourself, in order, unless this Codex session offers a subagent tool; say which steps ran in sequence. |
