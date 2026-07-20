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

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const MAX_BUFFER = 128 * 1024 * 1024;

// Absolute path to the skill's setup/restore script, so dependency-missing errors can
// point the user at the exact command to fix them. All scripts live in this same dir.
export const INIT_SCRIPT = join(import.meta.dirname, "init.sh");

// True if `cmd` is resolvable on PATH.
export function haveCommand(cmd: string): boolean {
    return spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0;
}

// Fail fast with an actionable message when a required external CLI isn't installed.
// The scripts shell out to yt-dlp / ffmpeg; a raw ENOENT deep in a spawn is opaque, so
// we check up front and route the user to init.sh.
export function requireCommand(cmd: string, brewPkg?: string): void {
    if (haveCommand(cmd)) return;
    const hint = brewPkg ? ` (or: brew install ${brewPkg})` : "";
    console.error(
        `ERROR: '${cmd}' is not installed. Run: bash "${INIT_SCRIPT}"${hint}`,
    );
    process.exit(1);
}

// yt-dlp/network failures worth retrying: YouTube rate-limits subtitle downloads
// aggressively (429), and transient 5xx / connection drops happen on big playlists.
const TRANSIENT_RE =
    /HTTP Error 429|Too Many Requests|HTTP Error 5\d\d|urlopen error|timed out|Temporary failure|Connection (reset|refused)/i;

function sleepSync(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// spawnSync wrapper with a hard timeout — a hung yt-dlp/ffmpeg (stalled network read)
// otherwise blocks the script forever — and optional retries with linear backoff when
// the failure looks transient (rate limit, 5xx, drop, or the timeout itself).
export function runCmd(
    cmd: string,
    args: string[],
    opts: { timeoutMs: number; retries?: number; retryDelayMs?: number },
): SpawnSyncReturns<string> {
    const retries = opts.retries ?? 0;
    for (let attempt = 0; ; attempt++) {
        const r = spawnSync(cmd, args, {
            encoding: "utf-8",
            maxBuffer: MAX_BUFFER,
            timeout: opts.timeoutMs,
        });
        const failed = r.status !== 0 || r.error !== undefined;
        const timedOut =
            (r.error as NodeJS.ErrnoException | undefined)?.code ===
            "ETIMEDOUT";
        const transient =
            timedOut ||
            TRANSIENT_RE.test(`${r.stderr ?? ""} ${r.error?.message ?? ""}`);
        if (!failed || !transient || attempt >= retries) return r;
        const delay = (opts.retryDelayMs ?? 10_000) * (attempt + 1);
        console.error(
            `  … ${cmd} hit a transient failure (${timedOut ? "timeout" : "rate limit / network"}), ` +
                `retry ${attempt + 1}/${retries} in ${Math.round(delay / 1000)}s`,
        );
        sleepSync(delay);
    }
}

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
    language?: string;
    chapters?: Array<{ title?: string; start_time?: number }> | null;
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

// Inverse of secToStamp: parse a display stamp ("M:SS" or "H:MM:SS", with or without
// surrounding [brackets]) back into seconds. Returns null if the string isn't a timecode —
// used to turn the `[M:SS]` block stamps in a cleaned transcript into `&t=<sec>s` links.
export function stampToSec(stamp: string): number | null {
    const s = stamp
        .trim()
        .replace(/^\[|\]$/g, "")
        .trim();
    if (!/^\d+(?::\d{1,2}){1,2}$/.test(s)) return null;
    const parts = s.split(":").map(Number);
    if (parts.some((n) => Number.isNaN(n))) return null;
    return parts.length === 2
        ? parts[0]! * 60 + parts[1]!
        : parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
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

// ---- Cleaned-transcript helpers (the `[M:SS] text` block format) ----
// Shared by cite_timecodes.ts (свод deep-linking) and note_model.ts (quote grounding).

export const STAMP_LINE_RE = /^\[(\d+(?::\d+){1,2})\]\s*(.*)$/;

export interface TranscriptBlock {
    stamp: string;
    sec: number;
    text: string;
}

export interface LoadedTranscript {
    blocks: TranscriptBlock[];
    byStamp: Map<string, number>;
    duration: number | null;
}

export function loadTranscript(path: string): LoadedTranscript {
    const blocks: TranscriptBlock[] = [];
    let duration: number | null = null;
    for (const raw of readFileSync(path, "utf-8").split("\n")) {
        const dm = /^DURATION:\s*(.+)$/.exec(raw);
        if (dm) duration = stampToSec((dm[1] as string).trim());
        const bm = STAMP_LINE_RE.exec(raw);
        if (bm) {
            const stamp = bm[1] as string;
            blocks.push({
                stamp,
                sec: stampToSec(stamp) ?? 0,
                text: bm[2] as string,
            });
        }
    }
    const byStamp = new Map<string, number>();
    blocks.forEach((b, i) => byStamp.set(b.stamp, i));
    return { blocks, byStamp, duration };
}

const normText = (t: string): string =>
    (t || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();

// Fraction of the smaller word-set that the two strings share — robust to light
// paraphrase/trimming while still catching a wrong transcript block.
export function containment(a: string, b: string): number {
    const A = new Set(normText(a).split(" ").filter(Boolean));
    const B = new Set(normText(b).split(" ").filter(Boolean));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const w of A) if (B.has(w)) inter++;
    return inter / Math.min(A.size, B.size);
}

// Choose the best subtitle track. Returns { lang, kind } (kind is 'manual' | 'auto').
//
// Priority: a manual track beats an auto one; within each, the caller's preferred
// language wins, then the video's ORIGINAL language, then English, then Russian, then
// whatever exists. The original-language step matters because YouTube's auto-caption
// table lists dozens of machine-TRANSLATED tracks: for a Russian video it offers both
// "ru" (original) and "en" (machine translation of it), and blindly preferring English
// would pick the doubly-degraded translation. Claude translates to Russian afterwards,
// so the source only needs to be faithful, not English.
export function pickSubtitle(
    meta: YtMeta,
    preferredLang?: string | null,
): { lang: string | null; kind: SubtitleKind | null } {
    const manual = meta.subtitles ?? {};
    const auto = meta.automatic_captions ?? {};
    const orig = meta.language ? (meta.language.split("-")[0] as string) : null;

    const cleanLangs = (d: Record<string, unknown>): string[] =>
        Object.keys(d).filter((k) => k && k !== "live_chat");

    const tables: Array<[SubtitleKind, Record<string, unknown>]> = [
        ["manual", manual],
        ["auto", auto],
    ];
    for (const [kind, table] of tables) {
        const langs = cleanLangs(table);
        if (langs.length === 0) continue;
        for (const want of [preferredLang, orig && `${orig}-orig`, orig]) {
            if (!want) continue;
            if (langs.includes(want)) return { lang: want, kind };
        }
        // The `xx-orig` auto track is the untranslated original even when meta.language
        // is absent — prefer it over any machine-translated track.
        const origTrack = langs.find((l) => l.toLowerCase().endsWith("-orig"));
        if (origTrack) return { lang: origTrack, kind };
        for (const want of ["en", "en-US", "ru"]) {
            if (langs.includes(want)) return { lang: want, kind };
        }
        // Prefer an English variant if any (e.g. 'en-GB'), else first available.
        const enVariant = langs.find((l) => l.toLowerCase().startsWith("en"));
        return { lang: enVariant ?? (langs[0] as string), kind };
    }
    return { lang: null, kind: null };
}
