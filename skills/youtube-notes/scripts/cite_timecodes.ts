#!/usr/bin/env node
// Turn the [N] footnotes in a multi-video "свод" note into clickable links that jump to
// the exact timecode of the source video where each idea is discussed.
//
// The note carries academic-style citations ([13], [40][22], ...) and a "# Источники"
// list mapping each number to a video URL. On a long video a link to the start is nearly
// useless, so we deep-link: [\[13\]](https://www.youtube.com/watch?v=...&t=336s).
//
// Two phases; the fuzzy semantic step in between is done by Claude/subagents, not here:
//
//   plan   node cite_timecodes.ts plan  <note.md> <transcripts_dir> <workdir> [--per-bin 18]
//          Parse the footnotes + "# Источники" list, group every citation by its source
//          video, and write one agent task file per bin (<workdir>/tasks/task_NN.json),
//          plus occ.json + manifest.json. Each task lists, per video, the ideas that cite
//          it and the path to that video's <id>.txt transcript.
//
//   ——     Claude then spawns one matcher agent per task file. Each reads the transcript,
//          finds the [M:SS] block where each idea is stated, and writes
//          <workdir>/res/res_NN.json — a list of {occ_id, vid, stamp, line, confidence}.
//          See references/aggregation.md for the exact agent prompt.
//
//   apply  node cite_timecodes.ts apply <note.md> <transcripts_dir> <workdir>
//          Validate every match against that video's OWN transcript — the stamp and the
//          quoted line must exist there verbatim, which discards hallucinations and
//          cross-video mixups (a stamp-only check can't: every video has a [4:05]). Then
//          rewrite the note so each footnote deep-links to its timecode. Anything with low
//          confidence, a null stamp, or a failed check falls back to a plain [\[N\]](url)
//          video link — still clickable, just no timecode (zero regression). The note is
//          backed up next to itself first.

import {
    copyFileSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

import { stampToSec } from "./lib.ts";

const SOURCES_HEADERS = ["# Источники", "# Links", "# Sources"];
// A footnote is either the already-clickable form [\[N\]](url) or a bare [N] not followed
// by "(" (so we don't mistake a markdown link's text for a citation). Tried in that order.
const CITE_RE =
    /\[\\\[(\d+)\\\]\]\((https?:\/\/[^)]+?)\)|\[(\d+)\](?!\()/g;
const SRC_LINE_RE = /^\s*(\d+)\.\s+\[[^\]]*\]\((https?:\/\/[^)]+)\)/;
const STAMP_LINE_RE = /^\[(\d+(?::\d+){1,2})\]\s*(.*)$/;

interface Occurrence {
    occ_id: number;
    n: number;
    video_id: string | null;
    idea: string;
    consensus: boolean;
}

interface Sources {
    map: Map<number, { url: string; video_id: string | null }>;
    headerIdx: number;
}

interface MatchRecord {
    occ_id: number;
    vid?: string;
    stamp?: string | null;
    line?: string;
    confidence?: string;
}

function videoIdOf(url: string): string | null {
    return /[?&]v=([\w-]+)/.exec(url)?.[1] ?? null;
}

function readNote(path: string): { lines: string[]; sources: Sources } {
    const lines = readFileSync(path, "utf-8").split("\n");
    const headerIdx = lines.findIndex((l) =>
        SOURCES_HEADERS.includes(l.trim()),
    );
    if (headerIdx === -1) {
        throw new Error(
            `no sources section found (expected one of: ${SOURCES_HEADERS.join(", ")})`,
        );
    }
    const map = new Map<number, { url: string; video_id: string | null }>();
    for (const l of lines.slice(headerIdx)) {
        const m = SRC_LINE_RE.exec(l);
        if (m) {
            const n = Number(m[1]);
            const url = m[2] as string;
            map.set(n, { url, video_id: videoIdOf(url) });
        }
    }
    return { lines, sources: { map, headerIdx } };
}

// Strip a body line down to the idea text: remove citation markup, the *(консенсус)*
// marker, leading list/emphasis punctuation, and collapse whitespace.
function ideaOf(line: string): string {
    return line
        .replace(CITE_RE, "")
        .replace(/\*\(консенсус\)\*/g, "")
        .replace(/\s+/g, " ")
        .replace(/^[\s\t*\-]+/, "")
        .trim();
}

// Walk the body (everything above the sources header) and yield one entry per citation,
// in reading order — the occ_id is the index in this order, which both phases rely on.
function occurrences(lines: string[], sources: Sources): Occurrence[] {
    const body = lines.slice(0, sources.headerIdx);
    const occ: Occurrence[] = [];
    for (const line of body) {
        CITE_RE.lastIndex = 0;
        if (!CITE_RE.test(line)) continue;
        const idea = ideaOf(line);
        const consensus = line.includes("консенсус");
        CITE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = CITE_RE.exec(line))) {
            const n = Number(m[1] ?? m[3]);
            occ.push({
                occ_id: occ.length,
                n,
                video_id: sources.map.get(n)?.video_id ?? null,
                idea,
                consensus,
            });
        }
    }
    return occ;
}

