# Lookang Codex and Claude Code Skills and Plugins

This repository contains Codex and Claude Code skills and installable plugins for Singapore MOE SLS workflows.

## Plugins

### Interactive xAPI Designer

<img src="plugins/interactive-xapi-designer/assets/icon.png" alt="Interactive xAPI Designer icon" width="128">

[`interactive-xapi-designer`](plugins/interactive-xapi-designer/) builds fresh SLS interactives or preserves existing HTML/ZIP activities while adding verified scoring, meaningful action history, supported misconception explanations and learner/teacher reports. Fresh builds follow the 450px Prompt Library design; existing content defaults to minimal-change integration. It uses the [SLS Prompt Generator and Interactive Prompt Library](https://iwant2study.moe.edu.sg/lookangejss/promptLibrary/ai-prompt-library.html) together with the [SLS xAPI Integrator Agent](https://iwant2study.org/lookangejss/appXapiIntegratorAgent/public/) as the maintained basis for its workflow.

Version 0.3.5 keeps the same plugin identity and supports three scopes: **Integrate only** (default for existing HTML/ZIP), **Integrate and improve** (requested targeted changes), and **Build or redesign** (default for fresh requests). Preserve existing interfaces, content and learning logic; apply full Prompt Library design rules to fresh builds and explicit redesigns only. The listing starters are kept within the platform's 128-character limit. The downloadable plugin archive includes the pinned SLS reference as regular files, so it can be uploaded to Claude without nested ZIPs. Package inspection is now offline-only and uses bounded, path-safe ZIP handling.

The directory listing uses the subtitle **Build SLS activities with xAPI**, the **Developer Tools** category and a public [privacy policy](plugins/interactive-xapi-designer/PRIVACY.md). It describes a teacher-facing HTML/ZIP authoring toolkit, with no publisher-operated MCP server.

The plugin bundles the exact user-confirmed SLS sample, checksum verification and a conservative injection helper. Keep xAPI libraries unchanged; adapt domain payloads and narrow check hooks. Injection prepares a scaffold, while meaningful scoring and analytics require the real model and completion handler. Reports send at active completion, with first/latest results and support evidence distinguished. Slider changes record investigation evidence, not assumed mastery.

Every delivered SLS ZIP carries `IWANT2STUDY-METADATA.txt` and `.json` with the final activity prompt, concise implementation rounds, authoring platform/model/effort when reported, source-file hashes and verification notes. The same metadata works for ChatGPT/Codex and Claude Code; unavailable runtime settings are marked `not-reported`. `scripts/package_sls.py` names scored files `iwant2study.moe.edu.sg_scorable_<slug>.zip` and explicitly unscored files `iwant2study.moe.edu.sg_interactive_<slug>.zip`; it leaves the activity's internal filenames and runtime bytes unchanged.

The plugin plans evidence before tracking, distinguishes standard timeline integration from custom semantic instrumentation, and verifies completion through a local mock LRS. For scored activities, it requires stable item evidence, authoritative scoring, completion fallback capture, misconception explanations, and useful SLS-visible teacher feedback. It also covers accessible interaction design, local asset packaging, true 3D verification, state restoration, privacy, and SLS-ready ZIP delivery.

Naming convention:

- Marketplace ID: `lookang-codex-skills`
- Plugin ID and folder: `interactive-xapi-designer`
- Display name: **Interactive xAPI Designer**
- Bundled skill invocation: `$interactive-xapi-designer`

- Prompt in ChatGPT can look like this
- Using the $interactive-xapi-designer plugin (from lookang/codexSkill), create a simple Chinese language learning game packaged for SLS. Ensure it includes xAPI learning analytics to track student responses, scores, and attempts, and output an SLS-ready ZIP file."

## Skills

- [`build-famath-interactives`](build-famath-interactives/) builds, extends, regenerates, packages, and validates FAMath formative mathematics interactives from syllabus learning objectives, with concrete-pictorial-abstract models, misconception-first tutorials, adaptive difficulty, challenge levels, and SLS xAPI packages.
- [`sim-to-youtube`](sim-to-youtube/) turns simulations, websites, SLS workflows and your own screen recordings into engaging, verified YouTube tutorials: WebEJS source fixes, self-recorded or edited walkthroughs with a teaching cursor, Kokoro narration, HyperFrames motion graphics synced word-by-word and checked against the footage, privacy blurring of student names, SRT, thumbnail, and a YouTube kit with chapters, Problems and Quizzes. It replaces `simulation-youtube-tutorial` and `websitesim-to-youtube`.
- `simulation-youtube-tutorial` and `websitesim-to-youtube` remain only as redirect stubs to `sim-to-youtube` so existing installs keep working.
- [`sls-community-reviewer`](sls-community-reviewer/) reviews SLS Community Gallery modules awaiting approval.
- [`sls-dev-module-transfer`](sls-dev-module-transfer/) transfers MOE SLS production modules into DEV draft modules while preserving rich formatting, response scaffolds, quiz settings, tags, and saved state.
- [`sls-finalize-community-module`](sls-finalize-community-module/) is a full guarded SLS authoring skill with a reproducible [`playWright`](sls-finalize-community-module/playWright/) package for curriculum and question tagging, meaningful page breaks, ACP practice interactives, featured images, gamification, credits, permissions, workflow recording, and reopen verification.

## Install the plugin in Codex

The recommended installation uses this repository as a Codex marketplace:

```powershell
codex plugin marketplace add lookang/codexSkill
codex plugin add interactive-xapi-designer@lookang-codex-skills
```

Start a new Codex task after installation so the bundled skill is discovered. To receive repository updates later, run:

```powershell
codex plugin marketplace upgrade lookang-codex-skills
codex plugin add interactive-xapi-designer@lookang-codex-skills
```

The same plugin is also available as [`dist/interactive-xapi-designer.zip`](dist/interactive-xapi-designer.zip) for inspection, archival, manual distribution, or upload to Claude. Rebuild it from the canonical plugin folder with `python scripts/package_interactive_xapi_designer.py`; verify source-to-archive identity and the published checksum with `python scripts/package_interactive_xapi_designer.py --check`.

## Install the plugin in Claude Code

The same canonical plugin source includes a Claude Code manifest and is published through the `lookang-claude-plugins` marketplace in this repository:

```powershell
claude plugin marketplace add lookang/codexSkill
claude plugin install interactive-xapi-designer@lookang-claude-plugins
```

Restart Claude Code after installation, or run `/reload-plugins` in an existing session. The bundled skill is available as:

```text
/interactive-xapi-designer:interactive-xapi-designer
```

For local testing without marketplace installation, load the plugin directory or the distribution ZIP directly:

```powershell
claude --plugin-dir .\plugins\interactive-xapi-designer
claude --plugin-dir .\dist\interactive-xapi-designer.zip
```

The Codex and Claude Code packages share one `skills/interactive-xapi-designer/` source tree so their instructional behavior stays aligned.

## Install standalone skills

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
Use $interactive-xapi-designer to design an accessible SLS interactive about
photosynthesis and add meaningful xAPI learning analytics.
```

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
