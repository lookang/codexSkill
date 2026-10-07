# Sync and overlays

The owner's test: "if the learner listens carefully and watches carefully, the visuals are exactly in sync."

## Timing rules

| Overlay | Appears | Leaves |
|---|---|---|
| Highlight box + pointer | on its narration word (pointer glides in 0.45 s earlier) | end of that sentence + 0.7 s, or when the next box starts, whichever first; never past its target leaving the screen |
| Card (formula / explanation) | on its word | end of that sentence + 0.7 s (min 1.3 s on screen) |
| Banner (hook) | on its word | next banner or end of its sentence + 0.7 s |
| Chapter tag | scene start | after 4.5 s |
| Stamp | on its word, with shake + flash | after ~1.3-2 s |
| Prediction countdown | after the question is asked | 3-2-1 at 0.5 s per beat, then the reveal |

Readability floor (from the earlier skills): short labels stay at least ~1.3 s; long phrases get ~0.18 s per word
beyond six, capped around 6 s. Do not cover the active control, the graph at an evidence moment, or the cursor target.

## Word anchors and the repeated-word trap

Anchors resolve to the n-th token whose normalised text matches (punctuation stripped, case-folded). So
`w("phy_2", "current,", 2)` matches the 2nd "current" **including** "current" without a comma. Before rendering,
list every anchor on a word that occurs more than once in its cue and confirm the intended occurrence:

```python
for cue, word, n in anchors:
    toks = [t["w"] for t in WORDS[cue]["tokens"]]
    idx = [i for i, t in enumerate(toks) if norm(t) == norm(word)]
    if len(idx) > 1:
        i = idx[n - 1]; print(cue, word, n, "->", " ".join(toks[max(0, i - 3):i + 3]))
```

Real bugs this caught: a "reverse" arrow firing on "Double the current"; a CONTROLS box ending at "the circuit"
instead of "The live data"; a card firing at "the physics" instead of "The Data Assistant".

## Footage-verified highlight boxes

Boxes are drawn in source pixels on a moving page. Two tools keep them honest:

1. `vis_scan.py`: for each box, take its region from a **reference frame** (`work/refs.json`: `{"<scene>-<k>": src_s}`)
   and scan +-40 s of source to find the contiguous window where that region still matches (edge-correlation >= 0.55).
   Output `work/hl_vis.json`.
2. `build.py` (retime): inside each beat, footage is cut so that, while a box is shown (word -> sentence end), the
   source plays **inside that visible window** - slowed or held as needed, never below rate 0.15; time before/after
   is skipped at up to 4x rather than raced.
3. `sync_check.py`: samples the final timeline every 0.1 s and reports `ok`, `TRIM` (shortened to where the target is
   really visible) or `DROP` (target never on screen while the box would show). `build.py` applies the result
   (`work/hl_sync.json`). Fix every DROP by re-measuring the box on a better reference frame, changing the beat's
   source range, or replacing the box with a card.

Fleeting UI (a tooltip visible 0.3 s) cannot carry a box - use a card timed to the words instead.

## Camera

- Establishing shot first (whole page), then `cams` push in to the detail on the word that names it, 0.6-0.8 s tween.
- Cover-fit 1920x1080, clamped to the page so no outside area shows.
- Re-check zoom rects whenever the page scrolls in the source.

## Visual QA before every render

Snapshot the moment each box/card is mid-way through its display and inspect them in contact sheets: the box must
frame its target, the label must be readable, the pointer must point at it. Re-snapshot after any fix.
