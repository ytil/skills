import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Directory naming: <ISO-ts>-<slug-of-task>
export function defaultReportDir(task) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug =
    task
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "task";
  return path.join(os.homedir(), ".cache", "cross-review", `${ts}-${slug}`);
}

function fmtDuration(ms) {
  if (ms == null) return "—";
  return `${Math.round(ms / 1000)}s`;
}

function fmtRole(role) {
  if (!role) return "CLI defaults";
  const model = role.model ?? "CLI default";
  const effort = role.effort ?? "CLI default";
  return `${model} : ${effort}`;
}

// artifacts: { analysisA, analysisB, reviewOfA, reviewOfB, verdict } — strings or null.
// timings:   same keys, ms or null. failures: array of {stage, error} strings.
export function buildReport({ task, config, synthesizer, artifacts, timings, failures }) {
  const lines = [
    "# Cross-review report",
    "",
    "## Run parameters",
    "",
    "| Role | Model : effort |",
    "|---|---|",
    `| Agent A (Claude) — analysis + review of B | ${fmtRole(config.claude)} |`,
    `| Agent B (Codex) — analysis + review of A | ${fmtRole(config.codex)} |`,
    `| Synthesizer (${synthesizer.side}) | ${fmtRole(synthesizer)} |`,
    "",
    `- cwd: \`${config.cwd}\``,
    `- per-call timeout: ${config.timeoutMin} min`,
    `- timings: analysis A ${fmtDuration(timings.analysisA)}, analysis B ${fmtDuration(
      timings.analysisB
    )}, review of A ${fmtDuration(timings.reviewOfA)}, review of B ${fmtDuration(
      timings.reviewOfB
    )}, synthesis ${fmtDuration(timings.verdict)}`,
    ""
  ];

  if (failures.length > 0) {
    lines.push("## Failures", "");
    for (const f of failures) lines.push(`- **${f.stage}**: ${f.error}`);
    lines.push("");
  }

  lines.push("## Task", "", task, "");

  const section = (title, body) =>
    lines.push(`## ${title}`, "", body ?? "_unavailable (call failed)_", "");

  section("Verdict (synthesizer)", artifacts.verdict);
  section("Agent A (Claude) — analysis", artifacts.analysisA);
  section("Agent B (Codex) — analysis", artifacts.analysisB);
  section("Review of A (by Agent B / Codex)", artifacts.reviewOfA);
  section("Review of B (by Agent A / Claude)", artifacts.reviewOfB);

  return lines.join("\n");
}

export function writeReport(dir, { report, meta }) {
  fs.mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, "report.md");
  fs.writeFileSync(reportPath, report, "utf8");
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  return reportPath;
}
