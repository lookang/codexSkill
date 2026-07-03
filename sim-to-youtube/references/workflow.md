# Sim To YouTube Workflow

## When To Use

Use this workflow when the user gives:
- a simulation URL
- a local WebEJS or EJS source file
- a request to improve pedagogy
- a request to make a tutorial or lesson video

## Inputs To Gather

Try to gather these inputs early:
- live URL of the simulation
- local source path, especially `_source.json` or `.ejss`
- whether the hosted URL has ads or distractions
- whether the user wants a short demo or a full lesson
- whether narration should use a local open-source voice

## Source Editing Rules

### 1. Choose the correct source file

- If the user is editing in WebEJS, prefer `_source.json`.
- If the user only has `.ejss`, inspect it, but be ready to switch to `_source.json` if editor import/export becomes fragile.

### 2. Preserve encoding

For WebEJS `_source.json`:
- inspect the current encoding before editing
- if WebEJS expects UTF-16 LE with BOM, restore that encoding after changes
- validate both the text encoding and JSON parseability

### 3. Keep model and view names synchronized

Common failure mode:
- model variables are renamed, but the generated view still references the old names

After edits:
- search for removed variable names in the whole source
- check initialization, reset, attributes, and change handlers
- avoid leaving view expressions that reference deleted names

### 4. Compile before visuals

After editing `_source.json`:
- do not assume the local exported `index.html` is authoritative
- compile the edited source in WebEJS first
- confirm the compiled interactive loads and the intended pedagogical changes are visible
- only then create the final recording, thumbnail, and YouTube-facing visuals

If a quick temporary local sync is needed for debugging, treat it as provisional only, not as the final recording source.

### 5. Prefer pedagogically meaningful changes

Good upgrades often include:
- separating scientific variables that were incorrectly merged
- adding preset materials
- adding prediction prompts
- adding explanatory labels or readouts
- improving category labels from binary shortcuts to conceptually accurate descriptions

For light-material sims, distinguish:
- transmission: how much light passes through
- scattering: how much the transmitted light is blurred or diffused

### 6. Audit lesson-sequence integrity

Before recording, check that these all agree with each other:
- the visible dropdown option order
- internal question numbering and auto-advance logic
- progress tables or helper overlays
- lesson narration outline

Common failure modes:
- a hidden example still exists internally but is not selectable
- an auto-advance step sets the wrong visible label for the next case
- the ion or molecule name is scientifically inaccurate even though the diagram logic is correct

Fix the sequence in the source before building narration, otherwise the video script will inherit the mismatch.

## Video Workflow

### 1. Prefer the cleanest compiled version of the sim

Choose the URL that gives the best classroom capture:
- compiled WebEJS output if it is stable and complete
- otherwise an ad-free hosted version

Do not record the final video from a pre-compilation local patch when the user expects the compiled WebEJS output to be the source of truth.
If compilation is blocked in the current environment, patch the minimum necessary exported runtime files only for provisional capture and state that clearly in the final handoff.

### 2. Record a real screen interaction

Prefer browser automation and recording over still images.

Typical coverage:
- orientation to the sim
- each preset
- direct variable comparisons
- at least one student-style prediction and reveal sequence
- summary of the key idea

### 3. Cursor, navigation, and attention choreography

Use the cursor as an instructional pointer, not just as an input device.

Rules:
- When narration names a visible object, move the cursor to that object and pause, sweep, circle, or pulse briefly. Examples: oil film, leaves, water level, dropdown, save button, graph line.
- The cursor must be visually distinct from the simulation. Prefer a magenta, cyan, yellow, or white glow if the sim uses green UI elements.
- Do not jump from one page area to another without showing the route. When the view changes to the lower half of an interactive, scroll in visible steps with the cursor near the right side and add a short navigation hint.
- Treat background or layout changes like scene transitions. The viewer should understand whether the teacher clicked, scrolled, selected a tab, or waited for a result.
- Review the whole narration/script and create attention cues wherever the spoken words refer to a specific on-screen thing.
- Use tasteful concept cards, icons, small pictures, or reaction bubbles to add emotion and variety, but never cover the active control, data table, graph, or apparatus being explained.

Useful automation helpers:

```js
function readableHoldMs(text, requestedMs = 3000) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const calculated = 3000 + Math.max(0, words - 6) * 180;
  return Math.max(requestedMs, Math.min(calculated, 6200));
}
```

Use a guided scroll helper rather than `scrollIntoView()` for final captures. The helper should:
- calculate the target scroll position
- show a navigation hint for at least 3 seconds
- move the cursor to the scroll side of the screen
- use several small wheel movements over about 1.1 to 1.8 seconds
- do a final precise alignment only after the visible scroll has happened

### 4. Overlay text readability

Short-lived text is still instructional text. It needs enough screen time for a learner to notice, read, and connect it to the simulation.

Minimum timing rule:
- every snap label, reaction bubble, and scroll hint stays visible for at least 3 seconds
- phrases longer than six words get extra hold time, about 0.18 seconds per extra word
- cap routine overlays around 6.2 seconds so they do not dominate the screen
- proof frames should confirm the text is visible for more than one sampled frame

Text placement rules:
- keep captions and reaction bubbles away from the active apparatus or control
- use high contrast, large type, and a stable container size
- do not use tiny labels that vanish before the viewer can read them
- avoid covering the graph at evidence moments

### 5. Narration

For a lesson-style video:
- explain the concept, not only the controls
- include prediction, observation, and explanation
- keep claims aligned with what is actually visible on screen

Preferred voice order:
1. Kokoro local TTS if available
2. another approved local open-source TTS
3. system fallback voice only if needed

### 6. Captions

Generate captions or subtitles and burn them in when useful for classroom viewing.

### 7. Video verification

Before calling the video finished:
- run a syntax check on capture scripts
- regenerate the raw capture and final MP4 after choreography changes
- inspect duration, resolution, video codec, and audio codec with `ffprobe`
- extract proof frames or a contact sheet at important moments, especially object-pointing cues, guided scrolls, graph explanations, and text overlays
- verify no abrupt scene jump remains where a learner needs to know how the teacher navigated there

## Thumbnail Workflow

Aim for:
- one clear science concept
- large readable text
- the sim visible
- a human face only if the user explicitly wants it and provides an allowed reference

Avoid clutter. The thumbnail should communicate the contrast between transparent, translucent, and opaque at a glance.

## YouTube Package

Prepare:
- title
- description
- tags or keywords
- concept overview text
- timestamps or chapter list
- audience/category suggestions if asked

Optimize for:
- scientific accuracy
- classroom searchability
- strong click-through without exaggeration

## Reusable Assumptions

If the user says only “make the video” and gives a sim URL, default to:
- a screen-recorded walkthrough
- pedagogically sound narration
- no background music unless requested
- one main MP4 in the workspace output folder
- one YouTube-ready thumbnail

## Known Good Local Patterns

If the workspace already contains prior capture or narration scripts, prefer adapting them instead of rebuilding from scratch.

Common reusable assets may include:
- Playwright capture scripts under `output/video/`
- narration text files under `output/video/`
- local Kokoro setup under `output/video/kokoro-venv/`
