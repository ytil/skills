// Prompt templates for the three pipeline phases. Deliberately minimal and
// task-agnostic: the task text itself tells the agents what to work with.
// Model identities are never revealed to the agents: the opponent is
// "another agent", the synthesizer sees anonymous "Agent A" / "Agent B".

const COMMON_RULES = `Rules:
- STRICTLY READ-ONLY: you are running with broad permissions, but you MUST NOT perform
  any mutating operation. Do not create, modify, delete, or move any file; do not run
  formatters, installers, migrations, or any git command that changes state (commit,
  checkout, stash, reset, ...). Read-only commands (cat, ls, rg, git log/diff/show/blame,
  running existing tests or linters that do not write) and fetching data from the web
  are allowed.
- Support your key claims with evidence that can be independently checked.
- Answer in the same language as the task statement.`;

export function analysisPrompt(task: string): string {
    return `Work on the task below independently, as an expert.

${COMMON_RULES}

Task:
${task}`;
}

// Sent as a follow-up turn in the reviewer's own analysis session: the task and
// the reviewer's own answer are already in its context, so neither is repeated.
export function reviewPrompt(opponentAnalysis: string): string {
    return `Another agent independently worked on the same task you just completed, in the same
environment. Cross-review their answer. Be adversarial but fair: your value is in
catching what is wrong or missing, not in agreeing — and if their answer exposes a gap
or error in your own, say so openly.

${COMMON_RULES}
- Verify their key claims independently before judging them — do not take their word for it.

Their answer:
---
${opponentAnalysis}
---`;
}

export interface SynthesisInput {
    task: string;
    analysisA: string;
    analysisB: string;
    reviewOfA: string | null;
    reviewOfB: string | null;
}

export function synthesisPrompt({
    task,
    analysisA,
    analysisB,
    reviewOfA,
    reviewOfB,
}: SynthesisInput): string {
    const reviewASection = reviewOfA
        ? `## Review of Agent A's answer (written by Agent B)
${reviewOfA}`
        : `## Review of Agent A's answer
UNAVAILABLE — this review call failed. Weigh Agent A's unreviewed claims more cautiously.`;

    const reviewBSection = reviewOfB
        ? `## Review of Agent B's answer (written by Agent A)
${reviewOfB}`
        : `## Review of Agent B's answer
UNAVAILABLE — this review call failed. Weigh Agent B's unreviewed claims more cautiously.`;

    return `Two agents (anonymized as Agent A and Agent B) independently worked on the same task
in the same environment, then each cross-reviewed the other's answer (each review was
written in the same session as its author's own answer, so a review may also concede
or revise its author's original position). You are the neutral synthesizer: produce
ONE final verdict from the four artifacts below. You have access to the same environment.

${COMMON_RULES}

Synthesis rules:
- Your primary job is synthesis, not a third attempt at the task — do not redo it
  from scratch.
- Never present a contested or unverified claim as fact: when the artifacts disagree
  on something load-bearing, resolve it explicitly — verifying it yourself if needed —
  and say which side the evidence supports and why.
- Do not try to guess which model produced which artifact; judge content only.

Task:
${task}

## Agent A — answer
${analysisA}

## Agent B — answer
${analysisB}

${reviewASection}

${reviewBSection}`;
}
