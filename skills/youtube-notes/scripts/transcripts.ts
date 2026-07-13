#!/usr/bin/env node
// Batch-download and clean transcripts for many videos — subtitles only, no video.
//
// Usage:
//     node transcripts.ts <workdir> <url1> <url2> ...
//
// For each URL: fetch metadata, pick the best subtitle track, download it, clean it into a
// timecoded transcript, and write <workdir>/<id>.txt with a small header. Writes an
// index.json summarizing every video (including failures) so a caller can see at a glance
// what succeeded and what has no captions.
//
// This is the lightweight path used when you need the words but not the visuals — e.g.
// synthesizing key ideas across a playlist into one document.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
    formatTranscript,
    parseVtt,
    pickSubtitle,
    secToStamp,
    type YtMeta,
} from "./lib.ts";

const MAX_BUFFER = 128 * 1024 * 1024;

interface Entry {
    id?: string;
    title?: string;
    channel?: string | null;
    url: string;
    duration_stamp?: string;
    status: "ok" | "no_subtitles" | "error";
    error?: string;
    transcript_path?: string;
    lang?: string;
    blocks?: number;
}

function run(cmd: string, args: string[]): SpawnSyncReturns<string> {
    return spawnSync(cmd, args, { encoding: "utf-8", maxBuffer: MAX_BUFFER });
}

function process_(url: string, workdir: string): Entry {
    const r = run("yt-dlp", ["--dump-single-json", "--skip-download", url]);
    if (r.status !== 0) {
        return { url, status: "error", error: r.stderr.trim().slice(-200) };
    }
    const meta = JSON.parse(r.stdout) as YtMeta;
    const vid = meta.id ?? "unknown";
    const entry: Entry = {
        id: vid,
        title: meta.title ?? "",
        channel: meta.channel ?? meta.uploader ?? null,
        url: meta.webpage_url ?? url,
        duration_stamp: secToStamp(meta.duration ?? 0),
        status: "no_subtitles",
    };

    const { lang, kind } = pickSubtitle(meta);
    if (!lang || !kind) {
        entry.status = "no_subtitles";
        return entry;
    }

    const flag = kind === "manual" ? "--write-subs" : "--write-auto-subs";
    const out = join(workdir, `${vid}.%(ext)s`);
    run("yt-dlp", [
        "--skip-download",
        flag,
        "--sub-langs",
        lang,
        "--sub-format",
        "vtt/best",
        "-o",
        out,
        url,
    ]);
    const vtts = readdirSync(workdir).filter(
        (f) => f.startsWith(`${vid}.`) && f.endsWith(".vtt"),
    );
    if (vtts.length === 0) {
        entry.status = "no_subtitles";
        return entry;
    }

    const transcript = formatTranscript(
        parseVtt(join(workdir, vtts[0] as string)),
    );
    const txtPath = join(workdir, `${vid}.txt`);
    writeFileSync(
        txtPath,
        `TITLE: ${entry.title}\n` +
            `CHANNEL: ${entry.channel}\n` +
            `URL: ${entry.url}\n` +
            `DURATION: ${entry.duration_stamp}\n` +
            "---\n" +
            transcript +
            "\n",
    );
    entry.status = "ok";
    entry.transcript_path = txtPath;
    entry.lang = lang;
    entry.blocks = transcript ? transcript.split("\n").length : 0;
    return entry;
}

function main(): void {
    const argv = process.argv.slice(2);
    if (argv.length < 2) {
        console.error("usage: transcripts.ts <workdir> <url>...");
        process.exit(1);
    }
    const workdir = argv[0] as string;
    const urls = argv.slice(1);
    mkdirSync(workdir, { recursive: true });

    const index: Entry[] = [];
    urls.forEach((url, i) => {
        const entry = process_(url, workdir);
        index.push(entry);
        const title = (entry.title || url).slice(0, 60);
        const mark = entry.status === "ok" ? "✓" : "✗";
        const extra =
            entry.status === "ok"
                ? `${entry.blocks ?? 0} blocks`
                : entry.status;
        console.error(`[${i + 1}/${urls.length}] ${mark} ${title} — ${extra}`);
    });

    writeFileSync(join(workdir, "index.json"), JSON.stringify(index, null, 2));
    const ok = index.filter((e) => e.status === "ok").length;
    console.error(
        `\nDone: ${ok}/${urls.length} transcripts ready → ${join(workdir, "index.json")}`,
    );
}

main();
