// Shared domain types for the cross-review pipeline.

export const EFFORT_VALUES = [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultracode",
] as const;
export type Effort = (typeof EFFORT_VALUES)[number];

export const SIDES = ["claude", "codex"] as const;
export type Side = (typeof SIDES)[number];

/** A fully specified role flag: --claude / --codex. */
export interface RoleSpec {
    model: string;
    effort: Effort;
}

/** A fully specified --synthesizer flag, or the resolved default. */
export interface SynthesizerSpec {
    side: Side;
    model: string | null;
    effort: Effort | null;
}

/** What the agent runners actually need from a role. */
export interface RoleLike {
    model: string | null;
    effort: Effort | null;
}

export interface CliConfig {
    task: string;
    taskFromStdin: boolean;
    claude: RoleSpec | null;
    codex: RoleSpec | null;
    synthesizer: SynthesizerSpec | null;
    cwd: string;
    out: string | null;
    timeoutMin: number;
    json: boolean;
}

/** One agent call result: the text plus the model that actually ran. */
export interface RunResult {
    text: string;
    model: string | null;
}

export interface RunParams {
    prompt: string;
    role: RoleLike | null;
    cwd: string;
    timeoutMs: number;
}

export interface StageFailure {
    stage: string;
    error: string;
}

export interface Artifacts {
    analysisA: string | null;
    analysisB: string | null;
    reviewOfA: string | null;
    reviewOfB: string | null;
    verdict: string | null;
}

export type Timings = Record<keyof Artifacts, number | null>;

export interface ResolvedModels {
    claude: string | null;
    codex: string | null;
    synthesizer: string | null;
}
