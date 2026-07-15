#!/usr/bin/env node
// Fetch everything the youtube-notes skill needs from a single video, in one shot.
//
// Usage:
//     node fetch.ts <youtube_url> <workdir> [--lang en] [--scene 0.4]
//
// Produces inside <workdir>:
//     meta.json      - title, duration, channel, url, chosen subtitle language, video path
//     transcript.txt - clean timecoded transcript ([M:SS] text blocks)
//     video.<ext>    - video-only stream, <=480p (enough to read slides, small & fast)
//     scenes.txt     - sorted scene-change timecodes in seconds (screenshot candidates)
//
// Design choices worth knowing:
//   * We download the video-only track (no audio) because screenshots don't need sound;
//     it roughly halves the download.
//   * 480p is a deliberate floor: slide text stays readable while files stay tiny.
//   * Scene detection is the primary source of screenshot candidates. In slide / screen-
//     share content every new slide is a scene change, so these timecodes land on keepable
//     frames. The skill still visually filters them (many scenes are just the talking head).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
    formatTranscript,
    parseVtt,
    pickSubtitle,
    requireCommand,
    runCmd,
    secToStamp,
    type SubtitleKind,
    type YtMeta,
} from "./lib.ts";

function die(msg: string, code = 1): never {
    console.error(`ERROR: ${msg}`);
    process.exit(code);
}

// Distinguishes "the track exists but the download failed" (error set — transient
// network / rate limit, worth re-running) from "yt-dlp succeeded yet produced no file"
// (both null — genuinely nothing usable). Conflating the two used to report a network
// hiccup as "video has no captions".
function downloadSubtitle(
    url: string,
    workdir: string,
    lang: string,
    kind: SubtitleKind,
): { path: string | null; error: string | null } {
    const flag = kind === "manual" ? "--write-subs" : "--write-auto-subs";
    const out = join(workdir, "sub.%(ext)s");
    const r = runCmd(
        "yt-dlp",
        [
            "--skip-download",
            flag,
            "--sub-langs",
            lang,
            "--sub-format",
            "vtt/best",
            "-o",
            out,
            url,
        ],
        { timeoutMs: 300_000, retries: 2 },
    );
    // yt-dlp names it sub.<lang>.vtt; prefer the exact language, else whatever landed.
    const vtts = readdirSync(workdir).filter(
        (f) => f.startsWith("sub.") && f.endsWith(".vtt"),
    );
    const name = vtts.find((f) => f === `sub.${lang}.vtt`) ?? vtts[0];
    if (name) return { path: join(workdir, name), error: null };
    if (r.status === 0 && !r.error) return { path: null, error: null };
    return {
        path: null,
        error: (r.error?.message ?? "") + (r.stderr ?? "").slice(-800),
    };
}

function downloadVideo(url: string, workdir: string): string {
    const out = join(workdir, "video.%(ext)s");
    const fmt = "bv*[height<=480]/b[height<=480]/wv*/w";
    const r = runCmd("yt-dlp", ["-f", fmt, "-o", out, url], {
        timeoutMs: 1_800_000,
        retries: 1,
    });
    const vids = readdirSync(workdir).filter(
        (f) => f.startsWith("video.") && !f.endsWith(".part"),
    );
    if (vids.length === 0) {
        die(
            "video download failed:\n" +
                (r.error ? r.error.message + "\n" : "") +
                (r.stderr ?? "").slice(-800),
        );
    }
    return join(workdir, vids[0] as string);
}

function detectScenes(
    videoPath: string,
    workdir: string,
    threshold = 0.4,
): { scenesPath: string; count: number } {
    const r = runCmd(
        "ffmpeg",
        [
            "-i",
            videoPath,
            "-filter:v",
            `select='gt(scene,${threshold})',showinfo`,
            "-f",
            "null",
            "-",
        ],
        { timeoutMs: 1_800_000 },
    );
    const times = [...r.stderr.matchAll(/pts_time:([0-9.]+)/g)]
        .map((m) => Number(m[1]))
        .sort((a, b) => a - b);
    const scenesPath = join(workdir, "scenes.txt");
    writeFileSync(scenesPath, times.map((t) => t.toFixed(2)).join("\n") + "\n");
    return { scenesPath, count: times.length };
}

