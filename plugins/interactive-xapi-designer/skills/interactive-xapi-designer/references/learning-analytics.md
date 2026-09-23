# Learning analytics for insight and metacognition

Design analytics backward from decisions. Every recorded field should answer a useful question for the learner, teacher, or both.

## Evidence map

Create a small table before implementation:

| Evidence | Meaning | Learner use | Teacher use | Representation |
|---|---|---|---|---|
| Prediction + confidence | Initial model and certainty | Compare before/after thinking | Surface confident misconceptions | Option/value IDs and confidence scale |
| Attempts | Persistence and error pattern | Notice repeated approach | Identify item or concept difficulty | Item ID, attempt number, correctness |
| Strategy or parameter changes | Investigation path | Reflect on method | Distinguish guessing from systematic testing | Strategy code or semantic change event |
| Hint use | Scaffolding needed | Judge independence | Target support | Hint ID and level, not hint text |
| Misconception code | Type of reasoning error | Name the gap | Group learners by support need | Stable taxonomy code |
| Revision | Change after evidence or feedback | Explain what changed | See conceptual movement | Before/after option or model code |
| Explanation/rubric evidence | Quality of reasoning | Self-assess justification | Review evidence use | Rubric dimensions; raw text only if required |
| Completion/score | Outcome and coverage | Monitor progress | Compare achievement with process | Real score, maximum, success, progress |

Adapt the rows to the activity. Do not collect fields that have no plausible pedagogical use.

For a multi-item assessment, also preserve a stable per-item record containing the item/prompt label, learner response, expected response, correctness, marks/max marks, attempt number, first and final response, revision count, misconception code and explanation, hint use, interaction mode, and relative time. Reconstruct this record from the activity's authoritative model or DOM at completion as a fallback; do not rely only on click interception.

## Recommended state shape

Use a stable, versioned object compatible with `window.storeState(...)`. The exact fields may vary, but a useful shape is:

```js
{
  schemaVersion: "1.0",
  reason: "answer-submitted",
  score: 3,
  max: 5,
  success: false,
  progress: 0.6,
  currentStep: "evidence-review",
  history: [
    {
      t: 42,
      itemId: "q3",
      action: "answer",
      responseId: "option-b",
      correct: false,
      misconceptionCode: "confuses-mass-and-weight",
      confidence: 4,
      hintLevel: 0,
      revisionOf: null
    }
  ],
  summary: {
    attempts: 4,
    revisions: 1,
    hintsUsed: 1,
    misconceptionCounts: { "confuses-mass-and-weight": 2 }
  },
  reflection: {
    strategyCode: "compare-extremes",
    confidenceBefore: 4,
    confidenceAfter: 2,
    nextStepCode: "recheck-units"
  }
}
```

Use elapsed time or relative event time where possible; avoid unnecessary wall-clock precision. Keep only the recent event window plus compact aggregates when histories could grow large.

## Learner and teacher views

Learner feedback should compare intent with evidence: prediction versus observation, confidence versus correctness, first attempt versus revision, and chosen strategy versus a more productive one. Offer a next step without revealing an answer prematurely.

Teacher summaries should show concept-level patterns, not surveillance-style activity logs. Prefer misconception distribution, confidence/correctness mismatches, hint dependence, revision quality, unfinished steps, and representative evidence. Explain limitations: the analytics indicate behavior in this interactive, not a definitive judgment of ability or intent.

For scored activities, the SLS-visible feedback should be a compact visual report, not a score sentence. Reuse existing icons or pictures where possible and include:

- score, accuracy, completion, and items needing review;
- a simple progress/accuracy bar;
- process indicators such as elapsed time, revisions, attempts, and hints;
- misconception clusters with plain-language explanations;
- question-by-question responses, expected answers, marks, and diagnostic insight; and
- one or more targeted teaching prompts derived from the observed pattern.

Build a plain semantic fallback into the same HTML so the report remains understandable if the host removes colour or inline styling.

## Privacy and proportionality

Use SLS-supplied launch identity only in the xAPI transport layer. Do not copy it into the activity state. Do not record raw keystrokes. Avoid free-text capture unless the learning goal requires the text and the user accepts that it will be stored. Never record credentials, query-string authentication values, unrelated browser data, or hidden personal identifiers.
