---
title: "From AI Feedback to Verified SLS Interactives: Building a Codex Skill with Playwright"
date: 2026-08-27
author: "Wee Loo Kang"
description: "How an AI skill, a deterministic Playwright runner and SLS Authoring Copilot became a guarded workflow for curriculum tagging, page breaks and FA Mathematics interactives."
keywords:
  - Singapore Student Learning Space
  - SLS
  - Playwright
  - Codex skills
  - AI in education
  - Mathematics Assistant
  - formative assessment
  - interactive learning
  - robotic process automation
---

# From AI Feedback to Verified SLS Interactives: Building a Codex Skill with Playwright

What happens when AI feedback is paired with an interactive mathematical model—and when the process of building that pairing is itself automated?

That question led to the development of **`sls-finalize-community-module`**, a Codex skill backed by a deterministic Playwright package for Singapore Student Learning Space (SLS) authoring. The goal was not to create an autonomous bot that clicks indiscriminately. It was to turn a careful teacher workflow into a repeatable, reviewable and verifiable process.

The accompanying demonstration, [**What Happens When AI Feedback Meets an Interactive? Make Mathematics Visible**](https://www.youtube.com/watch?v=GY5osFZ6ijA), shows the pedagogical result: a learner attempts a mathematics question, receives diagnostic feedback, then explores a visual model by changing values and testing the same structure again.

<iframe width="560" height="315" src="https://www.youtube.com/embed/GY5osFZ6ijA" title="What Happens When AI Feedback Meets an Interactive? Make Mathematics Visible" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

The reusable instructions are published as the [SLS finalization skill](https://github.com/lookang/codexSkill/tree/main/sls-finalize-community-module), while the complete cross-platform runner is available separately in the public [lookang/sls-playwright-automation repository](https://github.com/lookang/sls-playwright-automation).

## Why build this?

SLS is designed as an open, modular platform that supports curriculum-aligned resources, teacher tools and external content. Its continuing development reflects the changing needs of teachers and students, while its AI-enabled features are intended to provide timely feedback and support professional practice in pedagogically sound ways. These aims are described on the official [SLS—Designed for Learning](https://www.learning.moe.edu.sg/sls-designed-for-learning/) and [About AI in SLS](https://www.learning.moe.edu.sg/ai-in-sls/about-ai-in-sls/) pages.

The practical authoring work, however, can be repetitive:

- inspect every section, activity, page and question;
- infer the correct Subject, Level, Content Map and learning outcome;
- include genuine assessed questions in Learning Progress;
- preserve existing content and interactive ZIPs;
- separate multiple questions with meaningful page breaks;
- generate a matching practice interactive;
- save, reopen and verify every change;
- collect enough evidence to diagnose anything that failed.

A human can do all this. The challenge is doing it consistently across many modules without losing the professional judgment that makes the result trustworthy.

## The key architectural decision: AI decides the workflow; Playwright executes it

The project has three distinct layers:

```text
Teacher request and SLS URL
            |
            v
Codex skill: intent, routing, evidence rules and safety boundaries
            |
            v
Playwright runner: deterministic browser actions and verification
            |
            v
SLS authoring tools, including Authoring Copilot for generation
```

This distinction matters.

The **Codex skill** is the durable operational knowledge. Its [`SKILL.md`](https://github.com/lookang/codexSkill/blob/main/sls-finalize-community-module/SKILL.md) explains which launcher to use, what evidence is authoritative, when a run must stop, which changes require explicit authorization, and what must be reopened before success can be claimed.

The **Playwright package** is the maintained executor. It navigates the real SLS authoring interface using locators, waits for observable state, writes reports and traces, and refuses uncertain actions. It is not replaced by improvised screen clicking whenever a UI problem appears.

The **AI generation step** occurs only where it belongs. For ACP interactives, the runner builds a detailed prompt using the iwant2study [SLS Prompt Generator and Interactive Prompt Library](https://iwant2study.moe.edu.sg/lookangejss/promptLibrary/ai-prompt-library.html), then submits that prompt to SLS Authoring Copilot’s Interactive generator. The surrounding inventory, navigation, checking and persistence verification remain deterministic.

This hybrid design gives us the strengths of both approaches:

- AI for interpretation, curriculum context, prompt construction and generative content;
- Playwright for repeatable navigation, exact targets, guards and evidence;
- human review for ambiguity, authentication, pedagogy and consequential choices.

## How the development process unfolded

### 1. Record the real workflow

The first useful artifact was not a grand automation framework. It was a recording of the authentic authoring sequence.

`RUN-PLAYWRIGHT-RECORD-WORKFLOW.cmd` opens Playwright Codegen with reusable SLS authentication state and writes a raw browser recording locally. Codegen is useful for learning which controls appear, how dialogs are mounted and what changes after a save. Playwright documents this workflow in its [test generator and command-line guidance](https://playwright.dev/docs/test-cli).

Raw recordings are only observations. Generated locators may be too broad, copied text may become a literal, and a click that worked once may not identify the correct card after SLS rerenders. Each recording was therefore rewritten as maintained JavaScript with scoped locators, state checks and guard errors.

### 2. Separate the skill from the executable package

The AI skill and the browser code solve different problems, so they live separately:

- `SKILL.md` describes intent, routing, safety and completion criteria;
- `playWright/README.md` documents setup, launchers and operational flags;
- `scripts/` contains command-line entry points;
- `src/` contains the reusable browser and decision logic;
- `configs/` records verified module-specific expectations;
- `taxonomy/` stores harvested official learning outcomes;
- `tests/` preserves every failure as a regression case.

This separation made the workflow usable in two ways. Codex can select and apply the skill when a teacher supplies an SLS URL, while a human can run the same automation directly from a `.cmd` or `.command` launcher.

### 3. Build a read-first, write-second lifecycle

The early rule became: **review the whole target before changing it**.

For a normal run, `RUN-SLS-AUTOMATION.cmd`:

1. accepts a public, admin, section or activity URL;
2. extracts and preserves the exact module UUID;
3. opens admin Module View and verifies the visible title;
4. enters Edit mode only after identity is established;
5. inventories sections, activities, pages, questions and existing tags;
6. resolves curriculum evidence;
7. proposes one outcome per eligible question;
8. applies only clear, in-scope changes;
9. saves, reloads and reopens the changed question;
10. writes a JSON report, trace and screenshots.

The normal working revision is **surgical**: it updates existing questions in place and does not need to duplicate a section or activity. A historical duplicate-and-replace path is isolated behind an explicit flag because its deletion boundary is materially riskier.

### 4. Treat authentication as private, expiring state

SLS authentication is completed manually in a visible Chrome window. The helper saves Playwright storage state under `.auth/`, and later browser contexts load it. Playwright’s official [authentication guide](https://playwright.dev/docs/auth) recommends storing reusable state outside source control because the file can contain cookies and headers capable of impersonating the account.

The runner follows that guidance:

- it never asks for a password in the terminal;
- `.auth/` is excluded from Git;
- `/login` and MIMS are hard stop boundaries;
- an expired session is distinguished from a Chrome profile lock;
- only one authentication helper may use the dedicated profile at a time.

Authentication is not something to “work around.” If the trusted session is gone, the correct outcome is a visible handoff to the user.

## How curriculum tagging works

Curriculum tagging became the most interesting reasoning problem in the project.

### Start with authoritative SLS evidence

The runner does not search the entire syllabus and select the most similar sentence. It first narrows the candidate space:

1. read existing saved Module Tags;
2. recover the exact Subject, Level and Content Map;
3. open that saved map and crawl its official outcome tree;
4. use unsaved Subject → Level → Content Map discovery only when no saved map is available;
5. reload without saving after read-only discovery;
6. rank only outcomes from the eligible harvested map or maps.

This prevents a beautifully worded outcome from the wrong level, stream or subject from winning.

### Read the mathematics from several sources

An SLS question is not always ordinary text. The evidence reader therefore combines:

- visible DOM text;
- open shadow-DOM content from lazily hydrated FA Mathematics components;
- WIRIS MathML embedded in SVG comments;
- image `alt` and `title` metadata;
- local Tesseract OCR for substantial diagrams when the earlier evidence is weak;
- shared stimuli carried to related subquestions;
- the Suggested Answer as corroboration, never as permission to invent a missing topic.

Playwright locators can work through open shadow roots, and its documentation recommends role, label and other user-facing locators instead of fragile DOM chains. Those principles are central to the runner’s [scoped locator strategy](https://playwright.dev/docs/locators). Diagram OCR is performed locally with [Tesseract.js](https://github.com/naptha/tesseract.js); SLS question images are not sent to an external OCR service.

### Convert evidence into mathematical features

`src/math-features.mjs` extracts three types of signals:

- **operations**: add, subtract, multiply, divide;
- **operands and representations**: fractions, decimals, percentages, ratios, integers and mixed numbers;
- **topics and structures**: equations, quadratic functions, fractional equations, matrices, function graphs, angle relationships, measurement and data interpretation.

`src/question-tagger.mjs` then scores eligible official outcomes. Topic evidence carries more weight than a generic operation, an outcome that demands an absent concept receives a specificity penalty, and unresolved ties are skipped rather than guessed.

The activity and module titles act as a **bounded prior**. They can funnel a weak but readable question toward the right syllabus family, but they cannot turn an empty stem into mathematics or override a strong contradictory signal in the question itself.

## A revealing bug: when a parabola became a matrix

One Secondary Mathematics module was titled **Quadratic and Fractional Equations**. Q5 visibly contained a parabola, but the automation selected:

> Problems involving addition, subtraction and multiplication of matrices

The report made the cause clear. OCR had recovered mainly graph ticks and axes:

```text
5 10 −5 −10 5 10 15 −5 0 0,0 x y
```

The negative tick labels registered as subtraction. The matrix syllabus outcome contained the generic words “addition, subtraction and multiplication,” but the original matcher did not require the word or structure **matrix**. It therefore rewarded operation overlap and made a confident-looking mistake.

The fix was not a one-off exception for Q5. It changed the model of mathematical evidence:

- add explicit `matrix`, `quadratic`, `fractional equation` and `function graph` topics;
- detect coordinate-graph OCR only when both axes and several numeric ticks are present;
- require matrix outcomes to have actual matrix evidence;
- let a specialized topic in the question outrank the broader activity-title prior;
- retain a regression proving that a genuine matrix question still selects a matrix outcome.

After the repair, the stored Q5 evidence selected the official outcome beginning **“Sketching the graphs of quadratic functions…”**, while ordinary time calculations no longer matched matrices. The regression suite also checks the inverse case: “Given matrices A and B…” must remain a matrix question even inside an unrelated activity.

This incident captures an important lesson for educational AI: **context should narrow plausible interpretations, but semantic prerequisites must block category errors**.

## Recognising multipart FA Mathematics questions

Another failure looked simple: a page clearly contained Question 1(a) and 1(b), both using Feedback Assistant – Mathematics, yet an early scan reported no FA Mathematics question.

The correct abstraction was not “two unrelated questions.” In SLS, one multipart card can contain:

- a shared stimulus;
- several nested response parts;
- separate answer keys;
- randomized components with their own editor controls;
- one pedagogically coherent interactive target.

The ACP inventory now treats the multipart card as one candidate. It preserves shared context, every nested part, the suggested answers and child component IDs. If any response part is randomized, it reads the template, correct expression, variable names, ranges, dependent bounds and current rendered values without saving the editor.

That evidence becomes a single prompt for one coherent interactive instead of several disconnected mini-apps.

## Generating an ACP interactive safely

`RUN-SLS-ACPINTERACTIVE.cmd` traverses the complete selected module—even when the supplied URL points to one nested activity. A page is eligible only when it contains exactly one top-level FA Mathematics question and no existing interactive ZIP.

For each candidate, the runner:

1. collects the full question and answer evidence;
2. adds randomized parameter constraints when they actually exist;
3. opens the [iwant2study Prompt Library](https://iwant2study.moe.edu.sg/lookangejss/promptLibrary/ai-prompt-library.html);
4. selects the reviewed grade and Mathematics settings;
5. fills Specific Requirements;
6. generates the full prompt and records it in `report.json` and CLI copy markers;
7. returns to SLS and adds a Text component;
8. opens **Authoring Copilot → Interactive (Beta)**;
9. waits for a genuine completed Preview Interactive;
10. clicks **ADD** only after the visible generating overlay is gone;
11. waits for the completed ZIP;
12. selects **Done**, re-enters Edit and verifies the same ZIP persisted.

The Prompt Library itself generates optimized prompt variants for the SLS ACP Interactive Generator and includes accessibility expectations such as keyboard and touch support, non-colour cues, readable labels and reduced-motion support.

### Why the 200-second wait exists

During development, an interactive preview appeared after roughly 150 seconds. Earlier code used a short “dialog disappeared” assumption and could enter the wrong phase. SLS can also show a second **Generating your interactive** state after ADD.

The runner was changed to wait up to 200 seconds by default for observable completed preview/ZIP evidence. It does not click an ADD button hidden under an active overlay, and it does not declare success merely because a modal closes.

A controlled live trial generated `Interactive_20260825112621.zip`, selected Done, reopened the activity and verified the ZIP. Because that trial deliberately used `--max-interactives 1`, it proved one complete transaction—not completion of the entire module.

## Page breaks are semantic, not merely geometric

Pages with several top-level FA Mathematics questions are blocked from ACP generation until they are separated. `RUN-SLS-PAGE-BREAK.cmd` therefore performs a read-only review first.

The page-break planner groups question cards by their rendered vertical overlap:

- side-by-side questions remain in the same visual row;
- the break goes before the first question in the next row;
- a clear divider is selected through **Display → Page Break → Single**;
- SLS must show exactly one additional page before the split is checkpointed;
- ambiguous layouts are skipped without blocking clear pages elsewhere;
- `--dry-run` produces a report without changing SLS.

This is a good example of using geometry as evidence without confusing it with meaning. The script can identify a likely visual boundary, but it refuses a page where that boundary cannot be tied safely to the intended question.

## The complete launcher flow

The working `RUN-SLS-SELECTED.cmd` can coordinate several individual launchers. Pressing Enter or choosing `COMPLETE` runs the practical four-stage flow:

1. `RUN-SLS-AUTOMATION.cmd` — surgical curriculum and question tagging;
2. `RUN-SLS-PAGE-BREAK.cmd` — clear, verified question separation;
3. `RUN-SLS-THUMBNAIL.cmd` — generated Featured Image when absent;
4. `RUN-SLS-ADD-WEE-LOO-KANG.cmd` — exact teacher credit and completed-assignment printing permission.

`AUTO` is deliberately different: it includes all seven finalization stages, adding copy-suffix cleanup, ACP interactives and gamification in their safe dependency order.

Each launcher still inventories its own target and stops later stages if a guard fails. The coordinator suppresses only redundant end-of-script pauses; it does not weaken any mutation or authentication check.

## Failure-driven engineering

Most of the robustness came from real failures, not from predicting every possible interface state.

### A navigation overlay intercepted the next section

SLS retained a visible header drawer overlay after navigation. A section locator existed, but the overlay intercepted the click. The repair closed and verified the overlay before section work. The lesson: never force-click through an obstruction whose meaning is not understood.

### The Chrome window existed but the user could not see it

A tool-launched authentication window could be on a non-interactive desktop while the terminal waited for Enter. The workflow was changed to distinguish session expiry, profile lock and invisible handoff, and to prefer an existing connected Chrome session when appropriate.

### A direct checkbox action failed

SLS did not accept a direct checkbox state change for Learning Progress, while clicking the associated visible label worked. The durable rule became: interact as the user does, then verify the actual checkbox state.

### An ACP ADD control existed under a loading overlay

The DOM contained an ADD button before the preview was ready. The fix scoped the button to the genuine completed preview and required the generating overlay to be absent.

### An ambiguous page stopped the whole module

The policy changed so ambiguity is local: leave that page untouched, record why, and continue with independent clear candidates.

Each failure became a focused test, which is more valuable than another comment saying “be careful.”

## Verification and evidence

The package uses Node’s built-in [`node:test` test runner](https://nodejs.org/api/test.html) together with Playwright-based browser fixtures. At the time of writing, the local working revision passed:

- **232 automated tests**;
- a static/package check covering **88 JavaScript files**;
- **52 JSON files**;
- **32 SLS configs**;
- **15 Windows CMD launchers**;
- **15 macOS launchers**.

Every live run creates an evidence folder containing some or all of:

- `report.json` with per-question decisions and evidence provenance;
- `trace.zip` with browser actions, DOM snapshots and network activity;
- screenshots for failures and persistence checks;
- checkpoints for safe resumption.

Playwright’s [Tracing API](https://playwright.dev/docs/api/class-tracing) and [Trace Viewer](https://playwright.dev/docs/trace-viewer) turn a browser failure into an inspectable timeline instead of a vague “it did not work.”

The completion standard is intentionally strong:

```text
inspect -> mutate -> observe save -> reopen -> verify persisted state
```

A toast, closed modal or successful click is not proof of persistence.

## Privacy and publication boundaries

The public repository contains source, launchers, configs, taxonomies, tests and documentation. It deliberately excludes:

- `.auth/` — authenticated browser state;
- `.state/` — checkpoints and remembered module URLs;
- `output/` — reports, screenshots and traces;
- `recordings/` — raw Codegen demonstrations;
- caches, dependencies and generated test artifacts;
- credentials, teacher-directory exports and restricted learner data.

The exact boundary is documented in [`PUBLISHING.md`](https://github.com/lookang/sls-playwright-automation/blob/main/PUBLISHING.md). This is not just repository hygiene: browser traces and screenshots can contain lesson or account-interface content even when the source code does not.

## Reproducing the project

### Windows

```powershell
git clone https://github.com/lookang/sls-playwright-automation.git
cd .\sls-playwright-automation
npm.cmd ci --cache .npm-cache
npm.cmd run check
npm.cmd test
npm.cmd run sls:auth
```

Start with the read-only smoke check:

```powershell
RUN-SLS-SMOKE-CHECK.cmd "SLS-MODULE-URL"
```

Run the main guarded workflow:

```powershell
RUN-SLS-AUTOMATION.cmd "SLS-MODULE-URL"
```

Review ACP candidates without changing SLS:

```powershell
RUN-SLS-ACPINTERACTIVE.cmd --dry-run "SLS-MODULE-URL"
```

Run one deliberately capped ACP trial:

```powershell
RUN-SLS-ACPINTERACTIVE.cmd --apply --max-interactives 1 "SLS-MODULE-URL"
```

### macOS

```bash
git clone https://github.com/lookang/sls-playwright-automation.git
cd sls-playwright-automation
chmod +x ./*.command ./scripts/run-macos.sh
./00-install-and-check.command
./01-authenticate-sls.command
./RUN-SLS-SMOKE-CHECK.command "SLS-MODULE-URL"
```

The public repository is evolving. Read its current README and launcher text before a write run, especially when comparing the published package with a newer local working revision.

## Repository map for developers

- [Playwright automation repository](https://github.com/lookang/sls-playwright-automation)
- [SLS finalization skill](https://github.com/lookang/codexSkill/tree/main/sls-finalize-community-module)
- [Playwright README](https://github.com/lookang/sls-playwright-automation/blob/main/README.md)
- [Main launcher](https://github.com/lookang/sls-playwright-automation/blob/main/RUN-SLS-AUTOMATION.cmd)
- [Selected workflow launcher](https://github.com/lookang/sls-playwright-automation/blob/main/RUN-SLS-SELECTED.cmd)
- [Core SLS runner](https://github.com/lookang/sls-playwright-automation/blob/main/src/sls-runner.mjs)
- [Question evidence reader](https://github.com/lookang/sls-playwright-automation/blob/main/src/question-evidence.mjs)
- [Mathematics feature extractor](https://github.com/lookang/sls-playwright-automation/blob/main/src/math-features.mjs)
- [Question outcome tagger](https://github.com/lookang/sls-playwright-automation/blob/main/src/question-tagger.mjs)
- [ACP runner](https://github.com/lookang/sls-playwright-automation/blob/main/src/acp-interactive-runner.mjs)
- [Page-break runner](https://github.com/lookang/sls-playwright-automation/blob/main/src/page-break-runner.mjs)
- [Question-tag regression tests](https://github.com/lookang/sls-playwright-automation/blob/main/tests/question-tagger.test.mjs)
- [ACP regression tests](https://github.com/lookang/sls-playwright-automation/blob/main/tests/acp-interactive.test.mjs)
- [Publishing and privacy boundary](https://github.com/lookang/sls-playwright-automation/blob/main/PUBLISHING.md)

## Video and demonstration resources

- [What Happens When AI Feedback Meets an Interactive? Make Mathematics Visible](https://www.youtube.com/watch?v=GY5osFZ6ijA)
- [lookang AI YouTube channel](https://www.youtube.com/@lookang)
- [Demonstration SLS Community Gallery module](https://vle.learning.moe.edu.sg/community-gallery/module/view/7fce49d2-308e-4c31-a9d5-a0c6b4eaf814/module-plan)
- [iwant2study SLS Prompt Generator and Interactive Prompt Library](https://iwant2study.moe.edu.sg/lookangejss/promptLibrary/ai-prompt-library.html)

The video’s 3-minute-31-second sequence is:

- 00:00 — Is AI feedback enough?
- 00:14 — The strength and limit of text feedback
- 00:39 — Trying the problem as a learner
- 00:57 — How diagnostic feedback helps
- 01:23 — Making addition visible
- 01:55 — Varying the numbers
- 02:04 — Why the pattern generalises
- 02:22 — Using both tools intentionally
- 02:48 — Connecting representations
- 03:06 — The practical takeaway

## Technical and educational references

- Singapore Student Learning Space, [SLS—Designed for Learning](https://www.learning.moe.edu.sg/sls-designed-for-learning/)
- Singapore Student Learning Space, [About AI in SLS](https://www.learning.moe.edu.sg/ai-in-sls/about-ai-in-sls/)
- Singapore Student Learning Space, [Terms of Use](https://www.learning.moe.edu.sg/terms-of-use/)
- Playwright, [Locators](https://playwright.dev/docs/locators)
- Playwright, [Authentication](https://playwright.dev/docs/auth)
- Playwright, [Tracing API](https://playwright.dev/docs/api/class-tracing)
- Playwright, [Trace Viewer](https://playwright.dev/docs/trace-viewer)
- Playwright, [Command line and Codegen](https://playwright.dev/docs/test-cli)
- Node.js, [Test runner](https://nodejs.org/api/test.html)
- Tesseract.js, [JavaScript OCR](https://github.com/naptha/tesseract.js)
- OpenAI Developers, [Codex use cases](https://developers.openai.com/codex/use-cases)
- lookang, [Codex Skills repository](https://github.com/lookang/codexSkill)

## What this project taught me

The most important lesson was not “AI can automate SLS.” It was more precise:

> AI is most useful when its judgment is enclosed by evidence, deterministic execution, explicit mutation boundaries and observable verification.

The Mathematics Assistant and an interactive model also have complementary roles. Feedback can diagnose a learner’s current error. An interactive can make the underlying structure visible, let the learner vary quantities and support generalisation. The strongest sequence is not feedback **or** interaction, but:

```text
attempt -> feedback -> visualise -> vary -> try again
```

The same principle shaped the engineering. The Codex skill supplies adaptable judgment; Playwright makes the process repeatable; reports and tests make it accountable; the teacher remains responsible for the pedagogical and consequential decisions.

That is the kind of AI-assisted workflow worth building: not merely faster, but safer, clearer and easier to improve after every real classroom use.
