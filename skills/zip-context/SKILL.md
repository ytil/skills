---
name: zip-context
description: "Create a clean project-context zip archive for architecture review, code review, or model handoff. Use when Codex needs to package the current project or repository into a zip while respecting the project-local `zip_context_ignore.md` as the manual source of truth for exclusions, or when the user wants a focused archive for a specific subsystem or task."
---

# Zip Context

Package a project into a compact zip archive that keeps code, docs, text configs, and any assets not excluded by `zip_context_ignore.md`. The project-local `zip_context_ignore.md` is the manual source of truth for exclusions. The script must not create, rewrite, refresh, or auto-fix that file.

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
2. Check whether `zip_context_ignore.md` exists and has the expected marked blocks.
3. If `zip_context_ignore.md` is missing or invalid, stop and ask for it to be edited manually. Do not create, rewrite, refresh, or auto-fix it.
4. Decide whether the request is broad or focused:
   - if the user asks for the full project or gives no scope, use the default full-project archive flow;
   - if the user names a subsystem, feature, task, bug, endpoint, or area such as "billing", first inspect the repo and build a focused list of relevant paths.
5. For a focused request, inspect the repo before zipping:
   - use `rg`, existing tests, docs, routes, schemas, configs, migrations, and entrypoints to find the files tied to the request;
   - write a newline-delimited manifest with repo-relative paths or directories;
   - prefer a disposable manifest path such as `/tmp/<scope>-paths.txt`.
6. If the command is `zip`, choose the candidate source:
   - full-project mode: walk the filesystem and filter with `zip_context_ignore.md`; do not use `.gitignore` or Git exclude rules as archive rules;
   - focused mode: pass the prepared manifest with `--paths-file`.
7. Filter candidates:
   - full-project mode respects only the patterns in `zip_context_ignore.md`;
   - focused mode keeps the explicit scope even if some files live under normally ignored generated/build directories.
8. Keep everything that is not excluded by `zip_context_ignore.md`, including dotfiles, assets, binary files, archives, generated files, and local artifacts.
9. Write the archive to `output/share/<project>-zip-context-YYYY-MM-DD.zip` unless the user provided `--output`.

## Project Ignore File

The project-local ignore file is always `zip_context_ignore.md` in the project root.

The bundled script reads both marked blocks as manual ignore patterns. It does not create, rewrite, refresh, or auto-fix either block. If the user wants to change archive contents, edit `zip_context_ignore.md` manually.

## Commands

Use the bundled script:

```bash
python3 "$ZIP_CONTEXT" [zip] [--root PATH] [--output PATH] [--paths-file PATH]
```

Command semantics:

- `zip`: read `zip_context_ignore.md` and build the archive. Fail if the ignore file is missing or invalid; do not edit it automatically.
- `zip --paths-file <file>`: build a focused archive from a prepared newline-delimited list of repo-relative or absolute paths. Directories in the list are expanded recursively.

If the user only asks to “zip”, “pack the project”, “prepare context for an architect”, or similar, run `zip`.
If the user asks for “files of the billing subsystem”, “only auth-related files”, “pack code relevant to this bug”, or similar, first build a focused manifest and then run `zip --paths-file`.

## Guardrails

- Prefer the current project root unless the user gave another path.
- Require `zip_context_ignore.md` to exist and be valid before zipping.
- For focused requests, include the files that help another model understand the scoped area: entrypoints, handlers, domain logic, schemas, migrations, configs, tests, and nearby docs when they are relevant.
- Do not widen a focused request into a whole-project archive unless the user asked for that broader scope.
- Exclude only paths matched by `zip_context_ignore.md`; do not exclude `.gitignore`, assets, archives, generated files, or the output archive unless the ignore file says so.
- Keep everything that is not excluded by `zip_context_ignore.md`.
