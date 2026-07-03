# YouTube Upload Package

Use this when the tutorial video is ready for YouTube or classroom sharing. The deliverable must be directly usable in YouTube Studio.

## Required Files

Create these files in the tutorial output folder:

```text
youtube_metadata.json
youtube_upload_prep.md
thumbnail_1280x720.jpg or thumbnail_3840x2160.jpg
captions.srt
```

If a thumbnail image has not been generated yet, create a detailed thumbnail brief and mark the thumbnail status as `needs_generation`.

## Metadata JSON Shape

`youtube_metadata.json` should use this shape:

```json
{
  "title": "Recommended title here",
  "alternate_titles": [
    "Searchable alternate title",
    "Curiosity alternate title"
  ],
  "description": "Full YouTube description text",
  "tags": [
    "primary keyword",
    "science simulation",
    "student inquiry"
  ],
  "hashtags": [
    "#ScienceEducation",
    "#InquiryLearning",
    "#OpenSourcePhysics"
  ],
  "chapters": [
    { "time": "00:00", "title": "Hook and learning question" },
    { "time": "00:18", "title": "Set up the fair test" }
  ],
  "thumbnail": {
    "path": "thumbnail_1280x720.jpg",
    "status": "ready",
    "brief": "Simulation visible, one bold claim, one focal object, high contrast."
  },
  "pinned_comment": "Try the simulation here: https://...",
  "category": "Education",
  "playlist_suggestion": "Science simulations",
  "audience_setting": "not made for kids unless the channel owner decides otherwise",
  "language": "English",
  "captions_path": "captions.srt",
  "visibility_recommendation": "unlisted first for review, then public",
  "verification": {
    "mp4_ready": true,
    "audio_ready": true,
    "captions_ready": true,
    "thumbnail_ready": true,
    "metadata_ready": true
  }
}
```

## Upload Prep Markdown

`youtube_upload_prep.md` should have these sections in this order:

```markdown
# YouTube Upload Prep

## Video File

## Thumbnail

## Recommended Title

## Alternate Titles

## Description

## Tags

## Hashtags

## Chapters

## Pinned Comment

## Upload Settings

## Verification
```

Every section should contain copy-ready text, not only instructions.

## Title Rules

- Put the science topic or learner question near the beginning.
- Keep the recommended title concise, usually 55 to 70 characters when possible.
- Do not exceed YouTube's 100-character title limit.
- Avoid misleading curiosity hooks. The title must match the simulation and final video.
- Include the level or audience only when it helps search intent, for example `Primary 5` or `Grade 5`.
- Provide three title choices:
  - searchable classroom title
  - curiosity title
  - teacher/resource title

Example pattern:

```text
Plant Transpiration Virtual Lab: Fair Test Tutorial for Primary 5
```

## Description Template

Use this structure:

```text
Learn [science concept] with this interactive simulation tutorial.

Try the simulation:
[simulation URL]

In this video, students will:
- [learning outcome 1]
- [learning outcome 2]
- [learning outcome 3]

Teacher notes:
[short classroom-use note]

Chapters:
00:00 [chapter title]
00:18 [chapter title]
01:24 [chapter title]

Credits:
Simulation: Open Source Physics / Easy JavaScript Simulation / iwant2study.org
Created for classroom inquiry and science learning.

#ScienceEducation #InquiryLearning #OpenSourcePhysics
```

Keep the first two lines clear because they are most visible in previews and search. Include the simulation URL near the top.

## Tags and Hashtags

Hidden tags should be relevant search phrases, not broad stuffing. Use 8 to 15 focused tags and keep the total tag text under YouTube's tag field limit.

Include:
- primary science topic
- simulation name or app name
- level or syllabus keywords
- inquiry method keywords
- common alternate spellings or phrasing
- channel/project terms such as `iwant2study` and `Open Source Physics`

Visible hashtags belong at the end of the description. Use 3 to 5 relevant hashtags.

## Thumbnail Requirements

YouTube custom thumbnails should use a 16:9 image. Prefer `3840x2160` when file size allows, or `1280x720` for a safe HD upload target. Use JPG, PNG, or GIF. Verify the final image against current upload limits before submission.

Thumbnail design rules:
- show the actual simulation or a real frame from the final video
- use one short readable text phrase, usually 2 to 5 words
- make the main science object obvious
- keep high contrast and avoid tiny text
- do not use misleading images or emotions that the video does not support
- export a proof image and check it at small size

For classroom science tutorials, prefer honest curiosity over clickbait:

```text
WHY WATER DROPS?
FAIR TEST!
PLANTS LOSE WATER
```

## Chapters

Chapter rules:
- first chapter starts at `00:00`
- at least three chapters for longer videos
- timestamps must be ascending
- chapter labels should describe the learning move, not just the UI click
- keep each chapter title short enough to scan

## Pinned Comment

The pinned comment should invite action:

```text
Try the simulation here: [URL]
Question for students: What evidence shows that the plant lost water faster?
```

## Upload Settings Checklist

Include a recommendation for:
- visibility: `unlisted` for first review, then `public`
- category: `Education`
- playlist: existing science/simulation/tutorial playlist when known
- audience: ask the channel owner if the content should be marked `Made for Kids`; do not guess for compliance-sensitive uploads
- language: narration language
- captions: upload `captions.srt`
- end screen/cards: optional related simulation or playlist
- license: standard YouTube license unless the user requests otherwise

## Final Verification

Before saying the upload package is done:
- MP4 path exists
- audio stream exists
- captions file exists and matches final duration
- thumbnail image or generation brief exists
- description includes simulation URL
- chapters start at `00:00`
- tags and hashtags are relevant
- title, thumbnail, and video content are aligned
