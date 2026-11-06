# Cast layer

Cute characters, props and SFX for HyperFrames edits. Full guide: `../../references/cast-and-broll.md`.

| File | Use |
|---|---|
| `cast.py` | Bit the robot, a teacher with per-person colours, 20 props, doodles, `cameo()` for footage scenes, `CAST_JS` animation helpers, `cast_css()`, `expand()` macros for hand-written scene HTML |
| `cute_sfx.py` | 13 synthesized sounds (`CUTE` dict) merged into `soundtrack.FX`; `python cute_sfx.py` writes a preview WAV |

Copy both into `promo_build/` next to `build.py` and `soundtrack.py` from `../hyperframes-edit/`. Without them the
pipeline runs as before (no cast); with them, `cameos=[...]` on footage scenes and `CAST.actor_html(...)` in graphics
scenes become available.

Tested on the "xAPI + SLS Data Assistant, Part 2" project (5:36): 3 cameos + one cutaway scene, 0 overlaps,
`hyperframes check` ok, mix at -16.0 LUFS / -1.85 dBTP.
