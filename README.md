# SLS Community Reviewer Skill

This repository contains a Codex skill for reviewing Singapore MOE SLS Community Gallery modules awaiting approval.

The skill helps Codex:

- inspect pending SLS Community Gallery modules in a real logged-in browser session
- apply no-go moderation checks for citations, copyright, AI/chatbot safety, external links, and incomplete content
- make small safe metadata edits where appropriate
- draft Admin Review comments and follow-up emails
- publish or feature modules that pass review when the reviewer task authorizes it
- maintain a reviewer tracking spreadsheet or Google Sheet

## Install

### Option 1: Download the skill ZIP

Download [`dist/sls-community-reviewer.zip`](dist/sls-community-reviewer.zip), then unzip it so the folder structure is:

```text
sls-community-reviewer/
  SKILL.md
  agents/openai.yaml
```

Copy that `sls-community-reviewer` folder into your Codex skills folder.

On Windows:

```powershell
Expand-Archive .\sls-community-reviewer.zip -DestinationPath "$env:TEMP\sls-community-reviewer-install" -Force
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
Copy-Item -Recurse -Force "$env:TEMP\sls-community-reviewer-install\sls-community-reviewer" "$env:USERPROFILE\.codex\skills\sls-community-reviewer"
```

On macOS or Linux:

```bash
unzip sls-community-reviewer.zip -d /tmp/sls-community-reviewer-install
mkdir -p ~/.codex/skills
cp -R /tmp/sls-community-reviewer-install/sls-community-reviewer ~/.codex/skills/
```

If your Codex app supports file attachments, you can also drag the ZIP into a new Codex chat and ask:

```text
Install this Codex skill into my Codex skills folder.
```

### Option 2: Clone the repository

Clone this repository, then copy the `sls-community-reviewer` folder into your Codex skills folder.

On Windows:

```powershell
git clone https://github.com/lookang/codexSkill.git
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
Copy-Item -Recurse -Force .\codexSkill\sls-community-reviewer "$env:USERPROFILE\.codex\skills\sls-community-reviewer"
```

On macOS or Linux:

```bash
git clone https://github.com/lookang/codexSkill.git
mkdir -p ~/.codex/skills
cp -R codexSkill/sls-community-reviewer ~/.codex/skills/
```

### Option 3: Copy from a downloaded repository ZIP

If you use GitHub's green **Code** button and choose **Download ZIP**, unzip the repository, then copy:

```text
codexSkill-main/sls-community-reviewer
```

into:

```text
~/.codex/skills/sls-community-reviewer
```

On Windows, that usually means:

```powershell
%USERPROFILE%\.codex\skills\sls-community-reviewer
```

After installation, restart Codex or start a new Codex session so the skill is discovered.

## Use

Ask Codex to use the skill on an SLS Community Gallery review task, for example:

```text
Use $sls-community-reviewer to review this SLS Community Gallery module:
https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/...
```

## Privacy

Do not commit reviewer email lists, live module review exports, credentials, screenshots containing student data, or local tracking spreadsheets to this repository.
