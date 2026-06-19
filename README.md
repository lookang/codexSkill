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

Download or clone this repository, then copy the `sls-community-reviewer` folder into your Codex skills folder:

```powershell
Copy-Item -Recurse .\sls-community-reviewer "$env:USERPROFILE\.codex\skills\sls-community-reviewer"
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

