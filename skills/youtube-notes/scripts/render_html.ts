#!/usr/bin/env node
// Render video.json into a light self-contained HTML page.
//
// Usage:
//     node render_html.ts <video.json> <workdir> --out <dir> --slug <slug>
//
// Writes <out>/<slug>/<slug>.html + assets/*.png (screenshots copied from the
// workdir). Inline CSS, no build step, auto dark theme, section timeline with
// YouTube deep links. Mermaid sources render as neat <pre> blocks — the page
// stays fully offline; no CDN scripts.
//
// This is deliberately the LIGHT page (per the experiment owner's choice):
// no RU/EN toggle, no glossary/search, no generated imagery — real video frames
// and grounded quotes carry the visuals.

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
    deepLink,
    loadNotes,
    stampOf,
    validateNotes,
    type Idea,
    type Section,
    type VideoNotes,
} from "./note_model.ts";

function die(msg: string, code = 1): never {
    console.error(`ERROR: ${msg}`);
    process.exit(code);
}

const esc = (s: string): string =>
    s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

const CSS = `
:root {
  --bg: #f7f7f5; --card: #ffffff; --ink: #1c1c1c; --muted: #6b6b6b;
  --accent: #c4302b; --line: #e4e2dd; --tip: #0d7a5f; --warn: #b45309;
  --quote-bg: #f0efe9;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161616; --card: #1f1f1f; --ink: #e8e6e3; --muted: #9a9a9a;
    --accent: #ff6b64; --line: #2e2e2e; --tip: #34d399; --warn: #fbbf24;
    --quote-bg: #262624;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 16px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif;
}
.wrap { max-width: 860px; margin: 0 auto; padding: 24px 20px 80px; }
header.hero { padding: 36px 0 8px; }
.hero h1 { font-size: 1.9rem; line-height: 1.25; margin: 0 0 8px; }
.hero .meta { color: var(--muted); }
.hero .meta a { color: var(--accent); text-decoration: none; }
nav.toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0 8px; }
nav.toc a {
  border: 1px solid var(--line); border-radius: 999px; background: var(--card);
  padding: 5px 12px; font-size: .85rem; color: var(--ink); text-decoration: none;
}
nav.toc a .t { color: var(--muted); margin-left: 6px; font-variant-numeric: tabular-nums; }
section.chapter { margin-top: 36px; }
.chapter > h2 { font-size: 1.35rem; border-bottom: 2px solid var(--line); padding-bottom: 6px; }
.chapter > h2 a.stamp {
  font-size: .8rem; color: var(--accent); text-decoration: none;
  margin-left: 10px; font-variant-numeric: tabular-nums;
}
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 16px 18px; margin: 14px 0;
}
.card.tip { border-left: 4px solid var(--tip); }
.card.warning { border-left: 4px solid var(--warn); }
.card .tldr { font-weight: 650; margin: 0; }
.card ul { margin: 10px 0 0; padding-left: 20px; color: var(--ink); }
.card li { margin: 4px 0; }
.card img {
  max-width: 100%; border-radius: 8px; margin-top: 12px;
  border: 1px solid var(--line); display: block;
}
blockquote.q {
  margin: 12px 0 0; padding: 10px 14px; background: var(--quote-bg);
  border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0;
}
blockquote.q p { margin: 0; font-style: italic; }
blockquote.q a { color: var(--accent); text-decoration: none; font-size: .85rem; }
pre.mermaid-src {
  background: var(--quote-bg); border: 1px dashed var(--line); border-radius: 8px;
  padding: 12px; overflow-x: auto; font-size: .82rem; margin: 12px 0 0;
}
footer { margin-top: 48px; color: var(--muted); font-size: .85rem; }
footer a { color: var(--accent); }
`;

function ideaHtml(idea: Idea, url: string): string {
    const cls = idea.callout ? ` ${idea.callout}` : "";
    const parts: string[] = [`<p class="tldr">${esc(idea.tldr_ru.trim())}</p>`];
    if (idea.points_ru?.length) {
        parts.push(
            "<ul>" + idea.points_ru.map((p) => `<li>${esc(p.trim())}</li>`).join("") + "</ul>",
        );
    }
    if (idea.screenshot) {
        parts.push(`<img src="assets/${esc(idea.screenshot)}" alt="" loading="lazy">`);
    }
    if (idea.mermaid) {
        parts.push(`<pre class="mermaid-src">${esc(idea.mermaid.trim())}</pre>`);
    }
    if (idea.quote) {
        const q = idea.quote;
        parts.push(
            `<blockquote class="q"><p>«${esc(q.text_ru.trim())}»</p>` +
                `<a href="${esc(deepLink(url, q.t))}">▶ ${stampOf(q.t)}</a></blockquote>`,
        );
    }
    return `<div class="card${cls}">${parts.join("")}</div>`;
}

function sectionHtml(s: Section, i: number, url: string): string {
    const stamp =
        s.t !== null && s.t !== undefined
            ? ` <a class="stamp" href="${esc(deepLink(url, s.t))}">▶ ${stampOf(s.t)}</a>`
            : "";
    return (
        `<section class="chapter" id="s${i}"><h2>${esc(s.title_ru.trim())}${stamp}</h2>` +
        s.ideas.map((idea) => ideaHtml(idea, url)).join("") +
        `</section>`
    );
}

function pageHtml(notes: VideoNotes): string {
    const v = notes.video;
    const toc = notes.sections
        .map((s, i) => {
            const t =
                s.t !== null && s.t !== undefined
                    ? `<span class="t">${stampOf(s.t)}</span>`
                    : "";
            return `<a href="#s${i}">${esc(s.title_ru.trim())}${t}</a>`;
        })
        .join("");
    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(v.title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="hero">
  <h1>${esc(v.title)}</h1>
  <p class="meta">${v.channel ? esc(v.channel) + " · " : ""}${stampOf(v.duration)} ·
    <a href="${esc(v.url)}">смотреть на YouTube</a></p>
</header>
<nav class="toc">${toc}</nav>
${notes.sections.map((s, i) => sectionHtml(s, i, v.url)).join("\n")}
<footer>Конспект сгенерирован скиллом youtube-notes · <a href="${esc(v.url)}">${esc(v.url)}</a></footer>
</div>
</body>
</html>
`;
}

function main(): void {
    const argv = process.argv.slice(2);
    if (argv.length < 2) {
        die("usage: render_html.ts <video.json> <workdir> --out <dir> --slug <slug>");
    }
    const notesPath = argv[0] as string;
    const workdir = argv[1] as string;
    const getOpt = (name: string): string | null => {
        const i = argv.indexOf(name);
        return i !== -1 && i + 1 < argv.length ? (argv[i + 1] as string) : null;
    };
    const out = getOpt("--out");
    const slug = getOpt("--slug");
    if (!out || !slug) die("--out and --slug are required");

    const notes = loadNotes(notesPath);
    const framesDir = join(workdir, "frames");
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

    const pageDir = join(out, slug);
    const assetsDir = join(pageDir, "assets");
    mkdirSync(assetsDir, { recursive: true });
    let copied = 0;
    for (const s of notes.sections) {
        for (const idea of s.ideas) {
            if (idea.screenshot) {
                copyFileSync(
                    join(framesDir, idea.screenshot),
                    join(assetsDir, idea.screenshot),
                );
                copied++;
            }
        }
    }
    const htmlPath = join(pageDir, `${slug}.html`);
    writeFileSync(htmlPath, pageHtml(notes));
    console.error(`Page:        ${htmlPath}`);
    console.error(`Screenshots: ${copied} → ${assetsDir}`);
}

main();
