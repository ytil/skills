import { spawnSync } from "node:child_process";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";

import type { Effort, RunParams, RunResult } from "./types.ts";

// Claude effort levels accepted by the Agent SDK; "ultracode" is handled
// separately (prompt keyword + effort max).
const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];

function isClaudeEffort(effort: Effort): effort is ClaudeEffort {
    return (CLAUDE_EFFORTS as readonly string[]).includes(effort);
}

export function validateClaudeEffort(
    effort: Effort | null | undefined,
    flagName: string,
): string | null {
    if (effort === null || effort === undefined) return null;
    if (effort === "ultracode" || isClaudeEffort(effort)) return null;
    return `${flagName}: effort "${effort}" is not supported for Claude (use ${CLAUDE_EFFORTS.join(
        "/",
    )}/ultracode)`;
}

export async function preflightClaude(): Promise<string | null> {
    const res = spawnSync("claude", ["--version"], { encoding: "utf8" });
    if (res.error || res.status !== 0) {
        return (
            "claude CLI not found or not working. Install Claude Code and log in with a " +
            "subscription account: npm i -g @anthropic-ai/claude-code && claude  (then /login)"
        );
    }
    return null;
}

// Read-only discipline lives in the PROMPT (owner's decision): the agent runs
// with bypassPermissions so any read command is available without prompting.
export async function runClaude({
    prompt,
    role,
    cwd,
    timeoutMs,
}: RunParams): Promise<RunResult> {
    const isUltracode = role?.effort === "ultracode";
    const finalPrompt = isUltracode ? `ultracode\n\n${prompt}` : prompt;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const options: Options = {
        cwd,
        permissionMode: "bypassPermissions",
        // Owner's decision: agents behave like a regular session — global skills,
        // user CLAUDE.md, and project context are all visible. Pinned explicitly so
        // an SDK default change cannot silently isolate the agents.
        settingSources: ["user", "project", "local"],
        abortController: controller,
    };
    if (role?.model) options.model = role.model;
    if (role?.effort) {
        options.effort = isUltracode ? "max" : (role.effort as ClaudeEffort);
    }

    try {
        let resultText: string | null = null;
        let errorSubtype: string | null = null;
        let resolvedModel: string | null = null;
        for await (const message of query({ prompt: finalPrompt, options })) {
            // The init message carries the RESOLVED model id (aliases like
            // "sonnet" expanded) — recorded in the report for reproducibility.
            if (message.type === "system" && message.subtype === "init") {
                resolvedModel = message.model ?? null;
            }
            if (message.type === "result") {
                if (message.subtype === "success") resultText = message.result;
                else errorSubtype = message.subtype;
            }
        }
        if (resultText === null) {
            throw new Error(
                `claude run ended without a result (${errorSubtype ?? "no result message"})`,
            );
        }
        return { text: resultText, model: resolvedModel };
    } catch (err) {
        if (controller.signal.aborted) {
            throw new Error(
                `claude call timed out after ${Math.round(timeoutMs / 60000)} min`,
            );
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}
