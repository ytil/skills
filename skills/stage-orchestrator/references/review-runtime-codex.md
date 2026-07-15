# Review mechanics — Codex and other single-context runtimes

Read `review-workflow.md` first for the method and the data contract; this file
is the degradation path for a runtime with no workflow engine, no subagents,
and synchronous command execution. The goal is to preserve as much of the
method's *independence* as the runtime allows — independence, not parallelism,
is what makes the review adversarial.

## Order of work

1. **Run the full gate first**, to completion, before the review — there is no
   background execution to overlap with. Put its actual result into the shared
   preamble («гейт уже прогнан, результат: …»), not the parallel-gate wording.
2. **Review one dimension at a time**, each as a self-contained pass: re-read
   the real diff (`git diff HEAD`, `git show HEAD:<path>`) for that dimension's
   checks specifically; do not reuse conclusions from a previous dimension —
   the dimensions are supposed to be blind to each other, and in a single
   context the only blindness available is the discipline of re-deriving from
   the code each time.
3. **Record findings in the data contract JSON** (see `review-workflow.md`)
   *before* starting verification. Freezing the list first matters: it stops
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

## What is lost and how to compensate

- **Parallelism** — gone; wall-clock grows with the dimension count. Trim the
  dimension list to what the stage genuinely touched rather than running the
  full menu.
- **Structural independence** — approximated, not guaranteed. Compensate by
  weighting your *own machine-checks* (the skill's step 4) higher: in this
  runtime they are the only evidence source that cannot be contaminated by the
  finder's reasoning.
- **Fix isolation** — there is no fix subagent; you will apply fixes yourself.
  Freeze the confirmed set before the first edit and work through it
  mechanically; do not re-litigate findings mid-edit (they were already
  adversarially confirmed), and re-run the full gate after — same as step 7 of
  the loop.
