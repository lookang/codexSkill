# Prompt-library workflow

Use the live [SLS Prompt Generator](https://iwant2study.moe.edu.sg/lookangejss/promptLibrary/ai-prompt-library.html) to refine the brief or to generate a starting prompt. Its current Full details output is the canonical source for the complete SLS Interactive Development Master Prompt; use it when the task needs the complete system context. The shorter Forum or Prompt output is not a replacement for a user-supplied master prompt. Preserve the user's supplied requirements and adapt examples to the requested learning outcome.

## Compact SLS interface contract

Treat the Prompt Library's visible-interface quality gate as an acceptance criterion, not a style suggestion:

- At 100% width × 450px high, the first viewport must show the task or goal, the main visual/model, at least one usable control, and the output or feedback changed by that control. The learner can start and see a meaningful result without scrolling.
- Keep the title and task cue concise. Avoid a tall decorative hero, long static directions, redundant section headers, and repeated full-width question blocks. Preserve readable text, visible focus, accessible target sizes, browser zoom, and reflow.
- For new activities, follow the master prompt's offline, self-contained HTML requirement with embedded CSS/JavaScript and no remote runtime dependencies. Preserve an existing or required SLS xAPI transport and package its files locally when it cannot be embedded without altering the transport.
- For related outcomes or questions, share the main visual/workspace and switch the target question or filter within it. Use a compact grid only when it fits; use a short stepper or one active question on narrow screens. Never solve vertical length by shrinking controls or adding horizontal scrolling.
- Keep controls at least 44×44px for touch, with 48–54px targets for smartboard/IR where practical; support keyboard, touch, mouse, pen/IR, visible focus, zoom, and reduced motion. Do not rely on hover-only or drag-only actions.
- Show the active control beside its affected output. Make state changes immediate and obvious. Keep help, examples, settings, and analytics closed by default and reveal them only when requested.
- Reflow for a 320px-wide screen and for the Prompt Library's 90vh new-tab view. The 450px iframe composition is the primary initial-viewport check, not a fixed-height clipping rule.

For a multi-question activity, plan a shared representation and question-navigation model before building individual question markup. Avoid repeating a sample space, explanation, or control set when one shared workspace can serve all items.

## Design brief

Capture the following, concisely:

- topic, subject, grade or learner level, and likely prior knowledge;
- one observable performance-based learning outcome;
- RAT intent: Replace for an assessment, Amplify for a lab/game/manipulative, or Transform for a novel exploration tool;
- the main reason interaction is needed;
- the primary activity architecture and learning sequence;
- the system or phenomenon being represented;
- learner-controlled variables, observable or measurable outcomes, fixed constraints, realistic ranges, units, governing relationship, assumptions, limitations, and safety boundaries;
- representations that support reasoning, such as diagrams, graphs, tables, vectors, models, or linked multiple representations;
- scientific or disciplinary practices the learner should perform;
- evidence of learning that should remain: prediction, plan, data, graph interpretation, explanation, confidence, revision, justification, or limitations review;
- accessibility and device constraints; and
- teacher review criteria before student use.

## Interaction architecture

Choose one coherent primary architecture. Examples include guided investigation, parameter exploration, prediction-observation-explanation, model comparison, data interpretation, construction task, diagnostic quiz, or evidence-based decision. Add secondary mechanics only when they reinforce the outcome.

Make feedback explanatory. A learner should be able to see what changed, why an answer or model is incomplete, and what productive next action to try. Avoid praise-only or correctness-only feedback.

## Prompt-library features

Use optional screen recording, read-aloud, or CSV export only when the user requests them or the learning design clearly benefits. Confirm that any generated prompt still includes scientific accuracy, valid units and ranges, model limitations, keyboard and touch access, non-colour cues, readable labels, reduced-motion support, and a teacher review checklist.

If the user asks for a prompt only, return the finished prompt and the analytics contract outline. If the user asks for a built interactive, continue through implementation, integration, and verification.
