---
name: youtube-notes
description: >-
    Turn a YouTube video into a distilled Russian-language study note — thematic
    sections with timecode deep-links, idea cards, grounded quotes and screenshots of
    the important on-screen moments (slides, UI, charts) — saved into the user's
    Obsidian vault, with an optional self-contained HTML page («сделай html») rendered
    from the same source of truth. Use this whenever the user shares a YouTube
    link and wants a конспект / заметку / краткое содержание / перевод / ключевые идеи /
    разбор / summary / notes from it — even if they don't name the format explicitly.
    Trigger on phrases like "сделай заметку по этому видео", "законспектируй ролик",
    "переведи и выжми главное из видео", "summarize this video", or a bare YouTube URL
    with an implied "разбери это". It ALSO covers the multi-video case — synthesizing many
    videos, a playlist, or a channel into ONE categorized свод (ideas grouped by theme,
    deduplicated, with footnotes that deep-link to the timecode in each source); trigger
    that on a list of several YouTube URLs or on "собери идеи из этих роликов в один
    документ", "свод по каналу", "аггрегируй / сравни идеи", "разбей идеи по категориям".
    Do NOT use for non-YouTube videos, local video files, or when the user only wants the
    raw transcript with no distillation.
---

# YouTube → Obsidian note

Turn one YouTube video into a concise, Russian-language note that captures its key
ideas and illustrates them with screenshots of the genuinely visual moments. Output
matches the user's existing Obsidian note style and lands in their vault.

**Everything the user reads is in Russian** — the note body and your messages in chat
(the proposed filename can be Russian or English, whatever fits the topic, e.g.
`ASO (App Store Optimization)`). The video is usually English; you translate and distill.
These SKILL instructions are in English for you; the deliverable is not.

One deliberate exception: the two section headers stay in English — literally
`# Core ideas` and `# Links` — because that's how the user's existing notes are
structured. Everything _under_ them is Russian.

## What good output looks like

Not a flat wall of bullets: the note has a **spine of thematic sections** and **idea
cards** inside them. Character:

- **Distilled, not transcribed.** A 15-minute video → 4–6 sections × 2–4 idea cards.
  Each card: a bold one-sentence thesis, then 2–4 tab-indented detail points. If you
  find yourself translating sentence-by-sentence, stop — that's a transcript.
- **Screenshots are selective.** Images appear where a frame actually _shows_ something
  (a slide with rules, an app UI, a chart), bound to the idea they illustrate. Bare
  cards are normal and good.
- **Sparse accents, never decoration:** 0–3 grounded quotes (`[!quote]` callouts with a
  timecode deep link), 0–2 `[!tip]`/`[!warning]` callouts for the video's main
  takeaway/pitfall, 0–2 mermaid diagrams only for ideas with a real SHAPE (cycle,
  funnel, comparison). A note that is all callouts is the same wall, just colored.
- **Plain, practical tone** — notes-to-self, no filler intro/outro.

