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
- Guided scroll hint when moving to another part of the interactive.
- Short reaction bubble when an evidence moment needs emotional emphasis.

Cursor and navigation rules:

- Use the cursor as the teacher's hand. If the narration says "oil film", "water level", "temperature", "save", or "graph", move the cursor to that exact target and hold long enough for the learner to notice.
- Make the cursor visibly different from the simulation palette. If the simulation uses green controls, prefer magenta, cyan, yellow, or white glow.
- Do not use direct `scrollIntoView()` or instant page jumps in the final capture when the learner needs to understand how to navigate. Scroll in visible steps with the cursor near the side of the browser, then align precisely after the movement.
- Review the entire narration/script and add pointing cues wherever the spoken words refer to a specific on-screen object, control, data table, graph, or explanation area.
- Concept cards, icons, small pictures, and reaction bubbles may add warmth and variety, but they must not cover active controls, apparatus labels, tables, graph evidence, or the cursor target.

Readable overlay timing:

- Keep every reaction bubble, snap label, and scroll hint visible for at least 3 seconds.
- Add about 0.18 seconds for each word beyond six words.
- Cap routine overlays around 6.2 seconds so they stay readable without dominating the screen.
- Use proof frames or contact sheets to verify text is visible and readable across more than one sampled frame.

Reusable timing helper:

```js
function readableHoldMs(text, requestedMs = 3000) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const calculated = 3000 + Math.max(0, words - 6) * 180;
  return Math.max(requestedMs, Math.min(calculated, 6200));
}
```

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
- Cursor movements and guided scrolls make page-area changes understandable.
- Overlay text remains readable for at least 3 seconds.

## YouTube package

Prepare a complete upload submission pack, not only a short note.

Required files:

```text
99_notes/youtube_metadata.json
99_notes/youtube_upload_prep.md
05_previews/thumbnail_1280x720.jpg or 05_previews/thumbnail_3840x2160.jpg
02_audio/narration.srt
```

`youtube_upload_prep.md` must include:

- Final video file path.
- Thumbnail path or detailed thumbnail brief.
- Recommended title plus two alternate titles.
- Copy-ready description with simulation link near the top.
- Hidden tags/keywords.
- Visible hashtags for the end of the description.
- Chapters starting at `00:00`.
- Pinned comment with simulation link and student question.
- Upload settings: visibility, category, playlist, audience setting recommendation, language, caption path, and license.
- Verification notes for MP4, audio, captions, thumbnail, and metadata.

`youtube_metadata.json` must include:

```json
{
  "title": "Recommended title",
  "alternate_titles": ["Search title", "Curiosity title"],
  "description": "Full YouTube description",
  "tags": ["primary topic", "science simulation"],
  "hashtags": ["#ScienceEducation", "#InquiryLearning", "#OpenSourcePhysics"],
  "chapters": [{ "time": "00:00", "title": "Hook" }],
  "thumbnail": { "path": "05_previews/thumbnail_1280x720.jpg", "status": "ready", "brief": "..." },
  "pinned_comment": "Try the simulation here: https://...",
  "category": "Education",
  "playlist_suggestion": "Science simulations",
  "audience_setting": "ask channel owner; do not guess if Made for Kids compliance matters",
  "language": "English",
  "captions_path": "02_audio/narration.srt",
  "visibility_recommendation": "unlisted first for review, then public",
  "verification": {
    "mp4_ready": true,
    "audio_ready": true,
    "captions_ready": true,
    "thumbnail_ready": true,
    "metadata_ready": true
  }
}
```

Title rules:

- Put the science topic or learner question near the beginning.
- Keep the recommended title around 55 to 70 characters when possible and under YouTube's 100-character limit.
- Provide a searchable classroom title, a curiosity title, and a teacher/resource title.
- Avoid misleading clickbait; the title and thumbnail must match what the video shows.

Description rules:

- First two lines should state the learning promise and include the simulation URL.
- Include 3 to 5 learning outcomes.
- Include chapters, credits, and classroom-use notes.
- End with 3 to 5 relevant hashtags.

Thumbnail rules:

- Use an honest frame or composition showing the actual simulation.
- Use a 16:9 image. Prefer `3840x2160` when file size allows, or `1280x720` as a safe HD target.
- Keep one short readable phrase, one clear focal object, and high contrast.
- Export a proof image and check it at small size.

For API upload, use YouTube Data API only after the user provides/authorizes credentials for the intended channel. Keep tokens local and ignored.
