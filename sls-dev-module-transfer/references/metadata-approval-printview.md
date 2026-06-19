# Metadata, Approval, and Printview

## Cover metadata and Module Notes

`Module Description` in the cover metadata editor renders as Learning Outcomes in the Introduction view.

`Module Notes` is separate:

1. Open the right-side `Module` card gear.
2. Go to `Module Settings > Module Notes`.
3. Paste notes into the module notes editor.
4. Save with the blue save icon.
5. Verify the Introduction view shows a `Module Notes` block.

## Approved modules

For approved DEV modules that need a small metadata or activity-tag fix, prefer `Edit without Unpublishing`:

1. Open the top-right three dots menu.
2. Choose `Edit without Unpublishing`.
3. Make the smallest requested fix in the draft edit copy.
4. Click `Done`.
5. Confirm `Exit and Unlock Module`.

Do not approve the replacement copy unless the user explicitly asks. Approval can replace the current approved module and archive the previous version.

## Activity-level Active Learning Process tags

1. Select the activity in the left navigation.
2. Open the right-side `Activity` card gear.
3. In `Activity Details`, set `Active Learning Process`.
4. Save with the blue disk icon.
5. Close the modal.
6. Verify the left navigation shows the expected orange activity tag.

## Keyword Tags, Module Tags, and Content Map

Use the approval validation popup to learn the exact blocker. Fix the smallest fields required.

Validated flow:

1. Open the approval validation popup and read the exact missing field.
2. For `Keyword Tags`, open `Keyword Tags > Edit > Module Settings`.
3. Enter keywords as one comma-separated input so SLS tokenizes them into chips.
4. Save and confirm chips appear.
5. Reopen edit mode with `version=<module-uuid>` preserved.
6. Open the cover/title metadata card.
7. Set `Module Tags`.
8. Continue into `Content Map`.
9. If DEV lacks the exact production map tree, choose an available fallback content map and at least one selectable topic/outcome.
10. Retry approval validation.

For a validated Primary 5 Social Studies transfer, `SOCIAL STUDIES - SS` plus `Primary 5` worked more reliably than `SOCIAL STUDIES - SOCIAL ST`. Treat this as a case example, not a universal rule.

## Approval boundary

If SLS reaches the final `Approve Module?` dialog with `Cancel` and `OK`, that proves earlier tag/content-map validation errors are cleared.

Stop at `Cancel` unless the user explicitly asked to approve. If they did ask for approval, verify afterward in Manage Modules that the latest row is `Approved`; in approved-copy flows, also check whether the prior row became `Archived`.

## Printview

Use printview for student-facing worksheet checks and PDF export, not teacher answer verification.

Patterns:

- Production: `.../moe-library/module/printview/<module_uuid>?status=APPROVED`
- DEV draft: `.../moe-library/module/printview/<module_uuid>?status=DRAFT`

Printview can omit ShortAnsFA suggested answers and other teacher-only answer-key content. Use the edit/view pages for suggested-answer verification.
