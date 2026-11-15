# Guided support shared engines

These browser-local engines are the reusable core for opt-in Slow Solve and spoken Coach integrations. They contain no activity-specific answer key, score, launch credential, or SLS endpoint. Activity-specific behavior belongs in the adapter written for the target interactive.

## Files

- `cambridge-guided-solver.js` and `.css`: ordered, state-aware Slow Solve steps and optional control highlighting.
- `cambridge-coach.js` and `.css`: learner-controlled, model-aware Coach with browser speech synthesis, selectable available voice, readable text and replay.
- `ejss-guide-kit.js` and `.css`: EJSS/WebEJS host UI that connects the engines to one floating guide window. Use this host kit only for EJSS/WebEJS activities.

Copy only the engines selected by the user, plus required styles and host UI, into the generated activity ZIP. Keep `index.html` and source script order correct. Never link these runtime assets from a remote server. For non-EJSS activities, preserve the existing interface and write a small host adapter rather than using the EJSS kit.

The Coach does not request microphone access or recognize spoken input. TTS availability depends on the learner's browser and installed voices; the text Coach remains usable if no voice is available.

Maintain the shared files here and copy from this directory when authoring an activity; do not patch an already generated activity's private copy and call it a plugin update.
