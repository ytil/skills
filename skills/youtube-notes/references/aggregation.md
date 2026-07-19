# Multi-video синтез — «свод»

Read this when the user wants **many** videos folded into **one** document, rather than a
note per video. Triggers: a list of several YouTube URLs, "собери идеи из этих роликов в
один документ", "свод по каналу", "аггрегируй/сравни идеи", "разбей идеи по категориям".

The deliverable is one Russian note whose spine is **thematic categories**, not videos:
each idea is distilled once, deduplicated across sources, and every claim carries numbered
footnotes `[N]` that **deep-link to the exact timecode** in the source video. It reads like
the single-video note (distilled, notes-to-self tone) but at collection scale.

Every bullet is a **bold hook plus 2–4 sentences**, not a one-liner. A bare hook forces the
reader back into the video to find out what it actually meant, which defeats the point of a
свод — the note has to stand on its own.

```text
## 🧠 Мышление и подход
- **Жирный тезис-крючок — одна фраза, которую видно при беглом скролле.** Дальше 2–4
  предложения: механизм («почему это работает»), конкретика — числа, имена, примеры, —
  и практический вывод. Пункт должен читаться сам по себе, без обращения к видео.
  [\[13\]](https://www.youtube.com/watch?v=WmpzgtRG8ww&t=336s)
- **Мысль, звучащая у нескольких авторов** — помечай. Тело тезиса при этом одно, а сноски
  перечисляют всех, кто её высказал. *(консенсус)* [\[40\]](...&t=1898s)[\[22\]](...&t=1856s)

# Источники
1. [Video title](https://www.youtube.com/watch?v=_HiyjLNe_LA)
2. [Another title](https://www.youtube.com/watch?v=COblC3XvuZo)
```

The `# Источники` list stays plain `N. [Title](url)` markdown links. The inline `[N]` are the
part that gets deep-linked. Compound cites like `[40][22]` are two adjacent footnotes.

## Flow

### 1. Transcripts for every video

Subtitles only — you're synthesizing words, not grabbing screenshots:

```bash
node "<skill>/scripts/transcripts.ts" "<workdir>" "<url1>" "<url2>" ...
```

Each video becomes `<workdir>/<id>.txt` (a header + `[M:SS]`-stamped transcript) and an
`index.json` maps id → title → url → status. For a whole channel/playlist, first resolve the
member URLs with `yt-dlp --flat-playlist --print "%(id)s"` (or `--dump-single-json`), then
feed them in. Note which videos came back `no_subtitles` — you can't synthesize those.

### 2. Extract ideas per video (fan out)

Reading 30+ transcripts in one context is wasteful and lossy. Spawn parallel subagents, each
handling a handful of videos, each returning **structured** ideas. A good extractor prompt:

> Прочитай транскрипты этих видео (пути ниже). Из каждого вытащи существенные,
> переиспользуемые идеи — советы, правила, числа, фреймворки; пропусти приветствия, рекламу,
> «подпишись». Для каждой идеи верни объект `{idea, video_id, topic}`, где `idea` — на
> естественном русском (пересказ, не дословный перевод), `topic` — короткая тема-ярлык.
> **Каждая идея должна нести смысла на абзац**: механизм («почему так»), конкретика — числа,
> имена, версии, примеры, — и практический вывод. Не «используй сетку», а «держи отступы
> кратными 8: 8/16/24/32 — это даёт ритм и упрощает передачу в разработку».
> Запиши JSON-массив в `<путь>`.

Collect all the `{idea, video_id, topic}` objects. Expect heavy overlap across videos from the
same author — that's the raw material for consensus marking, not noise.

