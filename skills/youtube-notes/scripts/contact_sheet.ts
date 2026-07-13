#!/usr/bin/env node
// Build contact sheets (grids of thumbnails) from a list of timecodes.
//
// Usage:
//     node contact_sheet.ts <video> <outdir> --scenes <scenes.txt> [--cols 5 --rows 4]
//     node contact_sheet.ts <video> <outdir> --times 12.3 27.1 40.0 [...]
//
// Why this exists: scene detection can return ~100+ candidate moments for a 15-minute
// video, and most are just the talking head. Reading 100 frames one by one is wasteful.
// A contact sheet lets Claude eyeball the whole visual arc in a handful of images, decide
// which tiles are actually screen-worthy (slides, UI, charts, diagrams), then pull just
// those few at full resolution with frames.ts.
//
// Thumbnails are laid out in ascending time order, left-to-right, top-to-bottom. The tool
// prints a JSON map of tile position -> timecode so a chosen tile can be traced back to a
// moment. Sheets are written as sheet_00.jpg, sheet_01.jpg, ...

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { Jimp, JimpMime, loadFont, measureText, measureTextHeight } from "jimp";
import { SANS_32_WHITE } from "jimp/fonts";

const THUMB_W = 320;
const THUMB_H = 180;

interface Tile {
    pos: number;
    row: number;
    col: number;
    t: number;
}
interface Sheet {
    path: string;
    cols: number;
    rows: number;
    tiles: Tile[];
}

// Burn the timecode onto a thumbnail so a tile can't be misread on the grid.
//
// Reading a 5x4 grid and mapping a tile back to a timecode by counting rows and columns is
// genuinely error-prone; a wrong count sends you to the wrong second and you extract a
// talking head. A visible label on each tile removes the guesswork. White-on-black via
// jimp's bundled bitmap font — no system font needed, so it can't fail on a missing face.
async function stampTimecode(path: string, label: string): Promise<void> {
    const img = await Jimp.read(path);
    const font = await loadFont(SANS_32_WHITE);
    const pad = 4;
    const tw = measureText(font, label);
    const th = measureTextHeight(font, label, tw + 1);
    const bar = new Jimp({
        width: tw + 2 * pad,
        height: th + 2 * pad,
        color: 0x000000ff,
    });
    img.composite(bar, 0, 0);
    img.print({ font, x: pad, y: pad, text: label });
    writeFileSync(path, await img.getBuffer(JimpMime.jpeg));
}

function loadTimes(args: string[]): number[] {
    const si = args.indexOf("--scenes");
    if (si !== -1) {
        const path = args[si + 1] as string;
        return readFileSync(path, "utf-8")
            .split(/\s+/)
            .filter((x) => x.trim())
            .map(Number);
    }
    const ti = args.indexOf("--times");
    if (ti !== -1) {
        const out: number[] = [];
        for (const a of args.slice(ti + 1)) {
            if (a.startsWith("--")) break;
            out.push(Number(a));
        }
        return out;
    }
    return [];
}

function getOpt(args: string[], name: string, def: number): number {
    const i = args.indexOf(name);
    return i !== -1 ? Number(args[i + 1]) : def;
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    if (argv.length < 3) {
        console.error(
            "usage: contact_sheet.ts <video> <outdir> --scenes <f>|--times t...",
        );
        process.exit(1);
    }
    const video = argv[0] as string;
    const outdir = argv[1] as string;
    const args = argv.slice(2);
    const times = loadTimes(args).sort((a, b) => a - b);
    if (times.length === 0) {
        console.error(
            "ERROR: no timecodes (pass --scenes <file> or --times ...)",
        );
        process.exit(1);
    }
    const cols = getOpt(args, "--cols", 5);
    const rows = getOpt(args, "--rows", 4);
    const per = cols * rows;
    mkdirSync(outdir, { recursive: true });

    // 1. Extract downscaled thumbnails in ascending time order.
    const tmp = mkdtempSync(join(outdir, "cs_"));
    for (let i = 0; i < times.length; i++) {
        const t = times[i] as number;
        const src = join(tmp, `src_${String(i).padStart(4, "0")}.jpg`);
        spawnSync(
            "ffmpeg",
            [
                "-y",
                "-ss",
                t.toFixed(3),
                "-i",
                video,
                "-vf",
                `scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=decrease,` +
                    `pad=${THUMB_W}:${THUMB_H}:(ow-iw)/2:(oh-ih)/2:color=black`,
                "-frames:v",
                "1",
                "-q:v",
                "4",
                src,
            ],
            { encoding: "utf-8" },
        );
        await stampTimecode(src, `${t.toFixed(1)}s`);
    }

    // 2. Tile into sheets, one sheet per `per` thumbnails.
    const nSheets = Math.ceil(times.length / per);
    const sheets: Sheet[] = [];
    for (let s = 0; s < nSheets; s++) {
        const chunk = times.slice(s * per, (s + 1) * per);
        const listFile = join(tmp, `list_${s}.txt`);
        let list = "";
        for (let i = 0; i < chunk.length; i++) {
            // Absolute paths: concat resolves relative paths against the list file's own
            // directory, which would double the temp dir prefix.
            const src = resolve(
                join(tmp, `src_${String(s * per + i).padStart(4, "0")}.jpg`),
            );
            list += `file '${src}'\n`;
        }
        writeFileSync(listFile, list);
        const sheetPath = join(
            outdir,
            `sheet_${String(s).padStart(2, "0")}.jpg`,
        );
        spawnSync(
            "ffmpeg",
            [
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                listFile,
                "-vf",
                `tile=${cols}x${rows}:margin=8:padding=6:color=white`,
                "-frames:v",
                "1",
                "-q:v",
                "3",
                sheetPath,
            ],
            { encoding: "utf-8" },
        );
        const tiles: Tile[] = chunk.map((t, i) => ({
            pos: i + 1,
            row: Math.floor(i / cols),
            col: i % cols,
            t: Math.round(t * 100) / 100,
        }));
        sheets.push({ path: sheetPath, cols, rows, tiles });
    }

    console.log(JSON.stringify({ sheets }, null, 2));

    // Human-readable map to stderr: which tile is which timecode, per sheet.
    for (const sheet of sheets) {
        console.error(
            `\n=== ${basename(sheet.path)} (read left→right, top→bottom) ===`,
        );
        const grid: string[] = new Array(cols * rows).fill("");
        for (const tile of sheet.tiles) {
            grid[tile.row * cols + tile.col] =
                `${tile.t.toFixed(1).padStart(7)}s`;
        }
        for (let r = 0; r < rows; r++) {
            const rowCells = grid.slice(r * cols, (r + 1) * cols);
            if (rowCells.some((c) => c)) {
                console.error(
                    "  " + rowCells.map((c) => c || "   -   ").join(" | "),
                );
            }
        }
    }
}

await main();
