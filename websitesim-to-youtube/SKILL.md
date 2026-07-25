---
name: websitesim-to-youtube
description: Turn a live website, browser app, or educational simulation into a polished narrated YouTube tutorial. Use when Codex must inspect a real web workflow, record human-looking cursor actions in Chrome or another browser, explain each click or drag, add numbered teaching captions, synchronize narration before visible actions, repair incorrect screen segments, export an MP4, and verify the final video.
---

# Website Simulation to YouTube

## Outcome

Produce a truthful tutorial from the real website: a live screen recording, natural narration, clear step captions, and a verified MP4. Preserve the learner's mental model by showing the correct UI state before, during, and after every action.

## Non-negotiable rules

- Use the exact URL and actual interface as the source of truth.
- Fix browser zoom, viewport, crop, and visible menus before recording.
- Show one cursor only. Use a real browser cursor or an accurately captured system cursor.
- Keep cursor travel purposeful and slightly varied; do not teleport between targets.
- Hold the current UI state until its narration finishes. Then move and act.
- For a drag, show the object before pickup, during travel, at the snap target, and in the final connected state.
- Do not hide an incorrect state with blur, zoom, or captions. Recapture or replace that segment.
- Treat teaching captions as concise signposts, not a transcript of every spoken word.
- Verify the delivered MP4 itself. Do not infer quality from source files.

## Workflow

### 1. Inspect and define success

1. Open the exact page in the user's requested browser.
2. Identify authentication boundaries, zoom, responsive layout, toolbars, and panels that should be excluded.
3. Rehearse the workflow and record the expected state after every click, drag, entry, or selection.
4. Define the final success state in observable terms.
5. If a PDF or manual supplies the procedure, cross-check the live interface against it and note any version differences.

Read `references/production-workflow.md` before recording a multi-step or drag-heavy workflow.

### 2. Create a cue manifest

Use one cue per teachable action. Each cue should include:

- cue ID and spoken text;
- source recording and source action time;
- expected pre-action state;
- visible action and expected post-action state;
- caption text and step number;
- timeline start, end, and output action time after assembly.

The synchronization contract is:

```text
narration ends → 0.15–0.35 s comprehension beat → cursor travels → action → result hold
```

Use `scripts/validate_sync_manifest.py` after generating the final cue manifest.

### 3. Record the live browser

- Prefer the user's existing authenticated Chrome session when login state matters.
- Ask the user to sign in only at the authentication boundary.
- Use 1920×1080 or higher capture when practical; never deliver below 1280×720.
- Set browser zoom before the take and keep it unchanged.
- Exclude the Windows taskbar, browser download shelf, and unrelated tabs from the final crop.
- Park any extra physical cursor outside the final crop.
- Rehearse complex drags, then record generous handles before and after the action.
- End every take with a stable proof frame showing the correct result.

For connected programming blocks, drag the intended sub-stack from its top block. Confirm every lower block remains attached during the move and that all puzzle joints are visibly connected after release.

### 4. Build narration from the screen action

Record first, then write narration against the real footage. Generate one audio file per cue when possible so individual segments remain replaceable.

- Use short sentences and name the target before acting.
- Explain the reason behind the action, not only the gesture.
- Use a consistent instructor voice; Kokoro `af_bella` is a suitable local female default.
- Normalize the final program to about -16 LUFS and keep peaks at or below -1.5 dBTP.
- Regenerate or retime captions after the final narration duration is known.

### 5. Assemble without premature actions

For each cue:

1. Freeze or hold the correct pre-action frame while narration plays.
2. Start the live source shortly before the cursor begins moving.
3. Let the action occur only after narration ends.
4. Hold the correct post-action result long enough to read.
5. Join cues without black frames or accidental jumps.

When only one action is wrong, insert a clean replacement take for that cue. Preserve the rest of the validated master.

### 6. Add teaching captions

Use numbered steps so viewers always know their position, for example `STEP 3 OF 8`. Add short non-step signposts such as `WHY`, `TEST RESULT`, `WATCH OUT`, `FINAL CHECK`, and `RUN`.

- Keep captions within title-safe margins.
- Use high contrast and no more than one or two short lines.
- Highlight only key terms or the currently spoken phrase.
- Avoid covering the object being manipulated or its destination.
- Do not display production instructions such as “NO SUBTITLES”.

Read `references/caption-system.md` before creating or retiming the caption layer.

### 7. Run the correction loop

Inspect the full render and every high-risk segment:

- before and after each menu change;
- every drag pickup and release;
- settings confirmations;
- final run or success state;
- every caption transition.

If a defect appears, recapture the smallest complete action with enough context, replace its cue, render again, and repeat the checks. Do not call the video final while a misleading state remains visible.

### 8. Verify and deliver

Run:

```powershell
python .\scripts\verify_tutorial_video.py .\output\tutorial.mp4 --json .\output\tutorial.qa.json
python .\scripts\validate_sync_manifest.py .\output\tutorial.sync.json
```

Read `references/quality-gate.md` for the final review standard.

Deliver:

- final captioned MP4;
- clean master when useful;
- cue/synchronization manifest;
- QA report and key review images;
- optional title, description, chapters, tags, and thumbnail;
- a concise list of any action the user must still perform.

## Privacy and publishing

- Never commit credentials, cookies, OAuth tokens, student data, or private recordings.
- Use ignored local paths for upload tokens.
- Upload only to the explicitly named account or channel.
- Prefer an unlisted review before public release unless the user clearly requests immediate publication.
