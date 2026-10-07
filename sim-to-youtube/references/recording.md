# Recording and footage

## Route B - Self-record a live simulation or website

Prefer a scripted headless capture that advances the page deterministically (one frame per model step) over a
real-time screen grab: it is repeatable, sharp and easy to retime. Template: `templates/self-record/record_ejs_sim.mjs`
(puppeteer-core; set `CHROME_PATH`).

Setup
- Viewport so the **app fills 16:9 with no bands**: e.g. `setViewport({width: 1280, height: 720, deviceScaleFactor: 1.5})`
  gives 1920x1080 screenshots of a page laid out for 1280x720. Stretch panels (EJS `linkProperty('Height', ...)`) and
  re-apply after any stage/reset change. Never deliver below 1280x720.
- Seed `Math.random`; disable text selection (`*{user-select:none}`) so drags don't highlight text.
- Inject a **large high-contrast cursor** (yellow with black outline, ~40-60 px at 1080p) plus a red click ripple.
  Headless screenshots have no system cursor.

Capture loop (`snap()` per frame at 30 fps)
- `moveTo(x, y, sec)` with ease-in-out; `click(id)` = move, short hover, click, ripple, hold 0.35 s.
- `slide(id, value)` = real mouse drag of a range thumb, then **nudge** until the input reports the exact value
  (pixel mapping is never exact). Label only the landed value.
- `run(perFrame, doneFn, maxFrames)` steps the model and snaps each frame; override `isPlaying` while stepping if
  events depend on it.
- `mark(name)` logs the frame, the readout text, the banner text and element boxes (CSS px) to `work/marks.json`
  - these are the facts the narration quotes and the coordinates overlays use (multiply by deviceScaleFactor).
- `--dry` mode writes one PNG per mark for fast iteration.

Encode: `ffmpeg -framerate 30 -i work/frames/%05d.jpg -c:v libx264 -crf 16 -pix_fmt yuv420p screen_recording.mp4`.
Keep the clean recording as a deliverable.

Playwright alternative (from the older playbook): `browser.newContext({viewport, recordVideo: {dir, size}})`, inject
the same cursor/pulse overlays, run timed steps, then verify with `ffprobe`. Real-time capture is fine for simple
click-throughs but cannot slow a fast simulation.

Website/browser-app rules (from websitesim-to-youtube)
- Use the exact URL; keep query parameters; stop at login boundaries and let the user sign in.
- Fix zoom and window size once; hide unrelated tabs, download shelf, taskbar.
- Name the target, then move; let the action happen after its narration; hold the result >= 0.7 s (1.5-3 s finals).
- Drags: show the object before pickup, during travel, at the snap target, and connected after release; inspect
  every joint at full resolution.
- Do not hide an incorrect state with blur or zoom - recapture that cue and replace only it.

## Route C - Edit the user's own recordings

Typical folder: `screen_<id>.mp4` (silent, ~1900x970) + `camera_<id>.mp4` (the user's voice, often audio-only).

- Transcribe the voice; map the screen (see planning-and-narration.md).
- **Several takes:** combine meaningfully - pick the clearest take for each step, use the other for context or a
  second example, and desaturate "old way" footage. Keep a per-take source id on every scene.
- **Long recordings (20+ min):** cut waiting, dead ends, re-tries and repeated explanations; keep every distinct
  idea the user articulated. Speed up AI "thinking" time and badge it (`▶▶ ×7`) or state "worked for 9m 29s".
- Cut any segment whose payoff is not shown (the user will ask).
- If a live run fails on camera (e.g. a plan usage limit), ask whether to cut it or keep it as a tip.
- Prepare `hf/assets/screen.mp4` = a blurred copy (see privacy.md); the original is never edited in place.
- Coordinates are SOURCE pixels of the recording; the edit's camera maps them to 1920x1080 (cover-fit, clamped so
  nothing outside the page shows). A slight letterbox from a non-16:9 recording is acceptable only if cover-fit
  would crop essential UI; prefer cover-fit.
- `cv2` seeking can be ~1 s off on these recordings: confirm coordinates with ffmpeg-accurate frames.
