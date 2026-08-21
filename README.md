# Codex Skills

This repository contains Codex skills for Singapore MOE SLS workflows.

## Skills

- [`build-famath-interactives`](build-famath-interactives/) builds, extends, regenerates, packages, and validates FAMath formative mathematics interactives from syllabus learning objectives, with concrete-pictorial-abstract models, misconception-first tutorials, adaptive difficulty, challenge levels, and SLS xAPI packages.
- [`sim-to-youtube`](sim-to-youtube/) turns science simulations into classroom-ready tutorial video packages, including pedagogy checks, screen-recorded walkthroughs, cursor choreography, readable overlays, narration, captions, thumbnails, and YouTube metadata.
- [`sls-community-reviewer`](sls-community-reviewer/) reviews SLS Community Gallery modules awaiting approval.
- [`sls-dev-module-transfer`](sls-dev-module-transfer/) transfers MOE SLS production modules into DEV draft modules while preserving rich formatting, response scaffolds, quiz settings, tags, and saved state.
- [`sls-finalize-community-module`](sls-finalize-community-module/) is a full guarded SLS authoring skill with a reproducible [`playWright`](sls-finalize-community-module/playWright/) package for curriculum and question tagging, meaningful page breaks, ACP practice interactives, featured images, gamification, credits, permissions, workflow recording, and reopen verification.
- [`simulation-youtube-tutorial`](simulation-youtube-tutorial/) creates HD YouTube tutorials from interactive web simulations, with highlighted cursor walkthroughs, Kokoro narration, captions, thumbnails, metadata, and verification.
- [`websitesim-to-youtube`](websitesim-to-youtube/) turns live websites, browser apps, and simulations into narrated tutorial MP4s with human-looking cursor actions, numbered teaching captions, narration-first synchronization, correction takes, and final QA.

## Install

### Option 1: Download a skill ZIP

Download one of the ZIP files from [`dist/`](dist/), then unzip it so the folder structure is:

```text
skill-name/
  SKILL.md
  agents/openai.yaml
```

Copy that skill folder into your Codex skills folder.

On Windows:

```powershell
Expand-Archive .\sim-to-youtube.zip -DestinationPath "$env:TEMP\sim-to-youtube-install" -Force
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
Copy-Item -Recurse -Force "$env:TEMP\sim-to-youtube-install\sim-to-youtube" "$env:USERPROFILE\.codex\skills\sim-to-youtube"
```

On macOS or Linux:

```bash
unzip sim-to-youtube.zip -d /tmp/sim-to-youtube-install
mkdir -p ~/.codex/skills
cp -R /tmp/sim-to-youtube-install/sim-to-youtube ~/.codex/skills/
```

If your Codex app supports file attachments, you can also drag the ZIP into a new Codex chat and ask:

```text
Install this Codex skill into my Codex skills folder.
```

### Option 2: Clone the repository

Clone this repository, then copy the skill folder you want into your Codex skills folder.

On Windows:

```powershell
git clone https://github.com/lookang/codexSkill.git
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
Copy-Item -Recurse -Force .\codexSkill\sim-to-youtube "$env:USERPROFILE\.codex\skills\sim-to-youtube"
```

On macOS or Linux:

```bash
git clone https://github.com/lookang/codexSkill.git
mkdir -p ~/.codex/skills
cp -R codexSkill/sim-to-youtube ~/.codex/skills/
```

### Option 3: Copy from a downloaded repository ZIP

If you use GitHub's green **Code** button and choose **Download ZIP**, unzip the repository, then copy the wanted skill folder, for example:

```text
codexSkill-main/sim-to-youtube
```

into:

```text
~/.codex/skills/sim-to-youtube
```

On Windows, that usually means:

```powershell
%USERPROFILE%\.codex\skills\sim-to-youtube
```

After installation, restart Codex or start a new Codex session so the skill is discovered.

## Use

Ask Codex to use a skill by name:

```text
Use $sim-to-youtube to create a tutorial video package for this science simulation:
https://iwant2study.org/lookangejss/...
```

```text
Use $sls-dev-module-transfer to transfer this SLS production activity into DEV:
https://vle.learning.moe.edu.sg/...
https://vle.dev.sls.moe.edu.sg/...
```

```text
Use $sls-community-reviewer to review this SLS Community Gallery module:
https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/...
```

```text
Use $sls-finalize-community-module to infer curriculum tags and safely complete this SLS Community Gallery module:
https://vle.learning.moe.edu.sg/community-gallery/module/view/...
```

The SLS finalization skill includes its complete Windows Playwright automation,
lockfile, launchers, configs, taxonomies, and tests. To reproduce the validated
local setup:

```powershell
git clone https://github.com/lookang/codexSkill.git
cd .\codexSkill\sls-finalize-community-module\playWright
npm.cmd ci --cache .npm-cache
npm.cmd run check
npm.cmd test
npm.cmd run sls:auth
```

Authentication, checkpoints, reports, traces, raw recordings, caches, and
dependencies remain local and are excluded from Git. See the package
[`README.md`](sls-finalize-community-module/playWright/README.md) for the launcher
map and [`PUBLISHING.md`](sls-finalize-community-module/playWright/PUBLISHING.md)
for the public/private boundary.

```text
Use $simulation-youtube-tutorial to turn this simulation into an HD YouTube tutorial:
https://iwant2study.org/lookangejss/00workshop/2026TFL/sortingDragandDrop/
```

```text
Use $websitesim-to-youtube to record this live browser workflow, explain each
click and drag, add numbered teaching captions, and deliver a verified MP4:
https://example.com/simulation/
```

```text
Use $build-famath-interactives to turn these Primary 3 mathematics learning
objectives into chronological SLS xAPI interactives.
```

`build-famath-interactives` bundles its canonical generator, the vendored offline Three.js and KaTeX, and the proven xAPI sample, so it is larger than the other skills and can regenerate a full collection with no network. It needs PowerShell for the build, Python for the validator, and Node for `_source/headless_check.js`.

## Privacy

Do not commit reviewer email lists, live module review exports, credentials, screenshots containing student data, local tracking spreadsheets, or SLS content exports containing restricted learner/teacher data to this repository.
