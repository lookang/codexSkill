# Planning, script and narration

## Map the footage first (Route C) or rehearse the sim (Route B)

1. Transcribe the user's voice track: `templates/hyperframes-edit/transcribe.py ../camera_XXXX.mp4`
   (faster-whisper `small.en`, word timestamps, VAD). In these recordings `camera_*.mp4` is usually audio-only
   and `screen_*.mp4` silent.
2. Contact sheet of the whole screen recording every 60 s, then every 5-6 s, then 1-2 s around key moments
   (`scripts/contact_sheet.py`). Read the important frames at full resolution (`scripts/frame_ruler.py`).
3. Build a footage map: `source second -> what is visible -> exact on-screen text/number`. Note scrolling,
   dialogs, waits, dead ends, and anything private.

## Structure that has worked

- **Hook (<= 5 s):** a true, surprising result shown on screen. Examples: "Eleven experiments. Eight finished.
  Three abandoned halfway." / "100 °C water and 25 °C water... where do they meet?" / "This word problem has a bug."
- **Title card** (motion graphic) and, for a Part 2, a 20 s recap of Part 1.
- **Pain points** teachers already feel (only the answer, never the process; hours of marking; needs a programmer).
- **The concept** explained properly with an animated diagram or worked calculation (collision theory and limiting
  reactant; F = BIL with arrows that change; energy flows hot -> cold and to the room).
- **Numbered steps** (chapter tags "1 · GET THE PLUGIN", "2 · WRITE THE PROMPT", ...).
- **Predict moments**: a countdown card ("PREDICT! 3 2 1") before each reveal.
- **Evidence**: zoom into reports and readouts; stamp the key number.
- **Real-world tip** when something goes wrong on camera (e.g. a usage limit) - keep it if the user agrees.
- **Teaching tips** card, **end card** (link, credit, follow), 3 s hold for YouTube end-screen elements.

## Writing the narration (`narration.py`)

- One cue per beat: `("cue_id", "text")`. Put the source second(s) that prove each claim in a comment above it.
- Short sentences. Name the on-screen thing before the cursor acts on it.
- Spell numbers the way they should be spoken ("sixty-two point five"); the SRT step turns them back into digits.
- Say "x API" (not "xAPI") and "i want to study dot org" for clean Kokoro pronunciation; check the ASR echo
  printed by `tts.py` (match ratio < 0.85 usually means a mispronunciation).
- Keep claims scoped to what was shown. If a value comes from the sim's own readout, quote that value.
- Never say or show the user's name unless they asked; never speak student names.

## Kokoro TTS (`templates/hyperframes-edit/tts.py`)

- kokoro-onnx, voice `am_michael`, speed `1.0` (house default). Model files in `$KOKORO_DIR`
  (default `~/.cache/kokoro-onnx`: `kokoro-v1.0(.int8).onnx`, `voices-v1.0.bin`).
- One WAV per cue in `tts/` (cached by text hash, so re-voicing one line is cheap).
- faster-whisper re-transcribes each WAV and aligns words back onto the **script tokens** ->
  `tts/words.json` `{cue: {duration, tokens: [{w, start, end}]}}`. All edit timing hangs off these word times.
- Narration source must be UTF-8 without BOM.

## Length budget

Video length ~= narration seconds x 1.15-1.2 + graphics scenes. A 12.4 min narration produced a 14:06 video.
