# SLS xAPI integration

Use the pinned, bundled working SLS baseline by default. Consult the live [SLS xAPI Integrator Agent](https://iwant2study.org/lookangejss/appXapiIntegratorAgent/public/) when current options or additional examples are relevant. Live availability is not a prerequisite for integration with the verified bundle. Preserve a user-supplied different working transport and document its hashes; never silently replace the baseline with a newly downloaded implementation.

## Choose the integration approach

### Canonical working sample: preserve transport, change payload

The user's working reference is [the countable-nouns Timeline ZIP, plugin2](https://iwant2study.moe.edu.sg/lookangejss/appXapiIntegratorAgent/api/samples/timeline/scorable_newTab_timeline_countable-nouns-are-nouns-that-can-be-counted-with-pictures-replacements-by-acp_plugin2.zip). Read [working-sls-baseline.md](working-sls-baseline.md) before integration. The older filename above the plugin2 generation returned 404 in October 2026; do not guess or silently substitute a different sample.
Inspect the bundled reference before integrating. Copy its `lib/xAPI.js` and `lib/xapiwrapper.min.js` unchanged; compare SHA-256 hashes before delivery. Do not patch, replace, or monkey-patch transport to make an activity work. Keep activity-specific event handling and payload construction in application code calling `window.storeState(payload)`.

Use the bundled `scripts/prepare_sls_transport.py` to reproduce the baseline offline. Inspect its activity analytics and save triggers as well as its libraries. Copy the wrapper-before-glue script order in the head. Request the completed state from the real answer check while the frame is open; for sequential items, the final checked item may trigger completion automatically. Keep a report button for review, not as an essential extra save step. Request labelled in-progress checkpoints only after meaningful evidence exists. Lifecycle saves supplement active saves and must never be the only route. Adapt these semantic call sites to the supplied activity without changing transport code or its caching functions.

Treat `Missing agent`, `DOMException`, and `Submitted to SLS` logs as diagnostic evidence with limits: an anonymous fallback is not verified learner attribution; a bare DOMException does not identify its cause; the sample's submitted log is emitted after invoking the wrapper and is not a server acknowledgement. Never repair these by inventing an identity, replacing the wrapper, bypassing browser protections, or adding direct LRS requests. Verify launch context and actual received state, and label any unresolved live-SLS limitation.

The inspected sample reads `score`, `max`, `feedback`, `history`, `details`, and `summary`. Its human-readable attempt formatter expects history fields `type`, `q`, `value`, `expected`, and `correct`/`result`. Map domain event IDs and answers to those fields for assessed attempts; merely adding `action` and `responseId` does not produce useful built-in answer feedback. Keep exploration events semantically distinct from assessed answers.

Choose the feedback mode deliberately:

- **Built-in attempt log:** use `type`, `q`, `value`, `expected`, and `correct`/`result` when the generic question/answer list is sufficient.
- **Rich authored teacher report:** when marks, pictures, misconception explanations, process evidence, and teaching moves must remain visible, build the complete HTML in `feedback`; put item records in `quiz.items`, `hiddenMarks.items`, and `details`; and keep top-level `history` semantic without the formatter-triggering `q`/`value`/`expected` field combination. Verify the preserved transport does not replace the authored feedback.

Inspect the current sample's cache rules: the verified version prefers cached state when the new history is shorter or the reason contains pause/hidden. Test the actual outgoing state after reset and history truncation; an in-memory payload alone can hide stale transmitted scores. Preserve bounded history compatibility in the payload, with prior-run records clearly separated from current scored attempts, and check that score inference does not reinstate old marks. Never edit the library to bypass this behavior.

Use a local mock LRS with synthetic test launch parameters to observe actual wrapper state requests and score statements, including correct/incorrect answer text, reset, resume, and completion. Keep mock traffic local and test code outside the shipped package. Hash equality plus a call to storeState is insufficient: verify transmitted payloads. Do not claim successful SLS saving from the presence of URL parameters or a non-throwing call; label it as requested unless acknowledged. Distinguish local transport verification from a real SLS launch test.

- **Timeline mode:** use for standard quizzes, form elements, common score displays, and simulations where generic action tracking is meaningful. It injects libraries plus automatic saves on interaction, score/result changes, pause, and exit.
- **Custom semantic instrumentation:** use for complex simulations, canvases, EJS/EJSS, P5.js, multi-step modelling, or any activity where generic clicks cannot reveal learning. Use the integrator's current libraries and state contract, then add explicit calls at meaningful domain events.
- **Minimal mode:** use when the activity already has or will receive custom tracking and only the integration libraries are needed.

Uploading a ZIP to the public service sends the file to that service. Do so only when the user's request authorizes the upload; otherwise use the public sample as a reference and integrate locally.

## Package and launch contract

The ZIP must contain `index.html` at its root. Current integrated samples place these libraries under `lib/`:

```html
<script src="./lib/xapiwrapper.min.js"></script>
<script src="./lib/xAPI.js"></script>
```

The current SLS launch supplies `endpoint`, `auth`, `agent`, `stateId`, and `activityId` URL parameters. Without them, tracking should be skipped or kept local while the interactive continues to work.

Use the injected functions:

```js
if (typeof window.storeState === "function") {
  window.storeState(buildLearningState("answer-submitted"));
}

const previous = typeof window.getState === "function"
  ? window.getState()
  : null;
```

Do not send directly to the LRS with `fetch` or XHR. Let the injected glue configure the wrapper and transport the state. Current samples recognize useful fields including `score`, `max` or `total`, `feedback`, `history`, `details`, `summary`, `quiz`, and `actionLog`; prefer the smallest semantically useful set.

## Saving behavior

Save after meaningful state transitions: prediction committed, answer checked, hint revealed, model run, evidence captured, revision submitted, reflection completed, and activity completed. Debounce high-frequency controls and canvas input. Also flush a compact state on visibility loss or page exit, but do not depend only on exit events.

Do not send a launch-time `score: 0, max: N` payload for an untouched scored activity. For activities with many micro-interactions, keep the detailed event model locally during the attempt and send the full report on the real check/submit/completion action. On pause or exit, send an explicitly labelled in-progress state only when meaningful evidence exists.

At completion, independently reconstruct the visible/modelled results and compare them with the event-derived records. Use this as a fallback when event hooks were missed, and deduplicate so one completion action produces one final scored report.

Restore the latest state on launch when available. Validate the schema version and tolerate missing or older fields. Rehydrate UI state without adding new history entries or resubmitting the restored score.

Tracking code must be defensive: wrap calls, bound payload size, deduplicate unchanged payloads, and never allow analytics errors to stop the activity.

## Verification checklist

Run the integrated project in a browser and verify:

1. The page works without SLS launch parameters and reports no fatal errors.
2. Each planned semantic event changes the state payload as designed.
3. Correct and incorrect paths produce accurate attempts, misconception codes, score, maximum, success, and progress.
4. Hints, revisions, confidence changes, reset, pause, and completion behave correctly.
5. Repeated high-frequency actions are debounced and payloads remain bounded.
6. Restored state returns the learner to the correct place without duplicating evidence.
7. Payloads contain no launch auth value, raw keystrokes, unnecessary free text, or personal data.
8. Keyboard-only, touch, non-colour cues, labels, responsive layout, and reduced-motion behavior remain usable after integration.
9. For complex simulations, inspect `window.__xapiLastState` or intercept `window.storeState` in a test harness and confirm the data reflects the visible learner actions. A constant `score: 0` or generic click log is not sufficient verification.
10. Assert that an untouched launch sends no completed `0/N` record, the completion action sends the full item count, and the outgoing `feedback` still contains the intended teacher report after the real transport wrapper processes it.

When a true SLS/LRS environment is unavailable, clearly separate locally verified behavior from SLS-only transport that still needs a launch test.
