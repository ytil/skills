# Skills

Personal agent skills for Codex, Claude Code, and other Agent Skills-compatible tools.

## Skills

- `agents-md` - write or review AGENTS.md/CLAUDE.md agent-context files: ten principles, a verification-first review checklist, and AGENTS.md↔CLAUDE.md cross-tool interop. Sourced from [HumanLayer's "Writing a good CLAUDE.md"](https://www.humanlayer.dev/blog/writing-a-good-claude-md).
- `brainstorming-handoff` - clarify feature, refactor, product, or behavior ideas before implementation and end with a structured design handoff.
- `cross-review` - run a read-only analysis task through Claude and Codex in parallel, cross-review the two analyses against the real code, and synthesize one verdict. Subscription auth only (Claude Agent SDK + Codex SDK).
- `youtube-notes` - turn a YouTube video into a distilled Russian-language Obsidian note with screenshots of the important on-screen moments. TypeScript scripts drive `yt-dlp` + `ffmpeg`; run `bash skills/youtube-notes/scripts/init.sh` once before first use to install/restore dependencies.
- `zip-context` - create a clean project-context zip archive for model handoff. Original repo: https://github.com/glebkudr/zip_context.

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

## Usage

### Install as a plugin

The repo is a plugin marketplace for both Claude Code and Codex. Both plugins
bundle all skills from `skills/`.

Claude Code (inside a `claude` session):

```text
/plugin marketplace add ytil/skills
/plugin install ytil-skills@ytil-skills
```

Installed skills are invoked as `ytil-skills:<skill-name>`.

Codex:

```bash
codex plugin marketplace add ytil/skills
codex plugin add ytil-skills@ytil-skills
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
