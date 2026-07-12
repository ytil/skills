// CLI definition on commander. Role flags accept the FULL form only:
//   --claude=<model>:<effort>
//   --codex=<model>:<effort>
//   --synthesizer=<claude|codex>:<model>:<effort>

import { Command, InvalidArgumentError } from "commander";

import {
    EFFORT_VALUES,
    SIDES,
    type CliConfig,
    type Effort,
    type RoleSpec,
    type Side,
    type SynthesizerSpec,
} from "./types.ts";

function isEffort(value: string): value is Effort {
    return (EFFORT_VALUES as readonly string[]).includes(value);
}

function isSide(value: string): value is Side {
    return (SIDES as readonly string[]).includes(value);
}

function parseRoleSpec(value: string): RoleSpec {
    const parts = value.split(":");
    if (parts.length !== 2 || parts.some((p) => p.length === 0)) {
        throw new InvalidArgumentError(
            `expected the full form <model>:<effort>, got "${value}".`,
        );
    }
    const [model, effort] = parts as [string, string];
    if (!isEffort(effort)) {
        throw new InvalidArgumentError(
            `unknown effort "${effort}" (expected one of: ${EFFORT_VALUES.join(", ")}).`,
        );
    }
    return { model, effort };
}

function parseSynthesizerSpec(value: string): SynthesizerSpec {
    const parts = value.split(":");
    if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
        throw new InvalidArgumentError(
            `expected the full form <claude|codex>:<model>:<effort>, got "${value}".`,
        );
    }
    const [side, model, effort] = parts as [string, string, string];
    if (!isSide(side)) {
        throw new InvalidArgumentError(
            `side must be "claude" or "codex", got "${side}".`,
        );
    }
    if (!isEffort(effort)) {
        throw new InvalidArgumentError(
            `unknown effort "${effort}" (expected one of: ${EFFORT_VALUES.join(", ")}).`,
        );
    }
    return { side, model, effort };
}

// Commander is greedy: without this guard `--cwd --json` would consume
// "--json" as the value instead of erroring out.
function parsePath(value: string): string {
    if (value.startsWith("-")) {
        throw new InvalidArgumentError(
            `"${value}" looks like an option, not a value.`,
        );
    }
    return value;
}

function parseTimeout(value: string): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
        throw new InvalidArgumentError(
            "expected a positive number of minutes.",
        );
    }
    return n;
}

interface RawOptions {
    claude?: RoleSpec;
    codex?: RoleSpec;
    synthesizer?: SynthesizerSpec;
    cwd: string;
    out?: string;
    timeout: number;
    json?: boolean;
}

export function parseCli(argv: string[]): CliConfig {
    const program = new Command()
        .name("cross-review")
        .description(
            "Run a read-only task in Claude and Codex in parallel, cross-review the analyses,\n" +
                "and synthesize one verdict. Subscription auth only (API keys are scrubbed).",
        )
        .argument("[task]", 'task text, or "-" to read it from stdin')
        .option(
            "--claude <model:effort>",
            "Claude side: its analysis + its review. Full form only",
            parseRoleSpec,
        )
        .option(
            "--codex <model:effort>",
            "Codex side: its analysis + its review. Full form only",
            parseRoleSpec,
        )
        .option(
            "--synthesizer <side:model:effort>",
            "who writes the verdict; side is claude|codex (default: claude, inheriting --claude)",
            parseSynthesizerSpec,
        )
        .option(
            "--cwd <dir>",
            "repository to analyze",
            parsePath,
            process.cwd(),
        )
        .option("--out <dir>", "report directory override", parsePath)
        .option(
            "--timeout <min>",
            "per-call timeout in minutes",
            parseTimeout,
            10,
        )
        .option("--json", "machine-readable output")
        .allowExcessArguments(false)
        .addHelpText(
            "after",
            `
Effort values: ${EFFORT_VALUES.join(" | ")}
  "minimal" is Codex-only. "ultracode" maps to the ultracode multi-agent keyword
  for Claude and to model_reasoning_effort=ultra for Codex (GPT-5.6 sol/terra).

Examples:
  cross-review "why does test X flake on CI?"
  cross-review "audit the storage layer" --claude=claude-opus-4-8:high --codex=gpt-5.6-sol:xhigh
  cross-review "review the last commit" --codex=gpt-5.6-sol:xhigh --synthesizer=codex:gpt-5.6-sol:medium
  echo "<long task>" | cross-review -`,
        );

    program.parse(argv);

    const opts = program.opts<RawOptions>();
    const task = program.processedArgs[0] as string | undefined;
    if (task === undefined) {
        // program.error() exits the process; the throw only narrows the type.
        program.error(
            'missing required task argument (pass the task text, or "-" to read it from stdin).',
        );
        throw new Error("unreachable");
    }

    return {
        task,
        taskFromStdin: task === "-",
        claude: opts.claude ?? null,
        codex: opts.codex ?? null,
        synthesizer: opts.synthesizer ?? null,
        cwd: opts.cwd,
        out: opts.out ?? null,
        timeoutMin: opts.timeout,
        json: opts.json ?? false,
    };
}

// Fill in the synthesizer default: claude side, inheriting --claude settings when present.
export function resolveSynthesizer(config: CliConfig): SynthesizerSpec {
    if (config.synthesizer) return config.synthesizer;
    return {
        side: "claude",
        model: config.claude?.model ?? null,
        effort: config.claude?.effort ?? null,
    };
}
