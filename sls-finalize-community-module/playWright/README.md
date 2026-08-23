# SLS Playwright Automation

This is the reproducible browser-automation package bundled with the
[`sls-finalize-community-module`](../SKILL.md) Codex skill. It works through the
real SLS Community Gallery authoring interface with guarded Playwright locators,
visible review, traces, checkpoints, and save/reopen verification. It does not use
screen coordinates or store credentials in source control.

## What It Does

The package supports these complete workflows:

| Launcher | Purpose | Mutation boundary |
| --- | --- | --- |
| `RUN-SLS-AUTOMATION.cmd` | Inspect, resolve curriculum, tag questions, and perform guarded duplicate-and-replace work | Originals require the explicit `DELETE` checkpoint |
| `RUN-SLS-PAGE-BREAK.cmd` | Put each question on its own page using safe SLS dividers | Ambiguous layouts stop; `--dry-run` changes nothing |
| `RUN-SLS-REMOVE-COPY.cmd` | Remove the trailing ` - Copy` text from retained activity titles | Safe candidates run automatically; collisions are skipped |
| `RUN-SLS-SELECTED.cmd` | Select any combination of all seven finalization stages | Each stage inventories first; a guard stops later stages |
| `RUN-SLS-ACPINTERACTIVE.cmd` | Generate one matching ACP practice interactive per eligible FA Math question | Existing ZIPs are preserved; multi-question pages stop |
| `RUN-SLS-GAMIFICATION.cmd` | Generate and verify gamification | Existing usable games are reused |
| `RUN-SLS-THUMBNAIL.cmd` | Generate and verify a Featured Image | Existing images are protected unless replacement is explicit |
| `RUN-SLS-ADD-WEE-LOO-KANG.cmd` | Add the exact credited teacher and completed-assignment printing | Existing teachers and other permissions are preserved |
| `RUN-SLS-SMOKE-CHECK.cmd` | Check the live SLS entry points | Read-only; closes without saving |
| `RUN-PLAYWRIGHT-RECORD-WORKFLOW.cmd` | Record a new cross-site browser demonstration for later hardening | Produces a local raw recording only |

All launchers accept public, admin, section, or activity URLs for the same module.
They normalize navigation through admin Module View, verify the module UUID and
title, and share `.state\last-module.json`, so the module chosen in one launcher is
the Enter-key default in the others.

Question tagging reads live FA Math stems from lazily hydrated
`<akit-interaction>` shadow roots, including WIRIS mathematics. It distinguishes
assessed representation questions—such as fraction/decimal/mixed-number
conversions—from reflection prompts before enabling **Include in Learning
Progress**.

The scripts never ask for credentials in the terminal and stop when they reach an
unverified SLS or MIMS login boundary.

## One-Time Setup

### Simplest Windows workflow

For normal use, run only:

```text
RUN-SLS-AUTOMATION.cmd
```

Every public launcher shares the last valid module URL in the private `.state\last-module.json` file. A module selected in Automation, Gamification, Page Break, Smoke Check, Thumbnail, ACP Interactive, Add Teacher, or the recorder therefore becomes the displayed default in every other launcher. Press **Enter** to reuse it or paste a new SLS URL to replace it. Recording a non-SLS website preserves the previous SLS module. The automation accepts the normal Community Gallery viewing URL or an admin URL, opens the admin Module View page, clicks the real **Edit** button, verifies **Done** appears, and then continues in visible Chrome while streaming each stage in the terminal. A new or placeholder config is completed in the same run: the launcher first reads existing section metadata, then falls back to a strong unique match from locally harvested SLS taxonomies, reruns the question scan, and records confident section outcomes. When several curricula remain plausible, it prints numbered exact SLS candidates and asks the user to choose `1`, `2`, `3`, and so on; the reviewed selection is recorded locally and the read-only scan resumes in the same run. Pressing **Enter** at that prompt stops safely without selecting or changing SLS. A module with no question-level tags automatically enters the guarded duplicate-and-replace preparation pass; originals remain until you type `DELETE`. If the saved SLS session has expired, the launcher opens the authentication window and retries inspection once. It stops automatically on configuration, selector, verification, or SLS errors, and the CMD window remains open for copying debug output.

The numbered CMD files expose individual stages for troubleshooting. You do not need to run them one by one during normal use.

### Separate finishing commands

After the activity migration is complete, these independent launchers make only the named change:

```text
RUN-SLS-GAMIFICATION.cmd
RUN-SLS-THUMBNAIL.cmd
RUN-SLS-ADD-WEE-LOO-KANG.cmd
RUN-SLS-PAGE-BREAK.cmd
RUN-SLS-ACPINTERACTIVE.cmd
RUN-PLAYWRIGHT-RECORD-WORKFLOW.cmd
```

The finishing commands ask for a Community Gallery module or lesson URL, convert it to the exact admin Module View route, click **Edit**, and use the same authenticated visible-Chrome safeguards. The Playwright recorder is a separate demonstration tool and may traverse other websites.

