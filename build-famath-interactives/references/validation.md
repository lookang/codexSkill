# Validation and browser QA

Do not rely on visual inspection of one activity.

## Headless generator check first

`node _source/headless_check.js [folderPrefix] [--draws N]`

It extracts the template's activity script, swaps the config placeholder for a global, replaces the trailing `init();` with an export of the internals, and runs it in a Node VM against a Proxy-based stub DOM — once per activity, using each built `index.html`'s own config. The whole collection is covered in seconds against tens of seconds per activity in an iframe, which is the difference between checking everything and checking a sample.

It reports, for every activity:

- generation failures at any step and any offered level, including a level that silently serves a Level 1 item;
- the difficulty trend across the six steps, measured through the served path rather than the raw generator;
- which challenge levels are offered;
- values reaching a learner with too many decimal places;
- the widest repeated-object row each layout component can produce;
- which objectives genuinely emit alternative representations.

Run it three times when levels or availability are involved. Identical counts prove the availability probe is deterministic; drifting counts mean a control will appear and disappear between page loads.

Layout, fonts, animation, and real input still need a browser. Generation logic does not.

## Automated checks

Run the canonical build and validator. Require:

- manifest IDs, folders, and `kind` values are unique;
- per-grade folder prefixes are continuous and catalogue counts match;
- every folder has required files and no unresolved template placeholder;
- every script parses successfully;
- local references resolve and no external runtime dependency is required;
- every ZIP has root-level `index.html`, forward-slash entries, and required libraries;
- generated and packaged xAPI library hashes match the proven sample;
- generated `index.html` and ZIP `index.html` are byte-identical;
- required touch, keyboard, tutorial, analytics, and family-model markers exist;
- expected objective, folder, and ZIP counts match the confirmed syllabus scope.

Update validator expectations when adding grades or families. Never weaken a failing contract merely to make validation pass.

## Browser matrix

Serve the project locally over HTTP. Test at least one activity from each new family and verify:

1. initial problem and model are mathematically consistent;
2. touch/click/drag and keyboard alternatives work;
3. wrong answer opens a tutorial that reconstructs the actual learner response;
4. tutorial steps create a meaningful visual change and reach a correct notation bridge;
5. Next, Restart, Hint, Read, Clear, and Check preserve sensible state;
6. no JavaScript errors occur;
7. 390 x 760 mobile viewport has no horizontal overflow and essential actions remain reachable;
8. animations finish in a clear stable state and respect reduced motion;
9. SLS-local xAPI absence produces only the expected missing-launch-parameters warning.

Also inspect boundary cases: zero, exact midpoint, exact division, remainder, regrouping across zero, equal values, repeated values, 90-degree angles, and symmetric/asymmetric figures.

## Package evidence

Report exact counts and paths. Sample several ZIPs across early, middle, and final syllabus positions. Inspect archive member names, not timestamps. Preserve validation output as `validation-report.json` when the project already uses that convention.

