# SLS ZIP naming and provenance

Every delivered SLS ZIP includes two inert, human-readable files at its root:

- `IWANT2STUDY-METADATA.txt` for teachers and reviewers;
- `IWANT2STUDY-METADATA.json` for later tools and audits.

They share the same reviewed final activity prompt/brief, concise chronological iteration notes, authoring platform, exact model and effort setting when reported, activity title and scope, verification status/notes, and SHA-256 hashes for every packaged source file. This works for ChatGPT, Codex, and Claude Code. Use the exact model label and the provider's reasoning-effort/thinking-budget label; enter `not-reported` when that setting is unavailable. The helper does not detect or infer model settings. The prompt is the activity brief used for the work, not the entire chat transcript. An iteration note records a meaningful change and its reason or observed result; it does not expose hidden model reasoning. Never include learner identities or responses, SLS launch credentials, private student data, or unrelated conversation. Review the prompt and filenames before packaging.

## Build a package

Use UTF-8 text files: one containing the reviewed final prompt/brief, and one with one concise iteration round per non-empty line. Include one line for a one-pass build. Then run:

```powershell
python .\scripts\package_sls.py .\activity-folder `
  --title "Countable nouns" `
  --kind scorable `
  --mode integrate-only `
  --platform codex `
  --model "model-id-reported-by-runtime" `
  --effort "high" `
  --prompt-file .\activity-prompt.txt `
  --iterations-file .\activity-iterations.txt `
  --output-dir .\deliverables `
  --verification-status partial `
  --verification-note "Correct and incorrect answer paths checked in a local browser." `
  --verification-note "SLS live attribution not tested."
```

For an existing ZIP, pass the ZIP path instead of the folder. Use `--kind interactive` when the activity is explicitly unscored. The helper refuses to infer that distinction from an old filename: `scorable` must mean the activity computes a real score from authoritative performance. It produces:

```text
iwant2study.moe.edu.sg_scorable_countable-nouns.zip
```

or, for an unscored activity:

```text
iwant2study.moe.edu.sg_interactive_countable-nouns.zip
```

The helper requires `index.html` at the input ZIP root, checks for unsafe or duplicate ZIP paths, adds/replaces only the two reserved provenance files, and leaves each original runtime member's uncompressed bytes unchanged. It does not rename files inside the activity. An existing output is preserved unless `--force` is supplied.

For a Claude Code package, use `--platform claude-code` and the model and thinking-effort labels reported by that session. For ChatGPT, use `--platform chatgpt`; for Codex, use `--platform codex`. If the exact model or effort is unavailable, pass `not-reported` for that field. The metadata records the supplied labels verbatim, so review them before sharing or comparing model results.

`verified`, `partial`, and `not-run` are deliberate values. Use `verified` only when the checks are complete for the claims being made. Separate local/browser/mock-LRS results from live SLS acceptance and attribution; metadata is not evidence that a live SLS launch succeeded.
