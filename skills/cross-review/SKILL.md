---
name: cross-review
description: "Cross-review orchestrator: run any read-only task — code analysis, diagnosis, research, fact-finding — through Claude and Codex in parallel, have each model cross-review the other's answer, and synthesize one final verdict. Use when the user asks for a cross-review, a second opinion from both models, wants an answer double-checked by two independent AI agents, or says 'кросс-ревью', 'спроси обе модели', 'прогони через обе модели', 'проверь через обе модели'. Read-only tasks only (analysis, diagnosis, review, planning, research — no code edits). Runs on subscription limits (Claude + ChatGPT), never API keys."
---

# Cross Review

Run one read-only task through a 5-call pipeline:

1. **Analysis** — Claude and Codex work on the task independently, in parallel.
2. **Cross-review** — Codex reviews Claude's answer, Claude reviews Codex's, in parallel. Each review continues its author's own analysis session (the task and the reviewer's own answer are already in context; only the opponent's answer is new), and independently verifies the opponent's key claims.
3. **Synthesis** — one configurable model (default Claude) starts from a clean slate and writes a single verdict from the four anonymized artifacts.

The verdict is printed to stdout; a full report (all 5 artifacts + metadata) is saved to `~/.cache/cross-review/<timestamp>-<slug>/report.md`.

The orchestrator is a bundled TypeScript script (runs directly via Node's native
type stripping — requires Node 22.18+ / 24):

```
<skill base directory>/scripts/cross-review.ts
```

Resolve the path from this skill's base directory (Claude Code shows it when the skill loads; in Codex it is `$CODEX_HOME/skills/cross-review/scripts/cross-review.ts`).

Dependencies are NOT self-installed: if `scripts/node_modules` is missing (first use, or after a plugin update replaced the cache), run `npm install --no-fund --no-audit` in the `scripts/` directory before launching.

## Script interface

```
node cross-review.ts "<task text>" [options]
echo "<long task>" | node cross-review.ts - [options]

--claude=<model>:<effort>                      Claude side: its analysis + its review
--codex=<model>:<effort>                       Codex side: its analysis + its review
--synthesizer=<claude|codex>:<model>:<effort>  who writes the verdict (default: claude,
                                               inheriting --claude settings when given)
--cwd <dir>       working directory for the agents (default: current directory;
                  only matters when the task concerns its contents)
--out <dir>       report directory override
--timeout <min>   per-call timeout (default: 10; raise for ultracode runs)
--json            machine-readable output
```

Rules:

- Role flags accept the FULL form only. To express "just effort", supply the model too (see defaults below).
- effort: `minimal | low | medium | high | xhigh | max | ultracode` (`minimal` is Codex-only).
- `ultracode` maps to the ultracode multi-agent keyword for Claude and to `model_reasoning_effort=ultra` for Codex. Codex `ultra` requires a GPT-5.6 model (`gpt-5.6-sol` or `gpt-5.6-terra`; `gpt-5.6-luna` does not support it).

Model naming — concrete slugs only:

- A role flag, when you pass one, must carry a CONCRETE model slug, never an alias:
  "sonnet"/"opus" are ambiguous across releases. Resolve the user's alias to the current
  model id yourself (your harness lists current Claude model ids; for Codex check
  `~/.codex/config.toml` and the current lineup, e.g. `gpt-5.6-sol` / `gpt-5.6-terra` /
  `gpt-5.6-luna` — lineup examples age, trust the live sources over this file) and show
  the resolved slug in the approval gate — the user confirms it before launch.
  Omitting a role flag entirely is also fine: the CLI's own default runs, and the gate
  shows it as "CLI default".
- When the user names only an effort, pick the model too: Claude — the current Opus slug
  (or Fable if the user asks for maximum quality); Codex — the `model` key from
  `~/.codex/config.toml` if set, otherwise `gpt-5.6-sol`.
- There is deliberately NO model map in the script: model×effort compatibility is
  validated by the CLIs themselves, and the report records which models actually ran
  (`models actually used` line + `resolvedModels` in meta.json).

## Workflow

1. Extract the task text and any run parameters (models, efforts, synthesizer) from the user's request.
2. Build the flag set: translate natural-language wishes ("codex на максимум, синтез экономно") into full-form flags.
3. **Approval gate (mandatory).** Before every launch, show the resolved parameters via the Ask tool (AskUserQuestion in Claude Code, the user-question mechanism in Codex) and wait for explicit approval:
    - Show: task, claude model:effort, codex model:effort, synthesizer, cwd, report dir.
    - Model fields must be concrete slugs (aliases resolved by you), so the user sees
      exactly what will run.
    - Options: **"Запустить"** / **"Изменить параметры"** (free-text changes → rebuild flags → show the gate again).
    - Parameters the user did not specify are shown as "CLI default".
4. Launch the script with Bash `run_in_background` — a run takes 5–15+ minutes (more with ultracode). Do not block on it; check progress via the background task output (the script logs phase progress to stderr).
5. When the script finishes, relay the verdict from stdout to the user verbatim and give the report path. Do not re-summarize or editorialize the verdict.
6. On a non-zero exit, show the script's stderr error as-is — validation, auth, and usage-limit errors are self-describing (e.g. Codex limit exhaustion names the reset time).

## Guardrails

- Read-only tasks only: if the user asks for code changes, this skill is the wrong tool — offer a regular implementation flow instead.
- Read-only is enforced by the prompt, not by a sandbox: both agents run with full
  permissions so that read-only commands and existing tests/linters work without
  prompting. Hostile file contents could try to prompt-inject a mutating action —
  do not point the pipeline at an untrusted repository.
- Never launch without the approval gate, even when all parameters are explicit.
- Do not add your own analysis on top of the verdict; the pipeline's value is the
  five-call process with controlled context: two independent analyses, two cross-reviews
  (each continuing its own author's session, never the opponent's), and a clean-slate
  synthesis.
- The script scrubs `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` from its environment: both agents always run on subscription auth. Do not "fix" auth errors by injecting API keys.
