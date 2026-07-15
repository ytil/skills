# Adversarial review workflow

The verify step (step 3 of the loop) uses a `Workflow` script: one **finder** per
independent dimension of the diff, and *every* finding is then attacked by an
independent **verifier** whose job is to *refute* it. Pipeline, not barrier — a
dimension's findings verify as soon as that dimension's finder returns, so fast
dimensions don't wait on slow ones.

Copy the skeleton below and fill in `DIMENSIONS` for the stage under review. Keep
the `COMMON` preamble factual and specific: what the stage claims, what the base
commit is, what is *sanctioned* (so verifiers don't flag deliberate decisions),
and the instruction to read real code and return structured findings only.

## Why this shape

- **One finder per dimension** — dimensions are blind to each other, so each
  surfaces what a single reviewer would miss. Pick dimensions from what the stage
  touched, not a fixed list.
- **Adversarial verify per finding — minors included.** A plausible finding is
  not a real one, at any severity: an unverified minor handed straight to the
  fix subagent is exactly the plausible-but-wrong "fix" the loop exists to
  prevent, and a single verifier vote per minor is cheap. The verifier tries to
  refute using compensating code, a misread diff, or a sanctioned decision, and
  may also **re-grade severity** (`adjustedSeverity`) when a finding is real but
  over- or under-stated. Real defects survive; the rest get dropped or
  downgraded.
- **`COMMON` names the sanctioned decisions** — otherwise verifiers waste votes
  re-flagging things the stage deliberately did (a legacy shape kept at a VM
  boundary, a dependency deferred to a later stage).
- **You still machine-check on top** — the workflow is a wide net, not a
  substitute for grepping the load-bearing claims yourself (see the skill's
  second principle).

## Skeleton

```javascript
export const meta = {
    name: 'verify-<stage>',
    description: 'Адверсариальная верификация <stage> (<one line>)',
    phases: [{ title: 'Review' }, { title: 'Verify' }],
}

const FINDINGS_SCHEMA = {
    type: 'object',
    required: ['findings', 'summary'],
    properties: {
        summary: { type: 'string' },
        findings: {
            type: 'array',
            items: {
                type: 'object',
                required: ['file', 'severity', 'title', 'evidence'],
                properties: {
                    file: { type: 'string' },
                    line: { type: 'number' },
                    severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
                    title: { type: 'string' },
                    evidence: { type: 'string' }, // concrete code/diff lines
                },
            },
        },
    },
}

const VERDICT_SCHEMA = {
    type: 'object',
    required: ['isReal', 'reasoning'],
    properties: {
        isReal: { type: 'boolean' },
        reasoning: { type: 'string' },
        // set only when the finding is real but its severity is mis-graded
        adjustedSeverity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
    },
}

// Factual context every agent shares. Name the base commit, the claim, and — critically —
// what is SANCTIONED so verifiers don't re-flag deliberate decisions. Tell them the full
// gate is running separately in parallel (don't run it), to read REAL code/diffs, and that
// an empty findings list is a valid result (don't invent problems for volume).
const COMMON = `Репозиторий <path>, working tree = НЕЗАКОММИЧЕННЫЙ <stage> (<N файлов, +X/−Y>, base=<hash>). <что заявлено>. Санкционировано: <решения этапа, не флагать>. Ты ревьюер-верификатор. Смотри РЕАЛЬНЫЙ код (git diff HEAD, git show HEAD:<path>). Полный гейт запущен отдельно и идёт параллельно — НЕ запускай его сам. Пустой список находок валиден.`

const DIMENSIONS = [
    { key: '<dimension>', prompt: `${COMMON}\nИзмерение: <what to inspect, numbered checks, what counts as a finding vs sanctioned>` },
    // ...one per independent dimension
]

phase('Review')
const results = await pipeline(
    DIMENSIONS,
    (d) => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
    async (review, d) => {
        if (!review) return null
        if (!review.findings.length) return { key: d.key, summary: review.summary, confirmed: [] }
        const verified = await parallel(review.findings.map((f) => async () => {
            const verdict = await agent(`${COMMON}
Адверсариально проверь находку (измерение ${d.key}). Попробуй ОПРОВЕРГНУТЬ её реальным кодом: компенсирующий код, неверно прочитанный дифф, санкционированное решение. Если находка реальна, но severity завышена/занижена — верни adjustedSeverity. Находка: [${f.severity}] ${f.title} — ${f.file}${f.line ? ':' + f.line : ''}. Доказательство: ${f.evidence}`,
                { label: `verify:${d.key}`, phase: 'Verify', schema: VERDICT_SCHEMA },
            )
            return { ...f, severity: verdict?.adjustedSeverity ?? f.severity, verdict }
        }))
        return {
            key: d.key,
            summary: review.summary,
            confirmed: verified.filter(Boolean).filter((f) => f.verdict?.isReal),
        }
    },
)

const out = results.filter(Boolean)
log(`Подтверждено находок: ${out.reduce((n, r) => n + r.confirmed.length, 0)}`)
return out
```

## Dimension menu (pick what the stage touched)

- **behavioral-equivalence** — the thing that changed still behaves identically.
  When a bridge/mapper is deleted: every silent coercion it did must have an
  explicit replacement (validation, not silent mutation). When a query layer is
  converted: SQL must be 1:1 — have the agent *compile* `toSQL()` and diff, not
  read. Any silent behavior change = major with old-vs-new evidence.
- **residue** — deletions leave dead exports, stale doc-refs, orphaned barrels,
  dead-code-gate-masked test-only-live modules. Grep the removed symbols;
  confirm the removal is total.
- **tests-integrity** — migrated tests must not weaken assertions (fixture swap
  only, identical expect counts). Deleted test files must have covered only
  deleted code, with equivalent coverage relocated. Any changed *expectation*
  (not fixture) is a finding.
- **contract/schema-fidelity** — a generated/derived schema mirrors its source
  field-by-field; a remote contract matches the local one. Have the agent dump
  both and diff programmatically.
- **money-path** — auth sessions, sync eligibility, purchases/entitlement,
  migrations. Higher vote count; these fail silently and expensively.

## Gotchas

- Workflow scripts are plain JS, not TS — no type annotations, interfaces, or
  generics.
- Do **not** put backticks inside a template-literal prompt (nested backticks
  fail to parse) — use quotes for inline code in prompts.
- `pipeline(items, stage1, stage2)` runs each item through all stages with no
  barrier — the default. Only use `parallel()` (a barrier) when a stage genuinely
  needs *all* prior results at once (e.g. dedup across every finding before an
  expensive pass).
- Retrieve the result with the workflow's task id; the `result` field holds the
  returned array. Parse it and act on `confirmed` findings.
