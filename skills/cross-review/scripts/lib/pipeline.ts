import fs from "node:fs";
import path from "node:path";
import { text } from "node:stream/consumers";

import {
    runClaude,
    preflightClaude,
    validateClaudeEffort,
} from "./claude-agent.ts";
import { runCodex, preflightCodex } from "./codex-agent.ts";
import { analysisPrompt, reviewPrompt, synthesisPrompt } from "./prompts.ts";
import { buildReport, defaultReportDir, writeReport } from "./report.ts";
import type {
    Artifacts,
    CliConfig,
    ResolvedModels,
    StageFailure,
    SynthesizerSpec,
    Timings,
} from "./types.ts";

function log(msg: string): void {
    process.stderr.write(`[cross-review] ${msg}\n`);
}

function fail(msg: string, code: number): never {
    process.stderr.write(`[cross-review] ERROR: ${msg}\n`);
    process.exit(code);
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

// --- Retry wrapper: one retry with backoff, transient failures only.
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`${label} failed (${message}); retrying once in 5s ...`);
        await new Promise((r) => setTimeout(r, 5000));
        return await fn();
    }
}

async function timedCall<T>(
    label: string,
    timings: Timings,
    key: keyof Timings,
    fn: () => Promise<T>,
): Promise<T> {
    const started = Date.now();
    log(`${label} started`);
    try {
        const result = await withRetry(label, fn);
        timings[key] = Date.now() - started;
        log(`${label} done in ${Math.round(timings[key] / 1000)}s`);
        return result;
    } catch (err) {
        timings[key] = Date.now() - started;
        const message = err instanceof Error ? err.message : String(err);
        log(`${label} FAILED after retry: ${message}`);
        throw err;
    }
}

