# Published Package and Privacy Boundary

This folder is a complete, reproducible backup of the maintained SLS Playwright
automation used by the `sls-finalize-community-module` skill.

## Included

- matching Windows `.cmd` and macOS `.command` launchers plus Node.js entry points;
- guarded Playwright runners for migration/tagging, page breaks, ACP interactives,
  gamification, thumbnails, teacher credit, permissions, recording, and smoke checks;
- curriculum-resolution and mathematical-question classifiers;
- representative module configs and harvested curriculum taxonomies needed by the
  examples and automated tests;
- unit tests, the lockfile, setup scripts, and user documentation.

The example configs contain Community Gallery module identifiers and curriculum
wording. They are not authentication credentials. Review them before applying a
write workflow to another module.

## Never Published

| Excluded path | Reason |
| --- | --- |
| `.auth/` | Authenticated Chrome profile and Playwright storage state |
| `.state/` | Local checkpoints and the user's most recently selected module |
| `output/` | Reports, traces, and screenshots that may show SLS content or account UI |
| `recordings/` | Raw Codegen demonstrations, which may contain copied literals |
| `.sheet-cache/` | Locally cached resource-sheet data |
| `.npm-cache/`, `node_modules/` | Re-creatable dependencies and caches |
| `eng.traineddata` | Re-creatable unpacked OCR cache; the npm package supplies the source model |
| `test-results/`, `playwright-report/` | Local test artefacts |

Do not add credentials, teacher-directory exports, restricted learner data, or
private SLS content exports to this repository.

## Reproduce on Windows

```powershell
git clone https://github.com/lookang/codexSkill.git
cd .\codexSkill\sls-finalize-community-module\playWright
npm.cmd ci --cache .npm-cache
npm.cmd run check
npm.cmd test
npm.cmd run sls:auth
```

The authentication command opens a dedicated visible Chrome profile. Sign in at
the SLS boundary; do not enter credentials in the terminal. After authentication,
start with `RUN-SLS-SMOKE-CHECK.cmd` for a read-only live check or
`RUN-SLS-AUTOMATION.cmd` for the guarded main workflow.

## Reproduce on macOS

```bash
git clone https://github.com/lookang/codexSkill.git
cd codexSkill/sls-finalize-community-module/playWright
chmod +x ./*.command ./scripts/run-macos.sh
./00-install-and-check.command
./01-authenticate-sls.command
./RUN-SLS-SMOKE-CHECK.command "SLS-MODULE-URL"
```

Install Node.js 20 or newer and Google Chrome first. The `.command` launchers
call the same npm scripts and preserve the same authentication and mutation
guards as the Windows launchers.

## Release Check

Before publishing another synchronization:

1. Copy only source files into this folder and preserve the exclusions above.
2. Compare source and destination after normalizing CRLF/LF line endings.
3. Run `npm.cmd ci`, `npm.cmd run check`, and `npm.cmd test` inside this published
   folder—not only in the private source checkout.
4. Run the skill validator against the parent `sls-finalize-community-module`
   folder.
5. Inspect the staged file list for auth, state, output, cache, and recording paths
   before committing.
