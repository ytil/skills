# Skills

Personal agent skills for Codex, Claude Code, and other Agent Skills-compatible tools.

The marketplace also ships `mattpocock-skills-arc-version`, a separate Arc-adapted fork of Matt Pocock's skills.

## Skills

- `agents-md` - write or review AGENTS.md/CLAUDE.md agent-context files: eleven principles, a verification-first review checklist, and AGENTS.md↔CLAUDE.md interop. Tool mechanics cover Claude Code and Codex. Sourced from [HumanLayer's "Writing a good CLAUDE.md"](https://www.humanlayer.dev/blog/writing-a-good-claude-md).
- `brainstorming-handoff` - clarify feature, refactor, product, or behavior ideas before implementation and end with a structured design handoff. Inspired by the [Superpowers](https://github.com/obra/superpowers) `brainstorming` skill by Jesse Vincent / obra.
- `cross-review` - run any read-only task (code analysis, diagnosis, research, fact-finding) through Claude and Codex in parallel, cross-review the two answers, and synthesize one verdict. Subscription auth only (Claude Agent SDK + Codex SDK).
- `data-structures` - choose and implement custom JavaScript data structures with explicit complexity and contracts. Imported from [Timur Shemsedinov's original skill](https://github.com/metarhia/metaskills/blob/main/skills/data-structures/SKILL.md), with its YAML description quoted for portability.
- `error-handling` - apply JavaScript/TypeScript and Node.js error classification, propagation, retry, and shutdown patterns. Adapted from [Timur Shemsedinov's original skill](https://github.com/metarhia/metaskills/blob/main/skills/error-handling/SKILL.md).
- `js-gof` - apply creational and structural GoF and related patterns in JavaScript/TypeScript. Adapted from [Timur Shemsedinov's original skill](https://github.com/metarhia/metaskills/blob/main/skills/js-gof/SKILL.md).
- `stage-orchestrator` - orchestrate a multi-stage refactor or build over delegated work: author self-contained stage prompts with a git-worktree contract, then verify each returned stage (full gate, adversarial review workflow, machine-checked claims) before landing it on main.
- `youtube-notes` - turn a YouTube video into a distilled Russian-language Obsidian note with screenshots of the important on-screen moments. TypeScript scripts drive `yt-dlp` + `ffmpeg`; run `bash skills/youtube-notes/scripts/init.sh` once before first use to install/restore dependencies.
- `zip-context` - create a clean project-context zip archive for model handoff. Original repo: https://github.com/glebkudr/zip_context.

## Additional plugin

- `mattpocock-skills-arc-version` - the 25 stable skills from [Matt Pocock's `skills`](https://github.com/mattpocock/skills) plugin, pinned to [5b15a47](https://github.com/mattpocock/skills/commit/5b15a47f2d7150f545fbcacbfe381787fc0230dc). Skill files preserve the upstream text and formatting exactly except for Git-to-Arc adaptations; `in-progress` and `misc` remain excluded, matching the upstream plugin manifest.

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
    skills/             # 25 stable skills
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
```

The imported Metarhia skills retain their upstream MIT notice in
[`THIRD_PARTY_LICENSES/metarhia-metaskills-MIT.txt`](THIRD_PARTY_LICENSES/metarhia-metaskills-MIT.txt).

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
