// Prompt templates for the three pipeline phases.
// Model identities are never revealed to the agents: the opponent is
// "another engineer", the synthesizer sees anonymous "Agent A" / "Agent B".

const COMMON_RULES = `Rules:
- STRICTLY READ-ONLY: you are running with broad permissions, but you MUST NOT perform
  any mutating operation. Do not create, modify, delete, or move any file; do not run
  formatters, installers, migrations, or any git command that changes state (commit,
  checkout, stash, reset, ...). Read-only commands (cat, ls, rg, git log/diff/show/blame,
  running existing tests or linters that do not write) are allowed.
- Cite concrete evidence for every claim: file paths and line numbers.
- Separate facts you verified in the code from assumptions; label assumptions explicitly.
- Answer in the same language as the task statement.`;

export function analysisPrompt(task) {
  return `You are performing an independent expert analysis of a task against a real repository.

${COMMON_RULES}

Structure your answer as:
1. **Answer / findings** — the substance, most important first.
2. **Evidence** — file:line references backing each finding.
3. **Uncertainties** — what you could not verify and why.

Task:
${task}`;
}

export function reviewPrompt(task, opponentAnalysis) {
  return `Another engineer independently analyzed the task below against the same repository.
Your job is to cross-review their analysis. Be adversarial but fair: your value is in
catching what is wrong or missing, not in agreeing.

${COMMON_RULES}
- Verify their key claims against the ACTUAL code before judging them.

Structure your answer as:
1. **Claim verdicts** — for each significant claim: CONFIRMED / REFUTED / UNVERIFIABLE, with your evidence (file:line).
2. **Missed points** — relevant facts or risks their analysis omitted.
3. **Overall assessment** — how much of the analysis survives your review.

Task that was analyzed:
${task}

Their analysis:
---
${opponentAnalysis}
---`;
}

export function synthesisPrompt({ task, analysisA, analysisB, reviewOfA, reviewOfB }) {
  const reviewASection = reviewOfA
    ? `## Review of Agent A's analysis (written by Agent B)
${reviewOfA}`
    : `## Review of Agent A's analysis
UNAVAILABLE — this review call failed. Weigh Agent A's unreviewed claims more cautiously.`;

  const reviewBSection = reviewOfB
    ? `## Review of Agent B's analysis (written by Agent A)
${reviewOfB}`
    : `## Review of Agent B's analysis
UNAVAILABLE — this review call failed. Weigh Agent B's unreviewed claims more cautiously.`;

  return `Two agents (anonymized as Agent A and Agent B) independently analyzed the same task
against the same repository, then each cross-reviewed the other's analysis. You are the
neutral synthesizer: produce ONE final verdict from the four artifacts below. You have
access to the same repository.

${COMMON_RULES}

Synthesis rules:
- Your primary job is synthesis, not a third analysis — do not re-investigate the task
  from scratch.
- Never present a contested or unverified claim as fact: when the artifacts DISAGREE on
  a factual claim, or a load-bearing claim was not confirmed by either review, verify
  that specific claim against the actual code yourself before ruling on it.
- Do not try to guess which model produced which artifact; judge content only.
- Where the agents agree and reviews confirm, state it as consensus.
- Where they disagree, resolve the disagreement explicitly: say which side the evidence
  (including your own spot-checks) supports and why. A claim REFUTED by a review with
  concrete evidence must not survive into the verdict unchallenged.

Structure your verdict as:
1. **Final answer** — the synthesized substance, most important first.
2. **Consensus** — what both analyses independently established.
3. **Resolved disagreements** — each conflict and how you resolved it.
4. **Open questions** — what remains unverified after both reviews.

Task:
${task}

## Agent A — analysis
${analysisA}

## Agent B — analysis
${analysisB}

${reviewASection}

${reviewBSection}`;
}