`RUN-PLAYWRIGHT-RECORD-WORKFLOW.cmd` opens Playwright Codegen with the reusable SLS authentication state and saves the raw generated test under the git-ignored `recordings` directory. It can follow navigation across websites and tabs within the opened browser context. Clipboard demonstrations may be recorded as literal example text; review the generated file afterward and replace those literals with explicit source locators, variables, and destination fills before treating it as reusable automation.

`RUN-SLS-GAMIFICATION.cmd` requires a reviewed matching JSON config with a `gamification` block. It enables Gamification, uses Authoring Copilot with the configured recipe and instructions, selects the first completed preview, sets a meaningful title and description, saves, closes, reopens, and verifies the persisted game. It preserves existing leaderboard choices. If SLS reverts the title to `Untitled Game`, it retries once with the configured shorter title.

`RUN-SLS-THUMBNAIL.cmd` adds a generated Featured Image only when the module has no image, unless `--replace-existing` is explicitly supplied. It accepts an optional `--prompt "..."`, verifies the image after reopening the module, and leaves activities and tags untouched.

`RUN-SLS-ADD-WEE-LOO-KANG.cmd` works with any valid SLS Community Gallery module URL, including a URL copied while viewing a section or activity. It searches the teacher directory for the exact directory name `Wee Loo Kang`, requires exactly one match, preserves existing credited teachers, and enables **Allow viewing as print-friendly completed assignment**. It saves through Module Settings, closes, reopens, and verifies both the teacher and completed-assignment permission persisted. The copying, print-friendly worksheet, self-study reattempt, leaderboard, and other settings are preserved.

`RUN-SLS-PAGE-BREAK.cmd` reviews every activity in every section. Its first pass is read-only and groups questions into visual rows using their rendered positions. Side-by-side questions with substantial vertical overlap stay together; for example, a Q1+Q2 row followed by a Q3+Q4 row is split before Q3, not before Q2 or Q4. When the review has candidates and no ambiguous pages, a normal run automatically reopens the same module and inserts one verified break at a time. The runner waits up to 10 seconds for the nearby visible **Display > Page Break > Single** menu cascade and up to 45 seconds for SLS pagination to show the saved extra page. After a split, it inspects only the newly created continuation page; earlier pages remain checkpointed and untouched later pages retain their prior assessment with shifted page numbers. Separating page 5 into pages 5 and 6 therefore proceeds directly from page 6 instead of revisiting pages 1-5. Each split still requires an observed save response and page-count increase. The slower full-module reopen audit is skipped by default; add `--verify` to run it. A page containing one question remains one semantic chunk and uses the existing length-based rule (1.75 viewports). Use `--dry-run` when a report without SLS changes is required. Ambiguous layouts and missing save responses stop at a guard instead of clicking another divider.

`RUN-SLS-REMOVE-COPY.cmd` reviews every section and ignores all clean activity titles. An activity ending exactly in ` - Copy` (including repeated suffixes) is renamed to its suffix-free title automatically when that clean title is absent. A clean-title collision, duplicate copy title, or several copy depths resolving to the same base is reported as **SKIPPED**. No activity is deleted. Use `--dry-run` when only a report is required; `--apply` remains accepted for compatibility but is no longer necessary. Every rename preserves the activity's optional flag and recommended time, verifies the live SLS metadata immediately, and checks the sidebar. The runner then reopens the module and verifies that every old copy title is absent and every clean title remains exactly once.

`RUN-SLS-SELECTED.cmd` asks for the module and stages once, then accepts `1` for Automation, `2` for Page Break, `3` for Thumbnail, `4` for Gamification, `5` for ACP Interactive, `6` for Add Wee Loo Kang plus completed-assignment printing, and `7` for automatically removing unambiguous trailing ` - Copy` text. Enter a comma-separated subset such as `1,2,5,7`, a numeric range such as `1-4`, or combine them as `1-4,6,7`. Press **Enter** or type `AUTO` to run all seven. Coordinated child stages close their browsers automatically, and a failed or guarded run keeps the CMD open so the error can be read. The coordinator uses the safe dependency order: Automation, Remove Copy Suffixes, Page Break, ACP Interactive, Thumbnail, Gamification, then credits and permissions. For a non-interactive selection, use `RUN-SLS-SELECTED.cmd --steps 1-4,6,7 --url "SLS-URL"`; `--auto` is the equivalent all-seven choice.

`RUN-SLS-ACPINTERACTIVE.cmd` reviews every page in every activity and section. For a page containing exactly one `FA Math` question without an existing interactive ZIP, it sends the question to the iwant2study Prompt Library, selects the configured grade and Mathematics, reads the generated prompt, inserts a Text component, and uses **Authoring Copilot > Interactive (Beta)** to generate and add the matching practice interactive. It waits up to ten minutes for each preview, reopens every changed activity, and verifies the generated ZIP persisted. Existing interactives are preserved. A page containing several FA Math questions stops at a guard so `RUN-SLS-PAGE-BREAK.cmd` can separate them first. The demonstrated default is `Primary 5-6`; override it with `--grade "Primary 3-4"` when required.