Shape of the rendered note (nested bullets are tab-indented; images embed as
`![[filename]]`, resolved from the vault's attachments folder):

```text
# Core ideas

## [Название секции](https://www.youtube.com/watch?v=...&t=96s)

- **Тезис одним предложением.**
	- деталь: цифра, шаг, название
	- деталь
![[slug-01.png]]

> [!quote] [2:10](https://www.youtube.com/watch?v=...&t=130s)
> «Сильная формулировка автора»

## Следующая секция
...

# Links
- [Original video title](https://www.youtube.com/watch?v=...)
```

You never assemble this markdown by hand. You write **`video.json`** (the single source
of truth — sections, ideas, screenshots, quotes) and deterministic renderers produce the
note and, on request, an HTML page — both validated (timecodes in range, quotes grounded
against the transcript, screenshot files exist). Contract and authoring rules:
**`references/note-format.md`** — read it before writing video.json.

## Environment

- Vault root: `$HOME/Yandex.Disk.localized/ytil-db/` — notes live flat in the root.
- Attachments: `$HOME/Yandex.Disk.localized/ytil-db/attachments/` — all images go here.
- The scripts run as **plain TypeScript via `node`** (Node ≥22.18, native type stripping —
  no build step). Invoke them as `node <skill>/scripts/<name>.ts`, where `<skill>` is this
  skill's base directory (Claude Code shows it when the skill loads).
- **First-use setup:** run `bash <skill>/scripts/init.sh` once. It verifies Node, installs the
  external CLI tools (`yt-dlp`, `ffmpeg`) via whatever package manager is present — Homebrew on
  macOS, or `apt`/`dnf`/`yum`/`pacman`/`zypper`/`apk` on Linux — and restores the npm dependency
  (`jimp`, used to burn timecode labels onto thumbnails — it's gitignored, so absent after a fresh
  clone). The script is idempotent; re-running it with everything present is a green no-op. If it
  reports something it can't fix itself — Node too old, or no package manager found — relay that to
  the user and stop. Every script also fails fast with a message pointing back at `init.sh` if a
  dependency is missing at runtime, so you don't have to pre-flight manually.

Do all downloading and frame extraction in a **scratchpad workdir**, never in the vault.
Only the final `.md` and the chosen `.png` screenshots are written into the vault.

## Workflow

### 1. Fetch everything

Pick a scratchpad workdir (e.g. `<scratchpad>/yt-<videoid>/`) and run:

```bash
node "<skill>/scripts/fetch.ts" "<youtube_url>" "<workdir>"
```

This downloads subtitles + a small video-only 480p file, cleans the subtitles into a
timecoded transcript, and finds scene-change timecodes. Read the printed summary and
then read `<workdir>/transcript.txt`.

If the summary says **"Transcript: NONE FOUND"**, the video has no usable subtitles.
Tell the user (in Russian) that this video has no captions to work from and ask whether
they want to pick a different video — don't try to fabricate content from the visuals alone.

Distinguish that from **"ERROR: subtitle download failed"** — a track exists but fetching
it hit a rate limit / network problem even after the built-in retries. That's transient:
re-run the same command (downloads resume), and never report it to the user as "no captions".
Also note `fetch.ts` refuses a workdir that holds a different video's files — on that error,
pick a fresh workdir instead of forcing it.

### 2. Distill into video.json

Read the whole transcript first (and `meta.json` — if the video has author chapters,
they're your sectioning head start). Then write `<workdir>/video.json` per
`references/note-format.md`: 4–8 Russian-titled sections with start timecodes, idea
cards inside (thesis + detail points), placeholders for screenshots/quotes to be filled
in step 3. This is the heart of the note and where your judgment matters most:

- Extract the **substantive, reusable ideas** — the advice, rules, numbers, and
  frameworks a viewer would want to remember. Skip greetings, sponsor plugs, and
  "smash subscribe".
- **Translate into natural Russian**, not word-for-word. Convey the idea the way the
  user would jot it down for themselves. Watch for calques and anglicism jargon — the
  telltale sign of machine-flavored notes («реверс-инжинирит», «спека», «таргетируешь»,
  «шерабельный»): use the normal Russian word instead («разбирает», «спецификация»,
  «нацеливаешься», «которым хочется поделиться»). Product/brand names stay as-is.
- One card = one idea: a self-sufficient `tldr_ru` thesis plus 2–4 `points_ru` details
  (numbers, steps, names). Don't restate the thesis in the points.
- Keep the transcript's timecodes: sections need a start `t`, quotes need the exact
  block, and you'll need timecodes next to find screenshots.
- Quotes and mermaid are rare accents with hard rules — see `references/note-format.md`
  (a quote carries the verbatim `orig` transcript line; the renderer verifies it).
- **Trust the screen over the auto-captions for names and numbers.** Auto-generated
  subtitles routinely mangle brand and product names (e.g. "Habit Kit" transcribed as
  "Habit Kids"), drop words, and garble figures. When a slide or UI frame shows the real
  spelling or number (an app name, a rating count, a percentage), use what's on screen.
  If a tool or site is named but the caption swallowed it, say it generically rather than
  guessing — never invent a specific name or URL that isn't confirmed by the video.

Aim for tight, skimmable density: every line earning its place.

### 3. Choose and extract screenshots

The transcript tells you _what_ is said and _when_; the video is where the visuals are.
Most scene changes in a talk are just the speaker's face — you want the slides, app
screens, charts, and search results instead. Work visually:

**a. Survey the visual arc cheaply.** Build contact sheets (grids of thumbnails) so you
can see the whole video's visuals in a few images instead of reading 100 frames:

```bash
node "<skill>/scripts/contact_sheet.ts" \
  "<workdir>/video.mp4" "<workdir>/sheets" --scenes "<workdir>/scenes.txt"
```

Read each `sheet_NN.jpg`. **Each thumbnail has its timecode burned into the top-left
corner** (white on black), so you can read the exact second straight off any tile — no
counting rows and columns (the stderr map is a backup). Scan the sheets and note the
timecodes of tiles that are **screen-worthy**: slides, app UI, dashboards, charts,
comparison tables, search results. Ignore talking heads, split-screen interview shots,
blank/transition frames.

**b. Pull the finalists at full resolution.** For the timecodes you selected, extract
readable frames:

```bash
node "<skill>/scripts/frames.ts" \
  "<workdir>/video.mp4" "<workdir>/frames" 89.7 240.8 409.8
```

Files are named `f_<seconds>.png` so the filename carries the timecode. **Always read the
full-res frame before trusting a pick** — a thumbnail can look screen-worthy but land on a
transition or the wrong shot, and this is the step that catches it. Confirm each is sharp
and actually illustrates a bullet. If a frame sits mid-transition, re-extract a second or
two later, or pick the adjacent scene timecode from `scenes.txt`. A slide is worth keeping
only if its text is legible — 480p handles most slides fine, but drop anything blurry.

**c. Bind frames to ideas.** Put each kept frame's filename into the `screenshot` field
of the idea card it genuinely illustrates. It's completely fine for a strong idea to have
no image, and one image sits under the single card it fits best. Default density is
_moderate_ — a handful to ~15 images for a typical talk, fewer for a sparse one. Fill in
the quotes now too (verbatim `orig` line + `t` from the transcript).

### 4. Validate, preview, name

Render a preview — this also runs the validation gate (timecodes in range, quotes
grounded, screenshots exist); fix `video.json` until it passes:

```bash
node "<skill>/scripts/render_obsidian.ts" "<workdir>/video.json" "<workdir>" --dry-run
```

Then propose a filename and **confirm with the user before writing anything to the
vault** — the user names notes by clean topic (e.g. `ASO (App Store Optimization)`),
_not_ by the video's title. Suggest a short topic name in Russian or English as fits:

> Предлагаю назвать заметку: **«<тема>»**. Сохранить так или поправить название?

If the user already gave a name or topic in their request (or told you not to ask), use
that and skip the question.

### 5. Render into the vault

Once the name is confirmed, the renderer does the mechanical part — copies the chosen
frames into attachments as `<slug>-01.png…` (collision-safe), writes the note, and
refuses to overwrite an existing one:

```bash
node "<skill>/scripts/render_obsidian.ts" "<workdir>/video.json" "<workdir>" \
  --vault "$HOME/Yandex.Disk.localized/ytil-db" \
  --attachments "$HOME/Yandex.Disk.localized/ytil-db/attachments" \
  --name "<подтверждённое имя>" --slug <latin-slug>
```

Tell the user (in Russian) where the note was saved and how many screenshots it has.
Leave the scratchpad workdir in place during the session; `video.json` stays there, so
any re-render (including HTML) is free.

### 6. HTML mode (on request)

When the user asks for an HTML page («сделай html», «страницу», or both formats), render
the same `video.json` into a light self-contained page (hero, section timeline with
YouTube deep links, idea cards with the real screenshots, auto dark theme):

```bash
node "<skill>/scripts/render_html.ts" "<workdir>/video.json" "<workdir>" \
  --out "$HOME/yt-notes-html" --slug <latin-slug>
```

Output: `~/yt-notes-html/<slug>/<slug>.html` + `assets/` — outside the vault, opens with
a double-click. Default deliverable is the Obsidian note; HTML only when asked.

## Multi-video синтез (свод)

Everything above makes one note per video. When the user instead wants **many** videos folded
into **one** document — a list of URLs, a playlist, a whole channel, "собери идеи в один
документ", "разбей идеи по категориям" — it's a different, longer workflow with its own tools
(`transcripts.ts` for subtitles-only batch download, fan-out extractor agents, and
`cite_timecodes.ts` to deep-link the `[N]` footnotes to timecodes).

**Read `references/aggregation.md` and follow it** — it has the full step-by-step (transcripts
→ extract ideas → synthesize categorized note with deduped `[N]` footnotes → deep-link each
footnote to its timecode → spot-check), including the ready-to-use extractor- and matcher-agent
prompts. Don't improvise the свод from memory; the deep-linking has a validation gate that
matters for trust.

## Notes & edge cases

- **Language.** `fetch.ts` prefers manual subtitles, then auto-captions; within each it
  picks the video's **original language** first (YouTube's auto-caption list is mostly
  machine-translated tracks — the original beats a translation), then English, then Russian,
  then whatever exists. If the video is Russian, you're distilling (not translating). If
  it's another language, you translate the available track into Russian.
- **Long videos (>30 min).** The transcript and scene list get bigger but the flow is the
  same; just be more aggressive about distilling and about which visuals earn a screenshot.
- **Timecode drift.** Auto-caption timecodes and scene cuts can be a second or two off from
  when a slide fully appears. When a grabbed frame looks like a transition, nudge by ±1–2s.
- **Unavailable/private video.** `fetch.ts` will fail on metadata; report the error plainly
  and stop.
- **Re-runs.** Reusing the same workdir skips nothing by itself, but the downloaded files
  are already there; it's safe to re-run `contact_sheet.ts`/`frames.ts` against them.

## Scripts reference

Run each as `node <skill>/scripts/<name>.ts ...`. They shell out to `yt-dlp` and `ffmpeg`;
`contact_sheet.ts` additionally uses `jimp` (restored by `init.sh`).

- `scripts/init.sh` — one-shot setup/restore: verify Node, install the missing CLI tools via the
  platform package manager (Homebrew / apt / dnf / pacman / zypper / apk), `npm install` the
  gitignored `jimp`. Idempotent; run once before first use. Not a `node` script.
- `scripts/fetch.ts <url> <workdir> [--lang XX] [--scene 0.4]` — download subs+video,
  clean transcript, detect scenes, write `meta.json`. `--scene` lowers/raises scene
  sensitivity (more/fewer candidates); `--lang` forces a subtitle language.
- `scripts/contact_sheet.ts <video> <outdir> --scenes <file> [--cols 5 --rows 4]` — thumbnail
  grids for surveying visuals; prints a tile→timecode map. Accepts `--times t1 t2 ...` instead.
- `scripts/frames.ts <video> <outdir> <sec> [<sec> ...] [--offset 0.0]` — full-res frames at
  given timecodes, named by timecode. `--offset` shifts grabs past a scene cut.
- `scripts/render_obsidian.ts <video.json> <workdir> (--dry-run | --vault <dir>
  --attachments <dir> --name "<note>" --slug <slug>)` — validate video.json (timecodes,
  quote grounding vs transcript, screenshot files) and render the Obsidian note;
  `--dry-run` previews to stdout, the real run copies frames into attachments as
  `<slug>-NN.png` and refuses to overwrite an existing note.
- `scripts/render_html.ts <video.json> <workdir> --out <dir> --slug <slug>` — same
  validation, then a light self-contained HTML page → `<out>/<slug>/<slug>.html` +
  `assets/`.
- `scripts/note_model.ts` — video.json types + the shared validation gate used by both
  renderers (not called directly). Contract: `references/note-format.md`.
- `scripts/transcripts.ts <workdir> <url1> <url2> ... [--lang XX]` — batch, subtitles-only
  download for many videos → `<id>.txt` + `index.json`. The lightweight path for synthesizing
  ideas across a playlist without downloading any video. Used by the свод workflow. In
  `index.json`, `no_subtitles` means the video really has no captions; `error` with a
  "subtitle download failed" message is transient — re-run those URLs.
- `scripts/cite_timecodes.ts plan|apply <note.md> <transcripts_dir> <workdir> [--per-bin 18]` —
  turn the `[N]` footnotes in a свод into clickable links that deep-link to the source video's
  timecode. `plan` writes matcher-agent task files; `apply` validates the agents' matches
  against each video's own transcript and rewrites the footnotes. See `references/aggregation.md`.
- `scripts/lib.ts` — VTT parsing/formatting, timecode ↔ seconds, and subtitle-track selection
  helpers, shared by `fetch.ts`, `transcripts.ts`, and `cite_timecodes.ts` (not called directly).
