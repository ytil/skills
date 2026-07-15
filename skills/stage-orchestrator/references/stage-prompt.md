# Authoring a stage prompt

The prompt you hand the external agent is the whole contract — it works from the
prompt and the repo, not from your conversation. A vague prompt comes back wrong
and you pay for it in the verify loop. A good one is self-contained, orders the
work so it stays green throughout, and tells the agent when to **stop and report**
instead of guessing.

Write the prompt in the language the effort is run in; it is a single
self-contained markdown block. The template below is an example in Russian —
carry over its structure and invariants, not its language.

## Structure

```markdown
# Задача: <stage id> — <one-line goal>

Репозиторий: <path>. Работаем от <branch>, ветки/коммиты НЕ делать.
Перед любыми правками создай отдельный detached `git worktree`, например
`git worktree add --detach <worktree-path> <branch>`; все команды и правки
выполняй только в нём. Если worktree создать нельзя — СТОП и доложи.
Прочитай ПЕРЕД началом: <exact plan sections, standards docs, exemplar files,
the base commit whose message explains context>.

Контекст: <why this stage exists, what invariant it upholds, what the canonical
target is — enough that the agent doesn't reinvent a decision already made>.

## Порядок работ
1. <first unit>. После КАЖДОГО пункта — <the gate> зелёный.
2. <next unit>, по одному <entity/module> с зелёными гейтами.
   Если <precondition> не выполнено — СТОП, доложи, НЕ изобретай.
...

## Что НЕ делать
- <files/layers off-limits this stage — deferred to a later stage>
- <do not adjust the tests of the thing being ported; a failing core test = a
  finding, STOP and report>

## Верификация и отчёт
Готово, когда: <the full gate> зелёный; <per-app checks>; <build/export if
relevant>.
Отчёт: первой строкой абсолютный путь worktree и base commit; затем <what to
report — per-entity map, deltas named, sanctioned deviations, STOPs hit,
out-of-scope>.
```

## What makes it hold

- **Read-first, by exact reference.** Name the plan sections and exemplar files,
  not "read the docs". The agent's default is to skim; anchor it.
- **Worktree is mandatory.** A delegated agent works in its own `git worktree`,
  not the orchestrator checkout, and reports the absolute path. Otherwise you
  cannot know which tree to verify.
- **Green after every unit, one entity at a time.** Incremental gates localize a
  regression to the unit that caused it. "Do it all then run the gate" produces a
  red gate with no bisection.
- **STOP conditions over guessing.** The single highest-value instruction is
  "if X isn't covered, stop and report — don't invent." Delegated agents fill
  gaps by inventing plausible code; a STOP turns an unknown into a decision you
  make. Every real STOP in this effort surfaced a genuine design question
  (a field with no kernel equivalent, a schema gap) that would have been a silent
  bug had the agent guessed.
- **"What NOT to do" is as load-bearing as "what to do."** Name the deferred
  files/stages explicitly; otherwise the agent helpfully does next stage's work
  too and tangles the diff.
- **Disjoint file sets across parallel stages.** If you are running several
  stages at once, their "what to do" and "what NOT to do" must partition the
  tree — two in-flight stages touching the same module will collide at landing
  time. Overlap in the prompts means they were really one stage.
- **Partiality is allowed.** For a large stage, tell the agent it may stop at a
  green partial slice and report the remainder map, rather than push a huge risky
  diff. You'd rather review two clean slices than one sprawling one.
- **Demand a report shaped for verification.** Ask for per-entity before/after
  maps, named test deltas with the reason class, sanctioned deviations, and STOPs
  — the exact things your verify loop will machine-check. A report you can't
  grep-check is a report you can't trust.

## When the agent reports it stopped mid-way

Common when it hits a model/credit limit or a real STOP. Do not just re-delegate
blindly:
- If it stopped on a genuine STOP condition, **make the decision** (that's your
  job) and write a short continuation prompt that states the decision and resumes.
- If it stopped on a limit mid-edit, the tree may have an unfinished edit — read
  it, finish or revert it first, then either continue yourself or re-delegate the
  remainder with a precise map of what's left.
