---
name: sim-to-youtube
description: "Use this skill when the user gives a WebEJS/EJS simulation URL or source file and wants the workflow handled end to end: inspect the sim, prefer editing WebEJS `_source.json` when appropriate, improve the pedagogy, preserve WebEJS-compatible encoding, create a narrated screen-recorded lesson video, generate a thumbnail, and prepare YouTube-ready metadata."
---

# Sim To YouTube

## Overview

Use this skill for interactive science simulation workflows that start from a live URL or local EJS/WebEJS source and end with a classroom-ready video package.

This skill is especially useful when the user wants one or more of these outcomes:
- review or improve the pedagogy of a sim
- fix or edit a WebEJS `_source.json` or `.ejss` source file
- produce a narrated screen recording instead of a still-image video
- generate a thumbnail and YouTube packaging text

## Quick Start

1. Identify the best working source of truth.
If the user provides both a live URL and a local source file, inspect both.
Prefer `_source.json` over `.ejss` when WebEJS editor compatibility matters.

2. Preserve editor compatibility before editing.
For WebEJS `_source.json`, check the file encoding first and preserve or restore UTF-16 LE with BOM if the editor expects it.

3. Improve the sim before making the video.
Look for pedagogical gaps first: misconceptions, weak prompts, unclear controls, and missing presets or explanations.
Also verify that visible dropdown order, progress labels, info overlays, and internal question handlers all refer to the same lesson sequence.

4. Record a real interaction.
Only do final recording after the edited source has been compiled successfully in WebEJS and the compiled interactive has been confirmed visually.
Prefer that compiled browser version over a manually patched export or still-image slideshow.
During recording, treat the cursor as the teacher's hand: point at the exact object named by the narration, use a high-contrast glow that is visibly different from the simulation palette, and show scroll/navigation movements instead of jumping to a new page area.

5. Package for publishing.
Create the title, description, timestamps, concept overview, tags, and thumbnail after the video is finalized.

## Workflow

Follow the detailed procedure in [references/workflow.md](references/workflow.md).

## Output Expectations

Unless the user asks otherwise, aim to deliver:
- an improved source file or a clear review
- one main narrated MP4
- one thumbnail image
- a YouTube upload package with title options, final description, thumbnail brief/path, tags, hashtags, chapters, pinned comment, audience settings, and upload checklist

## Guardrails

- Keep the pedagogy scientifically correct, not just visually pleasing.
- Do not assume WebEJS accepts UTF-8; verify and restore the required encoding.
- Prefer changes that are easy for teachers to explain and maintain.
- Audit hidden or mislabeled examples before recording; a missing advanced case or wrong ion name can quietly undermine the whole lesson flow.
- Treat WebEJS compilation as a gate for final visuals. Do not produce the final lesson video, final thumbnail, or final YouTube screenshots until the user has compiled the edited source and the compiled interactive has been checked.
- If WebEJS compilation is not available in the current environment, sync the minimum necessary runtime export changes for capture and clearly label that capture source as provisional.
- Avoid unexplained visual jumps in tutorial recordings. If the view must move to a lower or different part of the interactive, animate the cursor and scroll movement so the learner sees how to navigate there.
- Keep short overlay text readable. Reaction bubbles, snap labels, and navigation hints must remain visible for at least 3 seconds, with longer holds for longer phrases.
- For YouTube submission, produce complete copy-paste metadata, not notes only. Include the upload title, alternate titles, description, thumbnail file/brief, tags, hashtags, chapters, pinned comment, audience setting recommendation, playlist/category suggestion, and verification status.
- When YouTube upload is requested, prepare the assets and metadata; only perform publishing through a supported user-approved workflow.
