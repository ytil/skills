# Review mechanics — Codex and other single-context runtimes

Read `review-workflow.md` first for the method and the data contract; this file
is the degradation path for a runtime with no workflow engine, no parallel
isolated review agents, and synchronous command execution. The goal is to
preserve as much of the method's _independence_ as the runtime allows —
independence, not parallelism, is what makes the review adversarial.

## Order of work

1. **Run the full gate first**, to completion, before the review — there is no
   background execution to overlap with. Put its actual result into the shared
   preamble («гейт уже прогнан, результат: …»), not the parallel-gate wording.
2. **Review one dimension at a time**, each as a self-contained pass: re-read
   the real diff in the worktree (`git -C <worktree> diff HEAD`,
   `git -C <worktree> show HEAD:<path>`) for that dimension's
   checks specifically; do not reuse conclusions from a previous dimension —
   the dimensions are supposed to be blind to each other, and in a single
   context the only blindness available is the discipline of re-deriving from
   the code each time.
3. **Record findings in the data contract JSON** (see `review-workflow.md`)
   _before_ starting verification. Freezing the list first matters: it stops
   the verifier pass from quietly rewriting findings instead of refuting them.
4. **Verify each finding in a separate refuter pass.** The strongest available
   isolation, in order of preference:
    - a separate `codex exec` invocation per finding (or per dimension's batch
      of findings), prompted with the shared preamble + the refuter role — a
      fresh process has no memory of how the finding was produced, which is the
      closest substitute for an independent verifier;
    - if spawning processes is not possible, a distinct refuter pass in the same
      context: state the finding, then actively search the code for compensating
      code, a misread diff, or a sanctioned decision. Name what refutation you
      attempted in `reasoning` — a verdict without an attempted refutation is
      just the finder agreeing with itself.
5. **Validate the JSON yourself.** There is no schema-enforcing tool layer:
   parse what came back (`jq` or equivalent), and re-ask on malformed output
   rather than hand-repairing it.
6. **Apply the confirmed fixes in a separate subagent — not in the
   orchestrator session.** Freeze the confirmed set, then hand it to a spawned
   subagent as a self-contained prompt: the worktree path (work only there),
   the full list — file, line, evidence, intended fix per finding — and the
   rules "the set is already adversarially confirmed, do not re-litigate it;
   if a fix cannot be applied as stated, STOP and report instead of
   inventing; report back what was applied and what was not". You stay the
   reviewer and committer: check the subagent's work with a
   `git -C <worktree> diff` scoped to the expected files (nothing outside the
   list may change) and re-run the full gate — step 7 of the loop. Only if
   the runtime truly cannot spawn a subagent, apply the fixes yourself:
   frozen set first, work through it mechanically, no re-litigating
   mid-edit. (A lone trivial edit may be done inline either way.)

## What is lost and how to compensate

- **Parallelism** — gone; wall-clock grows with the dimension count. Trim the
  dimension list to what the stage genuinely touched rather than running the
  full menu.
- **Structural independence** — approximated, not guaranteed. Compensate by
  weighting your _own machine-checks_ (the skill's step 4) higher: in this
  runtime they are the only evidence source that cannot be contaminated by the
  finder's reasoning.
- **Fix isolation** — preserved, via the fix subagent of step 6 above; only
  the no-subagent fallback loses it, and then the frozen-set discipline is the
  compensation.
