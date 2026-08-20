# SLS Playwright Automation

This project runs the guarded SLS Community Gallery section and activity-migration workflow without relying on improvised screen coordinates.

The first supplied configuration targets:

- Module: `AST_FA-Math_P3_Multiplication algorithms (up to 3 digits by 1 digit)`
- Module ID: `00000000-0000-0000-0000-000000000000`
- Sections: B to F
- Outcome: `3.4 multiplication and division algorithms (up to 3 digits by 1 digit)`
- Question keyword: `FA Math`

## What It Does

For each configured section, the runner:

1. Opens the exact SLS admin URL and verifies the module title.
2. Applies and verifies the section Subject, Level, Content Map, and learning outcome.
3. Reuses an existing valid `- Copy`, or duplicates exactly one original.
4. Opens every question settings panel.
5. Enables **Include in Learning Progress**.
6. Verifies `Pri 3 Mathematics (2021)` is present.
7. adds `FA Math`, saves, reloads, reopens, and verifies the setting.
8. Optionally deletes the exact original only after every copied question passes.
9. Optionally renames the retained copy to remove `- Copy`.
10. Writes a checkpoint, screenshots, a JSON report, and a Playwright trace.

The script never enters credentials and stops when it sees an SLS or MIMS login boundary.

## One-Time Setup

### Simplest Windows workflow

For normal use, run only:

```text
RUN-SLS-AUTOMATION.cmd
```

It accepts the normal Community Gallery viewing URL or an admin URL, opens the admin Module View page, clicks the real **Edit** button, verifies **Done** appears, and then continues in visible Chrome while streaming each stage in the terminal. When the module has a reviewed matching config, the guarded non-deleting edit pass starts automatically after inspection. It requires typing `DELETE` before verified originals can be removed. If the saved SLS session has expired, it automatically opens the manual authentication window and retries inspection once. It stops automatically on configuration, selector, verification, or SLS errors.

The numbered CMD files expose individual stages for troubleshooting. You do not need to run them one by one during normal use.

### Separate finishing commands

After the activity migration is complete, these independent launchers make only the named change:

```text
RUN-SLS-GAMIFICATION.cmd
RUN-SLS-ADD-WEE-LOO-KANG.cmd
```

Both commands ask for a Community Gallery module or lesson URL, convert it to the exact admin Module View route, click **Edit**, and keep visible Chrome open at the verified final state until you press Enter in the terminal.

`RUN-SLS-GAMIFICATION.cmd` requires a reviewed matching JSON config with a `gamification` block. It enables Gamification, uses Authoring Copilot with the configured recipe and instructions, selects the first completed preview, sets a meaningful title and description, saves, closes, reopens, and verifies the persisted game. If SLS reverts the title to `Untitled Game`, it retries once with the configured shorter title.

`RUN-SLS-ADD-WEE-LOO-KANG.cmd` works with any valid SLS Community Gallery module URL. It searches the teacher directory for the exact name `WEE LOO KANG`, requires exactly one match, preserves existing credited teachers, saves through Module Settings, closes, reopens, and verifies that the teacher persisted. It does not change printing, copying, or reattempt settings.

### PowerShell workflow

Open PowerShell in this folder:

```powershell
cd "C:\Users\weelo\OneDrive\Documents\0iwant2study.org\slsProd\sls-playwright-automation"
npm.cmd install
```

Create the dedicated authenticated Chrome profile and reusable Playwright state:

```powershell
npm.cmd run sls:auth
```

Chrome opens using `.auth\chrome-profile`. Sign into SLS manually, wait until an SLS page is fully visible, then return to PowerShell and press Enter. The script exports the authenticated cookies and browser storage to `.auth\sls-state.json`, which later runs load even when SLS uses a session-only cookie.

Run authentication again whenever SLS expires the saved session or the runner reaches the login boundary.

Do not commit or share `.auth`; it contains authenticated browser state.

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

## Adding Another Module

Copy `configs\p3-multiplication-algorithms.json` and change only verified values:

- exact module ID, title, and admin edit URL;
- exact section labels and titles;
- exact original activity titles;
- official Subject, Level, Content Map, outcome path, and leaf outcome;
- expected question counts when known.

Run `sls:inspect` first. Then run `sls:apply -- --keep-originals`. Enable deletion only after reviewing the report and trace from the non-deleting pass.
