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
- figure labels that cross a shape outline, plus in-figure labels listed for review — whether a label sits beside the feature it names is semantic, so the reviewer judges that list rather than the tool failing it;
- which objectives genuinely emit alternative representations.

Run it three times when levels or availability are involved. Identical counts prove the availability probe is deterministic; drifting counts mean a control will appear and disappear between page loads.

Layout, fonts, animation, and real input still need a browser. Generation logic does not.

## A check must run the shipped code, not a copy of it

The 3D net folding was verified by a script that re-implemented the hinge maths by hand. It reported every net correct while the rendered nets were visibly broken, because the script and the renderer were written from the same wrong assumption about the order Three.js composes Euler rotations. A check that agrees with the code's *intent* proves nothing.

- Load the artefact that actually ships and call into it. For geometry, build the tree from real `THREE.Group` objects and read world positions back from `updateMatrixWorld` — that is where a matrix-order mistake shows up.
- Better still, expose a test-only handle on the live component (gated behind the harness flag) and measure the **rendered objects** in the browser. Measuring in the model's local space rather than world space strips the view rotation out.
- Assert the property that means the thing works, not a proxy for it. "Face centres are where I expected" passed while the solid was open; "all four slant faces meet at one apex" and "each face is square to one axis" did not.
- When a first attempt at a rule produces a wall of failures, suspect the rule before the code: an inward-pointing normal is not a fold in the wrong direction.
- **Measure the artefact, not a quantity derived from the same assumptions.** A second fold defect survived a passing check because the check computed each face's centroid *from the layout* instead of reading the mesh: the assumed centroid agreed with itself while the real geometry sat half a face away. Read real vertices and assert extents.
- Where the code and the check both need a rule, hoist it into one shared function they both call. Two copies of a rule are two chances to write it wrong in the same way.
- Prove the check fails on the bug. Revert the fix, confirm it reports the defect, then restore. A check never seen to fail is not yet a check.

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

