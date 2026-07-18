# When YouTube blocks downloads

Read this when `yt-dlp` starts failing with **HTTP 429** and **"Sign in to confirm you're
not a bot"**. This is the norm for batch downloads (a whole channel/playlist), not a
transient glitch: after the first 2–3 video files YouTube rate-limits the IP and demands a
PO token, and the block persists for hours. Things that do NOT help, so don't burn time on
them: retrying with sleeps alone, `--extractor-args "youtube:player_client=tv"` (returns
DRM-only formats), `player_client=ios` (requires a PO token anyway). Subtitle-only
downloads (`transcripts.ts`) are much lighter and usually unaffected.

## Fix 1 — PO tokens via bgutil provider (no login, preferred)

The [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider)
plugin generates the PO tokens yt-dlp needs, anonymously — no account, no cookies.
One-time setup (check whether it's already installed first):

```bash
# 1. Plugin (yt-dlp loads it straight from the zip)
mkdir -p ~/.config/yt-dlp/plugins
curl -sL -o ~/.config/yt-dlp/plugins/bgutil-ytdlp-pot-provider.zip \
  "$(curl -s https://api.github.com/repos/Brainicism/bgutil-ytdlp-pot-provider/releases/latest \
     | grep -o 'https://[^"]*bgutil-ytdlp-pot-provider.zip')"

# 2. Token generator (node >= 18)
git clone -q --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
  ~/.local/share/bgutil-ytdlp-pot-provider
cd ~/.local/share/bgutil-ytdlp-pot-provider/server && npm ci --silent && npx tsc

# 3. Symlink to the plugin's default lookup path -> script mode works with zero config
ln -sfn ~/.local/share/bgutil-ytdlp-pot-provider ~/bgutil-ytdlp-pot-provider
```

No daemon needed: in **script mode** the plugin runs
`node ~/bgutil-ytdlp-pot-provider/server/build/generate_once.js` per request. For large
batches an HTTP server is faster (it caches the session):
`node ~/bgutil-ytdlp-pot-provider/server/build/main.js` (port 4416) — the plugin finds it
automatically and silently falls back to script mode when it's down.

Verify with `yt-dlp -v <url> 2>&1 | grep -i pot` — you should see
`Generating a gvs PO Token … via bgutil`. A red deno error in the log is cosmetic (the
deno variant is unavailable; node is used). If the plugin breaks after a yt-dlp upgrade,
update the zip and rebuild the server to the latest release.

Pacing still applies — 429 is partly per-IP. Download sequentially with pauses
(`sleep 5`+ between videos), never in parallel bursts.

## Fix 2 — cookies from a spare account (user does this, not you)

If tokens aren't enough: the user logs into YouTube with a **throwaway** account in a
private window, exports `cookies.txt` (e.g. the "Get cookies.txt LOCALLY" extension),
closes the window (YouTube rotates cookies of live sessions), then `yt-dlp --cookies
cookies.txt`. Never drive the login yourself and don't pull the main account's session via
`--cookies-from-browser` — Google flags accounts used for automated downloads.

## Fix 3 — frames from the embedded browser (no download at all)

When only **screenshots** are needed (the свод case) and downloads stay blocked, grab
frames straight from the YouTube player in the embedded Browser pane. Canvas capture of
the `<video>` element returns the pure video layer — no captions, no controls, no page UI.

1. Start the receiver so frames land in files instead of dragging base64 through context:
   `node <skill>/scripts/shot-server.mjs <outdir>` (background; port 8765).
2. Open the watch page, then per timestamp run in the page (javascript_tool):
   force quality once — `movie_player.setPlaybackQualityRange('hd720','hd720')`; seek —
   `v.currentTime = t; await seeked; v.pause()`.
3. **Take a `computer screenshot` after every seek.** The pane is unfocused, so the
   compositor doesn't present new frames until a screenshot forces a paint; without it the
   canvas returns the previous (stale) frame. Occasionally two screenshots are needed. The
   screenshot doubles as your visual verification of the frame.
4. Capture: draw `v` into a canvas, `toDataURL('image/jpeg', 0.92)`, `fetch` POST to
   `http://localhost:8765/?name=<videoid>_<t>`.
5. Stale-frame detector: identical `md5` across a series of captures means the paint never
   happened — redo that batch (seek → screenshot → capture, one at a time).

Quality tops out at the player's streamed resolution (720p is reliable); a downloaded
480p file via `frames.ts` is still preferred when the download works.
