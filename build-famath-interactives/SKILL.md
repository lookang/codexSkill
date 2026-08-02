---
name: build-famath-interactives
description: Build, extend, regenerate, package, and validate FAMath-style SLS formative mathematics interactives from syllabus learning objectives. Use when Codex needs to create chronological Primary, Secondary, or JC mathematics activity folders; preserve the FAMath visual UI and misconception-first "Show me visually" tutorials; reuse the proven SLS xAPI package strategy; generate upload-ready ZIPs; or audit an existing FAMath collection systematically at its canonical generator.
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

Use `-Build` only when reproducing the bundled Primary 1, 4, 5 and 6 starter unchanged.

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

## Preserve xAPI and packages

Reuse the bundled proven sample ZIP and its `lib/xapiwrapper.min.js` and `lib/xAPI.js` unchanged. Do not invent a replacement xAPI protocol. Generate ZIP entries with forward slashes and place `index.html` at the archive root, not inside an extra folder.

Record pedagogically meaningful state: question identity, learner response, correctness, attempt count, hint/tutorial use, strategy or constructed state, elapsed time, score, completion, and misconception category when available. Let SLS supply endpoint, authentication, agent, and activity identifiers.

## Build and verify

From the project root run:

```powershell
& .\_source\build.ps1
python .\_source\validate.py
```

If `python` is unavailable, locate the available Python runtime rather than silently skipping validation.

Then perform representative real-browser QA across every newly added family, including at least one wrong-answer tutorial and a 390 px mobile viewport. Follow [references/validation.md](references/validation.md). Iterate at the canonical source until all checks pass.

## Report completion

Lead with the outcome. Give exact paths to the chronological catalogue, manifest, master template, packages, and validation report. State objective/folder/ZIP counts, browser-tested families, mobile result, xAPI result, and any remaining blocker. Do not call the work complete when generated folders, ZIPs, or source files disagree.
