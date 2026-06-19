# Codex Skills

This repository contains Codex skills for Singapore MOE SLS workflows.

## Skills

- [`sls-community-reviewer`](sls-community-reviewer/) reviews SLS Community Gallery modules awaiting approval.
- [`sls-dev-module-transfer`](sls-dev-module-transfer/) transfers MOE SLS production modules into DEV draft modules while preserving rich formatting, response scaffolds, quiz settings, tags, and saved state.

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
Expand-Archive .\sls-dev-module-transfer.zip -DestinationPath "$env:TEMP\sls-dev-module-transfer-install" -Force
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
Copy-Item -Recurse -Force "$env:TEMP\sls-dev-module-transfer-install\sls-dev-module-transfer" "$env:USERPROFILE\.codex\skills\sls-dev-module-transfer"
```

On macOS or Linux:

```bash
unzip sls-dev-module-transfer.zip -d /tmp/sls-dev-module-transfer-install
mkdir -p ~/.codex/skills
cp -R /tmp/sls-dev-module-transfer-install/sls-dev-module-transfer ~/.codex/skills/
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
Copy-Item -Recurse -Force .\codexSkill\sls-dev-module-transfer "$env:USERPROFILE\.codex\skills\sls-dev-module-transfer"
```

On macOS or Linux:

```bash
git clone https://github.com/lookang/codexSkill.git
mkdir -p ~/.codex/skills
cp -R codexSkill/sls-dev-module-transfer ~/.codex/skills/
```

### Option 3: Copy from a downloaded repository ZIP

If you use GitHub's green **Code** button and choose **Download ZIP**, unzip the repository, then copy the wanted skill folder, for example:

```text
codexSkill-main/sls-dev-module-transfer
```

into:

```text
~/.codex/skills/sls-dev-module-transfer
```

On Windows, that usually means:

```powershell
%USERPROFILE%\.codex\skills\sls-dev-module-transfer
```

After installation, restart Codex or start a new Codex session so the skill is discovered.

## Use

Ask Codex to use a skill by name:

```text
Use $sls-dev-module-transfer to transfer this SLS production activity into DEV:
https://vle.learning.moe.edu.sg/...
https://vle.dev.sls.moe.edu.sg/...
```

```text
Use $sls-community-reviewer to review this SLS Community Gallery module:
https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/...
```

## Privacy

Do not commit reviewer email lists, live module review exports, credentials, screenshots containing student data, local tracking spreadsheets, or SLS content exports containing restricted learner/teacher data to this repository.
