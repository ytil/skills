#!/usr/bin/env node
// cross-review: run a read-only task in Claude and Codex in parallel,
// cross-review the analyses, synthesize one verdict.
//
// Runs as plain TypeScript via Node's native type stripping (Node 22.18+/24).
// Dependencies are NOT self-installed: run `npm install` in this directory
// once before the first use.

import "./lib/env.ts"; // side-effect FIRST: scrub API keys before SDK modules load

import { Command, InvalidArgumentError } from "commander";

import { runPipeline } from "./lib/pipeline.ts";
import {
    EFFORT_VALUES,
    SIDES,
    type CliConfig,
    type Effort,
    type RoleSpec,
    type Side,
    type SynthesizerSpec,
} from "./lib/types.ts";

function isEffort(value: string): value is Effort {
    return (EFFORT_VALUES as readonly string[]).includes(value);
}

function isSide(value: string): value is Side {
    return (SIDES as readonly string[]).includes(value);
}

// Role flags accept the FULL form only: --claude=<model>:<effort>
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

// --synthesizer=<claude|codex>:<model>:<effort>
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

interface CliOptions {
    claude?: RoleSpec;
    codex?: RoleSpec;
    synthesizer?: SynthesizerSpec;
    cwd: string;
    out?: string;
    timeout: number;
    json?: boolean;
}

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
        "working directory for the agents (only matters when the task concerns it)",
        parsePath,
        process.cwd(),
    )
    .option("--out <dir>", "report directory override", parsePath)
    .option("--timeout <min>", "per-call timeout in minutes", parseTimeout, 10)
    .option("--json", "machine-readable output")
    .allowExcessArguments(false)
    .addHelpText(
        "after",
        `
Effort values: ${EFFORT_VALUES.join(" | ")}
  "minimal" is Codex-only. "ultracode" maps to the ultracode multi-agent keyword
  for Claude and to model_reasoning_effort=ultra for Codex (GPT-5.6 sol/terra;
  luna does not support it).

Examples:
  cross-review "why does test X flake on CI?"
  cross-review "what is the current EUR/USD rate and this week's trend?"
  cross-review "audit the storage layer" --claude=claude-opus-4-8:high --codex=gpt-5.6-sol:xhigh
  cross-review "review the last commit" --codex=gpt-5.6-sol:xhigh --synthesizer=codex:gpt-5.6-sol:medium
  echo "<long task>" | cross-review -`,
    )
    .action(async (task: string | undefined, opts: CliOptions) => {
        if (task === undefined) {
            // program.error() exits the process; the throw only narrows the type.
            program.error(
                'missing required task argument (pass the task text, or "-" to read it from stdin).',
            );
            throw new Error("unreachable");
        }
        const config: CliConfig = {
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
        await runPipeline(config);
    });

await program.parseAsync(process.argv);
