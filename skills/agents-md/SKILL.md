---
name: agents-md
description: Write or review AGENTS.md and CLAUDE.md files — the always-loaded context files that onboard a coding agent to a repository. Use whenever the user wants to create, audit, shorten, fix, or review an AGENTS.md or CLAUDE.md, set up project/agent onboarding instructions, consolidate scattered agent rules into one place, or asks why an agent keeps ignoring its instructions or how to structure project context for coding agents — even when they only say "add a CLAUDE.md", "clean up our agent rules", or "the agent isn't following our conventions."
---

# AGENTS.md / CLAUDE.md — author & reviewer

`AGENTS.md` (the cross-tool standard, read here by OpenAI Codex) and `CLAUDE.md` (Claude Code's variant) are the same genre: a plain-Markdown file loaded into **every** agent session to onboard it to a repository. This skill helps you write one from scratch or review an existing one. The principles apply to any tool in this genre; the mechanics in `references/cross-tool-reference.md` cover Claude Code and Codex specifically.

The whole skill rests on one fact: **a model is stateless, and this file is the main thing it reads about the project on every single run.** That makes it the highest-leverage text in the repo — and it means every line is a standing tax on every session. As the instruction count climbs, adherence drops _uniformly_: the model doesn't ignore only the new lines, it follows all of them a little less. And the cost isn't only dilution — over-prescription actively degrades output: a capable model follows one short instruction about as well as ten enumerated ones, so the extra nine buy nothing and cost adherence everywhere else. So the goal is never "write down everything." It's "write down the few things the agent must know and would otherwise get wrong — and nothing else."

## Principles

The shared core for both writing and reviewing. Each is a line you should be able to defend.

1. **Every line is loaded every session — so earn each one.** If a line isn't useful in _most_ sessions, it belongs elsewhere (see #5) or nowhere.
2. **Cover WHAT, WHY, HOW, BOUNDARIES.** _What_ = stack + a map of where things live. _Why_ = what the major pieces are for, so the agent grasps intent. _How_ = the real commands to build, test, run, and **verify** — name what proves a change works _here_ (the smoke test, the health check, what "done" means), never an instruction _to_ verify; that one's the harness's (#11). _Boundaries_ = what's unsafe to do unattended **in this repo specifically** — not the generic "ask before risky actions" the harness already supplies (#11).
3. **Stay short.** Aim well under ~150 lines; many excellent files are under 60, and Claude Code's own guidance targets <200. Shorter file → better adherence — and where a tool caps the merged instruction chain by size, bloat stops being mere dilution: it can evict a nested file from the prompt outright (see the cross-tool reference for which tools cap and at what).
4. **Prefer pointers to copies.** Reference `path/to/file.ts:42`, imports, and READMEs instead of pasting code, schemas, or command output — copies rot, pointers don't.
5. **Use progressive disclosure.** Push task- or area-specific detail out of the always-loaded file into imported topic docs, path-scoped rule files, or skills — then point to them so the agent reads them only when relevant. (Every tool spells these differently, and not all of them defer loading — see the cross-tool reference.) The dividing line: **facts the agent holds constantly go in the file; procedures (deploy/release checklists) go in skills.**
6. **Don't send an agent to do a linter's job.** Formatting and mechanical style belong to a deterministic formatter wired to a hook, not to context the model burns tokens re-reading. A few conventions the agent genuinely can't infer are fine; an exhaustive style guide is not.
7. **Be specific and verifiable — and give the reason when it isn't obvious.** "Run `pnpm test`" beats "test your changes"; "handlers live in `src/api/handlers/`" beats "keep files organized." Vague instructions get ignored. For a non-obvious rule, attach the why in a few words — "don't edit `vendor/`: it's a fork, edits get clobbered on update" — the model generalizes from the reason to cases you didn't enumerate.
8. **No contradictions.** When two lines (or a root and a nested file) conflict, the agent picks one arbitrarily. Reconcile them.
9. **Craft it by hand; trust in-context learning.** Don't auto-generate and walk away, and don't codify what a couple of searches of a consistent codebase would already teach the agent. Curation is the point.
10. **Keep it universally relevant.** These files are injected with an "ignore if not relevant" caveat — padding with rarely-relevant content trains the agent to discount the whole file.
11. **Don't restate what the harness already tells the model.** Generic behavior steering — be concise, don't over-engineer, verify your work, ask before irreversible actions, show your reasoning — ships in the coding agent's own system prompt. A repo-level copy spends adherence on a duplicate instead of on the one fact only this repo knows.

## Changing the file: propose first, apply only with the human's OK

Whether you're reviewing, editing, or writing one of these files, treat it as the user's hand-curated artifact — not yours to rewrite or create silently. Before you write or change an `AGENTS.md`/`CLAUDE.md`, **show the concrete edits (or the draft) and get the human's sign-off — don't modify the file on your own without them seeing it first.** This isn't ceremony: it's the highest-leverage text in the repo, a line you'd cut may be there for a reason you can't see, and a silent change ships into _every_ future session before anyone notices it's wrong. "Here's what I'd cut and add, and why — want me to apply it?" is cheap, and it keeps the human in control of their own onboarding doc.

## Reviewing an existing file

1. Read the target file — plus any nested instruction files, imports, and path-scoped rules it pulls in (conflicts and bloat hide across files). Then **verify it against the actual repo** — don't judge the text in a vacuum: confirm the commands, paths, and architecture it claims are real and current, and notice what the agent needs that the file _omits_. The most expensive misses live here — a stale command or a half-complete map costs more than a wordy sentence.
2. Walk **`references/review-checklist.md`**, which turns the principles above into concrete checks with how-to-detect and how-to-fix notes.
3. Report findings roughly in the shape below — adapt it to what the file actually warrants. Per **"Changing the file"** above, these are _proposals_ — apply them only after the user signs off; never edit the file mid-review.

**Review output** — three beats, in this order:

- **Verdict** — one line: is it in good shape, and what's the single biggest problem?
- **Findings**, most to least important — for each: what's wrong → why it costs you → the fix, with `file:line` where it helps. Cite the principle number when it's not self-evident.
- **Cut / keep / add** — the lines not earning their place, and the missing WHAT/WHY/HOW/BOUNDARIES the agent needs.

## Writing a new file

The failure mode here is emitting a generic template full of plausible guesses — which is exactly the auto-generation anti-pattern (#9). Avoid it by **exploring first, writing second.** The value is in the real, discovered facts, not the headings.

1. **Discover the real commands.** Read `package.json` scripts, `Makefile`/`justfile`, `pyproject.toml`, CI config — don't guess how to build/test/lint/run. Where you can, run them once to confirm they actually work.
2. **Map the architecture.** Skim the tree and the entry points; capture where the important things live as pointers (`dir/`, `file:line`), not prose.
3. **Write down only what searching wouldn't reveal.** Infer conventions from the existing code, then record just the non-obvious rule, the gotcha that burned someone, the "always do X before Y," and which commands are unsafe to run unattended here. Ask the user for these — they're often nowhere in the code.
4. **Assemble lean**, in roughly WHAT+map → WHY → HOW → conventions/gotchas/boundaries → pointers order, applying every principle above. If you can't justify a line as "needed in most sessions," cut it.
5. **Wire up interop** when both Claude Code and Codex are in play — see `references/cross-tool-reference.md`. Claude Code reads `CLAUDE.md`, _not_ `AGENTS.md`; keep one source of truth and import/symlink rather than duplicate.

After drafting, run the review checklist on your own output as a self-check — then show the user the draft and write it into the repo only once they're happy (see **"Changing the file"** above).

## References

- `references/review-checklist.md` — the operational checklist for review (and a self-check after writing).
- `references/cross-tool-reference.md` — the mechanics per tool where known: which file each tool reads, locations & load order, merge/precedence and size caps, how to defer loading, AGENTS.md↔CLAUDE.md interop, monorepo nesting.
