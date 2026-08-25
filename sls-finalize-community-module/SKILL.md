---
name: sls-finalize-community-module
description: Safely complete Singapore Student Learning Space (SLS) Community Gallery modules with guarded Playwright automation for curriculum and question tagging, meaningful page breaks, ACP practice interactives, featured images, gamification, credits, permissions, recording, and final audits. Use when a user supplies a vle.learning.moe.edu.sg module URL and asks to improve, automate, finalize, or verify it.
---

# SLS Finalize Community Module

Complete an existing SLS Community Gallery module through a guarded browser workflow. Preserve the user's authenticated browser session and inspect visible state before every destructive or irreversible action.

## Collect Inputs

Require:

- An HTTPS module URL on `vle.learning.moe.edu.sg`.
- The target section and activity scope.
- Authorization before deleting original activities.

Accept Subject, Level, Content Map, learning outcome, keyword tags, credited teacher, and permission choices when supplied. Otherwise infer academic and keyword tags from the module and activity titles. Never infer a person's identity or broaden permissions.

Use the captured defaults only when the user explicitly asks to replay the recorded workflow. Read [references/captured-flow.md](references/captured-flow.md) for those values.

Never store credentials, email addresses, or restricted learner data in the skill or artifacts. If authentication is required, use the user's existing signed-in browser session or ask the user to sign in.

## Choose the Execution Path

When the bundled `playWright` automation is available, prefer its maintained launcher for repeated work. Read `playWright/README.md` for setup and flags. Route by intent:

- On Windows, use the `.cmd` launcher. On macOS, use the same base name with `.command`; run `chmod +x ./*.command ./scripts/run-macos.sh` once after a ZIP download or checkout that did not preserve executable bits.

- `RUN-SLS-AUTOMATION.cmd`: inspect, resolve curriculum, tag questions, and perform guarded duplicate-and-replace work.
- `RUN-SLS-PAGE-BREAK.cmd`: put each question on its own page when SLS exposes a safe divider.
- `RUN-SLS-ACPINTERACTIVE.cmd`: create one matching ACP practice interactive for each eligible FA Math question.
- `RUN-SLS-GAMIFICATION.cmd`, `RUN-SLS-THUMBNAIL.cmd`, and `RUN-SLS-ADD-WEE-LOO-KANG.cmd`: perform and reopen-verify the named finishing action.
- `RUN-SLS-SMOKE-CHECK.cmd`: verify live entry points without saving.
- `RUN-PLAYWRIGHT-RECORD-WORKFLOW.cmd`: record a new browser workflow, including cross-site text transfer, for later review and hardening.

All launchers share `.state/last-module.json`; a module chosen in one becomes the default in the others. Never publish `.state`, `.auth`, `output`, `recordings`, caches, or dependencies. The maintained scripts provide guarded URL normalization, checkpoints, traces, and persistence checks. Do not bypass configuration review, ambiguity stops, or the deletion guard.

Use direct browser control when the user asks for an interactive run, the deterministic launcher does not cover the requested operation, or the local scripts are unavailable. Before direct browser work, read [references/playwright-ui-playbook.md](references/playwright-ui-playbook.md) and follow its current SLS interaction patterns. Apply the same inspect, mutate, reopen, and verify cycle used by the scripts.

Accept public or admin module and lesson URLs, including nested section or activity routes, but preserve the supplied module UUID. Navigate through the corresponding admin Module View and click **Edit**. Never silently switch to a configured fallback or a different remembered module.

## Execute the Workflow

1. Open the supplied module URL and verify the expected module title before editing.
2. Inventory the module title, sections, activity titles, existing copies, question tags, featured image, gamification, and module settings. Skip work that is already complete.
3. Infer any missing academic and keyword tags using the rules below.
   - When a module has no existing section curriculum, use the bundled `sls:discover` read-only pass. It opens an existing question-details modal, follows SLS's live Subject to Level to Content Map cascade, harvests exact official outcomes, and reloads without saving before resolving the config.
