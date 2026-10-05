# Activity-aware evidence and hooks

Create a compact mapping before coding:

| Interaction | Reliable capture | Interpretation |
|---|---|---|
| Multiple choice | Existing Check handler reads authoritative item/choice and accepted answers | Checked correctness, first/latest response, revisions; distractor misconception only when justified |
| Typed answer | Normalise submitted answer at existing check; use original accepted-answer logic | Checked evidence, not raw keystrokes |
| Slider | Change/pointer-release or meaningful keyboard commit; capture value, units and affected model output | Investigation evidence; no mastery inference from position alone |
| Simulation | Committed parameters, prediction where present, resulting model state and existing completion action | Strategy or prediction-versus-observation; distinguish evidence from interpretation |
| Hint/solution | Existing support handler, relative time and item | Help used before a check versus support viewed afterwards |
| Reset/new case | Existing reset handler after model reset | Semantic reset, distinguish current results from previous attempts; no duplicated total marks |

Do not add confidence or hints in Integrate only if the activity does not already have them. Record null/absent rather than inventing confidence. For action-only exploration without a supplied rubric, omit assessed score/max and label assessmentType unscored; preserve domain-defined progress only. Verify the preserved wrapper's actual statement behaviour and report any imposed numeric default as a transport limitation, not learning achievement.

Passive listeners are useful for committed controls but are not always enough for grading. Inline handlers, delayed calculations, frameworks and canvas may need one explicit call after the source's authoritative check result is known. Never intercept an event by preventing the original handler or replace a transport function. Do not infer a result from an arbitrary CSS success class without validating its semantics.

## Payload contract

Adapt a versioned state object with `activityId`, `schemaVersion`, `reason`, `progress`, independently useful HTML `feedback`, `summary`, bounded semantic `history` and detailed item evidence. For assessed work include `score`, `max`, `success`, `quiz.items`, `hiddenMarks` and `details`, all derived from the same real scoring model. Preserve the original assessment policy and clearly label current case versus session totals.

Each assessed item should carry item/concept IDs, prompt, submitted response, accepted expected answers, correctness, marks/max, first/latest responses, attempt/check count, actual response revision count, existing optional confidence, hints and solution views before checking, relative time and interaction mode. Include a misconception code only with a supported explanation and a targeted teaching move. Blank is unanswered, not incorrect evidence of a misconception. Ambiguous incorrect responses stay unclassified.

Record history as ordered `{sequence, t, action, target, value, stateAfter}` events with relevant committed values. Avoid `q/value/expected` event combinations that trigger the sample's generic feedback formatter. Deduplicate identical completion captures and never add marks twice. Repeated unchanged checks may be counted as checks if pedagogically useful, but not as revisions or extra earned marks.

Build the visible report with score/coverage when assessed, first/latest evidence, supported reasoning gaps and next steps, concise support/process indicators, item table and a short chronological action sequence. Use semantic text that survives styling removal. Keep learner language actionable and teacher interpretation provisional. Do not rely on hidden JSON as the sole teacher evidence.

## Save, restore and cache

Use `window.storeState(payload)` while the frame is active at the existing completion action. For several required items, automatically complete after the final required check; earlier checked evidence stays local or is explicitly in-progress according to the source workflow. No untouched-launch 0/N submission. A report toggle is not a save prerequisite.

Use supplementary background/pagehide/beforeunload checkpoints after meaningful evidence. Validate restored activity/schema/item compatibility; restore supported domain state without adding attempts. Maintain bounded sequence history across resets and verify the actual outgoing result after vendor caching. Keep the unchanged transport in charge of identity and delivery; production code must not monkey-patch ADL, storeState or getState. Failures must leave the source learning interaction usable.
