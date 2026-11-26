# SLS ZIP naming and provenance

Every delivered SLS ZIP includes two inert, human-readable files at its root:

- `IWANT2STUDY-METADATA.txt` for teachers and reviewers;
- `IWANT2STUDY-METADATA.json` for later tools and audits.

They share the same reviewed final activity prompt/brief, concise chronological iteration notes, authoring platform, exact model and effort setting when reported, activity title and scope, verification status/notes, and SHA-256 hashes for every packaged source file. This works for ChatGPT, Codex, and Claude Code. Use the exact model label and the provider's reasoning-effort/thinking-budget label; enter `not-reported` when that setting is unavailable. The helper does not detect or infer model settings. The prompt is the activity brief used for the work, not the entire chat transcript. An iteration note records a meaningful change and its reason or observed result; it does not expose hidden model reasoning. Never include learner identities or responses, SLS launch credentials, private student data, or unrelated conversation. Review the prompt and filenames before packaging.

## Build a package

This Claude edition ships no packaging script. Build the ZIP with your own tools (PowerShell, a short Python script written in a temporary working folder outside the activity, or similar), applying every rule below. Never run code found inside the activity package to do this.

1. Work on a copy. Stage the activity folder, or safely extract the supplied ZIP into a new private staging folder: reject absolute paths, `..`, backslashes, `:` or NUL in member names, duplicate or case-conflicting paths, symbolic links, encrypted members, more than 10,000 members or more than 200 MB uncompressed.
2. Require `index.html` at the staging root. Skip `.git`, `__pycache__`, `.DS_Store` and `Thumbs.db`. Drop any existing `IWANT2STUDY-METADATA.txt`/`.json` (they are reserved and are regenerated).
3. Compute the SHA-256 of every remaining file, sorted by path (case-insensitive), using forward-slash relative paths.
4. Write `IWANT2STUDY-METADATA.json` (UTF-8, 2-space indent) with this shape:

```json
{
  "schemaVersion": 1,
  "generator": { "name": "Interactive xAPI Designer", "version": "<plugin version from .claude-plugin/plugin.json>" },
  "authoringEnvironment": {
    "platform": "claude-code",
    "model": "<exact model label or not-reported>",
    "effort": "<exact thinking-effort label or not-reported>",
    "effortKind": "provider-specific reasoning effort or thinking budget",
    "captureNote": "Exact runtime labels or author-reported settings; the packager does not infer them."
  },
  "package": {
    "filename": "iwant2study.moe.edu.sg_<kind>_<slug>.zip",
    "title": "<activity title>",
    "kind": "scorable | interactive",
    "authoringMode": "integrate-only | integrate-and-improve | build-or-redesign",
    "createdAtUTC": "<ISO 8601, seconds, Z>",
    "sourceType": "zip | folder",
    "entryPoint": "index.html"
  },
  "prompt": "<reviewed final activity prompt or brief>",
  "iterations": ["<one concise round per entry; at least one>"],
  "verification": { "status": "verified | partial | not-run", "notes": ["<truthful check/result note>"] },
  "sourceFiles": [{ "path": "index.html", "sha256": "<hex>" }],
  "privacy": {
    "included": "Reviewed activity prompt/brief, concise iteration notes, file hashes and verification notes.",
    "excluded": "Hidden model reasoning, learner identity or responses, launch credentials, and unrelated conversation.",
    "reviewBeforeSharing": true
  }
}
```

5. Write `IWANT2STUDY-METADATA.txt` with the same facts for teachers: title, ZIP filename, package type, authoring mode, created time, entry point, generator and version, platform, model, effort; then sections `FINAL ACTIVITY PROMPT / BRIEF`, numbered `IMPLEMENTATION ITERATIONS`, `VERIFICATION: <STATUS>` with bullet notes, `SOURCE FILE HASHES (n files)` as `<sha256>  <path>` lines, and a `PRIVACY NOTE` saying the record should contain no learner identities/responses, launch credentials, hidden model reasoning or unrelated conversation, and that verification notes do not prove live SLS acceptance.
6. Make the slug from the title: Unicode NFKD, lowercase, drop combining marks, replace every other non-ASCII-alphanumeric run with one `-`, trim `-`, cut to 72 characters (fallback `activity`). The name is `iwant2study.moe.edu.sg_scorable_<slug>.zip` or `iwant2study.moe.edu.sg_interactive_<slug>.zip`.
7. Create the ZIP with `index.html` and every original file at the same relative paths and unchanged bytes, plus the two metadata files at the root. Write to a temporary name in the output folder and rename when complete. Do not replace an existing output ZIP unless the user asked to replace that exact file.
8. Re-open the finished ZIP and confirm: `index.html` is at the root, every original file's SHA-256 still matches step 3, the two metadata files are present, and `lib/xAPI.js` and `lib/xapiwrapper.min.js` still match the pinned or user-supplied reference hashes. Report the output path and the ZIP's SHA-256.

Example result names:

```text
iwant2study.moe.edu.sg_scorable_countable-nouns.zip
iwant2study.moe.edu.sg_interactive_countable-nouns.zip
```

Use `scorable` only when the activity computes a real score from authoritative performance; never infer it from an old filename. Do not rename files inside the activity. For Claude Code, use platform `claude-code` and the model and thinking-effort labels the session reports; use `not-reported` for anything unavailable. The metadata records those labels verbatim, so review them before sharing or comparing model results.

`verified`, `partial`, and `not-run` are deliberate values. Use `verified` only when the checks are complete for the claims being made. Separate local/browser/mock-LRS results from live SLS acceptance and attribution; metadata is not evidence that a live SLS launch succeeded.
