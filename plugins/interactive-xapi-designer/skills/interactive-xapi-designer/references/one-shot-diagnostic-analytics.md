# One-shot diagnostic analytics contract

Use this contract for quizzes, sorts, classifications, matching, multi-step questions, and other scored item sets. Complete it without asking the user to specify ordinary analytics details.

## Definition of done

The delivered package must satisfy all of these conditions:

1. **Truth source:** derive scoring from the activity's real model or final UI state, not generic score-text scraping or click counts.
2. **Stable items:** assign stable item IDs and preserve prompt/word, learner response, expected response, correctness, marks/max marks, attempt, first/final response, revisions, hints, interaction mode, relative time, misconception code, and a teacher-readable misconception explanation.
3. **Completion gate:** do not submit an untouched launch as `0/N`. Accumulate micro-events locally. Submit the complete report on the real check/submit/completion action. Save an explicitly labelled in-progress report on pause/exit only when evidence exists.
4. **Fallback capture:** at completion, reconstruct every item from the authoritative model or DOM. If the primary instrumentation already captured it, deduplicate; otherwise fill the missing record.
5. **Useful visible feedback:** make `feedback` independently useful in SLS. Do not rely on hidden extensions for the teacher's main evidence.
6. **Transport compatibility:** preserve vendor libraries byte for byte and verify the outgoing state after their formatting/cache logic runs.
7. **Privacy:** never store literal keystrokes, launch authentication, learner identity copies, unrelated browser data, or unnecessary open text.

## Default final state

Adapt names to the activity while preserving the semantics:

```js
{
  schemaVersion: "2.0",
  reason: "activity-completed",
  score: 6,
  max: 8,
  success: false,
  progress: 1,
  feedback: "<visual teacher report>",
  summary: {
    attempted: 8,
    correct: 6,
    revisions: 1,
    checks: 1,
    hintsUsed: 2,
    elapsedSec: 94,
    misconceptionCounts: { "counts-substance-directly": 1 }
  },
  quiz: { attempted: 8, correct: 6, total: 8, items: [] },
  hiddenMarks: { totalMarks: 6, maxMarks: 8, items: [] },
  details: {
    analyticsPurpose: "diagnostic-teaching",
    questionByQuestionFeedback: [],
    timeline: [],
    privacy: "No raw keystrokes or learner identity stored."
  },
  history: []
}
```

Populate `quiz.items` and `hiddenMarks.items` with the final item records. Keep `history` bounded and semantic. When using a rich authored report with the canonical sample, avoid the top-level `type` + `q` + `value`/`expected` combination that activates the generic formatter and replaces `feedback`; store the full item evidence under `quiz`, `hiddenMarks`, and `details` instead.

## Visual teacher report

Use host-safe HTML with semantic text, tables, Unicode status symbols, and inline styling. Keep it under the transport's feedback limit. Reuse the activity's existing icons or picture cues; do not invent unrelated decoration.

Include, in this order:

1. activity title and “Teacher diagnostic view” label;
2. score, accuracy, completion, and items-needing-review cards;
3. an accuracy/progress bar with a text value;
4. process line: elapsed time, revisions, attempts/checks, hints, and meaningful strategy evidence;
5. misconception overview, grouped by concept and linked to the affected items;
6. question-by-question table: picture/label, student answer, correct answer, mark, revision, and insight;
7. targeted teaching move generated from the observed misconception pattern; and
8. a short interpretation limit.

If styling is removed, the remaining headings, table text, icons, and status symbols must still communicate the result.

## Completion fallback pattern

Use the real model when available. For a DOM-based sort, a safe pattern is:

```js
function captureFinalItems() {
  return [...document.querySelectorAll("[data-item-id]")].map(el => {
    const chosen = el.closest("[data-choice]")?.dataset.choice ?? null;
    const expected = el.dataset.expected;
    return {
      itemId: el.dataset.itemId,
      learnerResponse: chosen,
      expectedResponse: expected,
      correct: chosen === expected
    };
  });
}

submitButton.addEventListener("click", () => setTimeout(() => {
  const finalItems = captureFinalItems();
  if (finalItems.length === expectedItemCount) {
    saveCompletionOnce(mergeAndDeduplicate(finalItems));
  }
}, 0));
```

Keep the primary semantic instrumentation. The fallback is a completeness check, not a replacement for attempts, revisions, strategies, hints, or time.

## Required verification

Run a representative path containing at least one correct item, one misconception, one revision, one hint, and completion. Then verify through a local mock LRS with synthetic launch parameters:

- no scored state request is sent on untouched launch;
- completion sends the correct `score/max`, `progress: 1`, and full item count;
- the visible `feedback` still contains the visual report after the preserved transport wrapper runs;
- `quiz.items`, `hiddenMarks.items`, `details`, and bounded `history` agree;
- the payload contains no raw key values, auth values, learner identity copies, or unrelated text;
- pause, reset, and resume cannot reinstate stale marks; and
- tracking failure does not break the learning interaction.

Do not deliver after checking only an in-memory object. Inspect the value received by the mocked `sendState` call and, when statements are same-origin, the score statement too.