function transcriptPath(dir: string, vid: string): string {
    return join(dir, `${vid}.txt`);
}

// ---------------------------------------------------------------- plan

function plan(note: string, transcriptsDir: string, workdir: string, perBin: number): void {
    const { lines, sources } = readNote(note);
    const occ = occurrences(lines, sources);

    // Group occurrences by source video.
    const byVideo = new Map<string, Occurrence[]>();
    let unmapped = 0;
    for (const o of occ) {
        if (!o.video_id) {
            unmapped++;
            continue;
        }
        (byVideo.get(o.video_id) ?? byVideo.set(o.video_id, []).get(o.video_id)!).push(o);
    }

    // Greedy bin-packing: aim for ~perBin citations per bin, and never put two
    // heavily-cited videos (>= perBin/2) in the same bin so a matcher agent focused on a
    // dense video isn't also juggling another one.
    const videos = [...byVideo.entries()]
        .map(([video_id, ideas]) => ({ video_id, ideas, n: ideas.length }))
        .sort((a, b) => b.n - a.n);
    const heavy = (n: number) => n >= Math.ceil(perBin / 2);
    const bins: Array<Array<(typeof videos)[number]>> = [];
    for (const v of videos) {
        let placed = false;
        for (const b of bins) {
            const load = b.reduce((s, x) => s + x.n, 0);
            if (load + v.n <= perBin && !(heavy(v.n) && b.some((x) => heavy(x.n)))) {
                b.push(v);
                placed = true;
                break;
            }
        }
        if (!placed) bins.push([v]);
    }

    mkdirSync(join(workdir, "tasks"), { recursive: true });
    mkdirSync(join(workdir, "res"), { recursive: true });
    const manifest = bins.map((b, i) => ({
        bin: i,
        task: join(workdir, "tasks", `task_${String(i).padStart(2, "0")}.json`),
        res: join(workdir, "res", `res_${String(i).padStart(2, "0")}.json`),
        videos: b.map((x) => x.video_id),
        citations: b.reduce((s, x) => s + x.n, 0),
    }));
    bins.forEach((b, i) => {
        const task = {
            bin: i,
            videos: b.map((x) => ({
                video_id: x.video_id,
                txt: transcriptPath(transcriptsDir, x.video_id),
                ideas: x.ideas.map((o) => ({
                    occ_id: o.occ_id,
                    idea: o.idea,
                    consensus: o.consensus,
                })),
            })),
        };
        writeFileSync(manifest[i]!.task, JSON.stringify(task, null, 1));
    });
    writeFileSync(join(workdir, "occ.json"), JSON.stringify(occ, null, 1));
    writeFileSync(join(workdir, "manifest.json"), JSON.stringify(manifest, null, 2));

    console.error(`Citations: ${occ.length}  Videos: ${byVideo.size}  Bins: ${bins.length}`);
    if (unmapped) console.error(`  ⚠ ${unmapped} citations have no matching source-list URL`);
    for (const m of manifest) {
        console.error(`  bin ${String(m.bin).padStart(2, "0")}: ${m.videos.length} video(s), ${m.citations} cites`);
    }
    console.error(`\nTask files → ${join(workdir, "tasks")}/`);
    console.error(`Next: spawn one matcher agent per task file (see references/aggregation.md),`);
    console.error(`then: node cite_timecodes.ts apply "${note}" "${transcriptsDir}" "${workdir}"`);
}

// --------------------------------------------------------------- apply

interface Block {
    stamp: string;
    sec: number;
    text: string;
}

function loadTranscript(path: string): { blocks: Block[]; byStamp: Map<string, number>; duration: number | null } {
    const blocks: Block[] = [];
    let duration: number | null = null;
    for (const raw of readFileSync(path, "utf-8").split("\n")) {
        const dm = /^DURATION:\s*(.+)$/.exec(raw);
        if (dm) duration = stampToSec((dm[1] as string).trim());
        const bm = STAMP_LINE_RE.exec(raw);
        if (bm) {
            const stamp = bm[1] as string;
            blocks.push({ stamp, sec: stampToSec(stamp) ?? 0, text: bm[2] as string });
        }
    }
    const byStamp = new Map<string, number>();
    blocks.forEach((b, i) => byStamp.set(b.stamp, i));
    return { blocks, byStamp, duration };
}

const norm = (t: string): string =>
    (t || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// Fraction of the smaller word-set that the two strings share — robust to an agent
// trimming or lightly paraphrasing the quoted line while still catching a wrong block.
function containment(a: string, b: string): number {
    const A = new Set(norm(a).split(" ").filter(Boolean));
    const B = new Set(norm(b).split(" ").filter(Boolean));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const w of A) if (B.has(w)) inter++;
    return inter / Math.min(A.size, B.size);
}

