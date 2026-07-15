---
name: stage-orchestrator
description: >-
  Orchestrates a multi-stage refactor or build over delegated work: authors a
  precise stage prompt for an external agent, then verifies the returned work —
  full gate, adversarial review, machine-checked claims — before landing it on
  main. Trigger whenever the session orchestrates delegated work: writing a
  stage/task prompt for another agent, receiving a stage report or a delegate's
  summary ("готово, сделал X"), reviewing a large uncommitted diff someone else
  produced, or when the user says "проверь что сделано", "выдай промпт для
  этапа", "верифицируй", "заказчик прислал отчёт", or names a stage number —
  the point is the delegate → verify → fix → commit loop, not any single
  keyword. Not for reviewing a small self-authored diff — that is plain code
  review.
---

# Stage orchestrator

You are the orchestrator of a long, multi-stage effort. You do not do the bulk
implementation yourself — an external agent does, one stage at a time. Your job
is the part that makes delegation safe: **write a prompt precise enough that the
work comes back right, then verify it hard enough that you'd stake `main` on
it.** The external agent is capable but will over-claim, silently change
behavior, and stop reporting when it hits a limit. Your leverage is skepticism
plus machine-checkable evidence.

Two modes. You will usually alternate between them across the effort.

- **Author** — you are about to delegate a stage. First `git pull` the target
  branch — the remote may have moved ahead, and a stage built on a stale base
  pays for it at landing time. Then write the prompt. See
  `references/stage-prompt.md`. Every external-agent prompt must require a
  separate `git worktree`, all edits inside that worktree, and the worktree path
  in the final report.
- **Verify** — a report came back. Prove or disprove it before committing. This
  is the load-bearing mode; the rest of this file is mostly about it.

Across the effort the iteration rhythm is: **`git pull` → delegate → verify →
land → `git push` → next stage.** The pull and the push are the two steps
easiest to forget, and each skip has a price: a stale base turns into merge
conflicts at landing, and an unpushed stage is invisible to CI and to anything
else basing off the remote.

## External agent worktree contract

An external implementation agent must not edit the orchestrator checkout
directly. Its prompt must tell it to create a separate detached `git worktree`
from the target branch before making changes, work only inside that worktree,
and stop if it cannot do so. Its report must name the absolute worktree path and
base commit first, so verification runs against the tree that actually changed.

## The verify loop

Run these in order every time a stage report arrives. Do not skip to committing
because the report says green — the report is a claim, not evidence.

1. **Resolve the reported worktree, then start the full gate there.** The report
   must name the absolute `git worktree` path and base commit. If it does not,
   treat the report as incomplete and do not verify the orchestrator checkout by
   accident. The full gate is whatever this repo defines as its complete check —
   a `qa`/`check` script covering typecheck, lint, tests, format, dead code; see
   `references/gate-playbook.md` for how to resolve it and for its recurring
   failure modes. If the runtime can run commands in the background (Claude
   Code: `run_in_background`), start the gate now so the review overlaps it; a
   runtime that only runs commands synchronously (Codex) runs the gate first
   and reads the result before starting the review.

2. **Inventory the diff.** `git status --short | wc -l`, `git diff --stat | tail`.
   You need the scale (10 files vs 200) to calibrate how deep to review and
   which claims are load-bearing. Note untracked files separately — `git diff`
   does not show them, and a stage that *adds* files hides its most important
   changes there.

3. **Launch an adversarial review** over the diff — one finder per independent
   dimension, each finding then attacked by a separate verifier that tries to
   *refute* it. The method — the shape, the data contract, the shared prompt
   preamble, the dimension menu — lives in `references/review-workflow.md`.
   The execution mechanics are per-runtime; read only the file for yours:
   `references/review-runtime-claude.md` (Claude Code — parallel isolated
   agents via a `Workflow` script) or `references/review-runtime-codex.md`
   (Codex and other single-context runtimes — the sequential degradation
   path). Pick dimensions from what the stage actually touched: behavioral
   equivalence of the thing that changed, residue/dead-code, test-integrity,
   contract/schema fidelity, money-path (auth, purchases, migrations, data
   sync). Scale the finder count and vote count to the diff size and the
   user's thoroughness signal.

