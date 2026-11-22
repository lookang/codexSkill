# Optional guided support

Offer guided support as an optional teaching feature during activity creation and existing-activity integration or improvement. Ask once, after inspecting the learning task and before implementation, unless the user has already chosen or declined support.

Use this concise choice:

> Would you like optional guided support in this activity?
> - None
> - Slow Solve: learner-controlled, step-by-step guidance
> - Coach: a model-aware spoken Coach with readable text
> - Both

Keep the user’s decision separate from xAPI transport and scoring. If the user chooses None, do not add support assets or alter the interaction for this feature. If the user chooses an option, that selection authorizes the targeted support addition. Do not ask again about the same choice. If the user does not answer before implementation can proceed, preserve the activity and omit guided support until they opt in.

## What the options mean

- **Slow Solve** presents a short sequence of task-specific prompts. A step may direct attention to a real control or representation, ask for a prediction, suggest an observation, and help the learner interpret evidence. The learner remains in control of the activity; the guide must not perform the task, reveal an answer before the learner's attempt, or require completing a new stepper before using the original activity.
- **Coach** reacts to meaningful, committed model changes or assessment outcomes. It gives brief, authored, activity-specific guidance and can highlight a relevant control when that will help. The shared Coach engine uses the browser's `speechSynthesis` voices and displays the same words as text. Keep an explicit Coach on/off control, voice selection when available, a replay control, and a readable text fallback. The Coach does not use microphone input or speech recognition unless the user separately requests and approves that capability.
- **Both** uses one activity adapter and one model read path for both experiences. Avoid conflicting highlights and coach chatter while the learner is actively dragging or running the model. Keep controls visibly distinct and usable alongside the existing interface.

## Build the activity-specific adapter

The shared engines in `../../../assets/guided-support/` provide reusable presentation and reaction mechanisms; they do not know an activity's science, mathematics, controls, answer key, or completion rule. Before using them:

1. Inspect the activity source and identify its actual learner task, controls, model state, feedback and authoritative check/completion handlers. Do not infer mastery from a click, slider movement or elapsed time.
2. Author short Slow Solve steps or Coach reactions from that verified model. Use stable selectors/state keys and explain what evidence would support the learner's conclusion. Treat unsupported learner moves as ambiguous.
3. Preserve existing navigation, scoring, question order, model behavior and xAPI transport. Keep xAPI vendor code byte-for-byte unchanged. The support adapter may expose events such as Coach enabled, Coach support category, Slow Solve opened, and step ID reached. Store only what helps interpret support use.
4. Distinguish independent from supported work in any score or report. Support use is not a mark and must not change the activity's score unless the user explicitly asks for a new scoring design. Never count prompted or assisted success as independent mastery without labeling the support.
5. Do not store Coach prose, learner reflections, speech audio, transcripts, raw keystrokes, or pointer paths in analytics. Store a bounded event type and relevant stable item/step ID only when needed. Keep tracking failure non-fatal.

## Present it in the floating guide window (required)

Slow Solve and Coach always appear in one **draggable floating guide window**, the same design for every activity, EJSS/WebEJS or plain HTML. Never build them into the activity's layout: no new row in the control bar, no panel pushed into the page flow, no sidebar, no reflow of the existing interface. The activity must look and behave exactly as before until the learner opens the guide, and opening it must not move anything.

Use the shared host kit `assets/guided-support/ejss-guide-kit.js` and `ejss-guide-kit.css` (the file name is historical; it works on any page). It already implements the design below; do not restyle it or write a replacement. The required design:

| Part | Specification |
|---|---|
| Launcher | A small floating pill, `position: fixed`, bottom-left (12px inset), white with a soft shadow, holding a ⠿ drag handle, a **Slow Solve** button and the **Coach** button (only the selected ones). It has its own drag handle (arrow keys also move it; double-click puts it back) and remembers its place in `localStorage` key `ejss-guide-launcher`. Teal `#0b6f78` for Slow Solve, purple `#6a3fb5` for Coach. |
| Guide window | One `position: fixed` window holding both the Slow Solve steps and the Coach panel. Docked bottom-right (12px inset), 380px wide by default, grows upward with its text, never wider or taller than the viewport, `z-index: 1000`, 2px teal border, 12px radius, shadow. |
| Move | A teal top bar ("⠿ Guide · drag to move") drags the window; arrow keys move it; double-click returns it to the docked corner. |
| Resize | A corner grip (bottom-right, 24px, touch-sized) resizes it; Shift+arrow keys resize. Minimum 240 × 110px. The window is always clamped inside the viewport, also after the browser is resized. |
| Memory | Place and size are saved in `localStorage` key `ejss-guide-window` (this browser only; failures are ignored). |
| Slow Solve section | Title, "Step n of N", Back and Next step buttons and a close (×) button in one header row, then the step text. Next on the last step loops to an authored step (e.g. "Run another trial"). |
| Coach section | The shared Coach panel (face, "Say again", voice menu, text) sits in the same window under the steps. |
| Visibility | The window shows while Slow Solve is open or the Coach is on, and hides when both are off. |
| Both on | Both run together: the Coach keeps talking while Slow Solve is open, but only Slow Solve's step draws the red/yellow highlights, so the two never point at different things. |
| Highlights | Red pulsing box = press or drag this; yellow glow = look at this. They go on the activity's real controls and drawings. The engine's spare floating Back/Next bar stays hidden. |