4. Enter edit mode. Click the section title in the main content area, such as **A. Untitled**, to edit section metadata; do not use the header breadcrumb or Section settings cog for curriculum tags.
5. Expand **Section Tags** under **Learning Outcomes**. Select Subject and Level, then choose **Add Subject and Level**. The Content Map selector becomes available only after this row is added.
6. Expand **Content Map**, choose the matching official map, expand its curriculum branches, select the best-fit outcome, and choose **Add Content Map and Topic**.
7. Click outside section metadata editing, wait for **Saved**, reopen **Learning Outcomes**, and verify Subject, Level, Content Map, and outcome.
8. Partition originals into learning-outcome batches. Before duplicating a batch, save only that batch's most accurate section outcome and verify it visibly. Change the section outcome before starting a different batch, such as subtraction after addition.
9. Replace activities serially using the rolling duplicate-and-replace loop below. Never fill the remaining activity slots with copies.
10. Tag every question in each retained copy.
11. Generate and save a module featured image when requested or when completing the full workflow.
12. Configure and verify gamification when requested or when completing the full workflow.
13. Update module keywords, credited teachers, and permissions.
14. Select **Done**, return to Module View, and perform the final audit.

## Infer the Best-Fit Tags

Use the module title as the primary signal and activity titles as supporting evidence.

1. Remove punctuation, copy suffixes, and generic words such as `practice`, `lesson`, and `activity` from titles.
2. Infer Subject from the strongest curriculum concept match. Prefer the exact available SLS label.
3. Infer Level from explicit markers such as `P3`, `Primary 3`, or `S2`. Do not override an explicit level with a content-based guess.
   - Recognize compact combined markers such as `Sec 4G2G3 AMath`. Resolve the exact SLS Additional Mathematics G2 and G3 subjects independently and retain both content maps when both streams lead to the same outcome.
   - When a Primary assessment has several saved Mathematics Subject/Level rows, treat those levels as the eligible cumulative pool for each question. Choose one best-fit outcome across those maps; do not force every question into the section's highest-level default map.
4. Choose the available Content Map matching Subject and Level. Do not guess between equally plausible maps.
5. Compare available official learning outcomes with the normalized module and activity titles.
6. Select the single most specific leaf outcome covering the current activity batch.
7. Proceed automatically only when level and outcome have one clear best match. Ask before saving when the level is absent, two outcomes are similarly plausible, or available labels contradict the title.

Record the inferred Subject, Level, Content Map, outcome, and a one-line rationale in the final report.

## Replace Activities Safely

For each original in the current learning-outcome batch:

1. Count activities and confirm capacity for exactly one copy.
2. Record the original's exact visible title.
3. Use that activity's overflow menu to select **Duplicate Activity**.
4. Verify exactly one corresponding title ending in `- Copy` appears after the correct Section Tags were saved.
5. Add the exact original/copy pair to an in-memory checklist.
6. If deletion is authorized, select the exact original in the sidebar and verify all of the following:
   - Its title does not end in `- Copy`.
   - Its questions have blank Question Tags.
   - Its paired `- Copy` exists and carries the intended tags.
7. When the target activity is near the bottom of the navigation pane, scroll until the activity has moved upward and the entire overflow menu can open above the fixed **Help us improve** control. Do not select a clipped or covered menu option. Close the feedback popup if it is already open.
8. Open the original activity's own overflow menu and verify every option, including **Delete**, is fully visible. Choose that menu's **Delete** action only after rechecking the exact original title.
9. Confirm only a dialog headed **Delete Activity?**. Cancel if SLS instead shows **Delete Component?**, opens the feedback-rating popup, or presents any other target.
10. Verify the original is absent and the copy remains before continuing.

If the activity limit is reached, delete only an already-authorized original with a verified copy, then continue. If no verified pair exists, stop. If deletion was not authorized, stop after the first verified pair and obtain permission.

Treat `Something went wrong while performing this action` as an uncertain deletion result. Do not retry immediately. Refresh and recount the exact pair: continue only if the original is absent and the copy remains; leave both untouched if both remain; stop if the copy is missing.

