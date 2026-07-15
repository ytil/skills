# Skills repo — agent guide

Personal agent-skills monorepo, shipped as a Claude Code + Codex plugin marketplace. Each skill is a directory under `skills/<name>/` with a `SKILL.md`; both plugins bundle **all** of `skills/`.

## Layout

- `skills/<name>/SKILL.md` — one skill each: `agents-md`, `brainstorming-handoff`, `cross-review`, `stage-orchestrator`, `youtube-notes`, `zip-context`. Some also carry `scripts/` (TypeScript or Python) and `references/`.
- `.claude-plugin/` — Claude Code `plugin.json` + `marketplace.json`.
- `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json` — Codex plugin.
- `README.md` — human-facing skill list + layout tree.
- `*-workspace/` — gitignored skill-eval scratch; never edit or ship it.

## Formatting

- `npm run format` — Prettier, 4-space indent (see `package.json`). No build or tests for the repo itself.

## Before every push

The plugin manifests do not auto-derive from `skills/` — keep them in sync by hand:

- **Bump the version on every push** — increment `version` identically (patch by default; minor/major for larger changes) in all three: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`. They must always match.
- When you add, remove, rename, or change what a skill exposes, also update the skill list in `.claude-plugin/plugin.json` `skills[]` (Codex's `plugin.json` globs `./skills/`, so it needs no list), refresh `keywords`/`description`, and mirror the change in `README.md` (skill list + Layout tree).
