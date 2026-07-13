---
name: youtube-notes
description: >-
    Turn a YouTube video into a distilled Russian-language study note in Markdown,
    with screenshots of the important on-screen moments (slides, UI, charts, diagrams),
    saved into the user's Obsidian vault. Use this whenever the user shares a YouTube
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

The user's own reference note is the target (`# Core ideas` + `# Links`). Its character:

- **Distilled, not transcribed.** A 15-minute video becomes ~10–20 bullet points, not
  a wall of translated text. Each bullet is one idea in the user's words. If you find
  yourself translating sentence-by-sentence, stop — you're making a transcript, not a note.
- **Screenshots are selective.** Images appear where a frame actually _shows_ something
  (a slide with rules, an app UI, a chart, a search result), not on every bullet. Bare
  bullets are normal and good. Forcing one image per point is what makes a note read as
  auto-generated.
- **Plain, practical tone** — notes-to-self, on point, no filler intro/outro.

Structure to produce (nested bullets are tab-indented — shown here literally):

```text
# Core ideas
- Идея одним предложением
- Идея с иллюстрацией ![[slug-01.png]]
	- под-пункт, уточнение
	- под-пункт
- Ещё идея

# Links
- [Original video title](https://www.youtube.com/watch?v=...)
```

Note: nested bullets use a **tab**, and images embed with Obsidian syntax `![[filename]]`
(just the filename — the vault resolves it from the attachments folder).

## Environment

- Vault root: `$HOME/Yandex.Disk.localized/ytil-db/` — notes live flat in the root.
- Attachments: `$HOME/Yandex.Disk.localized/ytil-db/attachments/` — all images go here.
- The scripts run as **plain TypeScript via `node`** (Node ≥22.18, native type stripping —
  no build step). Invoke them as `node <skill>/scripts/<name>.ts`, where `<skill>` is this
  skill's base directory (Claude Code shows it when the skill loads).
- **First-use setup:** the contact-sheet step needs one npm dependency (`jimp`, used to burn
  the timecode label onto each thumbnail). If `<skill>/scripts/node_modules` is missing,
  run `npm install --no-fund --no-audit` in `<skill>/scripts/` once before using the skill.
- `yt-dlp` and `ffmpeg` must be installed (via Homebrew). If `fetch.ts` reports one missing,
  tell the user the exact `brew install` command and stop.

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

### 2. Distill into Russian key ideas

Read the whole transcript first, then write the `# Core ideas` list. This is the heart
of the note and where your judgment matters most:

- Extract the **substantive, reusable ideas** — the advice, rules, numbers, and
  frameworks a viewer would want to remember. Skip greetings, sponsor plugs, and
  "smash subscribe".
- **Translate into natural Russian**, not word-for-word. Convey the idea the way the
  user would jot it down for themselves.
- Group related detail as nested sub-bullets (tab-indented) where it clarifies a point,
  like the rules list in the reference note.
- Keep the transcript's timecodes in mind — you'll need them next to find screenshots.
  As you draft each bullet, note the rough `[M:SS]` where that idea is discussed.
- **Trust the screen over the auto-captions for names and numbers.** Auto-generated
  subtitles routinely mangle brand and product names (e.g. "Habit Kit" transcribed as
  "Habit Kids"), drop words, and garble figures. When a slide or UI frame shows the real
  spelling or number (an app name, a rating count, a percentage), use what's on screen.
  If a tool or site is named but the caption swallowed it, say it generically rather than
  guessing — never invent a specific name or URL that isn't confirmed by the video.

Aim for the reference note's density: tight, skimmable, every line earning its place.

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

**c. Match frames to bullets.** Attach a screenshot only to the bullets it genuinely
illustrates. It's completely fine for a strong idea to have no image, and for one image
to sit under the single bullet it fits best. Follow the screenshot density the user chose:
by default, _moderate_ — illustrate the points where a frame adds real information, leave
the rest as text. Expect on the order of a handful to ~15 images for a typical talk, fewer
for a sparse one.

### 4. Assemble and name the note

Draft the full note in the structure above. Then propose a filename and **confirm with
the user before writing anything to the vault** — the user names notes by clean topic
(e.g. `ASO (App Store Optimization)`), _not_ by the video's title (`My App Makes
$50K/Month...`), so you can't just reuse the title. Suggest a short topic name in Russian
or English as fits the subject, show it, and let them adjust:

> Предлагаю назвать заметку: **«<тема>»**. Сохранить так или поправить название?

If the user already gave a name or topic in their request (or told you not to ask), use
that and skip the question — the confirmation exists to catch a bad auto-name, not to
nag when the name is already settled.

### 5. Save into the vault

Once the name is confirmed:

- Copy the chosen frames into the attachments folder with clean, collision-safe names:
  `<slug>-01.png`, `<slug>-02.png`, … where `<slug>` is a short latin slug of the topic.
  Don't reuse the `Pasted image <timestamp>.png` scheme — timestamped names collide and
  are opaque. Before writing, check the name isn't already taken in attachments; if it is,
  bump the number.
- Write the note as `<vault>/<confirmed name>.md`. **If a file with that name already
  exists, stop and ask** — don't overwrite an existing note.
- Update the `![[...]]` embeds in the note to the final attachment filenames.
- Tell the user (in Russian) where the note was saved and how many screenshots it has.

Leave the scratchpad workdir in place during the session in case you need to re-extract a
frame; it's temporary and outside the vault.

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

- **Language.** `fetch.ts` prefers manual subtitles, then auto-captions, preferring English
  then Russian then whatever exists. If the video is Russian, you're distilling (not
  translating). If it's another language with no English track, you still translate the
  available track into Russian.
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
`contact_sheet.ts` additionally uses `jimp` (installed once via `npm install` in `scripts/`).

- `scripts/fetch.ts <url> <workdir> [--lang XX] [--scene 0.4]` — download subs+video,
  clean transcript, detect scenes, write `meta.json`. `--scene` lowers/raises scene
  sensitivity (more/fewer candidates); `--lang` forces a subtitle language.
- `scripts/contact_sheet.ts <video> <outdir> --scenes <file> [--cols 5 --rows 4]` — thumbnail
  grids for surveying visuals; prints a tile→timecode map. Accepts `--times t1 t2 ...` instead.
- `scripts/frames.ts <video> <outdir> <sec> [<sec> ...] [--offset 0.0]` — full-res frames at
  given timecodes, named by timecode. `--offset` shifts grabs past a scene cut.
- `scripts/transcripts.ts <workdir> <url1> <url2> ...` — batch, subtitles-only download for
  many videos → `<id>.txt` + `index.json`. The lightweight path for synthesizing ideas
  across a playlist without downloading any video. Used by the свод workflow.
- `scripts/cite_timecodes.ts plan|apply <note.md> <transcripts_dir> <workdir> [--per-bin 18]` —
  turn the `[N]` footnotes in a свод into clickable links that deep-link to the source video's
  timecode. `plan` writes matcher-agent task files; `apply` validates the agents' matches
  against each video's own transcript and rewrites the footnotes. See `references/aggregation.md`.
- `scripts/lib.ts` — VTT parsing/formatting, timecode ↔ seconds, and subtitle-track selection
  helpers, shared by `fetch.ts`, `transcripts.ts`, and `cite_timecodes.ts` (not called directly).
