---
name: build-famath-interactives
description: Build, extend, regenerate, package, and validate FAMath-style SLS formative mathematics interactives from syllabus learning objectives. Use when Codex needs to create chronological Primary, Secondary, or JC mathematics activity folders; preserve the FAMath visual UI and misconception-first "Show me visually" tutorials; add adaptive difficulty or challenge levels; reuse the proven SLS xAPI package strategy; generate upload-ready ZIPs; or audit an existing FAMath collection systematically at its canonical generator.
---

# Build FAMath Interactives

Create one purposeful formative interactive per learning objective while preserving the established FAMath design system, canonical-source discipline, and SLS xAPI packaging.

## Start correctly

1. Inspect the exact target path, local instructions, existing generator, manifest, packages, and working-tree state.
2. Read [references/architecture-and-packaging.md](references/architecture-and-packaging.md) and [references/pedagogy-and-ui.md](references/pedagogy-and-ui.md) completely.
3. Read [references/objective-family-map.md](references/objective-family-map.md) when mapping objectives to interaction families.
4. Read [references/validation.md](references/validation.md) before building or reporting completion.
5. Treat the syllabus supplied by the user as authoritative. Extract its exact order and wording; use the PDF skill when the source is a PDF.

Do not patch generated `index.html` files one by one. Change `_source/activities.json`, `_source/index.template.html`, `_source/build.ps1`, or `_source/validate.py`, then regenerate the complete affected set.

## Choose the workflow

### Bootstrap on another machine

Run the bundled PowerShell script into a new or empty directory:

```powershell
powershell -ExecutionPolicy Bypass -File "<skill-folder>\scripts\bootstrap_famath.ps1" -Destination "C:\path\to\FAMath"
```

Add or replace objectives in the copied `_source/activities.json`, extend the shared template by mathematical family, update explicit completeness checks in `_source/validate.py`, then build.

Use `-Build` only when reproducing the bundled complete Primary 1 to Primary 6 starter unchanged.

### Extend an existing collection

Preserve unrelated files. Verify whether ordered folders, ZIPs, or legacy names already exist. Add every new objective to the manifest in official sequence, implement reusable family logic in the master template, update grade-aware catalog and validation expectations, then regenerate.

## Build the objective manifest

Create one manifest record per independently assessed learning objective. Use this schema:

```json
{
  "id": "P4-WN-1.1",
  "folder": "Primary4_01_WN_1.1_Number_notation_representations_and_place_values",
  "strand": "Number and Algebra",
  "subStrand": "Whole Numbers",
  "section": "Numbers up to 100 000",
  "objective": "1.1 number notation, representations and place values ...",
  "shortTitle": "Five-Place Number Lab",
  "kind": "p4_place_value"
}
```

Keep the two-digit folder sequence continuous within each grade. Keep official LO identifiers visible even when numbering restarts within a sub-strand. Use short, filesystem-safe descriptive names.

Before coding, count the extracted objectives by grade and compare that count with the manifest and the requested scope.

## Implement by mathematical family

Route each `kind` through the shared problem generator, visible model, response renderer, and tutorial generator. Reuse an established family only when its mathematical meaning fits. Otherwise add a new family-level model; do not force an objective into a generic multiple-choice shell.

Every activity must provide:

- six progressive formative questions or an equally purposeful staged sequence;
- a concrete or pictorial model before compressed notation;
- touch and keyboard operation, with tap alternatives for drag actions;
- immediate checking, useful hints, restart, read-aloud support, and visible progress;
- misconception-specific feedback and a visual tutorial after an incorrect response;
- a tutorial that begins with the learner's actual attempt when one exists;
- meaningful teacher analytics rather than raw click noise;
- responsive operation inside an SLS iframe without network dependencies.

Use the family decisions in [references/objective-family-map.md](references/objective-family-map.md). Apply time-evolving animation when the concept itself changes over time: regrouping, ordering, counting, taking away, folding, measuring, or transforming.

When the objective is a procedure with a decision at every step — prime factorisation, HCF and LCM, roots by factorisation — animate the *search* on the learner's own number and keep the failed attempts on screen. The rejected primes are the lesson: a learner shown only the successful divisions never learns why the next prime was tried. Stage the reveal so the answer assembles at the end of the reasoning rather than arriving before it. A generic flow of verbs is not a substitute; it describes the method without ever performing it.

## Adapt difficulty to the learner

Every generator receives its question index as a difficulty dial. Keep the question SLOT (1/6 … 6/6) separate from the difficulty STEP fed to the generator, and move the step with the learner's evidence: up one on a clean first-try correct, hold when a hint or the walkthrough was used or the answer came on the second try, down one after three or more tries, clamped to the six available steps. A learner who is right every time then walks the original fixed ladder, so nothing regresses for a confident pupil; only a struggling one is held or stepped down.

Derive the Guided/Supported/Independent badge from the served step, not the slot, because generators word their instruction text from the same argument — the badge and the instruction must agree.

Roughly half of a mature family set will ignore the difficulty argument entirely, leaving question 1 as randomly hard as question 6. Fix that in two layers:

