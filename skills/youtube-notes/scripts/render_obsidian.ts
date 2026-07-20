#!/usr/bin/env node
// Render video.json into an Obsidian note and (optionally) save it into the vault.
//
// Usage:
//     node render_obsidian.ts <video.json> <workdir> --dry-run
//     node render_obsidian.ts <video.json> <workdir> \
//         --vault <vault_dir> --attachments <dir> --name "<note name>" --slug <slug>
//
// --dry-run prints the note to stdout with raw frame filenames — for review before
// the name is confirmed. The real run copies the referenced frames into the vault's
// attachments folder as <slug>-01.png, <slug>-02.png, ... (collision-safe: bumps the
// number if a name is taken), rewrites the embeds, and writes <vault>/<name>.md.
// It refuses to overwrite an existing note.
//
// Note shape (see references/note-format.md):
//   # Core ideas
//   ## [Секция](url&t=..s)            ← deep link when section.t is set
//   - **тезис** + tab-indented points ← idea card
//   ![[slug-NN.png]]                  ← screenshot bound to its idea
//   > [!quote] [M:SS](url&t=..s)      ← grounded quote
//   > [!tip] / ```mermaid             ← sparse highlights
//   # Links

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
    deepLink,
    loadNotes,
    stampOf,
    validateNotes,
    type Idea,
    type VideoNotes,
} from "./note_model.ts";

function die(msg: string, code = 1): never {
    console.error(`ERROR: ${msg}`);
    process.exit(code);
}

function renderIdea(
    idea: Idea,
    url: string,
    embedName: (frame: string) => string,
): string {
    const parts: string[] = [];
    const bulletBlock = (): string => {
        const lines = [`- **${idea.tldr_ru.trim()}**`];
        for (const p of idea.points_ru ?? []) lines.push(`\t- ${p.trim()}`);
        return lines.join("\n");
    };
    if (idea.callout) {
        // A highlighted card: the callout body carries the thesis and its points.
        const lines = [`> [!${idea.callout}] ${idea.tldr_ru.trim()}`];
        for (const p of idea.points_ru ?? []) lines.push(`> - ${p.trim()}`);
        parts.push(lines.join("\n"));
    } else {
        parts.push(bulletBlock());
    }
    if (idea.screenshot) parts.push(`![[${embedName(idea.screenshot)}]]`);
    if (idea.mermaid)
        parts.push("```mermaid\n" + idea.mermaid.trim() + "\n```");
    if (idea.quote) {
        const q = idea.quote;
        parts.push(
            `> [!quote] [${stampOf(q.t)}](${deepLink(url, q.t)})\n> ${q.text_ru.trim()}`,
        );
    }
    return parts.join("\n\n");
}

export function renderNote(
    notes: VideoNotes,
    embedName: (frame: string) => string,
): string {
    const url = notes.video.url;
    const out: string[] = ["# Core ideas"];
    for (const s of notes.sections) {
        const header =
            s.t !== null && s.t !== undefined
                ? `## [${s.title_ru.trim()}](${deepLink(url, s.t)})`
                : `## ${s.title_ru.trim()}`;
        out.push("", header, "");
        out.push(
            s.ideas.map((i) => renderIdea(i, url, embedName)).join("\n\n"),
        );
    }
    out.push("", "# Links", `- [${notes.video.title}](${url})`, "");
    return out.join("\n");
}

function main(): void {
    const argv = process.argv.slice(2);
    if (argv.length < 2) {
        die(
            "usage: render_obsidian.ts <video.json> <workdir> " +
                '(--dry-run | --vault <dir> --attachments <dir> --name "<note name>" --slug <slug>)',
        );
    }
    const notesPath = argv[0] as string;
    const workdir = argv[1] as string;
    const getOpt = (name: string): string | null => {
        const i = argv.indexOf(name);
        return i !== -1 && i + 1 < argv.length ? (argv[i + 1] as string) : null;
    };
    const dryRun = argv.includes("--dry-run");

    const notes = loadNotes(notesPath);
    const framesDir = join(workdir, "frames");
    // transcript.txt lives in the workdir for the single-video flow.
    const transcriptPath = join(workdir, "transcript.txt");
    const problems = validateNotes(
        notes,
        existsSync(framesDir) ? framesDir : null,
        existsSync(transcriptPath) ? transcriptPath : null,
    );
    if (problems.length) {
        console.error(`VALIDATION FAILED — ${problems.length} problem(s):`);
        for (const p of problems) console.error(`  ✗ ${p}`);
        process.exit(1);
    }

    if (dryRun) {
        process.stdout.write(renderNote(notes, (f) => f));
        console.error("\n--dry-run: nothing written (frame names shown raw)");
        return;
    }

    const vault = getOpt("--vault");
    const attachments = getOpt("--attachments");
    const name = getOpt("--name");
    const slug = getOpt("--slug");
    if (!vault || !attachments || !name || !slug) {
        die(
            "real run needs --vault, --attachments, --name and --slug (or use --dry-run)",
        );
    }
    if (!existsSync(vault)) die(`vault dir not found: ${vault}`);
    if (!existsSync(attachments))
        die(`attachments dir not found: ${attachments}`);
    const notePath = join(vault, `${name}.md`);
    if (existsSync(notePath)) {
        die(
            `note already exists: ${notePath} — pick another name, not overwriting`,
        );
    }

    // Copy each referenced frame to a clean collision-safe attachment name, in
    // note order, and remember the mapping for the embeds.
    const mapping = new Map<string, string>();
    let n = 0;
    const nextFree = (): string => {
        for (;;) {
            n++;
            const cand = `${slug}-${String(n).padStart(2, "0")}.png`;
            if (!existsSync(join(attachments, cand))) return cand;
        }
    };
    for (const s of notes.sections) {
        for (const idea of s.ideas) {
            if (idea.screenshot && !mapping.has(idea.screenshot)) {
                const target = nextFree();
                copyFileSync(
                    join(framesDir, idea.screenshot),
                    join(attachments, target),
                );
                mapping.set(idea.screenshot, target);
            }
        }
    }

    writeFileSync(
        notePath,
        renderNote(notes, (f) => mapping.get(f) ?? f),
    );
    console.error(`Note:        ${notePath}`);
    console.error(
        `Screenshots: ${mapping.size} → ${attachments} (${slug}-01..)`,
    );
}

// Allow importing renderNote from render_html/tests without running the CLI.
if (process.argv[1] && import.meta.filename === process.argv[1]) {
    main();
}