function reasonMessage(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

export async function runPipeline(config: CliConfig): Promise<void> {
    if (config.taskFromStdin) {
        config.task = (await text(process.stdin)).trim();
        if (!config.task) fail("stdin task is empty", 1);
    }
    config.cwd = path.resolve(config.cwd);
    if (!fs.existsSync(config.cwd))
        fail(`--cwd does not exist: ${config.cwd}`, 1);

    const synthesizer = resolveSynthesizer(config);

    // Side-specific effort validation (the shared vocabulary is checked by commander).
    const effortErrors = [
        validateClaudeEffort(config.claude?.effort, "--claude"),
        // Validate the synthesizer only when given explicitly: an inherited effort is already covered above.
        config.synthesizer && synthesizer.side === "claude"
            ? validateClaudeEffort(synthesizer.effort, "--synthesizer")
            : null,
    ].filter((e): e is string => e !== null);
    if (effortErrors.length > 0) fail(effortErrors.join("\n"), 1);

    log("preflight: checking CLI availability and auth ...");
    const preflightErrors = (
        await Promise.all([preflightClaude(), preflightCodex()])
    ).filter((e): e is string => e !== null);
    if (preflightErrors.length > 0) fail(preflightErrors.join("\n"), 2);

    const timeoutMs = config.timeoutMin * 60_000;
    const timings: Timings = {
        analysisA: null,
        analysisB: null,
        reviewOfA: null,
        reviewOfB: null,
        verdict: null,
    };
    const failures: StageFailure[] = [];
    const artifacts: Artifacts = {
        analysisA: null,
        analysisB: null,
        reviewOfA: null,
        reviewOfB: null,
        verdict: null,
    };
    // What actually ran: claude — resolved id from the SDK init message
    // (aliases expanded); codex — the flag or the config.toml model.
    const resolvedModels: ResolvedModels = {
        claude: null,
        codex: null,
        synthesizer: null,
    };
    const reportDir = config.out
        ? path.resolve(config.out)
        : defaultReportDir(config.task);

    const finishReport = (): string => {
        const report = buildReport({
            task: config.task,
            config,
            synthesizer,
            resolvedModels,
            artifacts,
            timings,
            failures,
        });
        const meta = {
            task: config.task,
            cwd: config.cwd,
            claude: config.claude,
            codex: config.codex,
            synthesizer,
            resolvedModels,
            timeoutMin: config.timeoutMin,
            timings,
            failures,
            finishedAt: new Date().toISOString(),
        };
        return writeReport(reportDir, { report, meta });
    };

    // --- Wave 1: independent analyses, both sides in parallel. A failed
    // --- analysis aborts the run: cross-review needs both sides.
    const taskPrompt = analysisPrompt(config.task);
    const [resA, resB] = await Promise.allSettled([
        timedCall("analysis A (claude)", timings, "analysisA", () =>
            runClaude({
                prompt: taskPrompt,
                role: config.claude,
                cwd: config.cwd,
                timeoutMs,
            }),
        ),
        timedCall("analysis B (codex)", timings, "analysisB", () =>
            runCodex({
                prompt: taskPrompt,
                role: config.codex,
                cwd: config.cwd,
                timeoutMs,
            }),
        ),
    ]);
    if (resA.status === "fulfilled") {
        artifacts.analysisA = resA.value.text;
        resolvedModels.claude = resA.value.model;
    } else
        failures.push({
            stage: "analysis A (claude)",
            error: reasonMessage(resA.reason),
        });
    if (resB.status === "fulfilled") {
        artifacts.analysisB = resB.value.text;
        resolvedModels.codex = resB.value.model;
    } else
        failures.push({
            stage: "analysis B (codex)",
            error: reasonMessage(resB.reason),
        });

    if (!artifacts.analysisA || !artifacts.analysisB) {
        const reportPath = finishReport();
        fail(
            `analysis phase failed (${failures.map((f) => f.stage).join(", ")}) — ` +
                `cross-review needs both sides. Partial report: ${reportPath}`,
            3,
        );
    }

    // --- Wave 2: cross-review — Codex reviews A, Claude reviews B. A single
    // --- failed review degrades gracefully: the synthesizer is told about it.
    const [revA, revB] = await Promise.allSettled([
        timedCall("review of A (codex)", timings, "reviewOfA", () =>
            runCodex({
                prompt: reviewPrompt(config.task, artifacts.analysisA!),
                role: config.codex,
                cwd: config.cwd,
                timeoutMs,
            }),
        ),
        timedCall("review of B (claude)", timings, "reviewOfB", () =>
            runClaude({
                prompt: reviewPrompt(config.task, artifacts.analysisB!),
                role: config.claude,
                cwd: config.cwd,
                timeoutMs,
            }),
        ),
    ]);
    if (revA.status === "fulfilled") artifacts.reviewOfA = revA.value.text;
    else
        failures.push({
            stage: "review of A (codex)",
            error: reasonMessage(revA.reason),
        });
    if (revB.status === "fulfilled") artifacts.reviewOfB = revB.value.text;
    else
        failures.push({
            stage: "review of B (claude)",
            error: reasonMessage(revB.reason),
        });

    // --- Wave 3: synthesis by one configurable model over anonymized artifacts.
    const synthPrompt = synthesisPrompt({
        task: config.task,
        analysisA: artifacts.analysisA,
        analysisB: artifacts.analysisB,
        reviewOfA: artifacts.reviewOfA,
        reviewOfB: artifacts.reviewOfB,
    });
    try {
        const synthResult = await timedCall(
            "synthesis",
            timings,
            "verdict",
            () => {
                const run =
                    synthesizer.side === "claude" ? runClaude : runCodex;
                return run({
                    prompt: synthPrompt,
                    role: synthesizer,
                    cwd: config.cwd,
                    timeoutMs,
                });
            },
        );
        artifacts.verdict = synthResult.text;
        resolvedModels.synthesizer = synthResult.model;
    } catch (err) {
        failures.push({
            stage: "synthesis",
            error: reasonMessage(err),
        });
        const reportPath = finishReport();
        fail(
            `synthesis failed — no verdict. Partial report with all artifacts: ${reportPath}`,
            3,
        );
    }

    const reportPath = finishReport();

    if (config.json) {
        process.stdout.write(
            JSON.stringify(
                {
                    verdict: artifacts.verdict,
                    reportPath,
                    resolvedModels,
                    timings,
                    failures,
                },
                null,
                2,
            ) + "\n",
        );
    } else {
        process.stdout.write(
            `${artifacts.verdict}\n\n---\nFull report: ${reportPath}\n`,
        );
    }
}
