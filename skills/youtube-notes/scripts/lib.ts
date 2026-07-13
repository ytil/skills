// Shared helpers for the youtube-notes skill.
//
// The trickiest part here is parsing YouTube auto-generated VTT subtitles. They come
// with two kinds of noise:
//   1. Inline word-level timing tags like `<00:00:00.560><c> word</c>` that need stripping.
//   2. "Rolling" duplication: each finished line is repeated in the next cue as context
//      while a new line is being typed out word by word. Left unhandled you get every
//      sentence 2-3 times.
//
// The approach below strips tags, then drops a line whenever it equals the previous
// emitted line, which collapses the rolling repeats into a clean, timecoded transcript.

import { readFileSync } from "node:fs";

const CUE_RE = /(\d\d:\d\d:\d\d\.\d\d\d)\s*-->\s*(\d\d:\d\d:\d\d\.\d\d\d)/;
const TAG_RE = /<[^>]+>/g;
const SKIP_PREFIXES = ["WEBVTT", "Kind:", "Language:", "NOTE"];

export type SubtitleKind = "manual" | "auto";

export interface Segment {
    start: number;
    text: string;
}

export interface YtMeta {
    id?: string;
    title?: string;
    channel?: string;
    uploader?: string;
    webpage_url?: string;
    duration?: number;
    subtitles?: Record<string, unknown>;
    automatic_captions?: Record<string, unknown>;
}

export function tsToSec(ts: string): number {
    const [h, m, s] = ts.split(":");
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

export function secToStamp(sec: number): string {
    const total = Math.round(sec);
    const h = Math.floor(total / 3600);
    const rem = total % 3600;
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Decode the HTML entities YouTube emits in captions: named (&amp; &lt; &gt; &quot;
// &apos; &nbsp;) plus decimal (&#39;) and hex (&#x27;) numeric references. This is the
// subset that actually shows up in .vtt tracks; anything unknown is left verbatim.
export function htmlUnescape(input: string): string {
    const named: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
    };
    return input.replace(
        /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g,
        (whole, ent: string) => {
            if (ent.startsWith("#x") || ent.startsWith("#X")) {
                const code = parseInt(ent.slice(2), 16);
                return Number.isNaN(code) ? whole : String.fromCodePoint(code);
            }
            if (ent.startsWith("#")) {
                const code = parseInt(ent.slice(1), 10);
                return Number.isNaN(code) ? whole : String.fromCodePoint(code);
            }
            return named[ent] ?? whole;
        },
    );
}

// Return segments (start seconds + one text line) with rolling duplicates removed.
export function parseVtt(path: string): Segment[] {
    const raw = readFileSync(path, "utf-8");

    const segments: Segment[] = [];
    let lastEmitted: string | null = null;
    for (let block of raw.split(/\n[ \t]*\n/)) {
        block = block.replace(/^\n+|\n+$/g, "");
        if (!block) continue;
        let start: number | null = null;
        const contentLines: string[] = [];
        for (const line of block.split("\n")) {
            const m = CUE_RE.exec(line);
            if (m) {
                start = tsToSec(m[1] as string);
                continue;
            }
            if (SKIP_PREFIXES.some((p) => line.startsWith(p))) continue;
            let clean = line.replace(TAG_RE, "");
            clean = htmlUnescape(clean);
            // Drop the ">>" speaker-change markers YouTube injects, collapse whitespace.
            clean = clean.replace(/>>/g, " ");
            clean = clean.replace(/\s+/g, " ").trim();
            if (clean) contentLines.push(clean);
        }
        if (start === null || contentLines.length === 0) continue;
        for (const cl of contentLines) {
            if (cl !== lastEmitted) {
                segments.push({ start, text: cl });
                lastEmitted = cl;
            }
        }
    }
    return segments;
}

// Group raw segments into readable timecoded blocks.
//
// One line per segment is accurate but noisy for a 15-minute video. Instead we coalesce
// consecutive lines into blocks that reset every ~blockSeconds or once they exceed
// ~blockChars, stamping each block with the start time of its first line. Timecodes stay
// accurate enough to locate a moment for a screenshot.
export function formatTranscript(
    segments: Segment[],
    blockSeconds = 12.0,
    blockChars = 240,
): string {
    if (segments.length === 0) return "";
    const blocks: Array<{ start: number; text: string }> = [];
    let curStart = (segments[0] as Segment).start;
    let curWords: string[] = [];
    let curLen = 0;
    for (const { start, text } of segments) {
        if (
            curWords.length &&
            (start - curStart >= blockSeconds || curLen >= blockChars)
        ) {
            blocks.push({ start: curStart, text: curWords.join(" ") });
            curStart = start;
            curWords = [];
            curLen = 0;
        }
        curWords.push(text);
        curLen += text.length + 1;
    }
    if (curWords.length) {
        blocks.push({ start: curStart, text: curWords.join(" ") });
    }
    return blocks.map((b) => `[${secToStamp(b.start)}] ${b.text}`).join("\n");
}

// Choose the best subtitle track. Returns { lang, kind } (kind is 'manual' | 'auto').
//
// Priority: a manual track beats an auto one; within each, the caller's preferred
// language wins, then English, then Russian, then whatever exists. Claude translates to
// Russian afterwards, so the source language only needs to be *some* language we actually
// have — English covers the overwhelming majority of tutorial content.
export function pickSubtitle(
    meta: YtMeta,
    preferredLang?: string | null,
): { lang: string | null; kind: SubtitleKind | null } {
    const manual = meta.subtitles ?? {};
    const auto = meta.automatic_captions ?? {};

    const cleanLangs = (d: Record<string, unknown>): string[] =>
        Object.keys(d).filter((k) => k && k !== "live_chat");

    const tables: Array<[SubtitleKind, Record<string, unknown>]> = [
        ["manual", manual],
        ["auto", auto],
    ];
    for (const [kind, table] of tables) {
        const langs = cleanLangs(table);
        if (langs.length === 0) continue;
        for (const want of [preferredLang, "en", "en-US", "en-orig", "ru"]) {
            if (!want) continue;
            if (langs.includes(want)) return { lang: want, kind };
        }
        // Prefer an English variant if any (e.g. 'en-GB'), else first available.
        const enVariant = langs.find((l) => l.toLowerCase().startsWith("en"));
        return { lang: enVariant ?? (langs[0] as string), kind };
    }
    return { lang: null, kind: null };
}
