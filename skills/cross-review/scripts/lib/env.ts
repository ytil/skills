// Side-effect module: MUST be the first import of the entrypoint so the scrub
// runs before any SDK module body executes.
//
// Subscription-only guarantee: children must never see API keys, and a nested
// Claude Code session must not leak its harness markers.

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
