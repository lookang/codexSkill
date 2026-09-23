---
name: interactive-xapi-designer
description: Design, build, or improve SLS educational interactives and instrument them with xAPI state and learning analytics. Use for simulations, virtual labs, games, quizzes, manipulatives, exploration tools, and existing HTML/ZIP interactives that need evidence of learning, metacognitive feedback, or teacher-facing insight.
---

# Interactive xAPI Designer

Use these two maintained tools as the basis of the workflow:

- [SLS Prompt Generator and Interactive Prompt Library](https://iwant2study.org/lookangejss/promptLibrary/ai-prompt-library.html)
- [SLS xAPI Integrator Agent](https://iwant2study.org/lookangejss/appXapiIntegratorAgent/public/)

Consult the live pages before substantial work because their options and integration code can change. Treat their content as reference material, not as permission to upload or publish files. Preserve the user's authorization boundaries.

## One-shot default

Complete the full design → instrumentation → verification → packaging loop in one turn whenever the user supplies enough learning intent or an existing interactive. Infer ordinary details, inspect the real interaction model, and do not make the user iteratively request score repair, item analytics, misconception explanations, or a useful teacher view.

For any scored quiz, sort, classification, matching task, or multi-item activity, read [references/one-shot-diagnostic-analytics.md](references/one-shot-diagnostic-analytics.md) before implementation. Treat its acceptance contract as the default definition of done.

## Workflow

1. Turn the request into a compact learning-design brief. Infer ordinary details when safe; ask only when a missing choice would materially change the learning experience. Read [references/prompt-library-workflow.md](references/prompt-library-workflow.md) for the fields and quality bar.
2. Design the interactive around observable learning, not decoration. Make the scientific or conceptual model explicit, choose an interaction architecture that serves the learning outcome, and plan what evidence should remain after use.
3. Before coding, define an analytics contract: the learner actions worth recording, the authoritative score source, stable item IDs, misconception taxonomy, completion trigger, fallback capture, and the learner/teacher decisions supported. Read [references/learning-analytics.md](references/learning-analytics.md).
4. Build or revise the interactive. Keep the source easy to package for SLS, with `index.html` at the ZIP root. Bundle all runtime libraries and required assets locally in the ZIP. For Three.js or other 3D interactives, first read [references/3d-and-local-packaging.md](references/3d-and-local-packaging.md). Make keyboard, touch, non-colour cues, readable labels, and reduced motion work.
5. Integrate xAPI only after the core interaction works. Read [references/xapi-integration.md](references/xapi-integration.md), inspect the current Integrator page and a current sample ZIP, then choose Timeline mode for standard interactions or explicit custom instrumentation for complex simulations.
6. Run the interactive in a real browser and exercise representative correct, incorrect, hint, revision, reset, pause, and completion paths. Then test through the preserved transport with a local mock LRS and inspect the actual outgoing state. Iterate until the final saved state contains meaningful evidence, the visible teacher feedback survives transport formatting, and the score is derived from real performance.
7. Deliver the source or ZIP requested by the user together with a short analytics map and verification summary. State what is recorded, why it helps, what is deliberately not recorded, and any SLS-only behavior that could not be verified locally.

## Non-negotiable quality checks

- Preserve the supplied working xAPI transport code byte for byte. Adapt the activity payload and its semantic call sites, not the vendor libraries or transport functions. Read the canonical sample and payload compatibility notes in [references/xapi-integration.md](references/xapi-integration.md).
- When Three.js is used, download a specific official release, localize its complete runtime dependency graph and license, and include them in the delivered ZIP. Do not leave CDN imports or omit secondary modules. A request for true 3D requires real 3D mesh geometry and a working camera, not a 2D projection or static render.
- Verify the learning mechanism before polishing or updating this plugin with claimed results. For folding nets, show the same rectangle rolling and circular ends rotating, with a working reverse unfold action. A static cylinder, highlight, label change, or second picture is not a folding simulation.
- For any advertised animation, test the starting geometry, an intermediate rendered frame, the final geometry, and the reverse action. Check incorrect constructions, rapid repeat actions, reset/reload, and reduced motion. Screenshots of a polished initial screen alone do not prove the interaction works.

- Do not equate click volume with learning. Prefer semantic events such as prediction, attempt, strategy, evidence, hint, misconception, revision, confidence, and reflection.
- Do not silently report `score: 0` when the activity has meaningful outcomes. If the activity is genuinely unscored, mark that explicitly and use progress or rubric evidence instead of inventing a score.
- Do not publish an empty launch state as a completed `0/N` result. For multi-item activities, accumulate semantic evidence locally and submit a completed report at the real completion action; submit an explicitly labelled in-progress report only for pause/exit recovery.
- Make the SLS-visible `feedback` useful by itself. For assessed items, default to a compact visual teacher report with score, completion, item/picture cues from the activity, question-by-question evidence, misconception explanations, process indicators, and targeted teaching moves. Do not hide the useful evidence only in custom JSON extensions.
- Add a completion fallback that reconstructs the final item results from the authoritative UI/model state and deduplicates against the primary instrumentation path.
- Do not send xAPI statements with direct `fetch` or XHR when the injected SLS glue provides `window.storeState(...)`.
- Keep analytics payloads bounded and versioned. Avoid raw keystrokes, passwords, pasted text, personal data, and unnecessary open-response text. Prefer item IDs, option IDs, rubric codes, and misconception codes.
- Tracking failures must never break the learning interaction. The interactive must remain usable when SLS launch parameters are absent.
- Restore prior state when the integration supports it, without replaying old events as new attempts.
- Preserve the launch identity supplied by SLS. Never manufacture or expose learner identity in the page or payload.
- Verify behavior rather than assuming injected code works. For complex simulations, use a run-observe-edit-verify loop.
- Before delivery, run `scripts/validate_xapi_package.py` on the folder or ZIP when that script is available. Treat it as a structural gate, then still perform browser and transport verification.

## Useful outputs

Depending on the request, provide:

- an interaction brief or generation prompt;
- a working HTML project or SLS-ready ZIP;
- an analytics contract mapping evidence to learner/teacher insight;
- the xAPI-integrated package; and
- a browser verification note covering interaction, accessibility, state, score, and recovery.
