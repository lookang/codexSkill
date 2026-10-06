# One-shot integration with the working SLS baseline

## Reference and evidence

Use the exact user-confirmed sample:

https://iwant2study.moe.edu.sg/lookangejss/appXapiIntegratorAgent/api/samples/timeline/scorable_newTab_timeline_countable-nouns-are-nouns-that-can-be-counted-with-pictures-replacements-by-acp_plugin2.zip

The whole ZIP SHA-256 is `16f4d7e700d032af5be801c273425b964ea4dd598872e6efdae9ceb989e73d99`. On 5 October 2026 the same plugin2 URL on iwant2study.org returned identical ZIP bytes. The older non-plugin2 filename returned 404. Prefer the user's exact URL; do not infer that similarly named examples are identical.

Preserve these files byte for byte:

| File | SHA-256 |
|---|---|
| lib/xAPI.js | ba353b8d33f9bfe6e2a93e797e821a3989390186708c58e984812182c951e030 |
| lib/xapiwrapper.min.js | ca1955f8387cc9167b3bf3f3813a0a7ed33279f9c7282b5c122f079e51632ac5 |

The public sample's files are unpacked under `assets/sls-working-reference/` so the Claude workspace-upload archive contains no nested ZIP files. `scripts/prepare_sls_transport.py OUTPUT_FOLDER` verifies every bundled member against pinned SHA-256 values and extracts only the two libraries plus a provenance manifest. `--refresh` downloads the exact URL, checks the full source ZIP checksum, and verifies the same member hashes before writing. `--verify-only` verifies existing packaged libraries. Never silently accept upstream drift; inspect the new sample and obtain a newly confirmed baseline when necessary. If the user supplies a different working transport, preserve that supplied implementation and document its hashes instead of overwriting it with this default.

The user confirmed the example as working in SLS and subsequently confirmed the reactor and acid–alkali packages worked after active check-triggered saves were aligned. These confirmations support this workflow; they do not establish every future launch context or learner identity. The adjustments trainer supplies a second interaction pattern: a five-part generated scenario with first-check and latest-check results, worked-solution support, misconception hypotheses and earlier-scenario evidence.

## Preserve transport; adapt payload and presentation

1. Inspect the real question/model state, correct answers, input IDs and completion action. Preserve the original learning mechanism.
2. Keep the wrapper-before-glue script order in the head, as in the example. Keep its vendor implementations, parameters, identity handling, state cache and statement behavior unchanged. Use application code for domain events, model restoration and the payload. Do not monkey-patch vendor functions to make production integration pass.
3. Derive marks from checked authoritative answers, not score text or click counts. Repair stale application counters where rechecks update feedback but leave marks unchanged. Distinguish first-check, latest-check, session totals and help-supported performance. Label the scope of the SLS score clearly.
4. Keep stable item IDs and regenerate final item results at the real check action. Store prompt, response, accepted answers, marks/max, first/final responses, answer changes, confidence only when selected, hints/solution views before check, misconception explanation, teaching move and relative time. Never assign a misconception to an unanswered field.
5. Build useful standalone HTML `feedback` with score, coverage, process indicators, item evidence, reasoning gaps, next teaching moves and a concise action sequence. Put full records in `quiz.items`, `hiddenMarks.items` and `details`. Avoid the generic formatter's `q/value/expected` history combination when preserving authored feedback.
6. Call `window.storeState(payload)` from the real check/completion handler while the frame is active. When the activity has sequential items, checking the last required item must trigger completion automatically. A separate Reports/Finish button must not be essential to sending the completed evidence. Save labelled in-progress checkpoints after meaningful evidence where useful; never transmit an empty launch as completed 0/N.
7. Treat background, beforeunload and pagehide saves as supplementary recovery. Preserve a bounded chronological history across resets so the sample's cached-history-length preference cannot reinstate old marks. Avoid cache-preferred pause/hidden reasons when a newer payload must be sent; verify actual outgoing reset and truncation behavior instead of modifying cache rules.
8. Restore the activity model through the existing getState path where supported. Validate activity/schema/item compatibility and avoid replaying old attempts. If only assessed answers are restored while the visual investigation resets, say so explicitly.

## Verification contract

Test correct, incorrect, explicit misconception, ambiguous answer, blank field, hint, worked solution, revision, repeated check, new question/reset, resume and completion paths. A generated multi-part activity must handle every scenario type, accepted answer alternative and legitimate zero answer where its model allows one. A duplicate check must not add duplicate marks; only changed answers count as revisions.

Use a real browser and local mock LRS with synthetic full launch parameters. Observe the state received by the preserved wrapper and same-origin score statements. Assert that the final answer check sends completion before any Reports/Finish interaction, that authored teacher feedback survives formatting, and that marks agree across the UI/model, top-level score, quiz and hidden marks. Test tracking failure without breaking the task. Keep mocks and synthetic credentials out of the delivered package.

Verify in a real 450px iframe at desktop and narrow mobile widths. In Integrate only, compare original and integrated layouts and preserve the learning flow; report existing scrolling or clipping separately rather than redesigning it. Apply the full initial-viewport goal/representation/control/result gate and shared question architecture only to fresh builds or explicit redesigns. Do not obscure existing controls. Check keyboard/native input access, non-colour cues, zoom/reflow and reduced motion for added UI.

## Reading SLS logs without overclaiming

- `Configuration persisted` proves a local configuration write, not reporting success.
- `Missing agent. Using anonymous fallback` means learner attribution is unverified. Keep the supplied identity path unchanged; do not invent or expose a learner identity in application state.
- `Retrieved state: [object Object]` does not show whether it is the intended learner/activity record. Inspect its structured content safely.
- `sendState failed (non-fatal): DOMException` reports a failure but does not identify its cause. Capture the exception name/message and launch context without exposing auth values. Do not assume CORS, teardown or iframe sandboxing from this message alone.
- `Submitted to SLS` in this vendor version is logged after calling sendState. It is not proof of server acknowledgement or visible SLS feedback.

Report local transport verification separately from a live SLS launch. Ask for the actual known-working ZIP or exact URL early if the current baseline differs; finish authorized implementation and testing before requesting further user action. Do not patch the vendor library to resolve uncertain live behavior.