Ask for the detail **here**, at extraction. Thin one-line ideas can't be expanded later — by
synthesis time the transcripts are out of your context, and re-reading them defeats the fan-out.
For technical channels add: имена API, команд и пакетов оставляй латиницей, а искажения
авто-субтитров нормализуй (`headerShown` слышится как «they're shown»).

### 3. Synthesize one note (solo, your judgment)

This is the heart of it and it's **your** work, not an agent's:

- **Categories are the spine.** Cluster the ideas into ~8–12 thematic sections (`## …`), and
  order points within each from foundational to niche. Let categories emerge from the ideas;
  don't force a fixed taxonomy.
- **Distil and dedup.** One idea, stated once, in the user's voice. When several videos make
  the same point, merge them into one bullet and cite all of them.
- **Expand every bullet.** Bold hook, then 2–4 sentences carrying the mechanism, the concrete
  detail (numbers, names, versions, examples) and the practical takeaway. Compressing a rich
  idea back into one line is the most common way a свод turns useless — the user then has to
  open the video to recover what the hook meant. Length isn't the goal; self-sufficiency is.
- **Mark consensus.** When a point recurs across **different** authors/videos, append
  `*(консенсус)*` before its footnotes — it flags the ideas with the most support.
- **Footnotes.** End each bullet with `[N]` for every source video it draws on (bare `[N]` is
  fine here — step 4 makes them clickable and adds timecodes). Keep a `# Источники` list at the
  bottom, `N. [Title](url)`, numbered stably — **freeze existing numbers** if you're extending
  an older свод, so old footnotes keep pointing at the right video.
- **Save** with the usual name-confirm step, into the vault.

### 4. Deep-link the footnotes to timecodes

A footnote to a 45-minute video's start is nearly useless. Turn each `[N]` into a link that
jumps to the moment the idea is discussed. Three steps — the middle one is agent work:

**a. Plan** — group citations by source video and write agent task files:

```bash
node "<skill>/scripts/cite_timecodes.ts" plan "<note.md>" "<transcripts_dir>" "<workdir>"
```

Prints how many citations/videos/bins, and writes `<workdir>/tasks/task_NN.json` (one bin =
one agent's work) plus `occ.json` (every citation, in reading order). `--per-bin N` tunes bin
size (default 18).

**b. Match** — spawn **one matcher agent per task file**, in parallel. Each reads its videos'
transcripts and locates the timecode for every idea. The prompt that works (returns the
verbatim stamp **and** the transcript line, so the next step can validate it):

> Ты сопоставляешь дистиллированные русские идеи с точным моментом в английских
> авто-транскриптах YouTube, чтобы сделать ссылку-переход на таймкод. **Точность важнее
> охвата — неверный таймкод хуже, чем его отсутствие.**
>
> 1. Прочитай задание `<workdir>/tasks/task_NN.json`: `{videos:[{video_id, txt, ideas:[{occ_id, idea, consensus}]}]}`.
> 2. Для каждого видео прочитай транскрипт по пути `txt`. Каждая строка начинается со стемпа
>    `[M:SS]` — начало ~12-секундного блока. Для каждой идеи найди блок, где мысль звучит
>    прямее всего; сопоставляй по смыслу (имена/числа/названия — якоря; авто-субтитры врут в
>    написании). `consensus:true` — тема нескольких авторов; найди, где ЭТОТ спикер выражает
>    её прямее всего.
> 3. На каждую идею верни `{occ_id, vid, stamp, line, confidence}`: `stamp` — скопирован
>    ДОСЛОВНО из блока (`[M:SS]`); `line` — полный текст блока БЕЗ стемпа, дословно;
>    `confidence` — `high` (звучит явно) / `med` (верная область) / `low` или не нашёл →
>    `stamp:null`. Не выдумывай таймкод.
> 4. Запиши JSON-массив в `<workdir>/res/res_NN.json`. `stamp`+`line` сверят с транскриптом
>    именно этого видео — расхождение отбрасывается, так что копируй точно и никогда не бери
>    стемп из другого видео.

One video per agent (or a small bin) matters: an agent focused on one transcript pins ideas
accurately; six transcripts at once invites cross-video mixups.

**c. Apply** — validate and rewrite:

```bash
node "<skill>/scripts/cite_timecodes.ts" apply "<note.md>" "<transcripts_dir>" "<workdir>"
```

For every match it checks the `(stamp, line)` pair exists **verbatim in that video's own
transcript** (a stamp-only check can't catch a cross-video slip — every video has a `[4:05]`),
that the timecode is within the video's duration, and that confidence isn't `low`. Passing
footnotes become `[\[N\]](url&t=<sec>s)`; anything that fails or is `null`/`low` falls back to a
plain `[\[N\]](url)` video link — still clickable, just no timecode (zero regression). The note
is backed up to `.<name>.bak` first, and the run prints how many were timecoded vs left plain.

### 5. Spot-check and report

The `apply` gate proves each timecode lands in the **right video** at a **real** line, but not
that it's the right _moment_ for that idea. Read ~10–15 matches (weight toward `*(консенсус)*`
and `med`-confidence — the hardest to localize) and confirm the idea actually matches the
quoted line. Report honestly: how many footnotes got timecodes vs stayed plain, and that
timecodes are approximate (±one ~12-second block).

## Свод со скриншотами (optional)

By default the свод is subtitles-only. When the user explicitly wants screenshots in it
(«скриншоты важны», «с картинками»), extend the flow after step 4 — the deep-linked
footnotes are your anchors:

1. **Pick what earns an image.** Not every bullet — visual moments only (redesigns, UI
   examples, diagrams, size specs), roughly 1–3 per section. The cited timecode in the
   bullet's footnote is where the frame lives.
2. **Get the frames.** Preferred: download the source videos (480p video-only, sequential
   with `sleep 5`+ between them — batch downloads hit the bot-check, see
   `references/download-fallbacks.md`) and extract with `frames.ts` at the cited timecodes.
   If downloads stay blocked, use the browser canvas-capture fallback from the same
   reference.
3. **Verify every frame visually** before binding it — same rule as the single-video flow:
   read the image, confirm it shows the idea, nudge ±1–2s or drop it if it doesn't. A
   series of byte-identical captures means stale frames — recapture.
4. **Bind and insert.** Copy chosen frames into the vault attachments as `<slug>-NN.<ext>`
   (check for collisions first; keep numbering in reading order), and insert `![[<name>]]`
   on its own line directly under the bullet it illustrates. Script the insertion by
   anchoring on unique bullet substrings — 30 hand-edits invite mistakes.
5. Save the note after images are in; report how many frames came from downloaded video vs
   the browser fallback.

## Notes

- **Clickable footnotes render as `[N]`.** The `[\[N\]](url)` form keeps the visible `[N]` look
  (escaped brackets) while being a link; in Obsidian Live-Preview the raw form shows only when
  the cursor is on that line. Bare `[N]` without `(url)` is **not** clickable — always finish a
  свод through step 4 (or at least an `apply`, which upgrades bare `[N]` to clickable too).
- **Extending an existing свод.** Back it up, keep source numbers `[1..K]` frozen, append new
  sources as `[K+1..]`, and add only genuinely new points (fold duplicates into consensus
  markers). Then re-run step 4 over the whole note — `apply` is idempotent (it strips any
  existing `&t=` before re-adding), so re-processing old footnotes is safe.
- **Approximate by design.** Some bullets summarize a whole video with no single moment; the
  matcher picks where it's stated most directly and marks `med`. That's expected, not a bug.
