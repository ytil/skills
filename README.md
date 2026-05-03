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

For Codex:

```bash
cp -R skills/<skill-name> ~/.codex/skills/<skill-name>
```

For Claude Code:

```bash
cp -R skills/<skill-name> ~/.claude/skills/<skill-name>
```

Restart the agent after installing or updating a skill.
