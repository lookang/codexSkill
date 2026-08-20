# Reliable SLS Browser Interaction Playbook

Read this reference before controlling the SLS authoring interface directly. These patterns are distilled from the maintained Playwright automation. They improve navigation reliability but do not relax the skill's authentication, ambiguity, deletion, permission, or verification safeguards.

## Navigate and Establish Scope

1. Parse the supplied `vle.learning.moe.edu.sg` URL and retain its module or lesson UUID. Public, admin, view, edit, section, and activity routes may all identify the same resource.
2. Open the matching admin Module View route ending in `/module-plan`, then click **Edit**. Verify edit mode from both the resource UUID in the URL and the visible module title.
3. If SLS redirects to `/login`, stop at the authentication boundary. Continue only after the user has authenticated in the browser session.
4. Never use a remembered URL or configured fallback when the user supplied another valid resource.

## Locate Controls Reliably

- Prefer accessible roles, exact visible labels, placeholders, and stable SLS icon names. Useful icon selectors include `button:has(svg[name="Settings24"])`, `button:has(svg[name="Save24"])`, and `button:has(svg[name="Plus24"])`.
- Scope every locator to the active card, form, or `.bx--modal-container:visible`. For nested modals, use the last visible modal only after checking its heading.
- Some edit affordances are `div.edit-indicator` elements rather than buttons. Hover the owning card to reveal its pencil, then click the visible edit indicator.
- Do not identify controls by SVG path data, DOM-generated IDs, screen coordinates, or a generic page-wide **Add**, **Save**, or **Delete** label.
- After any action that rerenders a modal, card, sidebar, or generated preview, locate the element again. Do not reuse an earlier element handle.
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
6. Read question text from its question body, including MathML or image alternative text when present. The settings-card heading may omit the mathematical expression.
7. Append intended tags and preserve existing human tags. Save with the active question modal's `Save24` control, reload, and verify the exact question card.

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
