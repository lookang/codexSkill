# Teaching Caption System

## Purpose

Teaching captions show structure and attention. They are not a verbatim subtitle track.

Use three layers:

1. Numbered workflow steps: `STEP 4 OF 8`
2. Reasoning labels: `WHY`, `LOGIC`, `TEST RESULT`
3. Safety and completion labels: `WATCH OUT`, `FINAL CHECK`, `RUN`

## Writing rules

- Prefer 2–7 words.
- Use the same nouns visible in the interface.
- State the concept, not the mouse gesture alone.
- Use symbols sparingly: `POWER 100 → 70`, `CLOSE ≠ CONNECTED`.
- Keep the total step count stable throughout the video.
- Avoid production notes, filler, and full narration sentences.

## Timing rules

- Enter 0.1–0.3 seconds before the key phrase.
- Highlight a key word as it is spoken.
- Keep the card visible through the corresponding action when it helps interpretation.
- Fade before the next unrelated instruction.
- Recalculate timing from the final narration, not the draft script.

## Layout rules

- Use a high-contrast rounded card with a subtle progress line.
- Keep at least 5% safe margin from each edge.
- Use at least 38 px type for 1920×1080 output.
- Test long labels at full resolution.
- Move or shorten a caption if it covers a dragged object, dropdown, numeric field, or snap target.

## Example caption data

```json
{
  "id": "connect-chain",
  "tag": "FINAL CHECK",
  "start": 121.8,
  "end": 126.4,
  "accent": "#ffae22",
  "words": [
    {"text": "ONE", "start": 122.7, "end": 123.0},
    {"text": "CONTINUOUS", "start": 123.0, "end": 123.9},
    {"text": "CHAIN", "start": 123.9, "end": 124.5}
  ]
}
```

YouTube automatic captions may coexist with teaching captions. Burned-in teaching captions should remain useful even when automatic subtitles are turned off.
