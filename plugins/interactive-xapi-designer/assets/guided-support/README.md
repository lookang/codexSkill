# Guided support shared engines

These browser-local engines are the reusable core for opt-in Slow Solve and spoken Coach integrations. They contain no activity-specific answer key, score, launch credential, or SLS endpoint. Activity-specific behavior belongs in the adapter written for the target interactive.

## Files

- `cambridge-guided-solver.js` and `.css`: ordered, state-aware Slow Solve steps and optional control highlighting.
- `cambridge-coach.js` and `.css`: learner-controlled, model-aware Coach with browser speech synthesis, selectable available voice, readable text and replay.
- `ejss-guide-kit.js` and `.css`: the host UI for every activity (the name is historical): a floating, draggable launcher plus one draggable, resizable floating guide window holding both Slow Solve and the Coach. Works on EJSS/WebEJS pages (reads `_model._userSerialize()`) and on any HTML page (pass `read()` in `EjssGuide.define`). Always include it when Slow Solve or Coach is selected.

Copy only the engines selected by the user, plus their styles and the host kit, into the generated activity ZIP. Keep `index.html` and source script order correct. Never link these runtime assets from a remote server. Never build Slow Solve or Coach into the activity's own layout; the floating window design is specified in `skills/interactive-xapi-designer/references/guided-support.md`.

The Coach does not request microphone access or recognize spoken input. TTS availability depends on the learner's browser and installed voices; the text Coach remains usable if no voice is available.

Maintain the shared files here and copy from this directory when authoring an activity; do not patch an already generated activity's private copy and call it a plugin update.
