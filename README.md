# Skills

Personal agent skills for Codex, Claude Code, and other Agent Skills-compatible tools.

## Skills

- `brainstorming-handoff` - clarify feature, refactor, product, or behavior ideas before implementation and end with a structured design handoff.

## Layout

```text
skills/
  brainstorming-handoff/
    SKILL.md
```

## Usage

Copy a skill directory into the target agent's skills folder.

For Codex:

```bash
cp -R skills/brainstorming-handoff ~/.codex/skills/brainstorming-handoff
```

For Claude Code:

```bash
cp -R skills/brainstorming-handoff ~/.claude/skills/brainstorming-handoff
```

Restart the agent after installing or updating a skill.
