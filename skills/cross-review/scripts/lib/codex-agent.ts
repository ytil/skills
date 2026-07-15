import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    Codex,
    type CodexOptions,
    type ThreadOptions,
} from "@openai/codex-sdk";

import type { Effort, RunParams, RunResult } from "./types.ts";

// Efforts typed natively by the SDK. "max" and "ultracode"→"ultra" are newer
// values (GPT-5.6) the TS type lags behind: they go through a raw config
// override. "ultra" is confirmed to work in headless exec (proactive
// multi-agent mode) on gpt-5.6-sol/terra; gpt-5.6-luna does not support it.
const CODEX_NATIVE_EFFORTS = [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
] as const;
type CodexNativeEffort = (typeof CODEX_NATIVE_EFFORTS)[number];

function isCodexNativeEffort(effort: Effort): effort is CodexNativeEffort {
    return (CODEX_NATIVE_EFFORTS as readonly string[]).includes(effort);
}

// The Codex SDK does not expose the resolved model in its events, so the best
// available record is the explicit flag or the `model` key from config.toml.
function codexConfiguredModel(): string | null {
    try {
        const configPath = path.join(
            process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
            "config.toml",
        );
        const match = fs
            .readFileSync(configPath, "utf8")
            .match(/^\s*model\s*=\s*"([^"]+)"/m);
        return match?.[1] ?? null;
    } catch {
        return null;
    }
}

export async function preflightCodex(): Promise<string | null> {
    const res = spawnSync("codex", ["login", "status"], {
        encoding: "utf8",
        timeout: 10_000,
    });
    if (res.error) {
        return "codex CLI not found. Install it and log in with a ChatGPT subscription: npm i -g @openai/codex && codex login";
    }
    if (res.status !== 0) {
        return "codex CLI is not logged in. Run: codex login  (ChatGPT subscription account)";
    }
    return null;
}

// Read-only discipline lives in the PROMPT (owner's decision): the agent runs
// with full disk access and never asks for approval.
export async function runCodex({
    prompt,
    role,
    cwd,
    timeoutMs,
}: RunParams): Promise<RunResult> {
    const isUltracode = role?.effort === "ultracode";

    const config: NonNullable<CodexOptions["config"]> = {};
    if (isUltracode) {
        config.model_reasoning_effort = "ultra";
    } else if (role?.effort === "max") {
        config.model_reasoning_effort = "max";
    }

    const threadOptions: ThreadOptions = {
        sandboxMode: "danger-full-access",
        approvalPolicy: "never",
        workingDirectory: cwd,
        skipGitRepoCheck: true,
    };
    if (role?.model) threadOptions.model = role.model;
    if (role?.effort && isCodexNativeEffort(role.effort)) {
        threadOptions.modelReasoningEffort = role.effort;
    }

    const codex = new Codex({ config });
    const thread = codex.startThread(threadOptions);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const turn = await thread.run(prompt, { signal: controller.signal });
        if (!turn.finalResponse) {
            throw new Error("codex run returned an empty finalResponse");
        }
        return {
            text: turn.finalResponse,
            model: role?.model ?? codexConfiguredModel(),
        };
    } catch (err) {
        if (controller.signal.aborted) {
            throw new Error(
                `codex call timed out after ${Math.round(timeoutMs / 60000)} min`,
            );
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}
