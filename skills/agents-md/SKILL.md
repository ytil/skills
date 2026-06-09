---
name: agents-md
description: Write or review AGENTS.md and CLAUDE.md files — the always-loaded context files that onboard a coding agent to a repository. Use whenever the user wants to create, audit, shorten, fix, or review an AGENTS.md or CLAUDE.md (or .cursorrules, GEMINI.md, copilot-instructions.md), set up project/agent onboarding instructions, consolidate scattered agent rules into one place, or asks why an agent keeps ignoring its instructions or how to structure project context for coding agents — even when they only say "add a CLAUDE.md", "clean up our agent rules", or "the agent isn't following our conventions."
---

# AGENTS.md / CLAUDE.md — author & reviewer

`AGENTS.md` (the cross-tool standard) and `CLAUDE.md` (Claude Code's variant) are the same genre: a plain-Markdown file loaded into **every** agent session to onboard it to a repository. This skill helps you write one from scratch or review an existing one.

The whole skill rests on one fact: **a model is stateless, and this file is the main thing it reads about the project on every single run.** That makes it the highest-leverage text in the repo — and it means every line is a standing tax on every session. As the instruction count climbs, adherence drops *uniformly*: the model doesn't ignore only the new lines, it follows all of them a little less. So the goal is never "write down everything." It's "write down the few things the agent must know and would otherwise get wrong — and nothing else."

## Principles

The shared core for both writing and reviewing. Each is a line you should be able to defend.

1. **Every line is loaded every session — so earn each one.** If a line isn't useful in *most* sessions, it belongs elsewhere (see #5) or nowhere.
2. **Cover WHAT, WHY, HOW.** *What* = stack + a map of where things live. *Why* = what the major pieces are for, so the agent grasps intent. *How* = the real commands to build, test, run, and verify.
3. **Stay short.** Aim well under ~150 lines; many excellent files are under 60, and Claude Code's own guidance targets <200. Shorter file → better adherence.
4. **Prefer pointers to copies.** Reference `path/to/file.ts:42` and `@imports`/READMEs instead of pasting code, schemas, or command output — copies rot, pointers don't.
5. **Use progressive disclosure.** Push task- or area-specific detail out of the always-loaded file into `@`-imported topic docs, path-scoped `.claude/rules/`, or skills — then point to them so the agent reads them only when relevant.
6. **Don't send an agent to do a linter's job.** Formatting and mechanical style belong to a deterministic formatter wired to a hook, not to context the model burns tokens re-reading. A few conventions the agent genuinely can't infer are fine; an exhaustive style guide is not.
7. **Be specific and verifiable.** "Run `pnpm test`" beats "test your changes"; "handlers live in `src/api/handlers/`" beats "keep files organized." Vague instructions get ignored.
8. **No contradictions.** When two lines (or a root and a nested file) conflict, the agent picks one arbitrarily. Reconcile them.
9. **Craft it by hand; trust in-context learning.** Don't auto-generate and walk away, and don't codify what a couple of searches of a consistent codebase would already teach the agent. Curation is the point.
10. **Keep it universally relevant.** These files are injected with an "ignore if not relevant" caveat — padding with rarely-relevant content trains the agent to discount the whole file.

## Changing the file: propose first, apply only with the human's OK

Whether you're reviewing, editing, or writing one of these files, treat it as the user's hand-curated artifact — not yours to rewrite or create silently. Before you write or change an `AGENTS.md`/`CLAUDE.md`, **show the concrete edits (or the draft) and get the human's sign-off — don't modify the file on your own without them seeing it first.** This isn't ceremony: it's the highest-leverage text in the repo, a line you'd cut may be there for a reason you can't see, and a silent change ships into *every* future session before anyone notices it's wrong. "Here's what I'd cut and add, and why — want me to apply it?" is cheap, and it keeps the human in control of their own onboarding doc.

## Reviewing an existing file

1. Read the target file — plus any nested `CLAUDE.md`/`AGENTS.md`, `@`-imports, and `.claude/rules/` it pulls in (conflicts and bloat hide across files). Then **verify it against the actual repo** — don't judge the text in a vacuum: confirm the commands, paths, and architecture it claims are real and current, and notice what the agent needs that the file *omits*. The most expensive misses live here — a stale command or a half-complete map costs more than a wordy sentence.
2. Walk **`references/review-checklist.md`**, which turns the principles above into concrete checks with how-to-detect and how-to-fix notes.
3. Report findings using the structure below. Per **"Changing the file"** above, these are *proposals* — apply them only after the user signs off; never edit the file mid-review.

**Review output structure:**

```
**Verdict:** <one line — is it in good shape, and what's the single biggest problem?>

**Findings** (most to least important):
- [principle #] <what's wrong> → <why it costs you> → <fix, with file:line if relevant>

**Cut / Keep / Add:**
- Cut: <lines not earning their place>
- Add: <missing WHAT/WHY/HOW the agent needs>
```

## Writing a new file

The failure mode here is emitting a generic template full of plausible guesses — which is exactly the auto-generation anti-pattern (#9). Avoid it by **exploring first, writing second.** The value is in the real, discovered facts, not the headings.

1. **Discover the real commands.** Read `package.json` scripts, `Makefile`/`justfile`, `pyproject.toml`, CI config — don't guess how to build/test/lint/run. Where you can, run them once to confirm they actually work.
2. **Map the architecture.** Skim the tree and the entry points; capture where the important things live as pointers (`dir/`, `file:line`), not prose.
3. **Write down only what searching wouldn't reveal.** Infer conventions from the existing code, then record just the non-obvious rule, the gotcha that burned someone, the "always do X before Y." Ask the user for these — they're often nowhere in the code.
4. **Assemble lean**, in roughly WHAT → HOW → map → conventions/gotchas → pointers order, applying every principle above. If you can't justify a line as "needed in most sessions," cut it.
5. **Wire up cross-tool interop** when other agents are in play — see `references/cross-tool-reference.md`. Claude Code reads `CLAUDE.md`, *not* `AGENTS.md`; keep one source of truth and import/symlink rather than duplicate.

After drafting, run the review checklist on your own output as a self-check — then show the user the draft and write it into the repo only once they're happy (see **"Changing the file"** above).

## References

- `references/review-checklist.md` — the operational checklist for review (and a self-check after writing).
- `references/cross-tool-reference.md` — file locations & load order, `@import` rules, `.claude/rules/`, AGENTS.md↔CLAUDE.md interop, monorepo nesting, and which tools read which file.
