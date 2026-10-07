# Route A - Improve a WebEJS/EJS simulation before filming

Use when the user provides `_source.json` / `.ejss` or asks for pedagogy fixes. Finish this route before any final
recording, thumbnail or YouTube screenshot.

## 1. Choose the correct source file

- If the user edits in WebEJS, prefer `_source.json`.
- If only `.ejss` exists, inspect it, but switch to `_source.json` if editor import/export becomes fragile.
- `.ejss` files are often UTF-16; decode with `encoding="utf-16"` to read the model (variables, Evolution, Fixed
  Relations, Custom functions) and the view's `setAction` / `linkProperty` handlers in the exported `index.html`.

## 2. Preserve encoding

- Inspect the current encoding before editing.
- WebEJS expects UTF-16 LE **with BOM** for `_source.json` and zipped uploads; restore it after changes.
- Validate both the encoding and JSON parseability.

## 3. Keep model and view names synchronized

Common failure: model variables renamed but view expressions still reference old names. After edits, search the
whole source for removed names (initialization, reset, attributes, change handlers).

## 4. Compile before visuals

- Do not treat a hand-patched exported `index.html` as authoritative.
- Compile in WebEJS, confirm the interactive loads and the change is visible, then record.
- If compilation is blocked, patch the minimum runtime files for a provisional capture and say so in the handoff.

## 5. Prefer pedagogically meaningful changes

- Separate variables that were wrongly merged (e.g. transmission vs scattering of light).
- Add presets, prediction prompts, explanatory readouts, accurate category labels.
- Add "event hand-offs" between stages when a lesson has phases (e.g. heating reaches target -> dialog -> transfer stage).

## 6. Audit lesson-sequence integrity

Before scripting narration, check that these agree: visible dropdown order, internal question numbering and
auto-advance logic, progress tables or helper overlays, and the narration outline. Typical defects: a hidden
example that is not selectable, an auto-advance that sets the wrong label, a scientifically wrong ion/molecule name.

## 7. Driving the sim for recording (EJS hooks)

Useful from Puppeteer/Playwright (`page.evaluate`):

- `_model._userSerialize()` / `_model._userUnserialize({...})` read and set model variables; call `_model.update()` after.
- `_model.step()` advances one step (deterministic capture: one or more steps per captured frame).
- `_model.getView().<element>.linkProperty('Height', () => 528)` overrides layout properties (e.g. to make panels
  fill a 16:9 frame); re-apply after stage changes, which reset it.
- Events that fire "while playing" (e.g. a "Target reached" dialog) only fire if `_model.isPlaying()` returns true:
  temporarily override `_model.isPlaying = () => true; _model.isPaused = () => false` while stepping.
- Element ids with dots (e.g. `.myBoxPanelOk.okbt`) are ids, not classes: use `document.getElementById`.
- Seed `Math.random` before load for repeatable takes.
