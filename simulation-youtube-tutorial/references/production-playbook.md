# Production Playbook

## Proven case study

The AC/DC sorting simulation tutorial used this pattern:

- Simulation: `https://iwant2study.org/lookangejss/00workshop/2026TFL/sortingDragandDrop/`
- YouTube embed id found in the page: `miDdS93oYUA`
- Final local export name: `AC_DC_sorting_tutorial_enhanced_13yo_emotional_kokoro.mp4`
- Final video verification: `1366x768`, `25 fps`, about `331.88 s`
- Narration: Kokoro voice `af_heart`
- Recording style: automated browser walkthrough with fake highlighted cursor, bottom captions, pulsed targets, pause-and-think moments, deliberate mistake/correction, and recap.

## Folder pattern

Use a production folder close to the simulation:

```text
01_scripts/
  record_<simulation>_tutorial.js
  generate_kokoro_narration.py
  create_youtube_thumbnail.py
  upload_to_youtube.py
02_audio/
  narration_script.txt
  narration_kokoro_<voice>.wav
  narration.srt
03_screen_recording/
  <simulation>_tutorial.webm
04_exports/
  <simulation>_tutorial_kokoro.mp4
05_previews/
  thumbnail_1280x720.jpg
99_notes/
  youtube_metadata.json
  youtube_upload_prep.md
```

Never commit OAuth tokens or client secrets in `99_notes/`.

## Automated recording recipe

Use Playwright with explicit viewport and recorded video size:

```js
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  recordVideo: { dir: outDir, size: { width: 1366, height: 768 } }
});
```

Inject overlays into the page:

- Bottom caption panel for the current narration/action.
- Rule card for definitions or thinking heuristics.
- Fake cursor with a bright outline.
- Pulse/highlight class on the current target.

Keep steps as timed objects:

```js
const steps = [
  { t: 16, cap: "Hook question", action: async page => { /* show rule */ } },
  { t: 12, cap: "Place Battery in DC", action: async page => { /* click item and zone */ } }
];
```

Each step should leave enough time for the learner to see the action. Add pauses before revealing answers for misconception-heavy items.

## Kokoro narration recipe

Use Kokoro local TTS for natural open-source narration:

```python
from kokoro import KPipeline
pipeline = KPipeline(lang_code="a")
for result in pipeline(text, voice="af_heart", speed=0.82, split_pattern=r"\n+"):
    ...
```

Rules:

- Save narration source as UTF-8 without BOM.
- Strip headings, metadata, and empty leading chunks before TTS.
- Generate WAV first; encode later during assembly.
- If Kokoro returns no chunks or throws an empty-array error, rewrite the narration text without BOM and remove non-spoken headings.
- Generate or rescale captions after final audio duration is known.

Known useful voices and speeds:

- `af_heart`, speed around `0.72` to `0.82` for slower student-facing explanation.
- `af_bella`, speed around `0.95` for polished teacher-style narration.

## Assembly

Use the final screen recording and Kokoro WAV to create the MP4. With FFmpeg available, prefer H.264 and AAC:

```powershell
ffmpeg -y -i screen.webm -i narration.wav -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest output.mp4
```

If the narration and screen recording lengths differ slightly, use an `atempo` adjustment only after calculating the ratio from actual durations.

## Verification commands

Check video stream:

```powershell
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,duration -of default=noprint_wrappers=1 output.mp4
```

Check audio stream:

```powershell
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels,duration -of default=noprint_wrappers=1 output.mp4
```

Pass criteria:

- Width at least `1280`.
- Height at least `720`.
- Audio stream exists.
- Duration matches expected tutorial length.
- Visual overlays do not hide essential simulation UI.

## YouTube package

Prepare:

- Recommended title and alternatives.
- Description with simulation link.
- Chapters based on final timestamps.
- Tags and hashtags.
- Thumbnail at `1280x720`.
- Pinned comment with the simulation URL and key learning rule.
- Visibility suggestion: upload unlisted first, review playback, then switch public.

For API upload, use YouTube Data API only after the user provides/authorizes credentials for the intended channel. Keep tokens local and ignored.
