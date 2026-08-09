# Architecture and SLS packaging

## Source of truth

Keep these canonical surfaces under `_source/`:

- `activities.json`: official Primary objective order, folder names, titles, and kind routing.
- `secondary_syllabus.json`: the same for Secondary objectives.
- `index.template.html`: shared self-contained UI, generators, models, tutorial engine, adaptive ladder, challenge levels, analytics, accessibility, and responsive CSS.
- `build.ps1`: ordered-folder generation, proven-library extraction, vendor copying, catalogue creation, and ZIP packaging.
- `validate.py`: completeness, syntax, package, library, interaction, and pedagogy contracts.
- `headless_check.js`: fast generator verification for every activity, step, and level.
- `net_fold_check.js`: fold-geometry verification for the 3D nets, run against the shipped Three.js build.
- `vendor/`: local Three.js and KaTeX with its fonts and licence. `build.ps1` refuses to run without them, because activities must work inside an SLS iframe with no network.

Generated activity folders and `_packages/*.zip` are products of those files. Regenerate them after canonical changes.

## Portable starter

The skill asset `assets/famath-starter/` contains the proven complete Primary 1 to Secondary canonical generator, the vendored offline libraries, and the xAPI sample ZIP. Copy it with `scripts/bootstrap_famath.ps1`; do not edit the asset in place during a user project.

The bundled starter is only trustworthy if it builds. After refreshing it, bootstrap into an empty directory with `-Build` and confirm the folder count, the validator, and the headless check all pass there — not just in the project it was copied from.

For a new grade:

1. Extract and count objectives in official order.
2. Add manifest records with a continuous `Primary<grade>_<NN>_` prefix.
3. Add or reuse family-level `kind` routes in the template.
4. Update explicit grade counts and new visual contracts in `validate.py`.
5. Build all affected folders and packages from source.

## Folder and package contract

Each generated folder contains:

```text
index.html
activity.json
instruction.txt
lib/xapiwrapper.min.js
lib/xAPI.js
```

Each matching ZIP contains the same paths at archive root. Internal separators are `/`. Never place the activity inside a wrapper directory.

Create grade catalogues:

- `Primary<grade>_Syllabus_Order.html`
- `SYLLABUS_ORDER.md` for Primary 1
- `PRIMARY<grade>_SYLLABUS_ORDER.md` for other grades

## xAPI invariants

- Extract `lib/xapiwrapper.min.js` and `lib/xAPI.js` from the proven sample ZIP.
- Verify generated and packaged hashes match the proven entries.
- Keep local preview functional when SLS launch parameters are absent.
- Treat the local warning about missing endpoint, auth, agent, or activity ID as expected outside SLS.
- Do not emit meaningless per-click statements. Aggregate teacher-visible learning evidence.
- Keep launch values supplied by SLS; never hard-code credentials or endpoints.

## Analytics payload intent

Prefer one coherent state object that includes:

- activity and objective identifiers;
- question/stage number and prompt family;
- learner response or constructed model;
- correctness, score, and attempt count;
- hints and visual tutorials opened;
- error or misconception category;
- elapsed time and completion state;
- concise evidence useful to a teacher.

Preserve existing working keys and wrapper behavior when extending a project.