## Tag Every Question

For every question card in every retained copy:

1. Inventory all cards. Scroll the question-settings sidebar independently to expose cards outside the initial viewport.
2. Visit every numbered activity page before caching question evidence. Ordinary SLS activities, not only quizzes, may mount just the current page; never conclude that Q2 onward are blank while still on page 1.
3. Scroll each mounted question component into view before reading it. FA Math hydrates `<akit-interaction>` lazily, and the mathematical stem may exist only inside its shadow root.
4. Build primary evidence in this order: visible DOM and shadow-DOM text, WIRIS MathML, image `alt`/`title`, then local OCR of substantial raster diagrams only when the earlier evidence remains weak. Preserve a common chart/table/diagram stimulus and its OCR for related subquestions when page breaks separate them, but require overlap with the later stem or diagram labels before carrying it forward. Read the question's suggested answer separately: it may corroborate operations, operands, or an already-established topic, but must never create a topic for an otherwise unreadable stem. Preserve evidence provenance and OCR confidence, and do not send SLS question images to an external OCR service.
5. Open the card's settings and select the matching details panel, such as **Free-Response Details**.
6. Enable **Include in Learning Progress** only for an assessed mathematical question. Fraction-to-decimal, decimal-to-fraction, and decimal-to-mixed-number conversion prompts are mathematical; reflection prompts are not, even if they carry marks.
7. Verify Subject, Level, and Content Map against the saved curriculum evidence. For a Primary module with several saved Mathematics levels, select one unambiguous best-fit question outcome across those declared levels. Keep explicit multi-stream Secondary maps additive. Do not silently replace contradictory question tags.
8. Add the requested keyword. When unspecified, derive one concise formative-assessment tag such as `FA math`.
9. Save, reload, reopen the same question, and verify Learning Progress plus the expected Keyword Tags and Question Tags persisted.
10. Reload the activity before editing the next question, then restore sidebar position. This prevents SLS from silently dropping later keywords.

Track completed questions so a resumed run does not retag them unnecessarily.
Record one report entry per visited question with its exact status (`tagged`, `already-tagged`, `skipped`, `partially-tagged`, or `error`), reason, readable stem, and tied candidates. Never use an activity-level success flag to imply that skipped questions were tagged.

## Add Meaningful Page Breaks

Use `RUN-SLS-PAGE-BREAK.cmd` when an activity contains several questions on one page or an unusually long single-question chunk.

1. Run the read-only review and inventory every section, activity, page, question heading, and available SLS divider.
2. For multiple questions, identify visual question rows first. Keep side-by-side questions with substantial vertical overlap together, and break before the first question of the next row. Scope the add-component cascade from the nearby visible **Display** trigger rather than the bounding box of its full nested menu; wait for **Page Break**, then **Single**, because SLS may mount the menu after a delay. Verify the page count increased by exactly one, checkpoint the completed preceding page, and continue directly from the new continuation page without revisiting earlier pages.
3. For a single long question, add a break only at a semantically safe divider; leave short pages and ambiguous layouts unchanged.
4. Stop if a section/activity disappears after rerender, a divider cannot be tied to the intended question, or SLS does not confirm persistence.
5. Select **Done** after all clear splits. Each split must already have an observed save response and page-count increase. The full resulting-page reopen audit is optional through `RUN-SLS-PAGE-BREAK.cmd --verify` and is skipped in normal runs for speed.

Use `--dry-run` when the user asks only for a proposal. A normal clear review may continue automatically; ambiguous pages must not.

## Generate ACP Practice Interactives

Use `RUN-SLS-ACPINTERACTIVE.cmd` for FA Math questions that should receive a matching practice interactive.

