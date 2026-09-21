# SLS xAPI integration

Consult the live [SLS xAPI Integrator Agent](https://iwant2study.org/lookangejss/appXapiIntegratorAgent/public/) and download a current sample ZIP before integrating. The implementation and sample libraries are the canonical reference when they differ from this guide.

## Choose the integration approach

### Canonical working sample: preserve transport, change payload

The user's working reference is [the countable-nouns Timeline ZIP](https://iwant2study.org/lookangejss/appXapiIntegratorAgent/api/samples/timeline/scorable_newTab_timeline_countable-nouns-are-nouns-that-can-be-counted-with-pictures-replacements-by-acp.zip).
Download and inspect this reference before integrating. Copy its `lib/xAPI.js` and `lib/xapiwrapper.min.js` unchanged; compare SHA-256 hashes before delivery. Do not patch, replace, or monkey-patch transport to make an activity work. Keep activity-specific event handling and payload construction in application code calling `window.storeState(payload)`.

The inspected sample reads `score`, `max`, `feedback`, `history`, `details`, and `summary`. Its human-readable attempt formatter expects history fields `type`, `q`, `value`, `expected`, and `correct`/`result`. Map domain event IDs and answers to those fields for assessed attempts; merely adding `action` and `responseId` does not produce useful built-in answer feedback. Keep exploration events semantically distinct from assessed answers.

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

When a true SLS/LRS environment is unavailable, clearly separate locally verified behavior from SLS-only transport that still needs a launch test.
