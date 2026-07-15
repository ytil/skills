# video.json — контракт и правила авторинга

Read this when distilling a video into `video.json` (workflow step 2/3). The JSON is the
single source of truth: `render_obsidian.ts` and `render_html.ts` both consume it, so
whatever you write here IS the note. Both renderers run the same validation gate
(`note_model.ts`) and refuse to render on any problem.

## Contract (schema_version: "video-notes-1")

```json
{
    "schema_version": "video-notes-1",
    "video": {
        "id": "Sh6lK57Cuk4",
        "url": "https://www.youtube.com/watch?v=Sh6lK57Cuk4",
        "title": "The Weird History of JavaScript",
        "channel": "Fireship",
        "duration": 729
    },
    "sections": [
        {
            "title_ru": "Рождение языка за 10 дней",
            "t": 96,
            "ideas": [
                {
                    "tldr_ru": "JavaScript написан за 10 дней как «клей» для браузера.",
                    "points_ru": [
                        "Netscape нужен был скриптовый язык для нетехнарей",
                        "Brendan Eich взял Scheme и обернул в синтаксис Java"
                    ],
                    "screenshot": "f_00104.5.png",
                    "quote": {
                        "text_ru": "«Java — для профессионалов, JavaScript — для всех остальных»",
                        "orig": "Java for professionals JavaScript for everyone else",
                        "t": 130
                    },
                    "mermaid": "flowchart LR\n  A[Scheme] --> C[JavaScript]\n  B[Java syntax] --> C",
                    "callout": "tip"
                }
            ]
        }
    ]
}
```

All fields beyond `tldr_ru` are optional per idea. `section.t: null` → header without a
deep link (rare; use the timecode of the first idea's discussion).

## Правила авторинга

**Секции (4–8).** Спайн заметки. Если у видео есть авторские главы (`meta.json →
chapters` после fetch) — начни с них: сливай соседние мелкие, режь часовые, переименуй
в русские смысловые заголовки (не «Intro»). Без глав — режь по смысловым сдвигам
транскрипта. `t` — секунда, где тема реально начинается.

**Идея-карточка.** `tldr_ru` — тезис одним предложением, самодостаточный (читается без
подпунктов); `points_ru` — 2–4 детали: цифры, шаги, названия. НЕ дублируй tldr в points.
Плоский список из 20 пунктов — то, от чего мы ушли; полотно из 8 секций по 8 карточек —
то же полотно, только хуже: типичное 15-минутное видео = 4–6 секций × 2–4 идеи.

**Скриншоты.** Как раньше: только реально визуальные кадры (слайд, UI, график), имя
файла из `<workdir>/frames`. Кадр привязывай к идее, которую он иллюстрирует.

**Цитаты (0–3 на заметку).** Только когда формулировка автора сильнее пересказа.
`orig` — ДОСЛОВНАЯ строка из транскрипта (валидатор сверяет containment ≥ 0.5 с блоком
около `t`; не прошло — рендер падает). `text_ru` — твой перевод. Не выдумывай цитат.

**Mermaid (0–2 на заметку).** Только если у идеи есть ФОРМА: цикл, воронка, сравнение
двух путей, пайплайн, таймлайн. Подпись-текст уже есть в tldr — диаграмма не пересказ,
а скелет. `flowchart LR/TD` покрывает почти всё; без ``` внутри. Если сомневаешься,
нужна ли диаграмма — не нужна.

**Callout (0–2 на заметку).** `tip` — главный вывод видео, `warning` — грабли/риск.
Это акценты; заметка из callout-ов — снова полотно, только цветное.

**Язык.** Все `*_ru` — естественный русский без калек (правила из SKILL.md шага
дистилляции действуют и здесь); имена/бренды/термины — как в источнике.

## Рендеринг

```bash
# превью в чат до подтверждения имени (ничего не пишет):
node "<skill>/scripts/render_obsidian.ts" "<workdir>/video.json" "<workdir>" --dry-run

# сохранить в vault (после подтверждения имени; сам копирует кадры как <slug>-NN.png,
# отказывается перезаписывать существующую заметку):
node "<skill>/scripts/render_obsidian.ts" "<workdir>/video.json" "<workdir>" \
    --vault "$HOME/Yandex.Disk.localized/ytil-db" \
    --attachments "$HOME/Yandex.Disk.localized/ytil-db/attachments" \
    --name "<подтверждённое имя>" --slug <latin-slug>

# HTML-режим (по запросу пользователя; страница + assets/ вне vault):
node "<skill>/scripts/render_html.ts" "<workdir>/video.json" "<workdir>" \
    --out "$HOME/yt-notes-html" --slug <latin-slug>
```

Валидация падает списком проблем (битый таймкод, несверившаяся цитата, отсутствующий
кадр) — исправляй `video.json` и перезапускай; повторный рендер бесплатный.