1. Treat a supplied nested section or activity URL as module selection only: the launcher must continue through every section, activity, and page. Do not impose a generation-count cap unless the user explicitly supplies `--max-interactives`. Require exactly one eligible FA Math question on each page; run the page-break workflow first when several questions share a page.
2. Read the live question stem. When the FA Math response is randomized, open the question pencil and the nested randomized-component pencil without saving; read the instruction template, correct expression, parameter names, ranges, dependencies, and current rendered values. Put that evidence into the iwant2study Prompt Library's **Specific Requirements** together with the reviewed grade and Mathematics settings. Require one constrained slider per numeric parameter, dynamic dependent bounds, and a control that restores the exact rendered source values. For a non-randomized response, leave **Specific Requirements** empty rather than inventing variables.
3. Print the full generated Prompt Library text in the command prompt between clear copy markers and retain it in the run report for that page.
4. Return to SLS, add a Text component, choose **Authoring Copilot > Interactive (Beta)**, paste the prompt, and wait for the complete preview. Generation may take several minutes.
5. Add only the reviewed result. Treat an empty, still-hydrating Text component as unresolved: wait for its attachment evidence and reopen the page once before deciding it lacks an ACP ZIP. Preserve an existing interactive ZIP and never create a duplicate merely because generation or attachment loading is slow.
6. Reopen the changed activity and verify the interactive ZIP persisted before advancing.
7. If one page fails to generate or fails reopen verification, record the exact section, activity, page, error, screenshot, and trace evidence, recover the edit view, and continue to later pages. Keep structural guards such as authentication loss, uncertain SLS action errors, missing target sections, or multi-question pages as stop/block conditions.

Use `--dry-run` for inventory only and `--max-interactives 1` for a controlled first trial.

## Generate the Featured Image

Use SLS's built-in image generator by default:

1. Open **Introduction** and click the module title in the main content area.
2. Open **Add Image** beside **Featured Image** and select **Generate Image (Beta)**.
3. Choose the best recipe for the module level and topic. Derive concise instructions from the title and learning outcomes. Avoid text, equations, logos, iconic characters, and details that may introduce curricular inaccuracies unless explicitly requested.
4. Select **Create** and wait for the generated-image selection screen, not merely for a fixed delay. Generation may take more than two minutes.
5. Inspect all three, including any below the initial viewport. Compare topic fit, age appropriateness, thumbnail clarity, and factual accuracy.
6. Select the strongest choice. If SLS preselects one option, confirm that selected state deliberately. Choose the visible floating **Add** action carrying the `Plus24` icon.
7. Wait until the selection screen closes and the Featured Image field displays an image preview. Only then choose **Done**.
8. Reopen the module settings and verify the saved featured image is still present. A toast or closed generator alone is insufficient evidence.

Use upload or an external generator only when explicitly requested or when the built-in generator is unavailable.

## Configure and Verify Gamification

1. Open module **Gamification**, enable it, select **Add Game**, then **Generate Game**.
2. Choose a suitable recipe and provide short level- and topic-specific instructions.
3. Wait for the complete preview. Review its relevance and coherence before adding it.
4. Set a meaningful plain-text Game Title and description, then configure the required stories, collectibles, or other generated elements.
5. Save, close the settings, reopen Gamification, and verify that the game, title, description, stories, and collectibles persisted.
6. If the title reverted to `Untitled Game`, retry once with a shorter plain-text title, blur or leave the field to commit it, save, and reopen for verification.
7. If the title reverts again, do not create another game or loop indefinitely. Preserve the saved game elements, record the title-persistence limitation, and report the exact visible state.

Do not report gamification as fully complete from a toast or loading state alone.

## Configure Module Settings

