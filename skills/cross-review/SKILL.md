---
name: cross-review
description: "Cross-review orchestrator: run a read-only analysis task through Claude and Codex in parallel, have each model cross-review the other's analysis against the real code, and synthesize one final verdict. Use when the user asks for a cross-review, a second opinion from both models, wants an analysis double-checked by two independent AI agents, or says 'кросс-ревью', 'спроси обе модели', 'прогони через обе модели'. Read-only tasks only (analysis, diagnosis, review, planning — no code edits). Runs on subscription limits (Claude + ChatGPT), never API keys."
---

# Cross Review

Run one read-only task through a 5-call pipeline:

1. **Analysis** — Claude and Codex analyze the task independently, in parallel.
2. **Cross-review** — Codex reviews Claude's analysis, Claude reviews Codex's, in parallel; each verifies the opponent's claims against the actual code.
3. **Synthesis** — one configurable model (default Claude) writes a single verdict from the four anonymized artifacts.

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
--cwd <dir>       repository to analyze (default: current directory)
--out <dir>       report directory override
--timeout <min>   per-call timeout (default: 10; raise for ultracode runs)
--json            machine-readable output
```

Rules:

- Role flags accept the FULL form only. To express "just effort", supply the model too (see defaults below).
- effort: `minimal | low | medium | high | xhigh | max | ultracode` (`minimal` is Codex-only).
- `ultracode` maps to the ultracode multi-agent keyword for Claude and to `model_reasoning_effort=ultra` for Codex. Codex `ultra` requires a GPT-5.6 model (use `gpt-5.6-sol`).

Model naming — concrete slugs only:

- Always pass a CONCRETE model slug in role flags, never an alias: "sonnet"/"opus" are
  ambiguous across releases. Resolve the user's alias to the current model id yourself
  (your harness lists current Claude model ids; for Codex check `~/.codex/config.toml`
  and the current lineup, e.g. `gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-5.6-luna`) and show
  the resolved slug in the approval gate — the user confirms it before launch.
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
- Never launch without the approval gate, even when all parameters are explicit.
- Do not add your own analysis on top of the verdict; the pipeline's value is the isolated three-model process.
- The script scrubs `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` from its environment: both agents always run on subscription auth. Do not "fix" auth errors by injecting API keys.
