# SLS Playwright Automation

This is the reproducible browser-automation package used by the
[`sls-finalize-community-module`](https://github.com/lookang/codexSkill/tree/main/sls-finalize-community-module) Codex skill. It works through the
real SLS Community Gallery authoring interface with guarded Playwright locators,
visible review, traces, checkpoints, and save/reopen verification. It does not use
screen coordinates or store credentials in source control.

## Public Resources

- **[SLS Modules Run by Automation Scripts](https://docs.google.com/spreadsheets/d/1GnyhDb2_jjOK2GBXHDtzBCSJz7-4xdwH-hOM3jl-Nr4/edit?usp=sharing)** — a public, filterable Google Sheet listing the SLS lesson/module titles and canonical URLs found in the automation run reports. It also records run counts, first and latest run times, workflows seen, latest status, and how each title was verified.

### Video Walkthrough

<a href="https://www.youtube.com/watch?v=GY5osFZ6ijA">
  <img src="https://img.youtube.com/vi/GY5osFZ6ijA/maxresdefault.jpg" width="720" alt="Watch: What Happens When AI Feedback Meets an Interactive? Make Mathematics Visible">
</a>

**[What Happens When AI Feedback Meets an Interactive? Make Mathematics Visible](https://www.youtube.com/watch?v=GY5osFZ6ijA)**

Watch the `lookang AI` walkthrough showing how AI feedback and interactive mathematics can work together to make learners' thinking visible. Click the preview to play it on YouTube.

The spreadsheet is a point-in-time operational index derived from local run reports; SLS access permissions still apply when opening the linked lesson URLs. Authentication files, traces, screenshots, and private report contents are never published with this repository.

## What It Does

The package supports these complete workflows:

| Launcher | Purpose | Mutation boundary |
| --- | --- | --- |
| `RUN-SLS-AUTOMATION.cmd` | Inspect, resolve curriculum, and surgically tag existing questions in place | No section or activity is copied, renamed, or deleted |
| `RUN-SLS-PAGE-BREAK.cmd` | Put each question on its own page using safe SLS dividers | Ambiguous pages are skipped; `--dry-run` changes nothing |
| `RUN-SLS-REMOVE-COPY.cmd` | Remove the trailing ` - Copy` text from retained activity titles | Safe candidates run automatically; collisions are skipped |
| `RUN-SLS-RENAME-TITLES.cmd` | Prefix module titles from a Google Sheet tab | Live title preview, one confirmation, duplicate-prefix protection and save/reopen verification |
| `RUN-SLS-REVERT-AST-TITLES.cmd` | Remove a leading title prefix only from titles containing a required token such as `AST` | Defaults to `AST` and `Topical Revision -`; unmatched titles are untouched |
| `RUN-SLS-ACPINTERACTIVE.cmd` | Generate one matching ACP practice interactive per eligible FA Math question | Existing ZIPs are preserved; multi-question pages stop |
| `RUN-SLS-GPT.cmd` | Generate a second comparison interactive with ChatGPT Work and upload its verified ZIP | Native ACP ZIPs are preserved; exact page and root `index.html` are rechecked |
| `RUN-SLS-GAMIFICATION.cmd` | Generate and verify gamification | Existing usable games are reused |
| `RUN-SLS-THUMBNAIL.cmd` | Generate and verify a Featured Image | Existing images are protected unless replacement is explicit |
| `RUN-SLS-ADD-WEE-LOO-KANG.cmd` | Add the exact credited teacher and completed-assignment printing | Existing teachers and other permissions are preserved |
| `RUN-SLS-SMOKE-CHECK.cmd` | Check the live SLS entry points | Read-only; closes without saving |
| `RUN-SLS-SELECTED.cmd` | Select any combination of all seven finalization stages | Each stage inventories first; a guard stops later stages |
| `RUN-PLAYWRIGHT-RECORD-WORKFLOW.cmd` | Record a new cross-site browser demonstration for later hardening | Produces a local raw recording only |

Single-module launchers accept public, admin, section, or activity URLs for the same module.
They normalize navigation through admin Module View, verify the module UUID and
visible core title (including when SLS prepends its saved Subject and Level), and
share `.state\last-module.json`, so the module chosen in one launcher is
the Enter-key default in the others.

### Batch Module Title Prefixes

Double-click `RUN-SLS-RENAME-TITLES.cmd` (macOS: `RUN-SLS-RENAME-TITLES.command`).
The default source is the [requested Sheet tab](https://docs.google.com/spreadsheets/d/1GnyhDb2_jjOK2GBXHDtzBCSJz7-4xdwH-hOM3jl-Nr4/edit?gid=447883961#gid=447883961).
Choose the Sheet, rows (`all` or e.g. `7-10,12`), and a purpose prefix such as
`Topical Revision -`. The default child-facing format is
`Topical Revision - Addition and Subtraction within 100 (FA-Math)`. The known
authoring-process phrase `(Algorithm - Recall, Practise and Quiz using FA-Math)`
is shortened to `(FA-Math)`, and an old leading level marker is removed from the
visible title. Subject, level, content map and outcome remain available through
the saved SLS curriculum tags. Use `--with-curriculum` when the visible title
should also include those saved tags, such as
`Topical Revision - P1 Mathematics - Addition within 100 (FA-Math)`. Adjacent
levels are compacted (`P4-P5 Mathematics`), non-adjacent levels remain explicit
(`P3 & P5 Mathematics`), and missing curriculum tags stop that optional mode
instead of being guessed. The launcher remembers the Sheet and prefix separately in
`.state/title-prefix.json`; row selection is deliberately asked again each run.
It opens visible Chrome, reads the actual SLS titles, shows old/new titles, and
asks once for `YES` before applying. A login boundary pauses for manual sign-in.
The existing topic text is retained after the standardized searchable heading.
After each SLS save is independently verified, Playwright writes the exact final
title into the same source row under **New Module Title**. On the current Sheet
this is column `K`; if that header already exists it is reused, otherwise the
launcher creates it in the next unused header cell. It never writes during
`--dry-run`, and `--no-sheet-update` explicitly disables tracking.
Titles containing standalone `AST` text are excluded from ordinary prefix batches
by default and are neither edited nor written to the tracking column. The console
lists every exclusion. Use `--include-ast` only when an AST title is deliberately
meant to receive the prefix.

Only **module titles** and the dedicated **New Module Title** cells change:
activity names, content, tags, credits, publication status and other Sheet columns
are untouched. Public/admin links for the same UUID are processed once. Existing lowercase purpose text and a leading level marker
are normalized rather than duplicated. Each save is checked after reopening, with no automatic retries
of uncertain saves. A mismatch or concurrent title change stops the remaining batch.
Reports under `output/title-prefix/<timestamp>/report.json` retain source rows,
old/new titles, progress and errors; `trace.zip` aids private debugging. Rerunning
the same selection and prefix skips previously completed SLS edits and backfills
or verifies their Sheet tracking cells.

```powershell
# List Sheet titles without opening Chrome or editing anything:
.\RUN-SLS-RENAME-TITLES.cmd --list
# Preview actual SLS titles for a small selection without applying:
.\RUN-SLS-RENAME-TITLES.cmd --rows "7-10" --prefix "Topical Revision -" --dry-run
```

For unattended execution, use `node scripts/rename-titles.mjs --sheet "<exact Sheet URL>" --prefix "Topical Revision -" --rows "7-10" --apply --no-pause`.
Valid SLS and Google sessions are required; the visible launcher pauses for manual
Google sign-in before any SLS mutation if the Sheet is view-only. Unattended runs
stop before changing SLS when either session is unavailable. `--apply` requires
an explicit Sheet and prefix and cannot be combined with preview modes.
The CMD window remains open for copying output; `SLS_NO_PAUSE=1` suppresses that
terminal pause. A browser-fixture test is not proof of a live SLS save: verify a
single row after logging in before applying a large batch on a new SLS release.

To undo the prefix only for AST resources, double-click
`RUN-SLS-REVERT-AST-TITLES.cmd` (macOS: `RUN-SLS-REVERT-AST-TITLES.command`).
It scans the selected live SLS titles and proposes a change only when both are true:
the title contains standalone `AST` text and begins with `Topical Revision -`.
The matching is case-insensitive and treats punctuation and underscores as token
boundaries. Review the exact old/new list and type `YES` once to apply it. Each
save is reopened and verified before the corresponding **New Module Title** Sheet
cell is updated. Use `--contains "other text"`, `--prefix "another prefix -"`, or
`--dry-run` when a different guarded rollback is needed.

Curriculum discovery first reads any existing saved **Module Tags** on Introduction—every exact Subject/Level row, selected Content Map, and selected outcome—and treats a single internally consistent set as authoritative evidence. During the surgical Automation flow, a section whose **Section Tags** are completely empty receives an exact additive copy of those saved Module Tags before its questions are processed. It enters through the hover pencil on the main section title, reproduces every saved Subject/Level row and the exact checked outcomes, saves, reopens, and verifies the persisted values. Existing section selections are preserved. After the Module Tag copy check, reviewed supplemental curricula are appended to empty or already-tagged sections, with exact Subject/Level, Content Map, and outcome verification after reopening. This workflow never duplicates an activity and never re-infers curriculum from the section title. The runner opens the saved map and crawls its complete official learning-objective tree before searching any unsaved chooser. If SLS exposes only one selected Content Map accordion, its exact official label supplies the corresponding Subject and Level for inference. Outcome ranking is then restricted to those harvested objectives, so a different level or stream cannot win merely because its wording scores better. It then reads the module description, visible module text, section/activity wording, and question stems to select the most specific learning outcome. Title inference is now a fallback rather than the only source; ambiguous or contradictory saved metadata is reported and left unchanged.

When that saved Module Tag tree already has learning outcomes selected, the
read-only inventory also records their exact labels and branch paths. Those
teacher-selected outcomes become the authoritative candidate pool for every
question in the module; question and answer-key evidence chooses the best match
inside that pool and can never select an unchosen branch merely because its
wording scores better. If SLS says, for example, `18 selected` but the runner
cannot recover exactly 18 checked outcomes, question tagging stops before any
write instead of falling back to the whole syllabus. Symbolic set expressions
such as `X ∪ Y`, `A ∩ B'`, and their LaTeX forms are recognised as set operations
rather than generic equations. Differentiation, integration, product, quotient,
chain-rule, and related Calculus evidence is also kept distinct, with an exact
Suggested Answer rule used only to refine an already established Calculus
question. The report retains the exact reference pool used for the run.

Question tagging visits every numbered page in ordinary activities as well as
quizzes before it caches question evidence. It reads live FA Math stems from
lazily hydrated `<akit-interaction>` shadow roots, WIRIS MathML, ordinary DOM
text, and image `alt`/`title` metadata. When a substantial raster diagram still
has weak readable evidence, bundled Tesseract OCR reads up to three diagram
images locally and appends only results above the confidence floor; no question
image is sent to an external service. It distinguishes
assessed representation questions—such as fraction/decimal/mixed-number
conversions—from reflection prompts before enabling **Include in Learning
Progress**. Common Primary story actions such as receiving more, losing, eating,
selling, or giving away are recognised as arithmetic evidence. Within a saved
Primary 1 Mathematics map, readable number stories may use explicit activity
structures—Joining, Separating, Part-Part-Whole, and Comparison—to resolve a tie:
values within 20 select the mental-calculation outcome, while larger values up to
100 select the within-100 outcome. Empty stems, reflections, other levels, and
contradictory metadata never use this fallback. The runner requires the configured `expectedQuestionCount` before
any tagging begins. For broad
multi-topic examinations, an activity may carry `reviewedOutcomePrefixes` keyed
by question number. Each reviewed syllabus code is resolved uniquely against the
exact wording harvested from the saved SLS Content Map; a stale or ambiguous code
stops instead of falling back to a nearby lexical match.

Reviewed ETD exemplars may also define `supplementalQuestionOutcomes` at the
default, section, or activity level. Each entry names an exact Content Map and
outcome, its source document, and optional `questionNumbers`. Before question
tagging, the runner appends the supplemental Subject/Level, Content Map, and exact
outcome to the owning section even when that section already has Mathematics
tags. It then applies the same reviewed mapping to eligible questions. Both paths
harvest the target map from SLS when it is not cached, require one exact official
outcome match, preserve existing selections, and reopen to verify persistence.
The Percentage, Rate, Fraction of a Set, Fractions and
Decimals, and Length/Mass/Volume configs contain the reviewed mappings from their
ETD Word exemplars. A saved `Sec 3 & 4 Mathematics (G2/G3) (2020)` map similarly
enables an additive `Mathematics - G2MATHS` / `Secondary 5` / `Sec 5 Mathematics
(G2) (2020)` mirror, but only when the exact source outcome also exists in the
Secondary 5 map. Additional Mathematics never activates this rule.

The scripts never ask for credentials in the terminal and stop when they reach an
unverified SLS or MIMS login boundary.

## One-Time Setup

### Simplest Windows workflow

For normal use, run only:

```text
RUN-SLS-AUTOMATION.cmd
```

Every public launcher shares the last valid module URL in the private `.state\last-module.json` file. A module selected in Automation, Gamification, Page Break, Smoke Check, Thumbnail, ACP Interactive, Add Teacher, or the recorder therefore becomes the displayed default in every other launcher. Press **Enter** to reuse it or paste a new SLS URL to replace it. Recording a non-SLS website preserves the previous SLS module. The automation accepts the normal Community Gallery viewing URL or an admin URL, opens the admin Module View page, clicks the real **Edit** button, verifies **Done** appears, and then continues in visible Chrome while streaming each stage in the terminal. A new or placeholder config is completed in the same run: the launcher first reads existing section metadata, then falls back to a strong unique match from locally harvested SLS taxonomies, reruns the question scan, and records confident section outcomes. When several curricula remain plausible, it prints numbered exact SLS candidates and asks the user to choose `1`, `2`, `3`, and so on; the reviewed selection is recorded locally and the read-only scan resumes in the same run. Pressing **Enter** at that prompt stops safely without selecting or changing SLS. Normal Automation then tags the existing questions surgically; it never duplicates, renames, or deletes a section or activity. The retired guarded replacement path is available only with the explicit `--duplicate-and-replace` flag and retains its separate `DELETE` checkpoint. If the saved SLS session has expired, the launcher opens the authentication window and retries inspection once. It stops automatically on configuration, selector, verification, or SLS errors, and the CMD window remains open for copying debug output.

The numbered CMD files expose individual stages for troubleshooting. You do not need to run them one by one during normal use.

### Simplest macOS workflow

Install Node.js 20 or newer and Google Chrome. From Terminal in this folder, make
the launchers executable once and run setup:

```bash
chmod +x ./*.command ./scripts/run-macos.sh
./00-install-and-check.command
./01-authenticate-sls.command
```

Then start the same one-shot workflow with:

```bash
./RUN-SLS-AUTOMATION.command
```

The `.command` launchers have the same base names and accept the same arguments
as their Windows `.cmd` counterparts. They use `npm` instead of `npm.cmd`, keep
the Terminal window open for readable diagnostics, and run first-time setup
automatically when dependencies are missing. Finder can open a `.command` file
after its executable bit is set. Authentication state, reports, traces, OCR
caches, and recordings remain local and git-ignored on both platforms.

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

`RUN-SLS-PAGE-BREAK.cmd` reviews every activity in every section. Its first pass is read-only and groups questions into visual rows using their rendered positions. Side-by-side questions with substantial vertical overlap stay together; for example, a Q1+Q2 row followed by a Q3+Q4 row is split before Q3, not before Q2 or Q4. A normal run then reopens the same module, skips any non-standard page that lacks an unambiguous divider, and inserts one verified break at a time on the clear candidates. The runner waits up to 10 seconds for the nearby visible **Display > Page Break > Single** menu cascade and up to 45 seconds for SLS pagination to show the saved extra page. After a split, earlier pages remain checkpointed and scanning continues directly from the newly created continuation page, so separating page 5 into pages 5 and 6 proceeds from page 6 instead of revisiting pages 1-5. Each split still requires an observed save response and page-count increase. The slower full-module reopen audit is skipped by default; add `--verify` to run it. A page containing one question remains one semantic chunk and uses the existing length-based rule (1.75 viewports). Use `--dry-run` when a report without SLS changes is required. Missing or changed save responses and uncertain click targets still stop at a guard; ambiguous pages themselves are reported as **SKIPPED** and left unchanged without stopping other activities.

`RUN-SLS-REMOVE-COPY.cmd` reviews every section and ignores all clean activity titles. An activity ending exactly in ` - Copy` (including repeated suffixes) is renamed to its suffix-free title automatically when that clean title is absent. A clean-title collision, duplicate copy title, or several copy depths resolving to the same base is reported as **SKIPPED**. No activity is deleted. Use `--dry-run` when only a report is required; `--apply` remains accepted for compatibility but is no longer necessary. Every rename preserves the activity's optional flag and recommended time, verifies the live SLS metadata immediately, and checks the sidebar. The runner then reopens the module and verifies that every old copy title is absent and every clean title remains exactly once.

`RUN-SLS-SELECTED.cmd` asks for the module and stages once, then accepts `1` for Automation, `2` for Page Break, `3` for Thumbnail, `4` for Gamification, `5` for ACP Interactive, `6` for Add Wee Loo Kang plus completed-assignment printing, and `7` for automatically removing unambiguous trailing ` - Copy` text. Press **Enter**, type `COMPLETE`, or pass `--complete` to run the four-stage flow: Automation, Page Break, Thumbnail, then Add Wee Loo Kang. Automation is always surgical in this normal flow: existing questions are updated in place, and no section or activity is copied, renamed, or deleted. Each successful launcher's redundant final review pause is suppressed so the next stage can start. Enter a comma-separated subset such as `1,2,5,7`, a numeric range such as `1-4`, or combine them as `1-4,6,7`. Type `AUTO` or pass `--auto` only when all seven stages are intended. The legacy guarded replacement path is outside the normal flow and requires the explicit `--duplicate-and-replace` flag. A failed or guarded run keeps the CMD open so the real error can be read. If the reusable SLS login is absent or expires between stages, the coordinator opens the existing visible authentication flow once, saves the refreshed session, and retries the same stage. Unrelated guards, including an upstream ACP authentication failure, are never treated as an expired SLS session. The seven-stage safe dependency order remains Automation, Remove Copy Suffixes, Page Break, ACP Interactive, Thumbnail, Gamification, then credits and permissions. For a non-interactive four-stage selection, use `RUN-SLS-SELECTED.cmd --complete --url "SLS-URL"`.

`RUN-SLS-ACPINTERACTIVE.cmd` reviews every page in every activity and section. A nested section or activity URL selects the module UUID but does not narrow this traversal. By default, the run continues without a generation-count cap through the final page of the final activity; use `--max-interactives N` only for a deliberately limited batch. For a page containing exactly one top-level `FA Math` question without an existing interactive ZIP, it sends the question to the iwant2study Prompt Library and selects the configured grade and Mathematics. A multiple-part SLS question remains one candidate: the runner retains its shared stimulus, every nested FA Math part, each suggested-answer key, and each child component ID so one coherent ACP interactive can cover the complete question. When any FA Math response part is randomized, the runner safely opens that child question pencil and nested randomized-component pencil, reads the instruction template, correct expression, parameter definitions, dependent bounds, and current rendered values, then closes without saving. It fills **Specific Requirements** with that evidence and explicitly requests integer sliders, dynamic constraint enforcement, and a reset control that reproduces the exact source instance. Non-randomized questions receive no invented slider requirements. The full generated Prompt Library text is printed in the command prompt between copy markers and retained in the run report for that page. The generated prompt is inserted into a Text component through **Authoring Copilot > Interactive (Beta)**. The runner waits up to 200 seconds by default for the genuine completed **Preview Interactive** and clicks **ADD** only when the visible generation overlay is gone. After **ADD**, it waits up to the same limit for the completed ZIP to become observable. It flushes the prompt and page status to `report.json` before generation and after every page. Each successful page is then committed with **Done**, reopened in a fresh Edit session, and checked for the exact ZIP before the next page begins; this is the crash-safe checkpoint, so persistence is never deferred until the whole activity or module finishes. If one page cannot generate or fails final reopen verification, the runner records the exact section, activity, page, error, screenshot, and trace evidence, recovers the edit view, and continues to later pages; the command prompt ends with an `ACP pages needing follow-up` checklist. Empty Text components are treated as unresolved attachment hydration; the page is reopened once and must expose stable ZIP evidence before candidate status is allowed. Existing interactives are preserved. A page containing several separate top-level FA Math questions stops at a guard so `RUN-SLS-PAGE-BREAK.cmd` can separate them first. The demonstrated default is `Primary 5-6`; override it with `--grade "Primary 3-4"` when required.

`RUN-SLS-GPT.cmd` reuses the same module traversal, FA Math extraction,
randomisation evidence, answer keys, and Prompt Library specification, but sends
the final specification to ChatGPT, preferring **GPT-5.6 Sol High** when it is
available. When that exact model cannot be selected, the command prints a large
warning, records the visible fallback model in `report.json`, and continues.
ChatGPT must
produce a real deterministic ZIP such as `ChatGPT56_109307754_P1.zip`. Before SLS
is touched, the runner opens the download, validates the ZIP directory and CRC,
decompresses the real root-level `index.html`, and checks that it contains
recognisable non-empty HTML. It then returns to SLS, reopens the exact section,
activity and page, and confirms the original question is still the candidate
before uploading through **Text/Media > File from Device**. The page is saved,
reopened, and checked for the exact filename before traversal continues. Existing
native ACP ZIPs stay in place for comparison. Reruns skip that page only when its
exact deterministic ChatGPT ZIP is already present; a different ChatGPT ZIP stops
the ambiguous page without replacing anything. The first run uses a separate
same visible Playwright Chrome context as SLS and the Prompt Generator. If a
signed-in `chatgpt.com` tab is already open there, the runner reuses the newest
one; otherwise it creates a ChatGPT tab and pauses for sign-in and model
selection. Downloads are enabled for this GPT-only context, and the combined SLS
and ChatGPT storage state is saved privately in `.auth/sls-state.json` for the
next run. Generation defaults to 30 minutes per question because a completed Work
result can take substantially longer than native ACP.

The separate `.auth/chatgpt-profile` Chrome profile remains a guarded fallback
for callers that do not supply the SLS browser context. An already-running
everyday Chrome window still cannot be attached safely unless it was originally
started with remote debugging, so the launcher does not borrow or modify the
normal Chrome profile.

```powershell
# Recommended first trial: review and generate only the first eligible question.
.\RUN-SLS-GPT.cmd --max-interactives 1
# Inventory candidates only; do not open ChatGPT or change SLS.
.\RUN-SLS-GPT.cmd --dry-run
```

macOS uses `RUN-SLS-GPT.command` with the same options.

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

Only one authentication helper may use `.auth\chrome-profile` at a time. If a
second run reports that the profile is already open, finish or close the earlier
automation sign-in window; this is a Chrome profile lock, not evidence that the
stored SLS login workflow has failed. Cancelling the current authentication
helper now closes its Chrome context and releases that lock cleanly.

Do not commit or share `.auth`; it contains authenticated browser state. Treat `output` reports, screenshots, and traces as private too because they can contain SLS lesson and account-interface content. All of these folders are excluded by `.gitignore`.

## Inspect Without Changing SLS

```powershell
npm.cmd run sls:inspect -- --config configs/p3-multiplication-algorithms.json
```

This verifies authentication, the exact module, and the visible section inventory. It writes output under `output\<module-id>\<timestamp>`.

If an untagged module has no section Content Map, the one-shot launcher first opens
the existing module-level **Module Tags** accordion and harvests every official
learning outcome from its saved Content Map into `taxonomy/`. Only when no saved
map tree is available does it open a question's details without saving and follow
the live SLS **Subject -> Level -> Content Map** cascade. It reloads the page to
discard any temporary form state and resumes the same run. Explicit title markers such as `Sec 4`,
`S2G3`, `G2G3`, and `AMath` constrain the crawl. Algebraic topic wording such as
`expansion using special algebraic identities` identifies Mathematics even when
the title omits the word `Math`. A single `G3` marker is enforced on the Content
Map, not guessed from an unrelated subject label. Discovery skips confidence and
reflection components, uses the first readable mathematical question as outcome
evidence, and prefers the newest syllabus already in force unless the title names
a syllabus year explicitly. Other ambiguous choices still stop safely.

The discovery pass can also be run independently:

```powershell
npm.cmd run sls:discover -- --config configs\your-module.json --url "SLS-MODULE-URL"
```

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

- `report.json`, including exact per-question decisions, evidence provenance (stem, shared stimulus, diagram OCR, and suggested-answer corroboration), tied candidates, and totals for newly tagged, already tagged, skipped, partially tagged, and failed questions
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
