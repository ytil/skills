#!/usr/bin/env node
// Extract full-resolution frames at given timecodes.
//
// Usage:
//     node frames.ts <video> <outdir> <seconds> [<seconds> ...] [--offset 0.0]
//
// Each frame is written as f_<zero-padded-seconds>.png so the filename itself carries the
// timecode — that's how the skill maps a chosen frame back to a moment in the video and to
// a bullet in the notes. PNG keeps slide text crisp and matches the vault's image
// convention. Use these for the FINAL images that go into the note, after you've decided
// which moments deserve a screenshot.
//
// --offset shifts the grab a bit past the requested time; useful when a timecode sits
// exactly on a scene cut and the very first frame is mid-transition.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { requireCommand } from "./lib.ts";

// Replicate Python's `f"{seconds:07.1f}"`: one decimal, zero-padded to width 7
// (e.g. 89.7 -> "00089.7", 409.8 -> "00409.8").
function fmt071(x: number): string {
    return x.toFixed(1).padStart(7, "0");
}

function extract(
    video: string,
    outdir: string,
    seconds: number,
    offset = 0.0,
): string | null {
    mkdirSync(outdir, { recursive: true });
    const out = join(outdir, `f_${fmt071(seconds)}.png`);
    spawnSync(
        "ffmpeg",
        [
            "-y",
            "-ss",
            (seconds + offset).toFixed(3),
            "-i",
            video,
            "-frames:v",
            "1",
            out,
        ],
        { encoding: "utf-8", timeout: 60_000 },
    );
    return existsSync(out) ? out : null;
}

function main(): void {
    const argv = process.argv.slice(2);
    if (argv.length < 3) {
        console.error(
            "usage: frames.ts <video> <outdir> <seconds>... [--offset 0.0]",
        );
        process.exit(1);
    }
    requireCommand("ffmpeg", "ffmpeg");
    const video = argv[0] as string;
    const outdir = argv[1] as string;
    let offset = 0.0;
    const times: number[] = [];
    const rest = argv.slice(2);
    for (let i = 0; i < rest.length; i++) {
        if (rest[i] === "--offset" && i + 1 < rest.length) {
            offset = Number(rest[i + 1]);
            i += 1;
            continue;
        }
        times.push(Number(rest[i]));
    }

    const written: string[] = [];
    for (const t of times) {
        const p = extract(video, outdir, t, offset);
        if (p) {
            written.push(p);
            console.log(p);
        }
    }
    console.error(
        `\n${written.length}/${times.length} frames written to ${outdir}`,
    );
}

main();
