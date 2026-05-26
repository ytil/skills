#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import zipfile
from dataclasses import dataclass
from datetime import date
from fnmatch import fnmatchcase
from pathlib import Path, PurePosixPath


IGNORE_FILE_NAME = "zip_context_ignore.md"


@dataclass(frozen=True)
class ProjectSetup:
    root: Path
    is_git_repo: bool
    has_gitignore: bool
    ignore_file: Path


@dataclass(frozen=True)
class IgnoreState:
    patterns: list[str]


@dataclass(frozen=True)
class SelectionStats:
    candidate_paths: int
    included_paths: int
    ignored_paths: int
    missing_paths: int


@dataclass(frozen=True)
class SelectionResult:
    relative_paths: list[Path]
    stats: SelectionStats


@dataclass(frozen=True)
class ArchiveSummary:
    output_path: Path
    file_count: int
    archive_size_bytes: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a clean project-context zip archive. Default command: zip.",
    )
    parser.add_argument(
        "command",
        nargs="?",
        choices=("zip",),
        default="zip",
        help="Build the archive. The only supported command is `zip`.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="Project path. Defaults to the current working directory.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Archive path for the `zip` command.",
    )
    parser.add_argument(
        "--paths-file",
        type=Path,
        help=(
            "Optional newline-delimited file with repo-relative or absolute paths to package. "
            "Useful when the agent already identified files related to a specific task or subsystem."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    setup = inspect_project(args.root.resolve())

    print(f"project root: {setup.root}")
    print(f"git repo: {'yes' if setup.is_git_repo else 'no'}")
    print(f".gitignore: {'found' if setup.has_gitignore else 'missing'}")

    try:
        ignore_state = load_ignore_file(setup)
    except (FileNotFoundError, ValueError) as exc:
        print(f"{IGNORE_FILE_NAME}: unavailable")
        sys.stderr.write(f"{exc}\n")
        return 1

    print(f"{IGNORE_FILE_NAME}: loaded")

    output_path = args.output.resolve() if args.output else default_output_path(setup.root)
    ignore_patterns = ignore_state.patterns
    if args.paths_file is not None:
        try:
            explicit_candidates, explicit_missing_paths = load_explicit_candidate_paths(
                root=setup.root,
                paths_file=args.paths_file.resolve(),
            )
        except (FileNotFoundError, ValueError) as exc:
            sys.stderr.write(f"{exc}\n")
            return 1

        print(f"selection mode: focused ({args.paths_file.resolve()})")
        selection = select_project_files(
            setup=setup,
            ignore_patterns=ignore_patterns,
            candidate_paths=explicit_candidates,
            apply_ignore_patterns=False,
            initial_missing_paths=explicit_missing_paths,
        )
    else:
        print("selection mode: full project")
        selection = select_project_files(
            setup=setup,
            ignore_patterns=ignore_patterns,
        )

    if not selection.relative_paths:
        sys.stderr.write("no files selected for the zip-context archive\n")
        return 1

    summary = write_archive(
        repo_root=setup.root,
        relative_paths=selection.relative_paths,
        output_path=output_path,
    )
    print(f"candidates: {selection.stats.candidate_paths}")
    print(f"included: {selection.stats.included_paths}")
    print(f"ignored by patterns: {selection.stats.ignored_paths}")
    print(f"missing on disk: {selection.stats.missing_paths}")
    print(f"archive: {summary.output_path}")
    print(f"archive files: {summary.file_count}")
    print(f"archive size: {summary.archive_size_bytes} bytes")
    return 0


def inspect_project(start_path: Path) -> ProjectSetup:
    git_root = resolve_git_root(start_path)
    root = git_root if git_root is not None else start_path
    return ProjectSetup(
        root=root,
        is_git_repo=git_root is not None,
        has_gitignore=(root / ".gitignore").is_file(),
        ignore_file=root / IGNORE_FILE_NAME,
    )


def resolve_git_root(path: Path) -> Path | None:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=path,
            capture_output=True,
            check=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return Path(completed.stdout.strip()).resolve()


def default_output_path(root: Path) -> Path:
    archive_name = f"{root.name}-zip-context-{date.today().isoformat()}.zip"
    return root / "output" / "share" / archive_name


def load_ignore_file(setup: ProjectSetup) -> IgnoreState:
    if not setup.ignore_file.exists():
        raise FileNotFoundError(
            f"{IGNORE_FILE_NAME} not found. Create it manually before running zip."
        )

    return IgnoreState(patterns=parse_ignore_file(setup.ignore_file))


def parse_ignore_file(path: Path) -> list[str]:
    patterns: list[str] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        patterns.append(line)
    return patterns


def load_explicit_candidate_paths(root: Path, paths_file: Path) -> tuple[list[Path], int]:
    if not paths_file.is_file():
        raise FileNotFoundError(f"paths file not found: {paths_file}")

    relative_paths: list[Path] = []
    seen: set[str] = set()
    missing_paths = 0

    for raw_line in paths_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        target = resolve_manifest_target(root=root, raw_path=line)
        if target is None:
            missing_paths += 1
            continue

        for relative_path in expand_manifest_target(root=root, target=target):
            path_string = relative_path.as_posix()
            if path_string in seen:
                continue
            seen.add(path_string)
            relative_paths.append(relative_path)

    return relative_paths, missing_paths


def resolve_manifest_target(root: Path, raw_path: str) -> Path | None:
    candidate = Path(raw_path)
    absolute_target = candidate if candidate.is_absolute() else (root / candidate)
    absolute_target = absolute_target.resolve()

    try:
        absolute_target.relative_to(root)
    except ValueError as exc:
        raise ValueError(
            f"paths file entry points outside project root: {raw_path}"
        ) from exc

    if not absolute_target.exists():
        return None

    return absolute_target


def expand_manifest_target(root: Path, target: Path) -> list[Path]:
    if target.is_file():
        return [target.relative_to(root)]

    if not target.is_dir():
        return []

    relative_paths: list[Path] = []
    for child in sorted(target.rglob("*")):
        if child.is_file():
            relative_paths.append(child.relative_to(root))
    return relative_paths


def select_project_files(
    setup: ProjectSetup,
    ignore_patterns: list[str],
    candidate_paths: list[Path] | None = None,
    apply_ignore_patterns: bool = True,
    initial_missing_paths: int = 0,
) -> SelectionResult:
    candidates = candidate_paths if candidate_paths is not None else walk_filesystem(setup.root, ignore_patterns)
    relative_paths: list[Path] = []
    ignored_paths = 0
    missing_paths = initial_missing_paths
    seen: set[str] = set()

    for relative_path in candidates:
        path_string = relative_path.as_posix()
        absolute_path = setup.root / relative_path
        if path_string in seen:
            continue
        seen.add(path_string)

        if not absolute_path.is_file():
            missing_paths += 1
            continue
        if apply_ignore_patterns and should_ignore_path(path_string, ignore_patterns):
            ignored_paths += 1
            continue

        relative_paths.append(relative_path)

    relative_paths.sort(key=lambda path: path.as_posix())
    return SelectionResult(
        relative_paths=relative_paths,
        stats=SelectionStats(
            candidate_paths=len(seen) + initial_missing_paths,
            included_paths=len(relative_paths),
            ignored_paths=ignored_paths,
            missing_paths=missing_paths,
        ),
    )


def walk_filesystem(root: Path, ignore_patterns: list[str]) -> list[Path]:
    relative_paths: list[Path] = []
    for current_root, dirnames, filenames in os.walk(root):
        current_root_path = Path(current_root)
        current_relative = current_root_path.relative_to(root)

        filtered_dirnames: list[str] = []
        for dirname in dirnames:
            relative_dir = (current_relative / dirname) if current_relative != Path(".") else Path(dirname)
            if should_ignore_path(f"{relative_dir.as_posix()}/", ignore_patterns):
                continue
            filtered_dirnames.append(dirname)
        dirnames[:] = filtered_dirnames

        for filename in filenames:
            relative_path = (current_relative / filename) if current_relative != Path(".") else Path(filename)
            if should_ignore_path(relative_path.as_posix(), ignore_patterns):
                continue
            relative_paths.append(relative_path)
    return relative_paths


def should_ignore_path(path_string: str, ignore_patterns: list[str]) -> bool:
    ignored = False
    for pattern in ignore_patterns:
        is_negation = pattern.startswith("!")
        match_pattern = pattern[1:] if is_negation else pattern
        if not match_pattern:
            continue

        if matches_ignore_pattern(path_string, match_pattern):
            ignored = not is_negation

    return ignored


def matches_ignore_pattern(path_string: str, pattern: str) -> bool:
    path_name = PurePosixPath(path_string).name
    path_parts = PurePosixPath(path_string).parts

    if pattern.endswith("/"):
        directory = pattern.rstrip("/")
        if "/" in directory:
            if path_string == directory or path_string.startswith(f"{directory}/"):
                return True
            return False
        return directory in path_parts

    if any(char in pattern for char in "*?["):
        if fnmatchcase(path_string, pattern) or fnmatchcase(path_name, pattern):
            return True
        return False

    if "/" in pattern:
        if path_string == pattern:
            return True
        return False

    return path_string == pattern or path_name == pattern


def write_archive(repo_root: Path, relative_paths: list[Path], output_path: Path) -> ArchiveSummary:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(
        output_path,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for relative_path in relative_paths:
            archive.write(repo_root / relative_path, arcname=relative_path.as_posix())

    return ArchiveSummary(
        output_path=output_path,
        file_count=len(relative_paths),
        archive_size_bytes=output_path.stat().st_size,
    )


if __name__ == "__main__":
    raise SystemExit(main())
