# Skills repo — agent guide

Personal agent-skills monorepo, shipped as a Claude Code + Codex plugin marketplace. Each skill is a directory under `skills/<name>/` with a `SKILL.md`; both plugins bundle **all** of `skills/`.

## Layout

- `skills/<name>/SKILL.md` — one skill each: `agents-md`, `brainstorming-handoff`, `cross-review`, `data-structures`, `error-handling`, `js-gof`, `stage-orchestrator`, `youtube-notes`, `zip-context`. Every skill also has `agents/openai.yaml` — its Codex-facing display name, description, and default prompt. Some carry `scripts/` (TypeScript or Python) and `references/`.
- `.claude-plugin/` — Claude Code `plugin.json` + `marketplace.json`.
- `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json` — Codex plugin.
- `README.md` — human-facing skill list + layout tree.
- `AGENTS.md` — a symlink to this file (Codex reads it). Edit `CLAUDE.md`; never replace the symlink with a copy.
- `*-workspace/` — gitignored skill-eval scratch; never edit or ship it.

## Formatting & checking

- `npm run format` — Prettier, 4-space indent (see `package.json`). It walks the **whole repo**, so a run after touching one skill can reformat others; check the diff before committing.
- No build or tests. The one mechanical invariant is the manifest versions — after bumping, confirm all three agree:
  `grep -h '"version"' .claude-plugin/plugin.json .claude-plugin/marketplace.json .codex-plugin/plugin.json`

## Before every push

The plugin manifests do not auto-derive from `skills/` — keep them in sync by hand:

- **Bump the version on every push** — increment `version` identically (patch by default; minor/major for larger changes) in all three: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`. They must always match.
- When you add, remove, or rename a skill, update the skill list in `.claude-plugin/plugin.json` `skills[]` (Codex's `plugin.json` globs `./skills/`, so it needs no list), the `keywords`/`description`, the `README.md` skill list + Layout tree, and the skill list under **Layout** above.
- When you change what a skill does, re-read its `agents/openai.yaml` and its `README.md` entry and fix whatever no longer describes it. README states specifics — counts, capabilities, scope — that go stale silently.
