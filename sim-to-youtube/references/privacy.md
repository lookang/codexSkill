# Privacy pass

Applies to every user recording and to any logged-in self-recording. The raw `screen_*.mp4` is never modified; the
edit uses a blurred copy in `hf/assets/screen.mp4`.

## What to blur

- **Student names** anywhere: monitor banners ("You're viewing NAME"), response tables, "NAME submitted on ..." lines,
  Data Assistant "Student" columns, dimmed rows behind modals.
- **Staff emails / "edited by" lines** in SLS headers.
- **Course/class title bars** that name other facilitators, browser profile avatars, name chips on tools.
- **File explorer / save dialogs** and download pop-ups showing the user's folders.
- The **user's own name** unless they choose to show it (e.g. they may want "Developer: <name>" and a GitHub link
  visible because viewers need it). Ask once.
- Never speak names in the narration; say "listed by name (blurred here)" if the point needs it.

## How to find them reliably (use more than one method)

1. **OCR** - `scripts/find_names.py VIDEO T0 T1 TAG` (easyocr, 2 fps). Flags ALL-CAPS multi-word strings that are not
   UI words. Run 4-6 ranges in parallel (each limited to 4 CPU threads). Expect ~5-10 min per minute of footage per
   worker on CPU.
2. **Template matching** - `templates/privacy/template_scan.py`: crop a known name (normal and dimmed) from a frame and
   match every frame at 5 fps (TM_CCOEFF_NORMED >= 0.78). Catches mixed-case lines and low-contrast rows that OCR misses.
3. **Fixed regions with colour/shape checks** - for banners, match the label ("You're viewing") and blur to its right
   only when the banner colour is right (the yellow "viewing all responses" banner has no name; the blue per-student
   banner does).
4. **Whole columns** - when a name is found in a table's Student column, blur the entire column for that moment.

`templates/privacy/blur_regions.py` merges all hit lists (`names_*.json`), pads each box (+70 px wide, one extra line
down for wrapped names), holds it +-0.6 s around each sample, Gaussian-blurs per frame and re-encodes.

## Verify

Sample frames at every scene that showed names (and a random sweep) and inspect them at full resolution. In the
edit, also check overlays and zooms: a zoom can enlarge an unblurred dimmed row. Search the repo/output for name
strings before committing; never commit OCR output or footage.
