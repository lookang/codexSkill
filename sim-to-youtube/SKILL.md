---
name: sim-to-youtube
description: "Turn a science simulation, website, browser app or SLS workflow into an engaging, verified YouTube tutorial package. Use when the user gives a simulation URL, a WebEJS/EJS source file, or raw screen recordings (screen_*.mp4 + camera_*.mp4) and wants any of: pedagogy review and source fixes, a self-recorded or edited walkthrough with a visible teaching cursor, Kokoro narration replacing their voice, HyperFrames motion graphics synced word-by-word to the narration, privacy blurring, an SRT, a thumbnail, and copy-paste YouTube metadata including chapters, Problems and Quizzes. Replaces simulation-youtube-tutorial and websitesim-to-youtube."
---

# Sim to YouTube

One skill for every "make a YouTube video of this" request: simulations (WebEJS/EJS or any web sim), websites and
browser apps, and edits of the user's own screen recordings. The output is a truthful, engaging tutorial whose
every on-screen claim is checked against the footage.

## Pick the route

| Input | Route | Read |
|---|---|---|
| WebEJS `_source.json` / `.ejss` that needs fixing | **A. Improve the sim first**, then B | `references/source-editing.md` |
| A simulation or website URL, no footage | **B. Self-record** the live page with a scripted cursor | `references/recording.md` (Route B) |
| `screen_*.mp4` (+ `camera_*.mp4` voice) from the user | **C. Edit the user's footage**; may be several takes or a Part 1/Part 2 series | `references/recording.md` (Route C) |

Every route then goes through the same production line:

1. **Plan and script** -> `references/planning-and-narration.md`
2. **Narration** (Kokoro + word timings) -> same file; template `templates/hyperframes-edit/tts.py`
3. **Edit in HyperFrames** (HTML + GSAP -> MP4) -> `references/hyperframes-edit.md`, templates in `templates/hyperframes-edit/`
4. **Sync and overlays** -> `references/sync-and-overlays.md`
5. **Privacy pass** (Route C always; Route B when logged in) -> `references/privacy.md`
6. **Package for YouTube** -> `references/youtube-upload-package.md`
7. **Quality gate** -> `references/quality-gate.md`

Worked examples with real numbers and the mistakes they taught: `references/case-studies.md`.

## House standard (non-negotiable unless the user overrides)

These come from the channel owner's explicit feedback on recent videos. Apply them by default.

**Voice and length**
- Replace the user's voice with Kokoro **`am_michael`** (male, clear English) at **speed 1.0**. Never use the raw voice track in the final video; use it only as a transcript for what the user meant.
- Hook in the **first 5 seconds**: the most surprising true result from the footage (a number, a bug caught, a counter-intuitive outcome).
- Length follows the material. Short demos: 2-4 min. When the user has explained nuances (e.g. a 24-min recording), aim for **about 15 minutes**: keep the technicalities, add the underlying science/maths concepts and the teacher pain points, do not "brush them away".
- Pace for newcomers: breathing room after each sentence (~0.8 s), no frantic speed-ups except obvious waits (and label those, e.g. "worked for 23m 57s" -> shown fast-forwarded).

**Picture**
- Footage is **full-frame**: no card border, no letterbox, no black bands. For self-recorded sims, size the browser so the app itself fills 16:9 (e.g. 1280x720 viewport at deviceScaleFactor 1.5 = 1920x1080 frames) and stretch panels if needed.
- Open each scene on a **full-screen establishing shot**, then push in to the detail.
- A visible **cursor/pointer leads attention**: animated pointer glides to every highlight box; recorded cursor is large, high-contrast, with a click ripple.
- **No burned-in subtitles.** YouTube shows the uploaded `.srt`. Short teaching signposts (chapter tags, step numbers, formula cards, stamps) are fine.
- Exciting but honest motion graphics: kinetic headline chips, stamps with shake/flash, prediction countdowns, formula cards, animated diagrams of the concept, synthesized music bed ducked under the voice, SFX on key beats.

**Sync (the difference between "good" and "great")**
- Every pop-up appears **on its narration word** and leaves when **its sentence ends** (+0.7 s); never lingers to the end of the scene.
- Every highlight box must sit on its target **while the target is actually on screen**: verify against the footage (`sync_check.py`), retime the footage to hold the target, or drop the box.
- Word anchors on **repeated words** ("the", "current", "only") must use the right occurrence. Scan for them before rendering.
- Footage must not race ahead of the callout; if the UI moves before the voice names it, slow or freeze that piece.

**Truth and privacy**
- Check **every claim** (numbers, labels, version strings, durations, marks) against full-resolution frames. Note the source second next to each line in `narration.py`.
- Cut segments that do not prove their point (e.g. a demo whose payoff was never shown).
- **Blur** student names, staff emails, the user's file explorer / save dialogs, course title bars naming other people. Ask before showing the user's own name; credit original authors when told (e.g. "Original simulation by ...").
- Describe sped-up AI waits and computer-generated narration in the description.

**Deliverables (same folder as the raw footage, or `video/` beside the sim)**
- `<Name>.mp4` (1920x1080, 30 fps, H.264/AAC, -16 LUFS, peaks <= -1.5 dBTP)
- `<Name>.srt` with readable digits and units ("3.75 minutes", "62.5 °C", "F = BIL")
- `<Name>_thumbnail.png` (1280x720, honest frame + 2-4 big words)
- `<Name>_youtube_kit.md`: 3 titles, description, chapters, tags, **Problems** block, **Quizzes** (question, ✅ correct, ✗ incorrect options, explanation, H:MM:SS time), series links
- `promo_build/` (or `build/`) with a README so any line can be re-voiced and rebuilt

## Working rules

- Inspect before editing: map the whole recording with contact sheets, then confirm coordinates with `scripts/frame_ruler.py`.
- Ask the user only for genuine decisions (show/blur their name, credit, what to do with a failed live moment, series vs one long video). Otherwise use the defaults above.
- For series (Part 1 / Part 2): separate videos, a 15-20 s "Next: Part 2" teaser before Part 1's end card, a 20 s recap at the start of Part 2, playlist + cross-links in descriptions.
- Never claim a render is finished until the MP4 exists, its timestamp is fresh, and frames have been inspected. If the user asks "is this the latest?", compare size and modified time (Explorer's "Date" column may show creation time).
- Never commit credentials, footage, OCR name lists or learner data. Upload only to an explicitly named channel, unlisted first.
