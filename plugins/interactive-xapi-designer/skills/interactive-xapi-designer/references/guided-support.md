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

## Choose the host integration

For EJSS/WebEJS activities, `ejss-guide-kit.js` and its stylesheet provide the shared Slow Solve/Coach controls and floating guide window. Include the selected engines and CSS locally in the ZIP, preserve the xAPI wrapper/glue order, then add a small `EjssGuide.define({...})` activity adapter. Load the Coach engine before the guide kit and the activity adapter after both. Include only the feature assets the user selected.

For other HTML/ZIP activities, reuse the appropriate shared engine only when its adapter API fits the host. Build a small host-specific button, panel and state adapter that follows the existing UI; do not add EJSS-specific code to a non-EJSS activity or force a floating overlay onto an unrelated layout. If the shared engine is not suitable, implement the same documented behavior in a small local adapter and explain why.

All runtime files must be packaged locally. Do not add a remote TTS service, cloud speech endpoint or new analytics destination. A browser may not expose a usable speech voice; in that case the Coach remains available as readable text with a clear status.

## Verify the selected support

Use an isolated local browser context with synthetic activity state. Verify each selected control, first-use and disabled states, the real activity interaction before and after support is enabled, mobile/iframe fit, keyboard access, reduced motion and the text fallback. For Coach, verify a voice can be chosen and replayed where browser speech synthesis is available. Confirm the model still works without launch parameters and that xAPI reports support separately from assessed performance. Use a mock LRS for transmission checks; never test live SLS attribution without the user's explicit request.

Report the selected support, what it observes or records, verification performed and any browser voice limitation. A UI that merely says “Coach” is not proof that the Coach responds to the model or speaks.
