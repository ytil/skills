import { spawnSync } from "node:child_process";
import { query } from "@anthropic-ai/claude-agent-sdk";

// Claude effort levels accepted by the Agent SDK; "ultracode" is handled
// separately (prompt keyword + effort max).
const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export function validateClaudeEffort(effort, flagName) {
  if (effort === null || effort === undefined) return null;
  if (effort === "ultracode" || CLAUDE_EFFORTS.includes(effort)) return null;
  return `${flagName}: effort "${effort}" is not supported for Claude (use ${CLAUDE_EFFORTS.join(
    "/"
  )}/ultracode)`;
}

export async function preflightClaude() {
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
export async function runClaude({ prompt, role, cwd, timeoutMs }) {
  const isUltracode = role?.effort === "ultracode";
  const finalPrompt = isUltracode ? `ultracode\n\n${prompt}` : prompt;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const options = {
    cwd,
    permissionMode: "bypassPermissions",
    // Owner's decision: agents behave like a regular session — global skills,
    // user CLAUDE.md, and project context are all visible. Pinned explicitly so
    // an SDK default change cannot silently isolate the agents.
    settingSources: ["user", "project", "local"],
    abortController: controller
  };
  if (role?.model) options.model = role.model;
  if (role?.effort) options.effort = isUltracode ? "max" : role.effort;

  try {
    let resultText = null;
    let errorSubtype = null;
    for await (const message of query({ prompt: finalPrompt, options })) {
      if (message.type === "result") {
        if (message.subtype === "success") resultText = message.result;
        else errorSubtype = message.subtype;
      }
    }
    if (resultText === null) {
      throw new Error(`claude run ended without a result (${errorSubtype ?? "no result message"})`);
    }
    return resultText;
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`claude call timed out after ${Math.round(timeoutMs / 60000)} min`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
