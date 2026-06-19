# Failure Modes

## Auth wall

Symptom: production opens `Login With MIMS`, `https://vle.learning.moe.edu.sg/login`, or a MIMS username/password page.

Fix: stop and ask the user for an authenticated session. Do not guess credentials or bypass login.

## Computer Use unavailable

Symptom: `Computer Use native pipe path is unavailable`.

Fix: retry once after a short reset/delay. If it repeats, stop and report helper unavailability.

Symptom: Computer Use says it was stopped by the user.

Fix: stop and report that status. Do not silently fall back to another Windows-control method.

## Unsaved title or field reverts

Likely cause: programmatic fill changed the visible value without making SLS mark the card dirty.

Fix: use real keyboard input or paste into the focused textbox, blur to blank page area, wait for `Saved`, then verify navigation/read-only view.

## Before-unload warning

Symptom: `Any changes made may not be saved.`

Fix: choose `Cancel` unless intentionally discarding. Return to the editor, blur to blank page area, and wait for `Saved`.

## Page unresponsive

Fix: choose `Wait`, not `Exit page`, if unsaved edits may still be in memory.

## Wrong add drawer

Likely cause: module-level `ADD NEW` was used for a quiz page/question.

Fix: return to the target quiz page and use the quiz component toolbar or page-level `+`.

## Lost rich formatting

Likely cause: content was rebuilt from plain text or pasted through a non-rich channel.

Fix: copy the formatted production source with `Ctrl+C`, paste into the DEV TinyMCE/SLS editor with `Ctrl+V`, set table border to `1`, and verify visible borders. Ask for screenshots or a demo if automation cannot inspect the layout.

## Missing prepopulated answer scaffold

Likely cause: the source student response scaffold was mistaken for body text or ignored because `Suggested Answer` was copied.

Fix: copy `Prepopulated Student Response` separately from `Question Body` and `Suggested Answer`.

## Marks wrong

Likely cause: digit appended after a failed select-all.

Fix: explicitly replace the whole marks field, then verify before and after save.

## Approval still blocked

Likely causes:

- keyword tags were typed but not tokenized into chips
- edit URL lost `version=`
- module tags were edited in the wrong card
- DEV lacks the exact production content map tree

Fix: reopen the blocker popup, tokenize keyword tags as comma-separated chips, reopen edit mode with `version=`, set module tags from the cover/title metadata card, then choose an available content-map fallback with at least one selectable outcome.

## Final approval dialog appears

Fix: treat `Approve Module?` as validation proof. Click `Cancel` unless the user explicitly asked to approve.
