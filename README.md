# Skills

Personal agent skills for Codex, Claude Code, and other Agent Skills-compatible tools.

The marketplace also ships `mattpocock-skills-arc-version`, a separate Arc-adapted fork of Matt Pocock's skills.

## Skills

- `agents-md` - write or review AGENTS.md/CLAUDE.md agent-context files: eleven principles, a verification-first review checklist, and AGENTS.md↔CLAUDE.md interop. Tool mechanics cover Claude Code and Codex. Sourced from [HumanLayer's "Writing a good CLAUDE.md"](https://www.humanlayer.dev/blog/writing-a-good-claude-md).
- `brainstorming-handoff` - clarify intent, separate decisions from assumptions, and end with a reviewed design handoff. Includes an authenticated visual companion. Adapted from the [Superpowers](https://github.com/obra/superpowers) `brainstorming` skill by Jesse Vincent / obra.
- `cross-review` - run any read-only task (code analysis, diagnosis, research, fact-finding) through Claude and Codex in parallel, cross-review the two answers, and synthesize one verdict. Subscription auth only (Claude Agent SDK + Codex SDK).
- `data-structures` - choose and implement custom JavaScript data structures with explicit complexity and contracts. Imported from [Timur Shemsedinov's original skill](https://github.com/metarhia/metaskills/blob/main/skills/data-structures/SKILL.md), with its YAML description quoted for portability.
- `error-handling` - apply JavaScript/TypeScript and Node.js error classification, propagation, retry, and shutdown patterns. Adapted from [Timur Shemsedinov's original skill](https://github.com/metarhia/metaskills/blob/main/skills/error-handling/SKILL.md).
- `js-gof` - apply creational and structural GoF and related patterns in JavaScript/TypeScript. Adapted from [Timur Shemsedinov's original skill](https://github.com/metarhia/metaskills/blob/main/skills/js-gof/SKILL.md).
- `stage-orchestrator` - orchestrate a multi-stage refactor or build over delegated work: author self-contained stage prompts with a git-worktree contract, then verify each returned stage (full gate, adversarial review workflow, machine-checked claims) before landing it on main.
- `youtube-notes` - turn a YouTube video into a distilled Russian-language Obsidian note with screenshots of the important on-screen moments. TypeScript scripts drive `yt-dlp` + `ffmpeg`; run `bash skills/youtube-notes/scripts/init.sh` once before first use to install/restore dependencies.
- `zip-context` - create a clean project-context zip archive for model handoff. Original repo: https://github.com/glebkudr/zip_context.

## Additional plugin

- `mattpocock-skills-arc-version` - the 27 stable skills from [Matt Pocock's `skills`](https://github.com/mattpocock/skills) plugin, pinned to [49dd158](https://github.com/mattpocock/skills/commit/49dd158d1076134a641b33efb035946536778336) (upstream 1.3.1). Skill files preserve the upstream text and formatting exactly except for Arc, Arcanum, Tracker, and CI adaptations; `in-progress` and `misc` remain excluded, matching the upstream plugin manifest.

## Layout

```text
.agents/
  plugins/
    marketplace.json   # Codex plugin marketplace
.claude-plugin/
  marketplace.json     # Claude Code plugin marketplace
  plugin.json          # Claude Code plugin manifest
.codex-plugin/
  plugin.json          # Codex plugin manifest
plugins/
  mattpocock-skills-arc-version/
    .claude-plugin/
      plugin.json      # separate Claude Code plugin
    .codex-plugin/
      plugin.json      # separate Codex plugin
    skills/             # 27 stable skills
    LICENSE            # upstream MIT license
skills/
  agents-md/
    SKILL.md
    references/
      review-checklist.md
      cross-tool-reference.md
    agents/
      openai.yaml
  brainstorming-handoff/
    SKILL.md
    builder-check-prompt.md
    visual-companion.md
    agents/
      openai.yaml
    scripts/           # visual companion server, client, and launchers
  cross-review/
    SKILL.md
    agents/
      openai.yaml
    scripts/
      cross-review.ts
      package.json
      tsconfig.json
      lib/
  data-structures/
    SKILL.md
    agents/
      openai.yaml
  error-handling/
    SKILL.md
    agents/
      openai.yaml
  js-gof/
    SKILL.md
    agents/
      openai.yaml
  stage-orchestrator/
    SKILL.md
    process-map.html   # визуальная карта процесса (открыть в браузере)
    agents/
      openai.yaml
    references/
      gate-playbook.md
      review-workflow.md
      review-runtime-claude.md
      review-runtime-codex.md
      stage-prompt.md
  youtube-notes/
    SKILL.md
    agents/
      openai.yaml
    scripts/
      init.sh
      fetch.ts
      contact_sheet.ts
      frames.ts
      transcripts.ts
      cite_timecodes.ts
      lib.ts
      package.json
      tsconfig.json
  zip-context/
    SKILL.md
    agents/
      openai.yaml
    scripts/
      zip_context.py
tests/
  upstream-regressions.test.cjs
```

The imported Metarhia skills retain their upstream MIT notice in
[`THIRD_PARTY_LICENSES/metarhia-metaskills-MIT.txt`](THIRD_PARTY_LICENSES/metarhia-metaskills-MIT.txt).
Superpowers attribution is preserved in
[`THIRD_PARTY_LICENSES/superpowers-MIT.txt`](THIRD_PARTY_LICENSES/superpowers-MIT.txt);
Matt Pocock's license and the `pr` skill's HumanLayer credit ship inside the separate plugin.

## Upstream audit — 2026-10-17

| Local copy                                    | Checked source                                                                                                                        | Result / local adaptations                                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mattpocock-skills-arc-version`               | [1.3.1 / 49dd158](https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336)                                 | Updated from `5b15a47`; all 27 stable skills. Arc commands, full hashes, bounded history, worktree preservation, and unpublished Arcanum PRs retained/adapted.                                                  |
| `brainstorming-handoff`                       | [Superpowers 7.0.0 / bb92a77](https://github.com/obra/superpowers/tree/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/brainstorming) | Updated workflow and companion together. Preserves general/OpenSpec handoff formats, optional saving, explicit next-phase requests, and `.brainstorming-handoff/`. Local branding; no upstream image telemetry. |
| `data-structures`, `error-handling`, `js-gof` | [Metarhia 1.0.5 / fe4c423](https://github.com/metarhia/metaskills/tree/fe4c4230ea054e4b354d9e81400e26299f1be6d7)                      | No newer source than the import. Keep YAML quoting, formatting, and corrected code examples; do not overwrite these with the raw source. Other Metarhia skills are not dependencies of these three.             |
| `zip-context`                                 | [6fc58ed](https://github.com/glebkudr/zip_context/tree/6fc58edf7bc2f54d556953956bb06f570e48e332)                                      | No newer source than the import. Keep manual ignore-file ownership, `.gitignore`/`.arcignore` fallback, and the local archive-selection contract.                                                               |
| `agents-md`                                   | [HumanLayer article](https://www.humanlayer.dev/blog/writing-a-good-claude-md), dated 2025-11-25                                      | Guidance source, not a versioned skill dependency. Article checked; local Claude Code/Codex mechanics were not re-audited.                                                                                      |

`cross-review`, `stage-orchestrator`, and `youtube-notes` have no declared external skill source to synchronize. SDK, CLI, and package updates are outside this audit.

### Compatibility in Matt Pocock plugin 2.0.0

- Adds `implement-spec`, `pr`, and `retro`; removes `resolving-merge-conflicts`, as upstream does. Use the separate `arc` skill for Arc conflicts.
- Domain documents now use `GLOSSARY.md`, `GLOSSARY-MAP.md`, and `GLOSSARY-FORMAT.md`. Before using the updated workflows in an existing project, migrate its old `CONTEXT.md` / `CONTEXT-MAP.md` domain documents and their pointers. This update does not edit consumer projects.
- `implement-spec` uses Arc worktrees and leaves Arcanum PRs unpublished until explicitly requested. The installed `arc` skill is preferred; Arc CLI help is the fallback.

### Arc-only follow-up — plugin 2.0.1

- Code/history operations use Arc; PR operations use Arcanum. The former hosted-Git tracker templates are replaced by a Yandex Tracker template, with local Markdown still supported.
- `setup-matt-pocock-skills` records the queue and available Tracker tools; issue creation requires an explicit request. Tracker and Arcanum identifiers remain separate.
- `wizard` retains local `.env` handling; CI secret provisioning follows the project's documented store/tool or manual steps. The hosted-Git CLI helpers are removed.
- Repository URLs in attribution and package metadata identify upstream sources; they are not workflow dependencies.

### Skill dependencies

Install the Matt Pocock plugin as a unit. Copying a single skill directory does not install its sibling dependencies:

| Caller                          | Sibling skills it loads                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `grill-me`                      | `grilling`                                                            |
| `grill-with-docs`               | `grilling`, `domain-modeling`                                         |
| `implement`, `implement-spec`   | `tdd`, `code-review`                                                  |
| `tdd`                           | `codebase-design` when interface design is needed                     |
| `improve-codebase-architecture` | `codebase-design`, `grilling`, `domain-modeling`                      |
| `wayfinder`                     | `research`, `prototype`, `grilling`, `domain-modeling` by ticket type |
| `retro`                         | `writing-for-agents`                                                  |

Tracker and Arcanum operations require their configured MCP/CLI tools; the installed `arc` and `arcanum-go` skills are used when available. The tracker workflows also require the project configuration written by `setup-matt-pocock-skills`; that skill is included. `ask-matt` routes the user to the bundled workflows. The `pr` skill embeds its credited `show-me` guidance, so installing `show-me` is unnecessary. Root skills require no other skill installation; `brainstorming-handoff` includes its builder-check prompt and companion and does not call `superpowers:writing-plans`.

Run `npm test` for the companion authorization/asset confinement and wizard `.env` regression checks. Native Windows behavior and real agent sessions are not covered.

## Usage

### Install as a plugin

The repo is a plugin marketplace for both Claude Code and Codex. The main
`ytil-skills` plugin bundles all skills from the root `skills/` directory;
`mattpocock-skills-arc-version` is packaged separately under `plugins/`.

Claude Code (inside a `claude` session):

```text
/plugin marketplace add ytil/skills
/plugin install ytil-skills@ytil-skills
/plugin install mattpocock-skills-arc-version@ytil-skills
```

Installed skills are invoked as `ytil-skills:<skill-name>` or
`mattpocock-skills-arc-version:<skill-name>`, depending on the plugin.

Codex:

```bash
codex plugin marketplace add ytil/skills
codex plugin add ytil-skills@ytil-skills
codex plugin add mattpocock-skills-arc-version@ytil-skills
```

Or browse via `/plugins` in the Codex TUI.

### Install as plain skills

Copy a skill directory into the target agent's skills folder.

### Install with `npx skills`

For Agent Skills-compatible tools, the easiest path is the `skills` CLI. First
list the skills exposed by this repository:

```bash
npx skills add ytil/skills --list
```

Install a selected skill globally for one agent:

```bash
npx skills add ytil/skills \
  --skill <skill-name> \
  --agent codex \
  --global
```

Supported agent names:

```text
cursor       Cursor
codex        Codex
claude-code  Claude Code
opencode     OpenCode
```

Install a selected skill globally for all four:

```bash
npx skills add ytil/skills \
  --skill <skill-name> \
  --agent cursor \
  --agent codex \
  --agent claude-code \
  --agent opencode \
  --global
```

For private repositories, prefer an SSH URL:

```bash
npx skills add git@github.com:ytil/skills.git \
  --skill <skill-name> \
  --agent codex \
  --global
```

For non-interactive scripts, add `--yes`:

```bash
npx skills add git@github.com:ytil/skills.git \
  --skill <skill-name> \
  --agent codex \
  --global \
  --yes
```

To avoid anonymous telemetry from the `skills` CLI, set
`DISABLE_TELEMETRY=1` before the command.

### Manual install

Global paths:

```text
Cursor       ~/.cursor/skills/<skill-name>
Codex        ~/.codex/skills/<skill-name>
Claude Code  ~/.claude/skills/<skill-name>
OpenCode     ~/.config/opencode/skills/<skill-name>
```

Project-local paths:

```text
Cursor       .agents/skills/<skill-name>
Codex        .agents/skills/<skill-name>
Claude Code  .claude/skills/<skill-name>
OpenCode     .agents/skills/<skill-name>
```

Copy a skill manually:

```bash
mkdir -p <target-skills-dir>
cp -R skills/<skill-name> <target-skills-dir>/<skill-name>
```

Restart the agent after installing or updating a skill.
