# Cross-tool reference

The mechanical facts behind the principles: where these files live, how they load, and how to keep one source of truth across tools. Verify version-specific details against current docs if a project depends on them — tool behavior drifts.

## AGENTS.md (the cross-tool standard)

- **Format:** plain Markdown, no required schema — "a README for agents." Use whatever headings fit.
- **Read by:** many coding agents; this reference covers **OpenAI Codex**, the one it documents in depth. (Notably **not** Claude Code — see interop below.) Other tools implementing the standard are out of scope here — verify their mechanics against their own docs.
- **Monorepos:** place an `AGENTS.md` in each package — the root file for repo-wide facts, each nested file for its own package.
- **Merge & precedence:** don't assume "nearest file wins." Codex **concatenates the whole chain** from the git root down, joined by blank lines, stopping when it reaches your current directory; closer files win only because they land _later_ in the combined prompt. Every level is still in context, so a root-vs-package contradiction is a live conflict the model resolves arbitrarily — it is not cleaned up by proximity (checklist check 8). Codex also loads a global `~/.codex/AGENTS.md` ahead of the project chain, and an `AGENTS.override.md` takes precedence over the `AGENTS.md` beside it at any level. Verified for Codex; other tools implementing the standard differ — confirm before relying on precedence.
- **Size cap:** Codex stops adding files once the concatenated chain reaches `project_doc_max_bytes` (32 KiB default), so an oversized root file can silently push a package's own instructions out of the prompt entirely. Trim the root or raise the limit. Claude Code has no equivalent cap — it loads the whole chain and you pay in adherence instead.
- **See what actually loaded:** `codex --ask-for-approval never "Summarize the current instructions."` makes Codex echo its guidance in precedence order.
- **Popular sections:** project overview, build/test commands, code-style pointers, testing instructions, security considerations, commit/PR conventions, gotchas. (Treat "code style" with principle #6 in mind — point to the formatter, don't transcribe it.)

## CLAUDE.md (Claude Code)

### Locations & load order (broad → specific; later overrides nothing, all are concatenated)

| Scope          | Location                                                                                                                                           | Loaded                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Managed policy | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md`, Linux/WSL `/etc/claude-code/CLAUDE.md`, Windows `C:\Program Files\ClaudeCode\CLAUDE.md` | Always, can't be excluded  |
| User           | `~/.claude/CLAUDE.md`                                                                                                                              | Always (all your projects) |
| Project        | `./CLAUDE.md` or `./.claude/CLAUDE.md`                                                                                                             | Always (shared via VCS)    |
| Local          | `./CLAUDE.local.md` (gitignore it)                                                                                                                 | Always (just you)          |

- Files in the directory hierarchy **above** the working dir load in full at launch, root-down (closer-to-cwd is read last). Files in **subdirectories** load on demand when Claude reads files there.
- **Size target:** under 200 lines. Longer files reduce adherence. CLAUDE.md loads in full regardless of length — there's no truncation saving you.
- **HTML comments** (`<!-- maintainer note -->`) are stripped before the content enters context — free notes for humans, zero token cost. Comments inside code blocks are preserved.
- **It's context, not enforcement.** Delivered as a user message after the system prompt; Claude usually follows it but isn't bound by it. For hard guarantees use a hook or `permissions.deny`.
- `/init` generates a starting file by analyzing the codebase (and, with `CLAUDE_CODE_NEW_INIT=1`, runs an interactive multi-phase flow). Treat its output as a _draft to curate_, not a finished file — review it against principle #9.
- `/doctor` (Claude Code only, v2.1.206+) adds a trim check for a checked-in `CLAUDE.md`: it flags content Claude can derive from the codebase — directory trees, dependency lists, architecture overviews — keeps pitfalls, rationale, and conventions that differ from tool defaults, and applies its proposals only after you confirm. Handy as a first pass before a manual review, with one caveat: its "derivable" heuristic doesn't separate a pasted directory tree (a copy — cut it, check 4) from a map of which layer does what (a pointer — check 3 wants it kept). Expect to disagree there. From the shell, `claude doctor` prints read-only diagnostics without starting a session.

### `@import` syntax

- `@path/to/file` pulls another file in. Both relative (resolved against the importing file) and absolute paths work; `@~/...` reaches your home dir.
- Recursive, **max depth 4 hops**.
- Imported files **load at launch into context** — imports help _organization_, they do **not** reduce context. To actually defer loading, use path-scoped rules or skills.

### `.claude/rules/` (modular & path-scoped instructions)

- Drop topic files in `.claude/rules/` (e.g. `testing.md`, `api-design.md`); all `.md` are discovered recursively.
- Add `paths:` frontmatter to scope a rule to matching files so it loads **only** when Claude touches them — the main lever for keeping the always-on file small:

```markdown
---
paths:
    - "src/api/**/*.{ts,tsx}"
---

# API rules

- All endpoints validate input.
```

- Rules without `paths:` load every session at the same priority as `.claude/CLAUDE.md`. User-level `~/.claude/rules/` applies everywhere.

## Interop: one source of truth, no duplication

Claude Code reads `CLAUDE.md`, not `AGENTS.md`. When a repo already has `AGENTS.md` for Codex, don't maintain two copies — point one at the other:

**Import (recommended — lets you add Claude-only notes):**

```markdown
@AGENTS.md

## Claude Code

Use plan mode for changes under `src/billing/`.
```

**Symlink (when no Claude-specific content is needed):**

```bash
ln -s AGENTS.md CLAUDE.md
```

(On Windows a symlink needs Administrator/Developer Mode — prefer the `@AGENTS.md` import there.)

Direction matters: put the substance in `AGENTS.md` and have `CLAUDE.md` import it, not the reverse. Claude Code can import; Codex has no import mechanism, so a Codex-side pointer to `CLAUDE.md` would leave it with only the pointer. With `CLAUDE_CODE_NEW_INIT=1`, `/init` reads an existing `AGENTS.md` and folds the relevant parts into the generated `CLAUDE.md`.
