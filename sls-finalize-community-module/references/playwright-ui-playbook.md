# Reliable SLS Browser Interaction Playbook

Read this reference before controlling the SLS authoring interface directly. These patterns are distilled from the maintained Playwright automation. They improve navigation reliability but do not relax the skill's authentication, ambiguity, deletion, permission, or verification safeguards.

## Navigate and Establish Scope

1. Parse the supplied `vle.learning.moe.edu.sg` URL and retain its module or lesson UUID. Public, admin, view, edit, section, and activity routes may all identify the same resource.
2. Open the matching admin Module View route ending in `/module-plan`, then click **Edit**. Verify edit mode from both the resource UUID in the URL and the visible module title.
3. If SLS redirects to `/login`, stop at the authentication boundary. Continue only after the user has authenticated in the browser session.
4. Never use a remembered URL or configured fallback when the user supplied another valid resource.
5. Maintained launchers share `.state/last-module.json`. A validated SLS module selected by one launcher becomes the Enter-key default for every other launcher. A recorder session starting on a non-SLS website must preserve the last SLS module.

## Locate Controls Reliably

- Prefer accessible roles, exact visible labels, placeholders, and stable SLS icon names. Useful icon selectors include `button:has(svg[name="Settings24"])`, `button:has(svg[name="Save24"])`, and `button:has(svg[name="Plus24"])`.
- Scope every locator to the active card, form, or `.bx--modal-container:visible`. For nested modals, use the last visible modal only after checking its heading.
- Some edit affordances are `div.edit-indicator` elements rather than buttons. Hover the owning card to reveal its pencil, then click the visible edit indicator.
- Do not identify controls by SVG path data, DOM-generated IDs, screen coordinates, or a generic page-wide **Add**, **Save**, or **Delete** label.
- After any action that rerenders a modal, card, sidebar, or generated preview, locate the element again. Do not reuse an earlier element handle.
- Before clicking a section or main-canvas control, dismiss only a visible `header .ui-shell-overlay.is-visible` through its real close control and verify that it disappeared. Do not force-click through the shell overlay.
- Close a visible informational **Module URL Updated** notice before the next **Edit** click. Do not generalize that dismissal to unrelated warning or confirmation modals.
- If multiple matches remain, inspect their container headings and visible text. Stop rather than choosing by index alone when the target is still ambiguous.

## Wait for State, Not Time

- Wait for a specific next state: an editor becomes visible, a selector becomes enabled, a save request completes, **Saved** appears, a generated-selection panel opens, or a preview persists after reopening.
- Use fixed waits only as short settling periods after a proven transition. They are not evidence that SLS saved anything.
- On an ordinary click timeout, re-inspect overlays and the active container, obtain a fresh locator, and retry once. Do not force-click a disabled or covered control.
- Treat a toast as supporting evidence. For metadata, tags, gamification, permissions, credits, and images, close and reopen the relevant editor and verify the persisted values.

## Section and Question Tagging

1. Open section metadata from the section title or its visible edit indicator, not a breadcrumb with similar text.
2. Add Subject and Level before looking for Content Map. The controls cascade and Content Map may not exist until the Subject/Level row is committed.
3. Add the Content Map and exact leaf outcome, then wait for the tagging save response and visible **Saved** state.
4. Reopen Learning Outcomes and read the tagging tree itself. Do not infer success from the section cover.
5. For a question, scope settings to its `#settings-card-<question-id>` and open that card's `Settings24` control. Wait for the tagging panel to mount before deciding that controls are missing.
6. Visit every numbered ordinary activity page as well as every quiz page before caching stems. SLS may mount only the current page, so Q2 onward are not blank merely because page 1 is open.
7. On each page, scroll every mounted `#component-<question-id>` into view. FA Math lazily hydrates `<akit-interaction>` and places readable mathematics in a shadow root.
8. Build evidence in order: visible DOM and shadow-DOM text, first visible `<akit-interaction>`, WIRIS MathML from data-URI SVG comments, and image `alt`/`title`. Treat later interaction instances as suggested solutions.
9. When a substantial raster diagram remains essential and the earlier evidence is weak, use the bundled local OCR on that image only. Keep its confidence as supporting evidence, reject low-confidence output, and never send SLS question images to an external OCR service.
10. Treat `Express/Write/Convert ... as/to a decimal`, `... as/to a fraction`, and `... as a mixed number` as mathematical representation questions. Do not infer mathematics from FA Math boilerplate or an activity title when the stem is unreadable.
11. Append intended tags and preserve existing human tags. Save with the active question modal's `Save24` control, reload, reopen, and verify both the exact question card and **Include in Learning Progress**.

