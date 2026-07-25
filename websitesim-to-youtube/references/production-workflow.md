# Production Workflow

## Browser preparation

1. Open the exact URL and preserve important query parameters.
2. Confirm the correct browser tab is physically visible before desktop capture.
3. Set browser zoom and window size once.
4. Hide unrelated UI from the intended crop.
5. Rehearse every state-changing action.
6. Capture a screenshot of the initial state and final success state.

Use browser automation for reliable target selection, but record the actual visible browser window when the user requests a live-screen look. A browser-only video stream may omit the system cursor or authenticated extension state.

## Cue manifest shape

```json
{
  "total_duration": 42.5,
  "minimum_action_delay": 0.15,
  "cues": [
    {
      "id": "03-connect-stack",
      "timeline_start": 18.0,
      "timeline_end": 24.2,
      "audio_duration": 4.6,
      "output_action_time": 23.1,
      "expected_before": "Two connected sub-stacks with a visible gap",
      "expected_after": "One continuous five-block chain"
    }
  ]
}
```

`output_action_time` is absolute in the final timeline. The validator checks that it occurs after `timeline_start + audio_duration + minimum_action_delay`.

## Natural cursor movement

- Approach from the cursor's real previous position.
- Use a shallow curved path with small direction changes.
- Slow slightly near small targets.
- Pause briefly after hovering before a click.
- For drags, keep the button held throughout the path and release only over the snap zone.
- Hold the result for at least 0.7 seconds; use 1.5–3 seconds for a final proof state.

Randomness should be bounded. The cursor must still communicate intention.

## Drag-heavy interfaces

Before recording:

- verify which block acts as the parent of a connected sub-stack;
- create a clear gap between the source and destination;
- ensure the destination remains visible throughout the drag;
- test the snap tolerance;
- confirm the lower blocks do not detach when the upper stack moves.

After release, inspect every joint at full resolution. A nearly touching block can be pedagogically wrong even when it looks plausible in a thumbnail.

## Repair strategy

Prefer cue-level replacement:

1. Recreate the exact pre-action state.
2. Record a clean take with long handles.
3. Identify the source action time frame by frame.
4. Replace only the affected cue's source and source action time.
5. Rebuild the synchronization manifest.
6. Render and compare before/action/after frames.

This preserves already-approved narration, captions, and unrelated actions.
