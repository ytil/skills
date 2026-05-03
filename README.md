# Skills

Personal agent skills for Codex, Claude Code, and other Agent Skills-compatible tools.

## Skills

- `brainstorming-handoff` - clarify feature, refactor, product, or behavior ideas before implementation and end with a structured design handoff.
- `code-simplifier` - simplify and refine recently changed code while preserving behavior.
- `karpathy-guidelines` - reduce LLM coding mistakes with explicit assumptions, simplicity, surgical changes, and verifiable success criteria.

## Layout

```text
skills/
  brainstorming-handoff/
    SKILL.md
  code-simplifier/
    SKILL.md
    agents/
      openai.yaml
  karpathy-guidelines/
    SKILL.md
    agents/
      openai.yaml
```

## Usage

Copy a skill directory into the target agent's skills folder.

### Install with `npx skills`

For Agent Skills-compatible tools such as OpenCode, the easiest path is the
`skills` CLI. First list the skills exposed by this repository:

```bash
npx skills add ytil/skills --list
```

Install selected skills globally for OpenCode:

```bash
npx skills add ytil/skills \
  --skill <skill-name> \
  --agent opencode \
  --global
```

For private repositories, prefer an SSH URL so the CLI can use your existing
GitHub SSH credentials:

```bash
npx skills add git@github.com:ytil/skills.git \
  --skill <skill-name> \
  --agent opencode \
  --global
```

For non-interactive scripts, add `--yes`:

```bash
npx skills add git@github.com:ytil/skills.git \
  --skill <skill-name> \
  --agent opencode \
  --global \
  --yes
```

To avoid anonymous telemetry from the `skills` CLI, set
`DISABLE_TELEMETRY=1` before the command.

### Manual install

For Codex:

```bash
cp -R skills/<skill-name> ~/.codex/skills/<skill-name>
```

For Claude Code:

```bash
cp -R skills/<skill-name> ~/.claude/skills/<skill-name>
```

For OpenCode global usage:

```bash
mkdir -p ~/.config/opencode/skills
cp -R skills/<skill-name> ~/.config/opencode/skills/<skill-name>
```

For OpenCode project-local usage, copy into the target project:

```bash
mkdir -p .opencode/skills
cp -R skills/<skill-name> .opencode/skills/<skill-name>
```

Restart the agent after installing or updating a skill.