- rank a pool of candidate draws by an intrinsic difficulty proxy and serve the rank matching the step, which needs no per-family knowledge and cannot invalidate an item;
- narrow the value pools per family so the easiest step draws genuinely easy numbers.

## Offer challenge levels only where they exist

Level 1 Build applies the objective. Level 2 Stretch adds a reasoning step. Level 3 Think works backwards, combines, or judges somebody else's reasoning.

Hand-written Level 2 and 3 items are best but do not scale. A generic Level 3 can be generated from data the collection already has: every choice problem carries a per-option diagnosis, so pick a wrong answer, describe in third person the METHOD that produced it, and ask which answer that method gives, keeping the correct answer among the choices as a distractor. Guard it hard — inferred diagnoses overlap in shape, so an equation can read as a unit error and a clock time as a ratio; re-validate each inferred code against the value, never name the asked-for value anywhere in the prompt, and reject a description that fits two wrong answers.

Probe availability at load and require every step to generate reliably, then show only the levels that exist. Run the probe on a seeded generator so the verdict is a pure function of the objective; with live randomness a borderline objective passes on one load and fails on the next, and the level button appears and disappears between refreshes. A level that silently serves a Level 1 item is worse than a level that is not offered.

## Keep the view readable

- **Fit-don't-wrap.** A row of repeated objects read as a sequence should shrink to stay on one line: `max(floor, min(cap, calc((100% - (N-1)*gap) / N)))`, with the generator writing N into a custom property because CSS cannot count siblings. A wrapped second row pushes the question and the answer buttons below the fold, so the learner scrolls away from the model to read what it asks. This does NOT apply to bulk collections — ninety counters or a two-dimensional array forced onto one line shrink below the point of being countable, and for an array the wrap IS the model.
- **Labels sit beside the feature they name.** Derive a figure label's position from the coordinates of the feature it describes, never from the shape's bounding box: "one corner = 90°" belongs under that corner's right-angle mark, and centring it across the shape puts the explanation as far from the corner as the figure allows while running text over the outline. A label naming a whole region may sit on that region; the test is whether it names what it sits on. Text must never cross a stroke.
- **Equal-height representations.** A pie is as tall as it is wide and a bar is not, so one shared size cap makes a representation toggle shift the whole page. Cap them to comparable heights where vertical space is fixed.
- **Readable decimals.** Float noise and non-terminating results reach choice buttons as `168.00000000000003` or `26.666666666666668`. Tidy at one chokepoint, but never blanket-round: values terminating within six decimals were written deliberately — sevenths and eighths, thousandths for ordering, the digits a rounding question removes, significant figures, standard form, trigonometric ratios. Tidy longer expansions only, preferring an exact short form, and keep three significant figures below one so a rate does not collapse to `0.02`. Move the answer and its options together or not at all.
- **A panel toggled through the `hidden` property must not carry an author `display` rule.** An author `display` beats the browser's `[hidden] { display:none }`, so the element stays visible and dead. Add an explicit `[hidden] { display:none }` guard and assert it in the validator.

## Preserve xAPI and packages

Reuse the bundled proven sample ZIP and its `lib/xapiwrapper.min.js` and `lib/xAPI.js` unchanged. Do not invent a replacement xAPI protocol. Generate ZIP entries with forward slashes and place `index.html` at the archive root, not inside an extra folder.

Record pedagogically meaningful state: question identity, learner response, correctness, attempt count, hint/tutorial use, strategy or constructed state, elapsed time, score, completion, and misconception category when available. Let SLS supply endpoint, authentication, agent, and activity identifiers.

## Build and verify

From the project root run:

```powershell
& .\_source\build.ps1
python .\_source\validate.py
node .\_source\headless_check.js
```

If `python` is unavailable, locate the available Python runtime rather than silently skipping validation.

`headless_check.js` runs the template's own script in a Node VM against a stub DOM, skipping `init()` so no UI is built, and exercises the generators for every activity, every step and every offered level in seconds. Nothing about problem generation needs a browser. Prefer it over any iframe sweep: loading each activity in a real browser costs tens of seconds once fonts and 3D scenes load, which limits a full pass to a sample, and sampling is how defects survive. It also reports the difficulty trend, the widest repeated-object row, values with too many decimals, and which objectives offer which levels.

Then perform representative real-browser QA across every newly added family, including at least one wrong-answer tutorial and a 390 px mobile viewport. Follow [references/validation.md](references/validation.md). Iterate at the canonical source until all checks pass.

When verifying CSS in a browser after a rebuild, cache-bust the URL. A stale page shows the new rule missing from `document.styleSheets` and the old value still computing, which looks exactly like a specificity or syntax failure and sends you hunting for an error that does not exist.

## Report completion

Lead with the outcome. Give exact paths to the chronological catalogue, manifest, master template, packages, and validation report. State objective/folder/ZIP counts, browser-tested families, mobile result, xAPI result, and any remaining blocker. Do not call the work complete when generated folders, ZIPs, or source files disagree.
