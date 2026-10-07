# Final Quality Gate

## Technical

- MP4 opens and duration is plausible.
- H.264 video and AAC audio are present.
- Resolution is at least 1280×720; prefer 1920×1080.
- Frame rate is stable.
- No black segments, frozen-render faults, truncated audio, or broken final frame.
- Audio is intelligible and not clipped.

## House checks

- Hook lands in the first 5 s; length matches the brief (short demo vs ~15 min deep dive).
- Kokoro `am_michael` narration only; no trace of the original voice.
- Footage full-frame; no letterbox/border; establishing shots before zooms.
- No burned-in subtitles; SRT readable (digits, units) and matches the final cut.
- Every number, label and duration in narration, cards, thumbnail and kit verified against full-resolution frames.
- Privacy: no student names, emails, other staff names, file dialogs, or the owner's name (unless approved).
- Deliverables beside the raw footage; output MP4 modified time is fresh and its duration matches `plan.json`.
- `scripts/verify_tutorial_video.py <mp4>` passes; a blank/frozen-frame sweep (frame std-dev every 1 s) finds none.

## Synchronization

- Each instruction names the visible target before the cursor acts.
- Every action occurs after its cue narration ends.
- Cursor travel is visible and purposeful.
- The result remains on screen long enough to verify.
- Captions follow the final audio and do not jump early.
- Every highlight box passes `sync_check.py` (no DROP); cards/boxes end with their sentence.
- Repeated-word anchors audited (see sync-and-overlays.md).

## Pedagogy

- Step number and total step count are clear.
- “Why” explanations accompany important choices.
- Common misconceptions have an explicit warning or test result.
- The final state is unambiguous.
- No misleading near-connected or partially configured state remains.

## Visual inspection

Create a full-video contact sheet plus detailed timeline views around:

- first step;
- longest caption;
- every drag release;
- correction points reported by the user;
- final run.

Review at 100% scale. Contact sheets are for coverage; individual full-resolution frames decide readability and connection accuracy.

## Independent review

Ask a clean-context reviewer to inspect the final MP4 without relying on production notes. Give the reviewer exact success criteria and high-risk timestamps. Address substantive defects, rerender, and repeat the targeted review.
