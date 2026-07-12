#!/usr/bin/env node
// cross-review: run a read-only task in Claude and Codex in parallel,
// cross-review the analyses, synthesize one verdict.
// Subscription auth only: API keys are scrubbed from the environment below.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    parseArgs,
    resolveSynthesizer,
    UsageError,
    USAGE,
} from "./lib/args.mjs";
import {
    analysisPrompt,
    reviewPrompt,
    synthesisPrompt,
} from "./lib/prompts.mjs";
import { buildReport, defaultReportDir, writeReport } from "./lib/report.mjs";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

// --- Subscription-only guarantee: children must never see API keys, and a
// --- nested Claude Code session must not leak its harness markers.
const SCRUBBED_ENV_VARS = [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    // CODEX_API_KEY switches codex to API billing over any other auth — the key one to scrub.
    "CODEX_API_KEY",
    "OPENAI_API_KEY",
    "CLAUDECODE",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_SSE_PORT",
];
for (const name of SCRUBBED_ENV_VARS) delete process.env[name];

function log(msg) {
    process.stderr.write(`[cross-review] ${msg}\n`);
}

function fail(msg, code) {
    process.stderr.write(`[cross-review] ERROR: ${msg}\n`);
    process.exit(code);
}

// --- First-run bootstrap: the SDK deps are not committed; install on demand.
function ensureDeps() {
    const needed = ["@anthropic-ai/claude-agent-sdk", "@openai/codex-sdk"];
    const missing = needed.filter(
        (dep) => !fs.existsSync(path.join(SCRIPTS_DIR, "node_modules", dep)),
    );
    if (missing.length === 0) return;
    log(`installing dependencies (first run): ${missing.join(", ")} ...`);
    const res = spawnSync(
        "npm",
        ["install", "--no-fund", "--no-audit", "--loglevel=error"],
        {
            cwd: SCRIPTS_DIR,
            stdio: ["ignore", "inherit", "inherit"],
        },
    );
    if (res.status !== 0) {
        fail(
            `npm install failed in ${SCRIPTS_DIR} — install dependencies manually and retry`,
            2,
        );
    }
}

async function readStdin() {
    let data = "";
    for await (const chunk of process.stdin) data += chunk;
    return data.trim();
}

// --- Retry wrapper: one retry with backoff, transient failures only.
async function withRetry(label, fn) {
    try {
        return await fn();
    } catch (err) {
        log(`${label} failed (${err.message}); retrying once in 5s ...`);
        await new Promise((r) => setTimeout(r, 5000));
        return await fn();
    }
}

async function timedCall(label, timings, key, fn) {
    const started = Date.now();
    log(`${label} started`);
    try {
        const result = await withRetry(label, fn);
        timings[key] = Date.now() - started;
        log(`${label} done in ${Math.round(timings[key] / 1000)}s`);
        return result;
    } catch (err) {
        timings[key] = Date.now() - started;
        log(`${label} FAILED after retry: ${err.message}`);
        throw err;
    }
}

async function main() {
    let config;
    try {
        config = parseArgs(process.argv.slice(2));
    } catch (err) {
        if (err instanceof UsageError) fail(`${err.message}\n\n${USAGE}`, 1);
        throw err;
    }

    if (config.help) {
        process.stdout.write(USAGE);
        return;
    }
    if (config.task === null) fail(`no task given\n\n${USAGE}`, 1);
    if (config.taskFromStdin) {
        config.task = await readStdin();
        if (!config.task) fail("stdin task is empty", 1);
    }
    config.cwd = path.resolve(config.cwd);
    if (!fs.existsSync(config.cwd))
        fail(`--cwd does not exist: ${config.cwd}`, 1);

    const synthesizer = resolveSynthesizer(config);

    ensureDeps();

    // SDK-backed modules are imported only after deps are guaranteed to exist.
    const { runClaude, preflightClaude, validateClaudeEffort } =
        await import("./lib/claude-agent.mjs");
    const { runCodex, preflightCodex } = await import("./lib/codex-agent.mjs");

    // Side-specific effort validation (the shared vocabulary is checked in args).
    const effortErrors = [
        validateClaudeEffort(config.claude?.effort, "--claude"),
        // Validate the synthesizer only when given explicitly: an inherited effort is already covered above.
        config.synthesizer && synthesizer.side === "claude"
            ? validateClaudeEffort(synthesizer.effort, "--synthesizer")
            : null,
    ].filter(Boolean);
    if (effortErrors.length > 0) fail(effortErrors.join("\n"), 1);

    log("preflight: checking CLI availability and auth ...");
    const preflightErrors = (
        await Promise.all([preflightClaude(), preflightCodex()])
    ).filter(Boolean);
    if (preflightErrors.length > 0) fail(preflightErrors.join("\n"), 2);

    const timeoutMs = config.timeoutMin * 60_000;
    const timings = {
        analysisA: null,
        analysisB: null,
        reviewOfA: null,
        reviewOfB: null,
        verdict: null,
    };
    const failures = [];
    const artifacts = {
        analysisA: null,
        analysisB: null,
        reviewOfA: null,
        reviewOfB: null,
        verdict: null,
    };
    const reportDir = config.out
        ? path.resolve(config.out)
        : defaultReportDir(config.task);

    const finishReport = () => {
        const report = buildReport({
            task: config.task,
            config,
            synthesizer,
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
    if (resA.status === "fulfilled") artifacts.analysisA = resA.value;
    else
        failures.push({
            stage: "analysis A (claude)",
            error: resA.reason.message,
        });
    if (resB.status === "fulfilled") artifacts.analysisB = resB.value;
    else
        failures.push({
            stage: "analysis B (codex)",
            error: resB.reason.message,
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
                prompt: reviewPrompt(config.task, artifacts.analysisA),
                role: config.codex,
                cwd: config.cwd,
                timeoutMs,
            }),
        ),
        timedCall("review of B (claude)", timings, "reviewOfB", () =>
            runClaude({
                prompt: reviewPrompt(config.task, artifacts.analysisB),
                role: config.claude,
                cwd: config.cwd,
                timeoutMs,
            }),
        ),
    ]);
    if (revA.status === "fulfilled") artifacts.reviewOfA = revA.value;
    else
        failures.push({
            stage: "review of A (codex)",
            error: revA.reason.message,
        });
    if (revB.status === "fulfilled") artifacts.reviewOfB = revB.value;
    else
        failures.push({
            stage: "review of B (claude)",
            error: revB.reason.message,
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
        artifacts.verdict = await timedCall(
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
    } catch (err) {
        failures.push({ stage: "synthesis", error: err.message });
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
                { verdict: artifacts.verdict, reportPath, timings, failures },
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

main().catch((err) => fail(err.stack ?? String(err), 3));