function apply(note: string, transcriptsDir: string, workdir: string): void {
    const { lines, sources } = readNote(note);
    const occ = occurrences(lines, sources);

    // Collect agent results, keyed by occ_id (last one wins if duplicated).
    const resDir = join(workdir, "res");
    const records = new Map<number, MatchRecord>();
    let resFiles = 0;
    for (const f of readdirSync(resDir).filter((f) => /^res_.*\.json$/.test(f))) {
        resFiles++;
        const arr = JSON.parse(readFileSync(join(resDir, f), "utf-8")) as MatchRecord[];
        for (const r of arr) records.set(r.occ_id, r);
    }

    const transcripts = new Map<string, ReturnType<typeof loadTranscript>>();
    const getTx = (vid: string) => {
        if (!transcripts.has(vid)) transcripts.set(vid, loadTranscript(transcriptPath(transcriptsDir, vid)));
        return transcripts.get(vid)!;
    };

    // occ_id -> validated seconds
    const good = new Map<number, number>();
    const reasons: Record<string, number> = {
        ok: 0, no_record: 0, wrong_vid: 0, low_conf: 0, null_stamp: 0,
        bad_stamp: 0, over_dur: 0, line_mismatch: 0,
    };
    for (const o of occ) {
        const r = records.get(o.occ_id);
        if (!r) { reasons.no_record!++; continue; }
        if (o.video_id && r.vid && r.vid !== o.video_id) { reasons.wrong_vid!++; continue; }
        if ((r.confidence ?? "").toLowerCase() === "low") { reasons.low_conf!++; continue; }
        if (!r.stamp) { reasons.null_stamp!++; continue; }
        const sec = stampToSec(r.stamp);
        if (sec === null) { reasons.bad_stamp!++; continue; }
        const vid = o.video_id ?? r.vid;
        if (!vid) { reasons.wrong_vid!++; continue; }
        let tx: ReturnType<typeof loadTranscript>;
        try { tx = getTx(vid); } catch { reasons.bad_stamp!++; continue; }
        const key = r.stamp.trim().replace(/^\[|\]$/g, "");
        const idx = tx.byStamp.get(key);
        if (idx === undefined) { reasons.bad_stamp!++; continue; }
        if (tx.duration && sec > tx.duration + 5) { reasons.over_dur!++; continue; }
        const cand = [idx - 1, idx, idx + 1]
            .filter((j) => j >= 0 && j < tx.blocks.length)
            .map((j) => tx.blocks[j]!.text);
        const best = Math.max(0, ...cand.map((c) => containment(r.line ?? "", c)));
        if (best < 0.5) { reasons.line_mismatch!++; continue; }
        good.set(o.occ_id, sec);
        reasons.ok!++;
    }

    // Rewrite the body in reading order; the k-th citation is occ_id k.
    const headerIdx = sources.headerIdx;
    const body = lines.slice(0, headerIdx).join("\n");
    const tail = lines.slice(headerIdx).join("\n");
    let k = 0;
    let added = 0;
    let plainCount = 0;
    const newBody = body.replace(CITE_RE, (whole, n1, url1, n3) => {
        const occId = k++;
        const n = Number(n1 ?? n3);
        const base = (url1 as string | undefined) ?? sources.map.get(n)?.url;
        if (!base) return whole; // no known URL; leave as-is
        const clean = base.replace(/&t=\d+s$/, ""); // idempotent on re-runs
        const sec = good.get(occId);
        if (sec !== undefined) { added++; return `[\\[${n}\\]](${clean}&t=${sec}s)`; }
        plainCount++;
        return `[\\[${n}\\]](${clean})`;
    });

    if (k !== occ.length) {
        throw new Error(`citation count mismatch: rewrite saw ${k}, plan saw ${occ.length}`);
    }

    const backup = join(dirname(note), `.${basename(note)}.bak`);
    copyFileSync(note, backup);
    writeFileSync(note, `${newBody}\n${tail}`);

    console.error(`Result files: ${resFiles}   Citations: ${occ.length}`);
    console.error(`Timecoded: ${added}   Plain video link: ${plainCount}`);
    console.error("Validation breakdown:");
    for (const [key, v] of Object.entries(reasons)) if (v) console.error(`  ${key}: ${v}`);
    console.error(`\nBackup: ${backup}`);
    console.error(`Note rewritten: ${note}`);
}

// ----------------------------------------------------------------- cli

function main(): void {
    const argv = process.argv.slice(2);
    const mode = argv[0];
    const rest = argv.slice(1);
    const perBinArg = rest.indexOf("--per-bin");
    let perBin = 18;
    if (perBinArg !== -1) {
        perBin = Number(rest[perBinArg + 1]);
        rest.splice(perBinArg, 2);
    }
    const [note, transcriptsDir, workdir] = rest;
    if ((mode !== "plan" && mode !== "apply") || !note || !transcriptsDir || !workdir) {
        console.error("usage: cite_timecodes.ts plan|apply <note.md> <transcripts_dir> <workdir> [--per-bin 18]");
        process.exit(1);
    }
    if (mode === "plan") plan(note, transcriptsDir, workdir, perBin);
    else apply(note, transcriptsDir, workdir);
}

main();