4. **Machine-verify the load-bearing claims yourself, in parallel** — do not
   outsource this entirely to the review agents. The external agent's recon
   *hallucinates*; its report says "0 refs" or "fully removed" when it is not.
   For every "removed / migrated / equivalent" claim, check it with a grep by
   **symbol name**, alias-aware, excluding tests where tests are not the point:
   `grep -rn '<symbol>' src --include='*.ts' | grep -v '\.test\.'` (adapt the
   include pattern to the repo's language). If the claim
   is "SQL is 1:1", compile the query and diff the SQL — do not read it. If the
   claim is "schema mirrors X", dump both and diff them with a script. If the
   claim is "the new gate/rule is equivalent to the old one", do not settle for
   green-on-clean — run the negative test from the principles below: introduce
   the violation, confirm both mechanisms catch it, revert.

5. **Reconcile the confirmed set.** What you act on = findings that survived
   adversarial refutation, at the severity the verifier settled on — *every*
   severity, minors included — plus anything your own machine-checks surfaced.
   When a review agent and your grep disagree, your grep wins; when two agents
   disagree, read the code and break the tie yourself.

   Before delegating fixes, ask whether the confirmed set says the *approach*
   is wrong, not just the execution — a blocker in the design (wrong layer, an
   invented contract, a misread plan) rather than a slipped detail. If so, do
   not patch it into shape: discard or park the worktree, make the design
   decision the agent should have STOPped on, and re-delegate the stage with a
   prompt that states that decision. Patching a wrong approach costs more than
   re-running the stage and leaves `main` with a shape nobody chose.

6. **Apply the confirmed fixes — via a subagent when the runtime has one.**
   Hand the whole confirmed set — file,
   line, evidence, and the intended fix for each — to one fix subagent (Claude
   Code: the `Agent` tool) and let it apply the edits **inside the external
   agent's worktree**, the same tree the gate and review ran against. You stay
   the reviewer and committer; keeping the mechanical editing out of your own
   thread preserves your context for judgment and mirrors the delegate → verify
   split the whole loop runs on. A runtime without subagents (Codex) applies
   the fixes itself — freeze the confirmed set first and work through it
   mechanically, without re-litigating findings mid-edit: the set was already
   adversarially confirmed. Fix *everything* confirmed, minors included —
   deferring a real minor just reopens it a stage later. (A lone trivial edit —
   one stale doc line — you may do inline rather than spawn an agent for it.)

7. **Re-run the full gate after the fixes land.** Any edit — yours or the
   subagent's — reopens the gate. The most common self-inflicted wound is
   committing after a fix without re-running the *full* gate: a passing typecheck
   is not a passing dead-code/format check.

8. **Land the worktree on `main`.** First sync `main` with the remote —
   `git pull`, resolving conflicts if the remote moved — because landing on a
   stale local tip only defers the same conflicts to push time, after the gate
   evidence has gone stale. The verified work is uncommitted inside the
   worktree; a bare `git diff | git apply` would silently drop untracked files.
   Instead, make the stage commit *inside the worktree* yourself —
   `git -C <worktree> add -A && git -C <worktree> commit` — then bring it into
   the orchestrator checkout with `git cherry-pick <sha>` (worktrees share the
   object database, so the sha is visible from `main`). If `main` has moved past
   the worktree's base commit since verification, the cherry-pick is a real
   three-way merge: after it, re-run the full gate on `main` and re-check any
   load-bearing claims touching files the intervening commits changed — your
   verification evidence was relative to the old base. When the landing is
   green, `git worktree remove` the landed tree.

9. **Finalize the commit, push, and update memory.** One commit per stage on
   `main`. The message states what the stage did, what got fixed after review,
   and any known transient. `git push` before starting the next stage — stacked
   unpushed stages turn the eventual push into a multi-stage gamble, and CI only
   sees what you push. If the push is rejected because the remote moved,
   `git pull --rebase`, resolve, re-run the full gate (a rebase is an edit like
   any other), then push. Finally update the project's plan/status memory with
   the commit hash and the gotchas learned.

## Parallel stages

Running several stages at once — each in its own worktree off the same base —
is fine, but **landings serialize**. Land one stage fully (steps 8–9), then the
next. Two consequences:

- After each landing, every other in-flight worktree's base is stale. Its gate
  run and review findings were relative to the old base, so when its turn
  comes, step 8's re-gate-on-main is mandatory, and re-check the claims that
  overlap files the earlier landing touched.
- Author-mode defense: keep parallel stages on disjoint file sets. If two
  in-flight stage prompts touch the same module, they were really one stage —
  merge them or sequence them rather than racing their landings.

## Three principles the loop is built on

These are the lessons that cost the most to relearn. Internalize them; they are
why the loop looks the way it does.

- **"Both gates green" ≠ equivalence.** Two gates passing on clean code only
  proves neither *fires* on the current code — it says nothing about hypothetical
  violations. When you are proving a port/rewrite is equivalent to what it
  replaced, add a **negative test**: introduce the violation the rule must catch,
  confirm *both* the old and new mechanism catch it, then revert. Green-on-clean
  is necessary, not sufficient.

- **Recon hallucinates; verify by symbol grep.** An external agent (and a review
  subagent) will confidently report a file is deleted, an export is orphaned, a
  reference is gone — and be wrong because it grepped a relative path when the
  import was an alias, or trusted its own earlier claim. Never accept a
  reachability/removal claim on narration. Grep the actual symbol name,
  alias-aware. This is also why a dead-code gate is not enough: it counts test
  files as consumers, so a module used only by dead tests looks "used" — hunt
  those with a `grep -v '\.test\.'` prod-consumer check.

- **Confirm findings adversarially before acting on them.** A plausible finding
  is not a real one. Spawn an independent verifier per finding whose job is to
  *refute* it by reading the compensating code, re-reading the diff, or
  recognizing a sanctioned decision. Real defects survive; plausible-but-wrong
  ones get dropped and over-stated severities get downgraded. This keeps you
  from "fixing" things that were correct.

## Scaling to the ask

A quick "does this look right" wants a couple of finders and a single-vote
verify. "Тщательно проверь" / a 150-file diff / a money-path (auth, purchases,
migrations, data sync) wants more finders, 3–5-vote adversarial passes, and your
own machine-checks on top. When unsure, lean thorough for review/audit and brief
for a sanity check — the cost of a missed regression on `main` dwarfs the cost of
an extra finder.
