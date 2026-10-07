# Case studies (2026-09/10) - what was made and what each taught

All used Kokoro `am_michael`, HyperFrames, and the "exciting viral" style of a popular AI-video-editing tutorial on
YouTube (fast kinetic headlines, stamps, countdowns, synced pointers) - tuned down where the owner asked for calmer pacing.

## Heat Transfer simulation (self-recorded, Route B, 2:22)

- Puppeteer drove the live EJS sim, one model step per frame; marks recorded every readout. Hook: "100 °C water,
  25 °C water, same mass. Where do they meet? Halfway, at 62.5?" - the sim showed they don't (both lose energy to a
  30 °C room; bath peaks at 41.6 °C).
- Lessons: the "Target reached" event only fires while the sim believes it is playing (override `isPlaying`);
  first version was letterboxed -> re-recorded at 1280x720 @1.5x with stretched panels so the app fills the frame;
  owner asked to remove burned-in subtitles and keep the SRT; then asked for YouTube Problems and Quizzes with
  explicit incorrect options.

## Interactive xAPI Designer plugin (two takes of user footage, Route C, 2:59)

- Two recordings combined: take B (probability lab -> teacher report) carried the story, take A supplied the old
  workflow and the plugin install. Hook from the report: "3/3 marks... but 72 s, 1 revision, 14 random draws".
- Lessons: a callout appeared after the screen had already moved on -> slow the footage to hold the menu while the
  narration names each item; pacing was too fast for newcomers -> speed 1.0, more breathing room, fewer 3x speed-ups;
  show full-screen views, not only crops; cut the inequalities example because its payoff (xAPI evidence) was never shown.

## Reaction Rate + xAPI (24 min own-voice recording -> 14 min, Route C)

- Owner wanted ~15 min to build an audience, with chemistry concepts (rate = gradient, collision theory, limiting
  reactant, n = cV and 24 dm³) and teacher pain points. A live run hit "out of Codex usage" - kept as a tip by request.
- Every report number checked (11 experiments, 8 completed, 3 interrupted, 47 actions, fair-test pairs, 95 cm³ = 0.004 mol x 24 000).
- Lessons: staff emails appeared in SLS headers -> template-matched and blurred both header lines; owner said pop-ups
  "stay on screen too long / not on point" -> sentence-tight overlays + footage-verified boxes (`vis_scan`/`sync_check`);
  a "THIS ONE" box floated over the wrong area because the menu had closed; the owner checked whether the file was
  the latest (Explorer showed creation date) - always report modified time and size.

## xAPI + SLS Data Assistant, Part 2 (6 min user footage -> 5:36)

- Decided with the owner to make it a separate video in a series rather than lengthen Part 1; added a 13 s teaser to
  Part 1 and a recap to Part 2.
- Privacy: 28-student class; OCR (6 parallel workers) + template matching + colour-checked banner detection blurred
  every name, including a mixed-case "NAME submitted on" line OCR missed.
- Physics diagram F = BIL: first version clipped the force arrow outside the SVG and never showed 2F or the reversal;
  fixed with a larger viewBox and per-state arrows (F, 2F up, dot->cross with 2F down). A repeated-word anchor
  ("current") fired the reversal early - led to the repeated-word audit.

## Earlier promo videos (TTelosAI bar model tools)

- Product promos from the owner's screen recordings: computer male voice, clear market-leader message, numbered
  STEP captions, predict countdowns, teaching tip, end card credit only "© 2026 TTelosAI.com", never the owner's name,
  file-explorer dialogs blurred, footage full-frame (a bordered card "reduced the joy of watching").

## Older patterns kept from the merged skills

- AC/DC sorting sim tutorial (Playwright, 1366x768, Kokoro `af_heart` at 0.72-0.82 for young learners): visible
  cursor, pulsed targets, deliberate mistake/correction, pause-and-think moments.
- websitesim-to-youtube: narration-first sync contract (narration ends -> 0.15-0.35 s beat -> cursor travels ->
  action -> result hold), cue manifests validated by `scripts/validate_sync_manifest.py`, cue-level repair takes.
