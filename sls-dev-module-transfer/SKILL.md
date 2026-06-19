---
name: sls-dev-module-transfer
description: Transfer or verify MOE SLS production modules into DEV draft modules. Use when Codex is given production and DEV SLS URLs, needs to preserve DEV version URLs, recreate quiz/question content, keep rich-text tables and prepopulated responses, configure Teacher-Marked Quiz or Short Answer Feedback Assistant pages, edit SLS metadata/tags/content map fields, or validate save/approval state without losing cloud edits.
---

# SLS DEV Module Transfer

## Core stance

Use browser-driven recreation. Treat SLS pages as fragile cloud editors: inspect the live production source, edit the DEV target through the real UI, preserve formatting with keyboard copy/paste, and verify each saved state before moving on.

Do not guess credentials, backend APIs, hidden SLS data models, or destructive cleanup. Do not delete accidental blank pages/components, unpublish, approve, or replace an approved module unless the user explicitly asks for that exact action.

## Inputs to confirm

- Production source URL, usually `https://vle.learning.moe.edu.sg/...`.
- DEV target URL, usually `https://vle.dev.sls.moe.edu.sg/...`.
- DEV `version=<module-uuid>` query parameter. Preserve it whenever opening edit URLs.
- Requested scope: whole module, specific section/activity, specific quiz page, metadata-only fix, or approval validation.
- Special content types: tables, images, rubrics, `Prepopulated Student Response`, `Suggested Answer`, marks, tags, or content map.

## Workflow

1. Check access first.
   - If the task needs the logged-in SLS browser or the user invoked Computer Use, use the Computer Use workflow when available and connect to the existing Chrome/SLS window.
   - If Computer Use says the user stopped it, stop and report that status.
   - If the helper reports `Computer Use native pipe path is unavailable`, retry once after a short reset. If it repeats, stop and report helper unavailability.
   - If production redirects to `Login With MIMS`, `https://vle.learning.moe.edu.sg/login`, or a MIMS username/password page, stop for user authentication. Do not guess login details.
2. Normalize the target URL.
   - Convert a DEV `module/view/...` URL to the matching `module/edit/...` URL only when editing is required.
   - Keep the original `version=<module-uuid>` query parameter. If it is lost, repair the URL before editing.
3. Inspect source and current DEV state.
   - Capture question bodies, instructions, marks, tables, suggested answers, response scaffolds, metadata, and source page order.
   - Check whether DEV already has blank pages, duplicate components, or partial transfer work. Work with existing state; do not delete cloud items without confirmation.
4. Recreate structure before detailed content.
   - Create only requested section shells, quiz activities, and question pages.
   - Use quiz/page-level add controls for quiz questions. Avoid module-level `ADD NEW` when adding a quiz question.
5. Enter rich content through the editor.
   - Prefer real UI focus plus keyboard input/paste over direct DOM filling.
   - For simple text, paste into the visible TinyMCE/SLS rich-text box, then blur to blank page area.
   - For tables or formatted prompts, follow `references/rich-text-and-shortansfa.md`.
6. Save after each meaningful edit.
   - Blur to blank page area or switch to another SLS card only after the active field is stable.
   - Wait for `Saved` in the header or verify the read-only card has updated.
   - If SLS warns `Any changes made may not be saved`, choose `Cancel` unless intentionally discarding edits.
7. Verify before continuing.
   - Check read-only view, left navigation, right cards, marks, tags, table borders, and response scaffolds.
   - Use accessibility text or screenshots when available, but trust the visual SLS editor for formatting.

## Task routes

- **Free-Response quiz recreation**: see `references/transfer-playbook.md`.
- **Teacher-Marked Quiz / Short Answer Feedback Assistant**: see `references/rich-text-and-shortansfa.md`.
- **Rich-text tables and prepopulated responses**: see `references/rich-text-and-shortansfa.md`; use `scripts/set-rich-clipboard.ps1` only as a fallback for generated HTML fragments.
- **Module title, cover metadata, Module Notes, activity tags, content map, approval validation, or printview**: see `references/metadata-approval-printview.md`.
- **Recovery from warnings, wrong add controls, missing marks, login walls, or helper failures**: see `references/failure-modes.md`.

## Verification checklist

- Source and DEV target opened in the intended authenticated session, or auth/helper blocker was reported before editing.
- DEV edit URL still contains the correct `version=<module-uuid>`.
- Only requested sections, activities, and pages were created or edited.
- Titles persist in left navigation, Module Plan, or the activity card after `Saved`.
- Question bodies show expected rich formatting, tables, marks, suggested answers, and response scaffolds.
- Pasted tables have visible borders and, when manually constructed, `border="1"`.
- `Prepopulated Student Response` was copied separately from `Suggested Answer` whenever the source had a student response format.
- TMQ/ShortAnsFA settings show the expected feedback assistant panel and marks.
- Metadata/tag/content-map blockers clear only after exact validation is checked.
- If final approval is not explicitly requested, stop at the `Approve Module?` confirmation by clicking `Cancel`.
