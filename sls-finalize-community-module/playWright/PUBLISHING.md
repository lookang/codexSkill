# What is published here, and what is not

This folder holds the Playwright automation for finalising SLS Community Gallery
modules: tagging questions against the syllabus, crediting a teacher, gamifying a
module, and generating a module cover picture.

## Deliberately not published

This is a public repository, so three things are kept out of it:

| Excluded | Why |
| --- | --- |
| `configs/` | One JSON per module, holding SLS module IDs, module and activity titles, and the learning outcomes chosen for them. |
| `taxonomy/` | Syllabus wording harvested from SLS content maps (Primary and Secondary mathematics). |
| `.sheet-cache/`, `output/`, `.auth/` | A cached copy of a working spreadsheet, run artefacts (reports, traces, screenshots), and the SLS session and browser profile. |

Nothing is lost by their absence: a config is **scaffolded automatically** the first
time you point the launcher at a module, and a syllabus is **harvested from the
module itself**. Both are written into `configs/` and `taxonomy/` locally.

## Placeholders you need to replace

The IDs that were in the source have been replaced so this repository names no real
module or spreadsheet:

- `00000000-0000-0000-0000-000000000000` - the default SLS module, used only when
  you press Enter instead of supplying a module. Set it to a module of your own, or
  always paste a URL.
- `PUT-YOUR-GOOGLE-SHEET-ID-HERE` in `src/sheet.mjs` - the resource spreadsheet the
  launcher lists modules from. Until you set it, paste an SLS URL rather than a row
  number.

`scripts/selftest.mjs` and `tests/config.test.mjs` also reference module IDs and a
config file that are not published, so those two need your own values before they
will pass.

## Getting started

```bash
npm install
npm run sls:auth          # sign in once; the session is saved under .auth
RUN-SLS-AUTOMATION.cmd    # inspect, then tag a module
```

`npm run check` type-checks every script and `npm test` runs the unit tests, which
cover the question-tagging logic without touching SLS.

## Safety properties worth keeping

The automation is built to append, never to strip:

- an outcome a human has already set is never removed, and a question already tagged
  is left alone;
- a write pass refuses to start while a scaffolded config still holds
  `REVIEW-BEFORE-RUNNING` placeholders;
- surgical tagging creates, renames and deletes nothing;
- harvesting a syllabus is read-only - it never selects a content map on a section.
