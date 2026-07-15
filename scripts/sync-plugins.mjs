#!/usr/bin/env node
// Keep the plugin manifests in sync — see CLAUDE.md "Before every push".
//
// Automates the *mechanics*: version across all three manifests + the derived
// skills[] list. It does NOT decide *when* to bump — that's `check` (below),
// wired into a pre-push hook if you want it enforced.
//
// Usage:
//   node scripts/sync-plugins.mjs bump [--minor|--major]  # bump version (patch default), re-derive skills[]
//   node scripts/sync-plugins.mjs check                   # verify all manifests are in sync; exit 1 if not
//
// Leaves curated prose (keywords, description, README) alone — update those by hand.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CLAUDE_PLUGIN = ".claude-plugin/plugin.json";
const CLAUDE_MARKET = ".claude-plugin/marketplace.json";
const CODEX_PLUGIN = ".codex-plugin/plugin.json";

const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));
const writeJson = (rel, obj) =>
    writeFileSync(join(root, rel), JSON.stringify(obj, null, 4) + "\n");

// Real skills = subdirs of skills/ with a top-level SKILL.md. This naturally
// excludes the gitignored *-workspace/ eval scratch (no SKILL.md at its root).
function deriveSkills() {
    const skillsDir = join(root, "skills");
    return readdirSync(skillsDir, { withFileTypes: true })
        .filter(
            (e) =>
                e.isDirectory() &&
                existsSync(join(skillsDir, e.name, "SKILL.md")),
        )
        .map((e) => e.name)
        .sort()
        .map((name) => `./skills/${name}`);
}

function nextVersion(v, kind) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    if (!m) throw new Error(`Unexpected version format: "${v}"`);
    let [major, minor, patch] = m.slice(1).map(Number);
    if (kind === "major") [major, minor, patch] = [major + 1, 0, 0];
    else if (kind === "minor") [minor, patch] = [minor + 1, 0];
    else patch += 1;
    return `${major}.${minor}.${patch}`;
}

const cmd = process.argv[2];
const kind = process.argv.includes("--major")
    ? "major"
    : process.argv.includes("--minor")
      ? "minor"
      : "patch";

const claudePlugin = readJson(CLAUDE_PLUGIN);
const claudeMarket = readJson(CLAUDE_MARKET);
const codexPlugin = readJson(CODEX_PLUGIN);
const skills = deriveSkills();

if (cmd === "bump") {
    const prev = claudePlugin.version;
    const next = nextVersion(prev, kind);
    claudePlugin.version = next;
    claudePlugin.skills = skills;
    claudeMarket.plugins[0].version = next;
    codexPlugin.version = next;
    writeJson(CLAUDE_PLUGIN, claudePlugin);
    writeJson(CLAUDE_MARKET, claudeMarket);
    writeJson(CODEX_PLUGIN, codexPlugin);
    console.log(
        `bumped ${prev} → ${next} (${kind}); skills[] = ${skills.length}`,
    );
} else if (cmd === "check") {
    const errors = [];
    const v = claudePlugin.version;
    if (claudeMarket.plugins?.[0]?.version !== v)
        errors.push(
            `marketplace.json version ${claudeMarket.plugins?.[0]?.version} != plugin.json ${v}`,
        );
    if (codexPlugin.version !== v)
        errors.push(`codex plugin.json version ${codexPlugin.version} != ${v}`);
    const have = JSON.stringify(claudePlugin.skills);
    const want = JSON.stringify(skills);
    if (have !== want)
        errors.push(
            `plugin.json skills[] out of sync with skills/:\n    have: ${have}\n    want: ${want}`,
        );
    if (errors.length) {
        console.error(
            "plugin manifests out of sync:\n- " + errors.join("\n- "),
        );
        process.exit(1);
    }
    console.log(
        `ok — v${v} across all manifests; skills[] matches skills/ (${skills.length})`,
    );
} else {
    console.error(
        "usage: node scripts/sync-plugins.mjs <bump [--minor|--major] | check>",
    );
    process.exit(2);
}
