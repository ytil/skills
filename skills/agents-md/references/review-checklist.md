# Review checklist for AGENTS.md / CLAUDE.md

Work top to bottom. Each check names what to look for, why it matters, and how to fix it. Severity is a default — adjust to the project. Cite `file:line` in findings so the user can jump straight to the problem.

**Don't judge the text in a vacuum — verify it against the repo.** Cross-check in two directions, because the most damaging misses live here, not in the prose: (1) Is every command, path, and architectural claim still true? A stale or dead reference is worse than a missing one — the agent trusts it and acts on it. (2) What does the agent need that the file omits? Things the repo has but the file never mentions — how to run the app, a whole source layer, a hard safety rule that lives only in the README — cost more than any wordy sentence. Trimming bloat and catching staleness/omissions are equally the job.

The checks map to the principles in `SKILL.md`. Length and relevance catch the most _common_ failures; the verification pass above catches the most _damaging_ ones — cover both.

## 1. Length & density — _is the file paying for the context it spends?_

- **Count the lines.** Well under ~150 is healthy; under ~60 is excellent; over ~200 is a problem to push back on. The cost is not just tokens — adherence to _every_ instruction drops as the count rises.
- **Look for paragraphs.** Dense prose is usually over-explanation. Most lines should be a scannable bullet or a short imperative.
- **Fix:** cut, don't compress. For each section ask "would the agent get this wrong without the line?" If no, delete it. If it's valuable but rarely needed, move it behind progressive disclosure (check 5).

## 2. Relevance — _is every line useful in most sessions?_ (highest-value check)

- Flag anything task-specific (how to do one particular migration), area-specific (deep detail on a module touched in 5% of sessions), or aspirational (roadmap, wishlist).
- Why it matters: the file is injected with an "ignore if not relevant" caveat. A file padded with rarely-relevant lines teaches the agent to discount the _whole_ file — so irrelevant content damages the relevant content too.
- **Fix:** move it to an `@`-imported topic doc, a path-scoped `.claude/rules/` file, or a skill; leave a one-line pointer if the agent needs to know it exists.

## 3. WHAT / WHY / HOW coverage — _can a competent stranger start working?_

- **WHAT** — a one-line "what is this project," the stack, and a _complete-enough_ map of where things live. Enumerate the real top-level source dirs and confirm the map covers them: a map that lists 6 of 10 dirs silently tells the agent the other 4 don't matter, and it files code in the wrong layer. In a monorepo, name the apps/packages and their purposes.
- **WHY** — does the agent learn what the major pieces are _for_? Intent prevents plausible-but-wrong changes.
- **HOW** — can a fresh agent **install, run, build, test, and verify** from this file alone? Walk that list explicitly; a test/QA gate is present far more often than "how to actually start the app," which is the usual gap. Commands should be copy-pasteable and confirmed against the repo (run them if you can).
- **Fix:** add the missing leg. An incomplete WHAT map and a missing "how to run it" are the most common gaps — and both are found by checking the file against the repo, not by reading it alone.

## 4. Pointers vs copies — _will this rot?_

- Flag pasted code blocks, inlined schemas, directory trees, or command output that duplicate something in the repo. They drift out of sync silently and then actively mislead.
- **Fix:** replace with a `path/to/file.ts:42` reference or an `@import` of the source/README. "Prefer pointers to copies."

## 5. Progressive disclosure — _is detail layered or dumped?_

- If the file is long because it carries deep per-topic detail, that detail should live in separate docs the agent loads on demand.
- **Fix:** split into `@`-imported topic files or `.claude/rules/` (path-scoped so they load only when matching files are touched), and reference them from the main file with a one-line "read X before doing Y." Note: `@import` aids organization but does **not** save context — imported files still load at launch. Path-scoped rules and skills are what actually defer loading.

## 6. Linter's job — _is the model being asked to format?_

- Flag exhaustive style/formatting rules (indentation, quote style, import ordering, line length). These bloat context and the model applies them inconsistently anyway.
- **Fix:** move them to a deterministic formatter (e.g. Prettier/Biome/ruff) wired to a hook or pre-commit. Keep only the few conventions a formatter can't enforce and the agent can't infer (e.g. "prefer the `Result` type over throwing in `core/`"). "Never send an LLM to do a linter's job."

## 7. Specificity — _is each instruction concrete enough to verify?_

- Flag vague directives: "write clean code," "test your changes," "keep files organized," "follow best practices." They read as filler and get ignored.
- **Fix:** make each one checkable. "Run `pnpm test` before committing." "Handlers live in `src/api/handlers/`." "Components use the `function` keyword, not arrow consts." If it can't be made concrete, it probably shouldn't be a line.

## 8. Contradictions — _does the file disagree with itself or its neighbors?_

- Scan for rules that conflict internally, and across the root file, nested `CLAUDE.md`/`AGENTS.md`, imports, and `.claude/rules/`. Conflicting guidance makes the agent choose arbitrarily, so the file stops being reliable.
- **Fix:** reconcile to one rule, or scope each explicitly to where it applies.

## 9. Hand-crafted, not auto-generated — _was this curated?_

- Tell-tale signs of dump-and-forget: generic boilerplate, headings with no content, restating what any agent already knows (what git is), or stale facts that no longer match the repo.
- **Fix:** delete the generic, verify the specific against the current code, and keep only what a couple of searches of a consistent codebase wouldn't already teach the agent (it learns conventions in-context from the code itself).

## 10. Enforcement boundary — _are hard rules in the right layer?_

- A context file is guidance, not a guarantee — the agent _usually_ follows it. If a finding is "the agent sometimes still does the forbidden thing," the file isn't the fix.
- **Fix:** for must-never-happen rules (don't touch prod, don't commit secrets, always run X before Y), recommend a hook, pre-commit, or permission/settings rule that enforces deterministically, and keep the context file for the behavioral nudge.

## Quick triage

If you only have time for three cuts: kill the longest prose block (1), the most task-specific section (2), and the biggest pasted code/schema copy (4). Those three usually recover the most adherence per line removed.

And the three highest-value _fixes/additions_: the missing "how to run it," any stale command or path the agent will trust and act on, and a complete-enough architecture map. A good review does both halves — it cuts what doesn't earn its place _and_ repairs what's wrong or missing.
