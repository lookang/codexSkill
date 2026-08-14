---
name: sls-finalize-community-module
description: Safely complete Singapore Student Learning Space (SLS) Community Gallery modules by inferring curriculum tags, replacing activities with tagged copies, tagging every question, generating a featured image, configuring and verifying gamification, and updating module metadata, credits, and permissions. Use when a user supplies a vle.learning.moe.edu.sg module URL and asks to retag, duplicate and replace activities, add formative-assessment tags, create a thumbnail, add gamification, credit a teacher, or finish and audit a module.
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

## Execute the Workflow

1. Open the supplied module URL and verify the expected module title before editing.
2. Inventory the module title, sections, activity titles, existing copies, question tags, featured image, gamification, and module settings. Skip work that is already complete.
3. Infer any missing academic and keyword tags using the rules below.
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
2. Open the card's settings and select the matching details panel, such as **Free-Response Details**.
3. Enable **Include in Learning Progress**.
4. Verify Subject, Level, and Content Map match the saved section tags. Do not silently replace contradictory question tags.
5. Add the requested keyword. When unspecified, derive one concise formative-assessment tag such as `FA math`.
6. Save and verify the exact card displays the expected Keyword Tags and Question Tags.
7. Reload the activity before editing the next question, then restore sidebar position. This prevents SLS from silently dropping later keywords.

Track completed questions so a resumed run does not retag them unnecessarily.

## Generate the Featured Image

Use SLS's built-in image generator by default:

1. Open **Introduction** and click the module title in the main content area.
2. Open **Add Image** beside **Featured Image** and select **Generate Image (Beta)**.
3. Choose the best recipe for the module level and topic. Derive concise instructions from the title and learning outcomes. Avoid text, equations, logos, iconic characters, and details that may introduce curricular inaccuracies unless explicitly requested.
4. Select **Create** and wait until all three choices are visible.
5. Inspect all three, including any below the initial viewport. Compare topic fit, age appropriateness, thumbnail clarity, and factual accuracy.
6. Select the strongest choice and choose **Add**.
7. Verify the success notification and a featured-image filename in the Introduction editor.

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
- Review all three generated images before selection.
- Prefer visible labels and roles over recorded screen coordinates.
- Keep navigation within the supplied SLS origin.

## Final Audit and Report

Before reporting completion:

1. Verify Subject, Level, Content Map, and current learning outcome in Module View.
2. Verify one intended tagged copy per original and no authorized target originals remain.
3. Verify every retained question has learning progress, curriculum tags, and its keyword.
4. Verify the featured-image filename.
5. Reopen Gamification and report the persisted title and generated elements; explicitly note any `Untitled Game` reversion.
6. Verify module keywords, credited teachers including `WEE LOO KANG`, and each required permission individually. For the full or captured workflow, confirm copying, print-friendly worksheet viewing, print-friendly completed-assignment viewing, and self-study reattempts are all enabled after reopening Module Settings.
7. Confirm Module View has no pending save indicator or error.

Report the inferred tags and rationale, original-to-copy mapping, skipped activities, featured-image result, gamification persistence result, credited teachers, permissions, and any unresolved SLS behavior.