Because the window floats, it may cover part of the activity on a small screen; that is acceptable only because the learner can drag, resize or close it and the launcher. Check that the docked defaults do not hide the activity's primary control at desktop width, at 375px and in the 450px SLS iframe, and say in the delivery note which corner may need moving.

## Wire the host kit

1. Copy the selected runtime files locally: `cambridge-guided-solver.js/.css` (Slow Solve), `cambridge-coach.js/.css` (Coach), and always `ejss-guide-kit.js/.css`. Load order in `<head>`, after the unchanged xAPI wrapper and glue: solver CSS, coach CSS, kit CSS, then solver JS, coach JS, kit JS, then the activity adapter (`sim-guide.js`), then the payload adapter.
2. Write one small activity adapter that calls `EjssGuide.define({...})` (alias `GuideWindow.define`):
   - `id`: stable activity id.
   - `read()`: **required for non-EJSS pages.** Return a NEW plain object snapshot of the activity's state each call, from its own variables or DOM (`{ selected: ..., answer: ..., checked: ... }`). On EJSS/WebEJS pages omit it: the kit reads `_model._userSerialize()`. Read-only; never write to the activity.
   - `mount()`: omit it for non-EJSS pages (the kit adds hidden anchors at the end of `<body>` and floats the launcher). On EJSS pages return `{ button, panel }` anchor elements, e.g. the control panel and the plotting panel, and set `floatButtons: true` when the control row is full.
   - `key(s)`, `steps(s)`, `loopStep`, `loopLabel`, and `coach: { scene, moves, result, react }` as in the kit's header comment. Step HTML uses `<b>` only, so it also works in strict XHTML pages.
3. If page controls are menus or inputs outside the model, copy their values into the snapshot when it is first read, so an older snapshot keeps the old values and the Coach can see what changed.
4. Listen with `EjssGuide.on(evt => ...)` for `slow-solve-open`, `slow-solve-step` and `coach-line` to record support use in the payload.

A minimal plain-HTML adapter:

```js
EjssGuide.define({
  id: "fraction-compare",
  read: () => ({ left: document.querySelector("#left").value, right: document.querySelector("#right").value,
                 checked: document.querySelector("#result").textContent }),
  key: s => JSON.stringify(s),
  steps: s => [
    { title: "1 · The question", html: "Which fraction is <b>bigger</b>?", focus: [{ target: "#left", look: true }, { target: "#right", look: true }] },
    { title: "2 · Choose", html: `You chose <b>${s.left}</b> and <b>${s.right}</b>. Press <b>Check</b> (red box).`, focus: [{ target: "#check" }] },
  ],
  coach: { scene: () => "fractions", moves: s => s.left + "|" + s.right, result: s => s.checked,
           react: (reason, prev, s) =>
             reason === "start" ? { show: "Compare the two fractions, then press Check.", press: ["#check"] }
             : reason === "check" ? { show: s.checked }
             : reason === "move" ? { show: `${s.left} or ${s.right}: which is bigger? Predict, then check.` }
             : null },
});
```

Do not add EJSS-specific calls (`_model`, `_view`) to a non-EJSS activity. If the activity's state cannot be read without changing its code, add the smallest read-only accessor and say so.

All runtime files must be packaged locally. Do not add a remote TTS service, cloud speech endpoint or new analytics destination. A browser may not expose a usable speech voice; in that case the Coach remains available as readable text with a clear status.

## Verify the selected support

Use an isolated local browser context with synthetic activity state. Verify the floating window first: opening Slow Solve or Coach does not move any existing element (compare bounding boxes before and after); the window drags by its bar, resizes by its grip, re-docks on double-click and stays inside the viewport; the launcher drags; both positions survive a reload. Then verify each selected control, first-use and disabled states, the real activity interaction before and after support is enabled, mobile/iframe fit, keyboard access, reduced motion and the text fallback. For Coach, verify a voice can be chosen and replayed where browser speech synthesis is available. Confirm the model still works without launch parameters and that xAPI reports support separately from assessed performance. Use a mock LRS for transmission checks; never test live SLS attribution without the user's explicit request.

Report the selected support, what it observes or records, verification performed and any browser voice limitation. A UI that merely says “Coach” is not proof that the Coach responds to the model or speaks.
