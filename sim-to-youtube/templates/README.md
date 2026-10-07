# Templates

Working code from real productions. Copy into a new `promo_build/` (or `build/`) beside the footage and adapt the
marked constants; do not run them from here.

| Folder | What it is |
|---|---|
| `hyperframes-edit/` | A complete edit pipeline (from "xAPI + SLS Data Assistant, Part 2"): `narration.py` (cues with source-second comments) -> `tts.py` (Kokoro + whisper word alignment) -> `build.py` (scenes, beats, overlays, graphics, sync-aware retiming; writes `../hf/index.html`) -> `vis_scan.py` / `sync_check.py` (footage-verified highlight boxes; `refs.example.json` shows the reference-frame map, plus `work/source.json` = `{"screen": "../screen_XXXX.mp4"}`) -> `soundtrack.py` + `audio.py` + `master.py` (music, SFX, ducking, -16 LUFS) -> `deliver.py` (SRT, YouTube kit with Problems + Quizzes, thumbnail). `transcribe.py` turns the user's voice track into a transcript. |
| `self-record/` | `record_ejs_sim.mjs` - puppeteer capture of a live EJS simulation with a large cursor, click ripples, real slider drags, deterministic stepping and `marks.json` facts (from the Heat Transfer video). Set `CHROME_PATH`. |
| `privacy/` | `template_scan.py` (find a known name crop in every frame) and `blur_regions.py` (merge OCR + template hits, banner detection, per-frame blur, re-encode). Use with `scripts/find_names.py`. |

When starting a new video, rename scenes and cues, replace footage coordinates using `scripts/contact_sheet.py` and
`scripts/frame_ruler.py`, and re-check every claim. Keep the README of the build folder up to date with the exact
rebuild commands (see references/hyperframes-edit.md).
