---
name: simulation-youtube-tutorial
description: Create polished HD YouTube tutorials from an interactive web simulation. Use when Codex must plan or produce a screen-recorded simulation walkthrough with visible highlighted cursor, target highlights, learner-friendly captions, Kokoro open-source narration, synced subtitles, MP4 export, thumbnail, YouTube metadata, and verification that the final video is at least HD.
---

# Simulation YouTube Tutorial

## Core stance

Turn the actual simulation into the tutorial. Record the live interactive page, make cursor movement and target selection visible, narrate with Kokoro open-source TTS when requested, and verify the exported video before calling it ready for YouTube.

Do not upload credentials, OAuth tokens, raw private recordings, or screenshots with learner data. Do not claim a polished MP4 exists until an actual screen recording and final audio have been assembled and verified.

## Inputs to gather

- Simulation URL or local `index.html`.
- Learning goal, target learners, and rough duration.
- Whether the user will record manually or Codex should automate the recording.
- Voice choice and speed, defaulting to Kokoro `af_heart` or `af_bella` if no preference is given.
- YouTube visibility preference, thumbnail direction, and whether upload should be manual or API-assisted.

## Workflow

1. Inspect the simulation.
   - Use the real page, not screenshots, as the source of truth.
   - Identify the main learner actions, misconceptions, checkpoints, and final success state.
2. Write a timed tutorial plan.
   - Start with a concrete student hook.
   - Use short segments with a visible action, narration cue, and expected screen state.
   - Include pauses where students should think before the answer is shown.
3. Record the screen in HD or better.
   - Minimum video size is 1280x720. Prefer 1366x768 or 1920x1080.
   - For automated browser capture, use Playwright video recording with an explicit viewport and final `ffprobe` verification.
   - Inject a visible cursor and highlight/pulse the relevant simulation targets.
4. Generate narration with Kokoro when voiceover is needed.
   - Save clean narration text as UTF-8 without BOM.
   - Generate WAV first, then encode or assemble into MP4.
   - Regenerate or scale SRT captions after final audio duration is known.
5. Assemble the final MP4.
   - Combine the screen recording and narration.
   - Keep pacing aligned with the visible actions and captions.
   - Add AAC audio and H.264 video unless the user requests otherwise.
6. Prepare YouTube packaging.
   - Create title, description, chapters, tags, thumbnail path, and pinned comment.
   - Suggest unlisted first, then public after playback review.
   - Upload only after credentials and destination channel are explicit.
7. Verify before reporting completion.
   - `ffprobe` width and height show at least 1280x720.
   - Duration matches the planned range.
   - Audio stream exists and is audible.
   - The cursor/highlights are visible.
   - Captions and chapter timestamps match the final render.

## Task routes

- For the detailed automated Playwright plus Kokoro pattern, read `references/production-playbook.md`.
- For manual recording, still produce the timed script, MP3/WAV narration, SRT, and sync cues first.
- For a live YouTube upload, never commit token files; use a local ignored token path and report only the resulting video URL or ID.

## Verification checklist

- Tutorial uses the actual simulation page or URL.
- Screen recording is HD minimum: `width >= 1280` and `height >= 720`.
- Cursor or pointer is visible and highlighted.
- Important targets are highlighted or pulsed during explanation.
- Kokoro narration was generated from clean UTF-8 no-BOM text, when requested.
- Final captions were generated after final audio render.
- MP4 has both video and audio streams.
- YouTube metadata includes title, description, chapters, tags, thumbnail, and visibility guidance.
- Credentials, OAuth tokens, local secrets, and learner/private data were not committed.