For an ACP review without changes:

```powershell
RUN-SLS-ACPINTERACTIVE.cmd --dry-run
```

For a controlled first-interactive trial:

```powershell
RUN-SLS-ACPINTERACTIVE.cmd --apply --max-interactives 1
```

For an explicitly read-only run:

```powershell
RUN-SLS-PAGE-BREAK.cmd --dry-run
```

To skip the separate read-only pass and start the guarded apply pass immediately, use `--apply`; it still re-locates every insertion target and checks the save response and page-count increase:

```powershell
RUN-SLS-PAGE-BREAK.cmd --apply
```

For an occasional full reopen audit after all page breaks are applied:

```powershell
RUN-SLS-PAGE-BREAK.cmd --verify
```

### PowerShell workflow

Open PowerShell in this folder:

```powershell
cd "C:\Users\weelo\OneDrive\Documents\0iwant2study.org\slsProd\sls-playwright-automation"
npm.cmd ci --cache .npm-cache
```

Create the dedicated authenticated Chrome profile and reusable Playwright state:

```powershell
npm.cmd run sls:auth
```

Chrome opens using `.auth\chrome-profile`. Sign into SLS manually, wait until an SLS page is fully visible, then return to PowerShell and press Enter. The script exports the authenticated cookies and browser storage to `.auth\sls-state.json`, which later runs load even when SLS uses a session-only cookie.

Run authentication again whenever SLS expires the saved session or the runner reaches the login boundary.

Do not commit or share `.auth`; it contains authenticated browser state. Treat `output` reports, screenshots, and traces as private too because they can contain SLS lesson and account-interface content. All of these folders are excluded by `.gitignore`.

## Inspect Without Changing SLS

```powershell
npm.cmd run sls:inspect -- --config configs/p3-multiplication-algorithms.json
```

This verifies authentication, the exact module, and the visible section inventory. It writes output under `output\<module-id>\<timestamp>`.

The launcher accepts any exact URL in this form:

```text
https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/<module-id>
```

A URL is sufficient for read-only inspection. Applying changes also requires a matching JSON config because the URL does not contain the curriculum outcome, intended sections, exact activity titles, or expected question counts. Apply and resume stop before editing if the URL and config module IDs differ.

## Apply Safely Without Deleting Originals

```powershell
npm.cmd run sls:apply -- --config configs/p3-multiplication-algorithms.json --keep-originals
```

This applies outcomes, creates or reuses copies, and verifies every question. Originals remain in place.

## Apply the Full Duplicate-and-Replace Workflow

Deletion requires the explicit command-line flag:

```powershell
npm.cmd run sls:apply -- --config configs/p3-multiplication-algorithms.json --delete-originals --rename-copies
```

The runner accepts only a dialog headed exactly `Delete Activity?`. It stops on `Delete Component?`, ambiguous copies, missing question tags, an unexpected module title, or an SLS error.

## Resume After a Stop

```powershell
npm.cmd run sls:resume -- --config configs/p3-multiplication-algorithms.json --delete-originals --rename-copies
```

Checkpoints are stored in `.state\<module-id>.json`. The runner still rechecks live SLS state before skipping or deleting anything.

To start at a later section:

```powershell
npm.cmd run sls:resume -- --config configs/p3-multiplication-algorithms.json --start-section C --delete-originals --rename-copies
```

## Inspect a Failure

Each run creates:

- `report.json`
- `trace.zip`
- `failure.png` when a run stops
- one verification screenshot per question
- one completion screenshot per activity

Open a trace with:

```powershell
npx.cmd playwright show-trace "output\<module-id>\<timestamp>\trace.zip"
```

## Validate the Project

```powershell
npm.cmd run check
npm.cmd test
```

To verify the live SLS entry points in visible Chrome without changing or saving anything, run:

```powershell
RUN-SLS-SMOKE-CHECK.cmd "https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/<module-id>/section/<section-id>"
```

This read-only smoke test checks URL conversion, Edit mode, Gamification, Module Settings/teacher credits, and Featured Image generation controls. It closes every modal without saving. Add `--headless` only when a visible window is not wanted.

## Adding Another Module

Copy `configs\p3-multiplication-algorithms.json` and change only verified values:

- exact module ID, title, and admin edit URL;
- exact section labels and titles;
- exact original activity titles;
- official Subject, Level, Content Map, outcome path, and leaf outcome;
- expected question counts when known.

Run `sls:inspect` first. Then run `sls:apply -- --keep-originals`. Enable deletion only after reviewing the report and trace from the non-deleting pass.
