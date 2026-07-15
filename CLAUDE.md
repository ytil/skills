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

The plugin manifests do not auto-derive from `skills/`. `scripts/sync-plugins.mjs` handles the mechanics:

- **Bump the version on every push:** `npm run bump` — increments `version` identically across all three manifests (`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`) and re-derives `skills[]` from `skills/`. Use `npm run bump -- --minor` / `--major` for larger changes.
- **`npm run check`** verifies the manifests are in sync (exit 1 if not) — safe for CI or a pre-push hook. It does not enforce _when_ to bump; that's on you (or a hook).
- **Curated by hand** (the script leaves these alone): when you add, remove, or rename a skill, refresh `keywords`/`description` in the manifests and mirror the change in `README.md` (skill list + Layout tree).
