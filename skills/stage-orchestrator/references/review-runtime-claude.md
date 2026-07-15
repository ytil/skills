# Review mechanics — Claude Code

Read `review-workflow.md` first for the method and the data contract; this file
is only the execution: a `Workflow` script that runs finders in parallel,
verifies each finding as soon as its dimension returns (pipeline, not barrier),
and enforces the data contract via `schema` — an agent returning malformed JSON
is retried at the tool-call layer, so no parsing is needed.

Copy the skeleton, fill in `DIMENSIONS` for the stage under review, and put the
shared preamble (from `review-workflow.md`) into `COMMON`.

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

// The shared preamble from review-workflow.md, filled in for this stage.
const COMMON = `<...>`

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
- For a money-path or "тщательно проверь" review, raise the vote count: spawn
  3–5 verifiers per serious finding and take the majority instead of one vote.
