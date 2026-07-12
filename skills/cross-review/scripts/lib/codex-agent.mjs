import { spawnSync } from "node:child_process";
import { Codex } from "@openai/codex-sdk";

// Efforts typed natively by the SDK. "max" and "ultracode"→"ultra" are newer
// values (GPT-5.6) the TS type lags behind: they go through a raw config
// override. "ultra" is confirmed to work in headless exec (proactive
// multi-agent mode) on gpt-5.6-sol/terra; gpt-5.6-luna does not support it.
const CODEX_NATIVE_EFFORTS = ["minimal", "low", "medium", "high", "xhigh"];

export async function preflightCodex() {
    const res = spawnSync("codex", ["login", "status"], { encoding: "utf8" });
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
export async function runCodex({ prompt, role, cwd, timeoutMs }) {
    const isUltracode = role?.effort === "ultracode";

    const codexOptions = { config: {} };
    if (isUltracode) {
        codexOptions.config.model_reasoning_effort = "ultra";
    } else if (role?.effort === "max") {
        codexOptions.config.model_reasoning_effort = "max";
    }

    const threadOptions = {
        sandboxMode: "danger-full-access",
        approvalPolicy: "never",
        workingDirectory: cwd,
        skipGitRepoCheck: true,
    };
    if (role?.model) threadOptions.model = role.model;
    if (role?.effort && CODEX_NATIVE_EFFORTS.includes(role.effort)) {
        threadOptions.modelReasoningEffort = role.effort;
    }

    const codex = new Codex(codexOptions);
    const thread = codex.startThread(threadOptions);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const turn = await thread.run(prompt, { signal: controller.signal });
        if (!turn.finalResponse) {
            throw new Error("codex run returned an empty finalResponse");
        }
        return turn.finalResponse;
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
