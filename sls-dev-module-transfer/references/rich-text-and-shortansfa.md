# Rich Text, Tables, and ShortAnsFA

## Rich-text transfer rule

If the source contains tables, special formatting, or structured answer prompts, do not rebuild it from plain text. Use the browser UI:

1. Open the production source question.
2. Select the formatted content directly from the browser surface.
3. Copy with `Ctrl+C`.
4. Focus the matching DEV rich-text editor.
5. Paste with `Ctrl+V`.
6. For tables, ensure table borders are visible and set table border to `1` when manually constructing or repairing HTML.
7. Blur to blank page area and wait for `Saved`.

If automation cannot reveal the source layout, ask the user for screenshots or a short demo instead of guessing.

## Separate fields

Copy these separately because SLS stores and renders them differently:

- `Question Body`: the prompt/instructions students see.
- `Prepopulated Student Response`: the scaffold students can edit as part of their answer.
- `Suggested Answer`: teacher answer key or Short Answer Feedback Assistant reference.
- `Feedback`: optional feedback text, separate from suggested answer.

Do not put student response scaffolds into the question body just because they appear below the prompt in production.

## Table preservation

When constructing fallback HTML for a table, use both `border="1"` and inline cell borders:

```html
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%;">
  <tbody>
    <tr>
      <td style="border: 1px solid #000000;"><strong>Original</strong></td>
      <td style="border: 1px solid #000000;">Source sentence</td>
    </tr>
    <tr>
      <td style="border: 1px solid #000000;"><strong>Correction</strong></td>
      <td style="border: 1px solid #000000;">&nbsp;</td>
    </tr>
  </tbody>
</table>
```

For generated HTML clipboard fallback on Windows, use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/set-rich-clipboard.ps1 -HtmlFile fragment.html -PlainTextFile fallback.txt
```

Then paste into the focused SLS editor with `Ctrl+V`.

## Short Answer Feedback Assistant

Use this flow for ShortAnsFA question pages:

1. Ensure the quiz is in `Teacher-Marked Quiz` mode when required.
2. Use the blue page `+` in the quiz page navigator for additional questions.
3. On a blank page, choose `Short Answer Feedback Assistant`.
4. Fill `Question Body`.
5. Fill `Prepopulated Student Response` only when the source includes a student answer scaffold.
6. Fill `Suggested Answer` separately.
7. Set marks.
8. Open `All Settings` when needed and verify:
   - `Use Feedback Assistant` is checked.
   - `Feedback Assistant 1` is `Short Answer Feedback Assistant`.
   - `Provide marks` is checked.
   - optional `Feedback Assistant 2` can remain unselected.
9. Click blank page area to save.
10. Verify read-only view shows the `FEEDBACK ASSISTANT` panel, suggested answer, and marks.

## Example split

For a source question with a prompt plus a table headed `Passage`, `Error`, and `Correction`:

- Put only the task label and instructions in `Question Body`.
- Put the `Passage/Error/Correction` table in `Prepopulated Student Response`.
- Put the actual answer key in `Suggested Answer` only if the source has a teacher suggested answer.
