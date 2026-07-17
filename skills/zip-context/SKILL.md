---
name: zip-context
description: "Create a clean project-context zip archive for architecture review, code review, or model handoff. Use when Codex needs to package the current project or repository into a zip while respecting the project-local `zip_context_ignore.md` (or `.gitignore`/`.arcignore` as a fallback) as the source of truth for exclusions, or when the user wants a focused archive for a specific subsystem or task."
---

# Zip Context

Package a project into a compact zip archive that keeps code, docs, text configs, and any assets not excluded by the active ignore source. The project-local `zip_context_ignore.md` is the primary, manual source of truth for exclusions. When it is absent, the script falls back to the repo's `.gitignore` and `.arcignore` (patterns combined, plus an implicit `.git/`/`.arc/` exclusion so VCS metadata never lands in the archive). The script must not create, rewrite, refresh, or auto-fix any ignore file.

By default the skill archives the full project. When the user asks for a specific subsystem, feature, task, or bug area, first identify the relevant files and archive only that scope.

## Quick Start

Set the script path once per shell:

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export ZIP_CONTEXT="$CODEX_HOME/skills/zip-context/scripts/zip_context.py"
```

Default action is `zip`:

```bash
python3 "$ZIP_CONTEXT"
python3 "$ZIP_CONTEXT" zip
```

Target another directory:

```bash
python3 "$ZIP_CONTEXT" zip --root /path/to/project
```

Focused archive from a prepared path list:

```bash
python3 "$ZIP_CONTEXT" zip --root /path/to/project --paths-file /tmp/billing-paths.txt
```

## Workflow

1. Resolve the project root. Prefer the current repository root; otherwise use `--root` or the current directory.
2. Resolve the ignore source: use `zip_context_ignore.md` if it exists; otherwise fall back to `.gitignore` / `.arcignore`. The script does this automatically.
3. If none of `zip_context_ignore.md`, `.gitignore`, or `.arcignore` exist, the script stops with an error — ask for `zip_context_ignore.md` to be created manually. Do not create, rewrite, refresh, or auto-fix any ignore file.
4. Decide whether the request is broad or focused:
    - if the user asks for the full project or gives no scope, use the default full-project archive flow;
    - if the user names a subsystem, feature, task, bug, endpoint, or area such as "billing", first inspect the repo and build a focused list of relevant paths.
5. For a focused request, inspect the repo before zipping:
    - use `rg`, existing tests, docs, routes, schemas, configs, migrations, and entrypoints to find the files tied to the request;
    - write a newline-delimited manifest with repo-relative paths or directories;
    - prefer a disposable manifest path such as `/tmp/<scope>-paths.txt`.
6. If the command is `zip`, choose the candidate source:
    - full-project mode: walk the filesystem and filter with the active ignore source (`zip_context_ignore.md`, or the `.gitignore`/`.arcignore` fallback);
    - focused mode: pass the prepared manifest with `--paths-file`.
7. Filter candidates:
    - full-project mode respects only the patterns from the active ignore source;
    - focused mode keeps the explicit scope even if some files live under normally ignored generated/build directories.
8. Keep everything that is not excluded by the active ignore source, including dotfiles, assets, binary files, archives, generated files, and local artifacts.
9. Write the archive to `output/share/<project>-zip-context-YYYY-MM-DD.zip` unless the user provided `--output`.

## Project Ignore File

The primary ignore file is `zip_context_ignore.md` in the project root — a plain newline-delimited ignore file, similar to `.gitignore`. Blank lines and `#` comments are ignored. Each remaining line is treated as a path, directory, or glob pattern.

When `zip_context_ignore.md` is absent, the script falls back to the repo's `.gitignore` and `.arcignore` (whichever exist; their patterns are combined). In fallback mode it also always excludes `.git/` and `.arc/` — VCS ignore files never list those, and they must not end up in a context archive. A single leading `/` anchor on a fallback pattern (e.g. `/node_modules`) is normalized so it still matches; the fallback is best-effort, not a full `.gitignore` engine.

The bundled script never creates, rewrites, refreshes, or auto-fixes any ignore file. To change archive contents, edit `zip_context_ignore.md` (or the fallback `.gitignore`/`.arcignore`) manually.

## Commands

Use the bundled script:

```bash
python3 "$ZIP_CONTEXT" [zip] [--root PATH] [--output PATH] [--paths-file PATH]
```

Command semantics:

- `zip`: read the active ignore source (`zip_context_ignore.md`, else the `.gitignore`/`.arcignore` fallback) as a plain ignore-pattern list and build the archive. Fail only if none of them exist; never edit any ignore file automatically.
- `zip --paths-file <file>`: build a focused archive from a prepared newline-delimited list of repo-relative or absolute paths. Directories in the list are expanded recursively.

If the user only asks to “zip”, “pack the project”, “prepare context for an architect”, or similar, run `zip`.
If the user asks for “files of the billing subsystem”, “only auth-related files”, “pack code relevant to this bug”, or similar, first build a focused manifest and then run `zip --paths-file`.

## Guardrails

- Prefer the current project root unless the user gave another path.
- Require an ignore source before zipping: `zip_context_ignore.md`, or a `.gitignore`/`.arcignore` fallback. Treat each as a plain `.gitignore`-style list of path, directory, and glob patterns. If none exist, the script fails — ask for `zip_context_ignore.md` to be created manually.
- For focused requests, include the files that help another model understand the scoped area: entrypoints, handlers, domain logic, schemas, migrations, configs, tests, and nearby docs when they are relevant.
- Do not widen a focused request into a whole-project archive unless the user asked for that broader scope.
- Exclude only paths matched by the active ignore source (plus `.git/`/`.arc/` in fallback mode); do not exclude assets, archives, generated files, or the output archive unless the ignore source says so.
- Keep everything that is not excluded by the active ignore source.
