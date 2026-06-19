# SLS Transfer Playbook

## Preflight

Start by opening the production source and DEV target. If the user supplied a DEV view URL but the task requires editing, open the matching DEV edit URL and preserve `version=<module-uuid>`.

Inspect current DEV state before adding anything:

- existing section shells
- existing quiz activity or activity page
- blank pages/components created by earlier attempts
- whether the active edit card is already open
- current save state in the header

Do not delete blanks or duplicates unless the user explicitly approves cleanup.

## Structure recreation

Build navigation first, content second:

1. Create only the requested section shell(s).
2. Create only the requested quiz/activity shell(s).
3. Open the quiz/activity and verify the right-side card matches the requested target.
4. Add question pages from the quiz component toolbar or page-level `+`.

Avoid the lower or left module-level `ADD NEW` drawer when adding quiz questions; it can create the wrong component.

## Free-Response questions

For Free-Response:

1. Use the quiz component toolbar.
2. Choose `Question` -> `Free-Response` -> `Default`.
3. Focus the real TinyMCE/SLS question body.
4. Paste or type the prompt.
5. Set the marks field explicitly.
6. Blur to blank page area.
7. Verify read-only view shows the prompt and `MARKS [n]`.

If mark replacement behaves oddly, select the whole value and replace it again. Verify before and after saving because SLS can append digits after a failed select-all.

## Titles and activity settings

For section, quiz, or activity titles:

1. Click or double-click the visible title.
2. Edit the large bordered title card.
3. Use real keyboard input or paste into the focused title box.
4. Click blank page area to save.
5. Wait for `Saved`.
6. Confirm left navigation or Module Plan reflects the new title.

For quiz settings:

1. Click the visible settings/details area near `Quiz Mode`.
2. Edit the large bordered settings card.
3. For Teacher-Marked Quiz, set `Quiz Mode` to `Teacher-Marked Quiz`.
4. Click outside the settings card.
5. Wait for `Saved`.
6. Confirm read-only cover text updates.

## Save rhythm

Use short edit loops:

1. Paste or type into one field.
2. Blur safely.
3. Wait for `Saved`.
4. Verify the read-only surface or navigation.
5. Move to the next card/page.

This is slower than batching, but it avoids losing cloud edits when SLS warns or becomes unresponsive.
