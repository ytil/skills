# Skills

Personal agent skills for Codex, Claude Code, and other Agent Skills-compatible tools.

## Skills

- `agents-md` - write or review AGENTS.md/CLAUDE.md agent-context files: ten principles, a verification-first review checklist, and AGENTS.md↔CLAUDE.md cross-tool interop. Sourced from [HumanLayer's "Writing a good CLAUDE.md"](https://www.humanlayer.dev/blog/writing-a-good-claude-md).
- `brainstorming-handoff` - clarify feature, refactor, product, or behavior ideas before implementation and end with a structured design handoff.
- `zip-context` - create a clean project-context zip archive for model handoff. Original repo: https://github.com/glebkudr/zip_context.

## Layout

```text
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
  zip-context/
    SKILL.md
    agents/
      openai.yaml
    scripts/
      zip_context.py
```

## Usage

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