function main(): void {
    const argv = process.argv.slice(2);
    if (argv.length < 2) {
        die(
            "usage: fetch.ts <youtube_url> <workdir> [--lang XX] [--scene 0.4]",
        );
    }
    const url = argv[0] as string;
    const workdir = argv[1] as string;
    let preferredLang: string | null = null;
    let sceneThreshold = 0.4;
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === "--lang" && i + 1 < argv.length)
            preferredLang = argv[i + 1] as string;
        if (argv[i] === "--scene" && i + 1 < argv.length)
            sceneThreshold = Number(argv[i + 1]);
    }

    requireCommand("yt-dlp", "yt-dlp");
    requireCommand("ffmpeg", "ffmpeg");
    mkdirSync(workdir, { recursive: true });

    console.error("→ Fetching metadata...");
    const meta = runCmd("yt-dlp", ["--dump-single-json", "--skip-download", url], {
        timeoutMs: 120_000,
        retries: 2,
    });
    if (meta.status !== 0) {
        die(
            "could not fetch video metadata:\n" +
                (meta.error ? meta.error.message + "\n" : "") +
                (meta.stderr ?? "").slice(-800),
        );
    }
    const info = JSON.parse(meta.stdout) as YtMeta;

    // Refuse a workdir that already holds another video's files — the downloads below
    // find their outputs by filename pattern, so stale video.*/sub.*.vtt from a previous
    // run would be silently picked up as this video's.
    if (info.id) {
        // Hidden name on purpose: downloadVideo() finds its output by the `video.*`
        // glob, and a marker named `video.id` would match it.
        const idPath = join(workdir, ".source.id");
        if (existsSync(idPath)) {
            const prev = readFileSync(idPath, "utf-8").trim();
            if (prev && prev !== info.id) {
                die(
                    `workdir ${workdir} holds files for another video (${prev}); ` +
                        "use a fresh workdir for this one",
                );
            }
        }
        writeFileSync(idPath, info.id + "\n");
    }

    const { lang, kind } = pickSubtitle(info, preferredLang);
    let transcriptPath: string | null = null;
    let nBlocks = 0;
    if (lang && kind) {
        console.error(`→ Downloading ${kind} subtitles (${lang})...`);
        const { path: vtt, error: subError } = downloadSubtitle(
            url,
            workdir,
            lang,
            kind,
        );
        if (subError) {
            die(
                `subtitle download failed (a ${lang} track exists but couldn't be fetched):\n` +
                    subError +
                    "\nThis is transient (rate limit / network) — re-run the same command, " +
                    "NOT a missing-captions case.",
            );
        }
        if (vtt) {
            const transcript = formatTranscript(parseVtt(vtt));
            transcriptPath = join(workdir, "transcript.txt");
            writeFileSync(transcriptPath, transcript + "\n");
            nBlocks = transcript ? transcript.split("\n").length : 0;
        }
    }

    console.error("→ Downloading video (<=480p, video-only)...");
    const videoPath = downloadVideo(url, workdir);

    console.error("→ Detecting scene changes...");
    const { scenesPath, count: nScenes } = detectScenes(
        videoPath,
        workdir,
        sceneThreshold,
    );

    const duration = info.duration ?? 0;
    // Author-defined YouTube chapters are a free sectioning hint for the note.
    const chapters = (info.chapters ?? [])
        .filter((c) => c.title && c.start_time !== undefined)
        .map((c) => ({
            title: c.title as string,
            t: Math.round(c.start_time as number),
            stamp: secToStamp(c.start_time as number),
        }));
    const outMeta = {
        chapters,
        title: info.title ?? null,
        channel: info.channel ?? info.uploader ?? null,
        id: info.id ?? null,
        url: info.webpage_url ?? url,
        duration,
        duration_stamp: duration ? secToStamp(duration) : null,
        subtitle_lang: lang,
        subtitle_kind: kind,
        video_path: videoPath,
        transcript_path: transcriptPath,
        scenes_path: scenesPath,
        n_scenes: nScenes,
    };
    writeFileSync(join(workdir, "meta.json"), JSON.stringify(outMeta, null, 2));

    console.error("\n=== READY ===");
    console.error(`Title:      ${outMeta.title}`);
    console.error(`Channel:    ${outMeta.channel}`);
    console.error(`Duration:   ${outMeta.duration_stamp}`);
    if (transcriptPath) {
        console.error(`Transcript: ${transcriptPath} (${nBlocks} blocks)`);
    } else {
        console.error(
            "Transcript: NONE FOUND — no usable subtitles for this video",
        );
    }
    console.error(`Video:      ${videoPath}`);
    console.error(`Scenes:     ${scenesPath} (${nScenes} candidates)`);
    console.error(
        `Chapters:   ${chapters.length ? `${chapters.length} (author-defined, see meta.json)` : "none"}`,
    );
    console.error(`Meta:       ${join(workdir, "meta.json")}`);
}

main();
