// CLI argument parsing for cross-review.
// Role flags accept the FULL form only:
//   --claude=<model>:<effort>
//   --codex=<model>:<effort>
//   --synthesizer=<claude|codex>:<model>:<effort>

export const EFFORT_VALUES = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultracode"
];

export const SIDES = ["claude", "codex"];

export class UsageError extends Error {}

export const USAGE = `cross-review — run a read-only task in Claude and Codex, cross-review, synthesize.

Usage:
  node cross-review.mjs "<task text>" [options]
  echo "<task text>" | node cross-review.mjs - [options]

Role options (omit a flag entirely, or give the FULL form — partial forms are rejected):
  --claude=<model>:<effort>                      Claude side: its analysis + its review
  --codex=<model>:<effort>                       Codex side: its analysis + its review
  --synthesizer=<claude|codex>:<model>:<effort>  who writes the verdict (default: claude,
                                                 inheriting --claude settings when given)

  effort: ${EFFORT_VALUES.join(" | ")}
  "ultracode" maps to the ultracode keyword for Claude and to
  model_reasoning_effort=ultra for Codex (GPT-5.6 models).

Environment and output:
  --cwd <dir>       repository to analyze (default: current directory)
  --out <dir>       report directory (default: ~/.cache/cross-review/<ts>-<slug>/)
  --timeout <min>   per-call timeout in minutes (default: 10)
  --json            machine-readable output on stdout
  --help            this help
`;

function parseRoleSpec(flag, value) {
  const parts = value.split(":");
  if (parts.length !== 2 || parts.some((p) => p.length === 0)) {
    throw new UsageError(
      `${flag} requires the full form ${flag}=<model>:<effort>, got "${value}"`
    );
  }
  const [model, effort] = parts;
  if (!EFFORT_VALUES.includes(effort)) {
    throw new UsageError(
      `${flag}: unknown effort "${effort}" (expected one of: ${EFFORT_VALUES.join(", ")})`
    );
  }
  return { model, effort };
}

function parseSynthSpec(value) {
  const parts = value.split(":");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new UsageError(
      `--synthesizer requires the full form --synthesizer=<claude|codex>:<model>:<effort>, got "${value}"`
    );
  }
  const [side, model, effort] = parts;
  if (!SIDES.includes(side)) {
    throw new UsageError(
      `--synthesizer: side must be "claude" or "codex", got "${side}"`
    );
  }
  if (!EFFORT_VALUES.includes(effort)) {
    throw new UsageError(
      `--synthesizer: unknown effort "${effort}" (expected one of: ${EFFORT_VALUES.join(", ")})`
    );
  }
  return { side, model, effort };
}

export function parseArgs(argv) {
  const config = {
    task: null,
    taskFromStdin: false,
    claude: null,
    codex: null,
    synthesizer: null,
    cwd: process.cwd(),
    out: null,
    timeoutMin: 10,
    json: false,
    help: false
  };

  const takeValue = (arg, next, name) => {
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      const value = arg.slice(eq + 1);
      if (!value) throw new UsageError(`${name} requires a non-empty value`);
      return { value, consumed: 0 };
    }
    // A following option flag is not a value — reject instead of consuming it silently.
    if (next === undefined || next.startsWith("--")) {
      throw new UsageError(`${name} requires a value`);
    }
    return { value: next, consumed: 1 };
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      config.help = true;
    } else if (arg.startsWith("--claude=")) {
      config.claude = parseRoleSpec("--claude", arg.slice("--claude=".length));
    } else if (arg.startsWith("--codex=")) {
      config.codex = parseRoleSpec("--codex", arg.slice("--codex=".length));
    } else if (arg.startsWith("--synthesizer=")) {
      config.synthesizer = parseSynthSpec(arg.slice("--synthesizer=".length));
    } else if (arg === "--claude" || arg === "--codex" || arg === "--synthesizer") {
      throw new UsageError(`${arg} requires the full form ${arg}=<...> (see --help)`);
    } else if (arg === "--cwd" || arg.startsWith("--cwd=")) {
      const { value, consumed } = takeValue(arg, argv[i + 1], "--cwd");
      config.cwd = value;
      i += consumed;
    } else if (arg === "--out" || arg.startsWith("--out=")) {
      const { value, consumed } = takeValue(arg, argv[i + 1], "--out");
      config.out = value;
      i += consumed;
    } else if (arg === "--timeout" || arg.startsWith("--timeout=")) {
      const { value, consumed } = takeValue(arg, argv[i + 1], "--timeout");
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new UsageError(`--timeout must be a positive number of minutes, got "${value}"`);
      }
      config.timeoutMin = n;
      i += consumed;
    } else if (arg === "--json") {
      config.json = true;
    } else if (arg === "-") {
      if (config.task !== null) throw new UsageError("task given twice");
      config.taskFromStdin = true;
      config.task = "-";
    } else if (arg.startsWith("--")) {
      throw new UsageError(`unknown option ${arg} (see --help)`);
    } else {
      if (config.task !== null) {
        throw new UsageError("task given twice — quote the task text as a single argument");
      }
      config.task = arg;
    }
  }

  return config;
}

// Fill in the synthesizer default: claude side, inheriting --claude settings when present.
export function resolveSynthesizer(config) {
  if (config.synthesizer) return config.synthesizer;
  return {
    side: "claude",
    model: config.claude?.model ?? null,
    effort: config.claude?.effort ?? null
  };
}
