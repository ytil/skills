// The video.json contract — single source of truth for a distilled video note.
//
// Claude writes video.json after distillation; render_obsidian.ts and render_html.ts
// both consume it, so the two outputs can never drift apart and either can be rebuilt
// without re-analysis. This module owns the types and the validation gate.
//
// Validation philosophy (same as cite_timecodes.ts): anything that would put a wrong
// fact in front of the user — a quote the transcript doesn't confirm, a timecode past
// the end of the video, a screenshot file that doesn't exist — fails loudly BEFORE
// rendering, listing every problem at once.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
    containment,
    loadTranscript,
    secToStamp,
    type LoadedTranscript,
} from "./lib.ts";

export interface VideoInfo {
    id: string;
    url: string;
    title: string;
    channel?: string;
    duration: number; // seconds
}

export interface Quote {
    text_ru: string; // translated quote shown in the note
    orig: string; // verbatim line from the transcript — grounds the quote
    t: number; // seconds; deep-link target
}

export interface Idea {
    tldr_ru: string; // the thesis, one sentence — rendered bold
    points_ru?: string[]; // 2-4 supporting bullets
    screenshot?: string; // frame filename inside <workdir>/frames
    quote?: Quote;
    mermaid?: string; // mermaid source, only when the idea's SHAPE earns a diagram
    callout?: "tip" | "warning"; // renders the idea as a highlighted block; use sparingly
}

export interface Section {
    title_ru: string;
    t: number | null; // seconds where the section starts; null → no deep link
    ideas: Idea[];
}

export interface VideoNotes {
    schema_version: "video-notes-1";
    video: VideoInfo;
    sections: Section[];
}

export function deepLink(url: string, t: number): string {
    return `${url}${url.includes("?") ? "&" : "?"}t=${Math.round(t)}s`;
}

export function stampOf(t: number): string {
    return secToStamp(t);
}

export function loadNotes(path: string): VideoNotes {
    const data = JSON.parse(readFileSync(path, "utf-8")) as VideoNotes;
    if (data.schema_version !== "video-notes-1") {
        throw new Error(
            `unsupported schema_version: ${String((data as { schema_version?: unknown }).schema_version)}`,
        );
    }
    return data;
}

const QUOTE_MATCH_THRESHOLD = 0.5;

// Validate the whole document; returns a list of human-readable problems (empty = ok).
// `framesDir` — where screenshots live; `transcriptPath` — the cleaned transcript used
// to ground quotes. Either may be null to skip the respective checks (e.g. re-rendering
// HTML long after the workdir is gone).
export function validateNotes(
    notes: VideoNotes,
    framesDir: string | null,
    transcriptPath: string | null,
): string[] {
    const problems: string[] = [];
    const v = notes.video ?? ({} as VideoInfo);
    for (const field of ["id", "url", "title"] as const) {
        if (!v[field]) problems.push(`video.${field} is missing`);
    }
    if (!(v.duration > 0)) problems.push("video.duration must be > 0");

    if (!Array.isArray(notes.sections) || notes.sections.length < 2) {
        problems.push("need at least 2 sections (aim for 4-8)");
        return problems;
    }
    if (notes.sections.length > 10) {
        problems.push(`${notes.sections.length} sections — too many, merge to <=10`);
    }

    let tx: LoadedTranscript | null = null;
    if (transcriptPath) {
        try {
            tx = loadTranscript(transcriptPath);
        } catch {
            problems.push(`cannot read transcript at ${transcriptPath}`);
        }
    }

    const checkT = (t: number, where: string): void => {
        if (!(t >= 0) || t > v.duration + 5) {
            problems.push(`${where}: t=${t}s is outside the video (0..${v.duration}s)`);
        }
    };

    notes.sections.forEach((s, si) => {
        const sid = `sections[${si}] "${(s.title_ru ?? "").slice(0, 30)}"`;
        if (!s.title_ru?.trim()) problems.push(`${sid}: empty title_ru`);
        if (s.t !== null && s.t !== undefined) checkT(s.t, sid);
        if (!s.ideas?.length) {
            problems.push(`${sid}: no ideas`);
            return;
        }
        if (s.ideas.length > 8) problems.push(`${sid}: ${s.ideas.length} ideas — split the section`);
        s.ideas.forEach((idea, ii) => {
            const iid = `${sid}.ideas[${ii}]`;
            if (!idea.tldr_ru?.trim()) problems.push(`${iid}: empty tldr_ru`);
            if (idea.points_ru && idea.points_ru.length > 5) {
                problems.push(`${iid}: ${idea.points_ru.length} points — distill to <=4`);
            }
            if (idea.mermaid?.includes("```")) {
                problems.push(`${iid}: mermaid source must not contain \`\`\` fences`);
            }
            if (idea.screenshot && framesDir) {
                if (!existsSync(join(framesDir, idea.screenshot))) {
                    problems.push(`${iid}: screenshot ${idea.screenshot} not found in ${framesDir}`);
                }
            }
            const q = idea.quote;
            if (q) {
                checkT(q.t, `${iid}.quote`);
                if (!q.text_ru?.trim() || !q.orig?.trim()) {
                    problems.push(`${iid}.quote: text_ru and orig are both required`);
                } else if (tx) {
                    // Ground the quote: its verbatim `orig` must match the transcript
                    // around t (the stamped block or a neighbour — timecodes are block-
                    // granular). Same containment logic as the свод validation gate.
                    const idx = nearestBlock(tx, q.t);
                    const cand = [idx - 1, idx, idx + 1]
                        .filter((j) => j >= 0 && j < tx!.blocks.length)
                        .map((j) => tx!.blocks[j]!.text);
                    const best = Math.max(0, ...cand.map((c) => containment(q.orig, c)));
                    if (best < QUOTE_MATCH_THRESHOLD) {
                        problems.push(
                            `${iid}.quote: orig not found in transcript near [${secToStamp(q.t)}] ` +
                                `(best match ${(best * 100).toFixed(0)}%) — fix t or drop the quote`,
                        );
                    }
                }
            }
        });
    });
    return problems;
}

function nearestBlock(tx: LoadedTranscript, t: number): number {
    let best = 0;
    let bestDist = Infinity;
    tx.blocks.forEach((b, i) => {
        const d = Math.abs(b.sec - t);
        if (d < bestDist) {
            bestDist = d;
            best = i;
        }
    });
    return best;
}