1. Open **Module Settings**.
2. Add two to four concise Keyword Tags from the dominant title concepts.
3. Preserve existing credited teachers and edit or add credits so `WEE LOO KANG` is included when completing the full workflow. Do not remove another credited teacher to add this name.
4. Search the teacher directory for the exact name `WEE LOO KANG`, require one unambiguous match, select it, and verify the exact name appears in **Module Credited to**. If the exact match is unavailable or ambiguous, stop and report the visible candidates instead of guessing.
5. Preserve permission settings unless the user requests changes or an exact replay. When completing the full workflow for this user or replaying the captured workflow, enable all four student permissions: copying, print-friendly worksheet viewing, print-friendly completed-assignment viewing, and self-study reattempts. Treat worksheet viewing and completed-assignment viewing as separate checkboxes; never infer that enabling one enables the other.
6. Treat keyword chips and the credited-teacher table as staged changes only. Return to **Module Settings** after editing credits, then click the blue disk **Save** button in the dialog header. Do not close the dialog, switch tabs, open another browser, or begin verification before clicking this Save button.
7. If leaving the credited-teacher view raises a confirmation dialog, handle that dialog deliberately and return to Module Settings with the intended teacher still visible before saving. Never interpret an unsaved teacher row as persisted.
8. Close and reopen Module Settings, then verify the keyword chips, `WEE LOO KANG`, and every required permission checkbox are still present or enabled. For the full or captured workflow, explicitly verify all four permissions, including **Allow viewing as print-friendly completed assignment**. If any required item is missing or disabled, reapply the changes, click the blue disk Save button, and verify again before continuing.

## Safety Rules

- Treat **Delete Activity** as irreversible.
- Preserve at least one free activity slot by replacing serially.
- Never duplicate until the current batch's Section Tags visibly show as saved.
- Do not retain a copy created before correct Section Tags merely because its title ends in `- Copy`.
- Never distinguish original and copy by position; use exact title and suffix.
- Never delete a copy while attempting to remove an original.
- Before deleting a bottom activity, move it upward in the viewport so the complete overflow menu is visible and unobstructed by **Help us improve**.
- Confirm **Delete Activity?** before accepting; never accept **Delete Component?** or interact with the feedback-rating popup as a substitute.
- Stop if SLS creates no copy, creates multiple ambiguous copies, changes a title unexpectedly, or loses a copy.
- Do not add an ambiguous teacher or remove an existing credit.
- Never treat a visible staged keyword or credited-teacher row as saved. Click the blue disk Save button and verify persistence after reopening Module Settings before navigating away or testing in another tab or browser.
- Never treat permission checkboxes as saved from their visible state alone. Click the blue disk Save button, reopen Module Settings, and verify each required checkbox, especially the separate print-friendly completed-assignment permission.
- Do not broaden permissions without explicit authorization.
- Never add a page break or ACP interactive when the review reports an ambiguous page.
- Preserve existing interactive ZIPs and do not generate a second interactive for an already-served question.
- Review all three generated images before selection.
- Prefer visible labels and roles over recorded screen coordinates.
- Scope controls to the active card or visible modal. When SLS rerenders after a click, locate the control again instead of reusing a stale element.
- Prefer stable accessible names and SLS icon names such as `Settings24`, `Save24`, and `Plus24`; never target an SVG path string or use an unscoped generic **Add**, **Save**, or **Delete** control.
- Wait for the resulting state, network save, or persisted preview rather than relying on a fixed sleep. Retry a failed ordinary click once only after re-inspecting the active view; never force a disabled or covered control.
- Keep navigation within the supplied SLS origin.

## Final Audit and Report

Before reporting completion:

1. Verify Subject, Level, Content Map, and current learning outcome in Module View.
2. Verify one intended tagged copy per original and no authorized target originals remain.
3. Verify every retained question has learning progress, curriculum tags, and its keyword. Reconcile the exact per-question totals for newly tagged, already tagged, skipped, partially tagged, and failed questions; list candidate outcomes for unresolved ties.
4. Verify every inserted page break and ACP interactive after reopening the affected activity.
5. Verify the featured-image filename.
6. Reopen Gamification and report the persisted title and generated elements; explicitly note any `Untitled Game` reversion.
7. Verify module keywords, credited teachers including `WEE LOO KANG`, and each required permission individually. For the full or captured workflow, confirm copying, print-friendly worksheet viewing, print-friendly completed-assignment viewing, and self-study reattempts are all enabled after reopening Module Settings.
8. Confirm Module View has no pending save indicator or error.

Report the inferred tags and rationale, original-to-copy mapping, skipped activities, featured-image result, gamification persistence result, credited teachers, permissions, and any unresolved SLS behavior.