## Meaningful Page Breaks

1. Inventory all sections and activities from fresh locators after every navigation; SLS rerenders and invalidates sidebar assumptions.
2. Group questions into visual rows. Side-by-side questions with substantial vertical overlap remain together; break before the first question in the next row.
3. After a verified split, checkpoint the completed preceding page and continue directly from the new continuation page. Do not revisit earlier pages merely to rescan them.
4. A single-question page uses the length-based chunk rule only when a safe semantic divider exists. Short or ambiguous pages remain unchanged.
5. Verify the divider belongs to the intended question and is not already a page break. Skip an ambiguous page and continue independently clear candidates; never force an unavailable or hidden action.
6. Each split requires the observed save response and an exact page-count increase. A full reopen audit is optional through `--verify` and is skipped in normal runs for speed.

## ACP Interactive Generation

1. Require one FA Math question and no existing interactive ZIP on the page. Multiple questions are a page-break prerequisite, not a reason to guess which prompt to use.
2. Read and compact the live question stem before sending it to the iwant2study Prompt Library. Preserve the reviewed grade and subject settings.
3. Transfer the generated prompt back to SLS through a newly added Text component and the visible **Authoring Copilot > Interactive (Beta)** flow.
4. Wait for the actual generated preview for up to the configured bound; a fixed three-minute delay is not evidence of failure or success.
5. Add once, save, reopen the activity, and verify the interactive ZIP. Existing interactives are idempotent completion evidence.

## Activity Duplication and Deletion

1. Match activities within the intended section and by exact normalized title. A section heading may repeat an activity title and must not be counted as another activity.
2. Duplicate one original at a time and verify exactly one `<title> - Copy` before any deletion.
3. Reopen the retained copy and verify its question tags before deleting the original.
4. Move a low sidebar item upward before opening its overflow menu. If a feedback widget covers the menu, close or temporarily move the blocker and restore it afterward.
5. Scope **Delete** to the original activity's open overflow menu. Confirm only a dialog headed **Delete Activity?** and reject **Delete Component?**.
6. Recount the exact original/copy pair after deletion. Never continue from a toast or uncertain error alone.

## Generated Featured Image

1. Open module settings from the module card's visible edit pencil and choose **Add Image**, then **Generate Image (Beta)**.
2. After **Create**, wait for `.acp-image-selection-subpage.is-visible`. Do not assume generation failed because 45 or 120 seconds elapsed.
3. Review all generated choices. Select the intended radio input if none is selected.
4. In the visible selection subpage, choose `.btn-add button:has(svg[name="Plus24"])`. This avoids hidden background **Add** controls.
5. Confirm the selection subpage closes. Wait for a visible non-empty `img[src]` inside the Featured Image form because SLS may first use a temporary scan or blob URL.
6. Choose **Done** only after that preview exists. Reopen module settings and verify the persisted thumbnail; after saving, its URL may use `/thumbnail/`.
7. If **Add** produces a visible SLS error or no preview appears before the bounded wait ends, stop without choosing **Done** and report the state.

## Gamification

1. Scope actions to the Gamification modal. If gamification is off, enable it before reading details because SLS may not mount or enable those fields beforehand.
2. Inspect for existing stories and collectibles before generating. Skip generation when usable generated content already exists.
3. Open **Add Game** inside the Gamification modal, then **Generate Game** in its menu. Scope generator controls to the newest visible modal.
4. Wait for the complete generated preview, select the reviewed result, and return to the underlying Gamification modal.
5. Save title and description, close, reopen, and verify the enabled state, exact accepted title, description, stories, collectibles, and unchanged leaderboard setting.
6. Retry a reverted title once with the shorter reviewed title. Do not generate a second game merely because a title field failed to persist.

## Module Settings and Credits

1. Open the module card's settings pencil and scope all controls to that dialog.
2. Treat keyword chips and credited-teacher rows as staged until the dialog header's `Save24` button is clicked.
3. Search for the exact reviewed teacher name and require one unambiguous result. Preserve existing credits.
4. Reopen Module Settings after saving and verify keywords, credits, and each permission checkbox independently.

## Evidence and Stopping Conditions

- Keep an in-memory checklist of the resource UUID, module title, section, activity, question, intended mutation, and post-save evidence.
- Stop on title or UUID mismatch, ambiguous control scope, authentication, missing expected copy, changed existing tags, failed persistence, or a covered destructive control.
- For a resumable or repeated run, inventory current state first and skip completed work. Idempotence is safer than replaying every click.
