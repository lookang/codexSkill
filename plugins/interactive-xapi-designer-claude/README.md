# Interactive xAPI Designer (Claude edition)

The Claude directory edition of the Interactive xAPI Designer. It designs SLS HTML5 interactives, or adds meaningful xAPI reporting to existing HTML/ZIP activities while preserving them, with optional Slow Solve and spoken Coach support.

This edition contains **instructions only** (Markdown, JSON and the icon), so it meets the directory policy for publishers that are not Verified organizations. It ships no JavaScript, CSS, HTML or helper scripts. Instead:

- you supply the runtime files: the working SLS xAPI sample ZIP and, when you choose guided support, the shared engines from the full edition on GitHub;
- Claude verifies every file against the SHA-256 values in `skills/interactive-xapi-designer/references/runtime-files.md` before using it;
- Claude does the injection, structural checks and provenance packaging with its own tools, following the same rules as the full edition's helper scripts.

The full edition, with bundled reference files and Python helpers for Codex and ChatGPT, is in [`plugins/interactive-xapi-designer`](../interactive-xapi-designer). When you change the skill's teaching rules, update both editions.

See [PRIVACY.md](PRIVACY.md) for data handling.
