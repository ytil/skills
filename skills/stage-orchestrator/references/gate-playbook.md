# Gate playbook

This file is the repo-specific half of the skill. The methodology (delegate →
verify → fix → land) is portable; *what the full gate is and how it fails* is
not. Resolve it once per repo and keep the shape below: **one command, its
recurring failure modes, and the recovery move for each** — so a red gate is a
lookup, not an investigation.

## Resolving the gate in a new repo

Look, in order: the repo's CLAUDE.md / AGENTS.md (a well-onboarded repo names
its gate), the root `package.json` scripts (a `qa`, `check`, `verify`, or `ci`
script), then the CI workflow (what does CI actually run?). The full gate is
the superset command — the one that runs typecheck, lint, tests, format check,
and dead-code check together. If the repo has no such script, run the pieces CI
runs, all of them; a subset gate produces exactly the "passing typecheck is not
a passing format check" wound the verify loop warns about. Record what you
resolved in the project's memory or its CLAUDE.md — not in this file, which is
read-only when the skill is installed as a plugin (vendored in-repo copies may
update it) — so the next stage doesn't re-derive it.

## Worked instance: pnpm monorepo (prettier / eslint / knip)

The battle-tested instance this skill grew up on. Full gate: `pnpm qa` from the
repo root. Its failure modes recur; know them so a red gate does not stall you:

- **`format:check` red** — you (or an agent) added/edited files without
  formatting. `npx prettier --write <files>` then re-run. New files are the usual
  culprit.
- **`knip` red** — deleting code orphans exports/files (barrels, re-exports,
  value objects whose only caller you just removed). Chase each orphan; update
  the barrel. Remember knip does **not** flag test-only-live code — grep for that
  separately with a `grep -v '\.test\.'` prod-consumer check.
- **`lint` red** — usually an unused import/var left after a removal.
- **"Command qa not found"** — the shell is stuck in an `apps/<app>` dir after a
  per-app command; re-run from the repo root.
- **Local green ≠ CI green** — a green local gate reflects the working tree;
  CI sees only the pushed HEAD. Never push a commit you know is red — the
  loop's one-green-commit-per-stage plus an immediate push means a red
  intermediate should never exist to begin with.

## The experiment beats the argument

Prefer verifying a disputed empirical claim (a shim is needed, an export is
dead) by *doing the experiment* — stash and re-run, `mv` and re-export — over
reasoning about it. The gate is cheap to run; a wrong belief committed to
`main` is not.
