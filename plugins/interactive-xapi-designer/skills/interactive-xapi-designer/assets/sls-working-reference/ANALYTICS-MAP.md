# Diagnostic analytics map

This SLS-ready package records evidence that can support a teaching decision. It does not treat click volume as learning.

| Evidence recorded | What it can indicate | Teacher use |
|---|---|---|
| First and final basket for each of 8 words | Initial classification and current understanding | Identify exact words and concepts needing follow-up |
| Correctness and misconception code | Whether a learner counts a substance directly, confuses grains/portions with units, or treats an object as a mass noun | Group errors by explanation needed rather than by total score only |
| Revision, with previous and new choice | Change in thinking before checking | Distinguish a fixed misconception from self-correction |
| Relative event time | Sequence and pacing within the activity | Locate long pauses, rapid guessing, and the point of revision |
| Interaction mode (click, drag, touch) | Access route used | Check usability without interpreting device behavior as ability |
| Learning-tip and help use | Scaffolding consulted | Discuss independence and productive help-seeking |
| Check attempts and completion | Outcome and coverage | Separate unfinished work from incorrect work |

The xAPI state contains a true item score (`score` out of `max: 8`), `quiz.items[]`, `hiddenMarks.items[]`, a bounded semantic timeline, aggregate `summary`, misconception counts, and teacher-facing `feedback`. Empty start states are not submitted as scored results. The visible feedback is a compact visual teacher report with score and accuracy cards, a progress bar, learning-process indicators, a misconception picture, picture-and-word question evidence, and targeted teaching moves.

Privacy: the package does not store literal keys, typed text, learner identity, authentication values, or unrelated browser data. “Keystroke analytics” is deliberately represented by meaningful revisions and interaction modes because the task has no legitimate text-entry requirement.

Interpretation limit: these analytics describe behavior in this activity. They are prompts for teacher noticing and conversation, not definitive judgments about a learner's ability or intent.
