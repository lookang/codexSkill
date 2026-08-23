import fs from "node:fs/promises";
import path from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";
import { visiblePageContainsModuleTitle } from "./module-identity.mjs";
import {
  isSubstantiveCurriculumQuestion,
  loadDictionaries,
  levelToContentMap,
  proposeQuestionTag,
  questionStemFromSettingsCardText,
  resetDictionaries
} from "./question-tagger.mjs";
import { flattenMathml } from "./math-features.mjs";
import { createQuestionImageOcr, shouldUseImageOcr } from "./question-evidence.mjs";
import {
  inferCurriculumClues,
  contentMapSupportsStreams,
  rankContentMapOptions,
  rankLevelOptions,
  rankSubjectOptions
} from "./curriculum-discovery.mjs";
import {
  createRunPaths,
  loadCheckpoint,
  saveCheckpoint,
  saveJson,
  activityRowCount,
  normalizeActivityRowTitle,
  normalizeSectionDisplayTitle,
  buildOutcomePaths,
  unreviewedPlaceholders,
  PLACEHOLDER_MARKER,
  questionTagState,
  questionCarriesMap,
  subjectForContentMap,
  levelForContentMap
} from "./io.mjs";

const SLS_ORIGIN = "https://vle.learning.moe.edu.sg";
let expect = baseExpect.configure({ timeout: 15_000 });

export class GuardError extends Error {}

export async function runSlsWorkflow(config, options, shared = {}) {
  expect = baseExpect.configure({ timeout: options.timeoutMs });
  const paths = await createRunPaths(options, config.module.id);
  const checkpoint = await loadCheckpoint(paths.checkpointPath, config.module.id);
  const report = {
    schemaVersion: 1,
    mode: options.mode,
    startedAt: new Date().toISOString(),
    module: config.module,
    options: {
      deleteOriginals: options.deleteOriginals,
      renameCopies: options.renameCopies,
      headless: options.headless,
      startSection: options.startSection
    },
    inventory: null,
    sections: [],
    status: "running",
    error: null
  };

  let context;
  let browser;
  let page;
  let traceStopped = false;
  // A caller running several phases in a row can hand in its own browser and
  // context so one window serves the whole pipeline; whoever created them closes
  // them. Tracing still starts and stops per phase, so each phase keeps its own
  // trace file.
  const ownsBrowser = !shared.browser;
  const ownsContext = !shared.context;
  try {
    await assertAuthStateAvailable(options.authStatePath);
    browser = shared.browser ?? (await launchSlsBrowser(options));
    context = shared.context ?? (await createSlsContext(browser, options));
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(options.timeoutMs);
    page.setDefaultNavigationTimeout(Math.max(options.timeoutMs, 30_000));

    console.log(`Opening admin Module View for ${config.module.id}...`);
    await enterEditMode(page, config.module);
    await assertAuthenticated(page);
    console.log("Authenticated SLS session detected.");
    await assertModule(page, config.module);
    console.log(`Verified module ${config.module.id}; Edit mode is active.`);
    report.inventory = await inventoryModule(page);
    if (!report.module.title) report.module.title = report.inventory.title;
    console.log(`Found ${report.inventory.sectionCount} visible section entries.`);

    if (options.mode === "inspect") {
      report.status = "inspected";
    } else if (options.mode === "discover") {
      report.discovery = await discoverCurriculumTaxonomies(page, config, options);
      report.status = "discovered";
    } else if (options.mode === "scan") {
      await scanModule(page, config, report, options);
      report.status = "scanned";
    } else if (options.mode === "tag") {
      // Surgical tagging writes no section tags, but it still reads the section's
      // subject, level and content map to decide what to put on each question. A
      // placeholder there is not harmless: it produced questions tagged from
      // whatever dictionary happened to share the placeholder's name.
      // Surgical tagging chooses an official outcome per question from the
      // harvested dictionary. A broad 30-question quiz legitimately has no one
      // section outcome, so only Subject, Level and Content Map placeholders block
      // this mode; section/default outcome placeholders remain a replacement-pass
      // guard.
      const unreviewed = unreviewedPlaceholders(config).filter(
        (field) => !/\.outcome$/i.test(field)
      );
      if (unreviewed.length > 0) {
        throw new GuardError(
          `This config still holds scaffolded placeholders: ${unreviewed.join(", ")}. ` +
            "Run `npm run sls:scan` on this module first so the real subject, level and " +
            "content map are discovered. Nothing was written to SLS."
        );
      }
      options.tagQuestions = true;
      await tagModuleInPlace(page, config, report, options, checkpoint, paths.checkpointPath, paths.runDir);
      report.status = "tagged";
    } else if (options.mode === "harvest") {
      report.scan = await harvestModuleDictionaries(page, config, report, options);
      report.status = "harvested";
    } else {
      const unreviewed = unreviewedPlaceholders(config);
      if (unreviewed.length > 0) {
        throw new GuardError(
          `This config still holds scaffolded placeholders: ${unreviewed.join(", ")}. ` +
            "Run a scan to discover the real values, or paste them in by hand. " +
            "Nothing was written to SLS."
        );
      }
      let startReached = options.startSection == null;
      for (const section of config.sections) {
        if (!startReached && section.label.toUpperCase() === options.startSection) {
          startReached = true;
        }
        if (!startReached) continue;
        const sectionReport = await processSection({
          page,
          config,
          section,
          options,
          checkpoint,
          checkpointPath: paths.checkpointPath,
          runDir: paths.runDir
        });
        report.sections.push(sectionReport);
      }
      report.status = "applied";
    }
  } catch (error) {
    report.status = "stopped";
    report.error = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
    if (page) {
      await page.screenshot({
        path: path.join(paths.runDir, "failure.png"),
        fullPage: true
      }).catch(() => {});
    }
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await saveJson(paths.reportPath, report).catch(() => {});
    if (context) {
      await context.tracing.stop({ path: paths.tracePath }).then(() => {
        traceStopped = true;
      }).catch(() => {});
      if (ownsContext) await context.close().catch(() => {});
    }
    if (browser && ownsBrowser) await browser.close().catch(() => {});
    if (!traceStopped) {
      await fs.writeFile(
        path.join(paths.runDir, "trace-unavailable.txt"),
        "The browser closed before Playwright could finish the trace.\n",
        "utf8"
      ).catch(() => {});
    }
  }

  // The report is returned as well as written, so a caller running many modules in
  // one pass can summarise without re-reading each file off disk.
  return { ...paths, checkpointPath: paths.checkpointPath, report };
}

async function processSection({
  page,
  config,
  section,
  options,
  checkpoint,
  checkpointPath,
  runDir
}) {
  const sectionState = checkpoint.sections[section.label] ??= { activities: {} };
  const sectionReport = {
    label: section.label,
    title: section.title,
    id: section.id ?? null,
    outcome: section.outcome,
    activities: []
  };

  console.log(`[Section ${section.label}] ${section.title}`);
  const resolvedSection = await openSection(page, config, section);
  section.id = resolvedSection.id;
  sectionReport.id = resolvedSection.id;
  await ensureSectionOutcome(page, config, section);
  console.log(`  Learning outcome verified: ${section.outcome}`);
  sectionState.outcomeVerified = true;
  await saveCheckpoint(checkpointPath, checkpoint);

  for (const activity of section.activities) {
    const activityState = sectionState.activities[activity.title] ??= {
      completedQuestions: []
    };
    const activityReport = await processActivity({
      page,
      config,
      section,
      activity,
      options,
      activityState,
      checkpoint,
      checkpointPath,
      runDir
    });
    sectionReport.activities.push(activityReport);
  }
  return sectionReport;
}

async function processActivity({
  page,
  config,
  section,
  activity,
  options,
  activityState,
  checkpoint,
  checkpointPath,
  runDir
}) {
  const originalTitle = activity.title;
  const copyTitle = `${originalTitle} - Copy`;
  const activityReport = {
    originalTitle,
    copyTitle,
    originalId: activityState.originalId ?? null,
    copyId: activityState.copyId ?? activity.existingCopyId ?? null,
    questionCount: null,
    taggedQuestions: [],
    originalDeleted: false,
    renamed: false
  };
  console.log(`  Activity: ${originalTitle}`);

  await openSection(page, config, section);
  const originalMatch = await sidebarActivityMatch(page, originalTitle, section);
  const copyMatch = await sidebarActivityMatch(page, copyTitle, section);
  const originalCount = originalMatch.count;
  const copyCount = copyMatch.count;

  if (copyCount > 1 || originalCount > 1) {
    // More than one activity shares this title. Duplicating or renaming the wrong
    // one would be worse than doing nothing, so skip this activity and let the
    // rest of the module proceed; the report records why.
    console.log(
      `    Skipped: ${originalCount} activities named "${originalTitle}" and ${copyCount} named "${copyTitle}".`
    );
    activityReport.skipped = `ambiguous original/copy pair (${originalCount} originals, ${copyCount} copies)`;
    return activityReport;
  }

  if (
    copyCount === 0 &&
    originalCount === 1 &&
    activityState.renamed &&
    activityState.originalDeleted
  ) {
    activityState.copyUrl = await openSidebarActivity(page, originalTitle, section);
    activityState.copyId ??= activityIdFromUrl(activityState.copyUrl);
  } else if (copyCount === 0 && originalCount === 1) {
    const originalUrl = await openSidebarActivity(page, originalTitle, section);
    activityState.originalId = activityIdFromUrl(originalUrl);
    activityState.originalUrl = originalUrl;
    await duplicateCurrentActivity(page, originalTitle, copyTitle, section);
    activityState.copyCreated = true;
    await saveCheckpoint(checkpointPath, checkpoint);
  } else if (copyCount === 1 && originalCount === 0) {
    activityState.originalDeleted = true;
  } else if (copyCount === 0 && originalCount === 0) {
    throw new GuardError(`Neither an original nor a verified copy exists for ${originalTitle}.`);
  }

  await openSection(page, config, section);
  const copyNow = await sidebarActivityMatch(page, copyTitle, section);
  if (copyNow.count === 1) {
    const copyUrl = await openSidebarActivity(page, copyTitle, section);
    activityState.copyId = activityIdFromUrl(copyUrl);
    activityState.copyUrl = copyUrl;
  } else if (activityState.copyId) {
    const copyUrl = sectionActivityUrl(config, section.id, activityState.copyId);
    await openExactUrl(page, copyUrl);
    await assertAuthenticated(page);
  } else {
    throw new GuardError(`Cannot resolve the retained copy for ${originalTitle}.`);
  }

  activityReport.copyId = activityState.copyId;
  activityReport.originalId = activityState.originalId ?? null;
  const questionResult = await tagEveryQuestion({
    page,
    activity,
    section,
    activityState,
    checkpoint,
    checkpointPath,
    runDir,
    options
  });
  activityReport.questionCount = questionResult.count;
  activityReport.taggedQuestions = questionResult.ids;
  activityState.questionsVerified = true;
  await saveCheckpoint(checkpointPath, checkpoint);

  if (options.deleteOriginals && !activityState.originalDeleted) {
    await deleteVerifiedOriginal({
      page,
      config,
      section,
      originalTitle,
      copyTitle,
      activityState
    });
    activityState.originalDeleted = true;
    activityReport.originalDeleted = true;
    await saveCheckpoint(checkpointPath, checkpoint);
  } else {
    activityReport.originalDeleted = Boolean(activityState.originalDeleted);
  }

  if (options.renameCopies && activityState.originalDeleted) {
    await renameRetainedCopy({
      page,
      config,
      section,
      originalTitle,
      copyTitle,
      activityState
    });
    activityState.renamed = true;
    activityReport.renamed = true;
    await saveCheckpoint(checkpointPath, checkpoint);
  }

  await page.screenshot({
    path: path.join(runDir, `${section.label}-${safeName(originalTitle)}-complete.png`),
    fullPage: true
  });
  return activityReport;
}

async function tagEveryQuestion({
  page,
  activity,
  section,
  activityState,
  checkpoint,
  checkpointPath,
  runDir,
  options
}) {
  if (!activity.allowNoQuestions) {
    await page
      .locator('[id^="settings-card-"] svg[name="Settings24"]')
      .first()
      .waitFor({ state: "attached", timeout: 15000 });
    await page.waitForTimeout(500);
  }
  const questionIds = await listQuestionCardIds(page);
  if (activity.expectedQuestionCount != null && questionIds.length !== activity.expectedQuestionCount) {
    throw new GuardError(
      `${activity.title} has ${questionIds.length} questions; expected ${activity.expectedQuestionCount}.`
    );
  }
  if (questionIds.length === 0) {
    if (activity.allowNoQuestions) {
      console.log("    No native SLS question cards expected for this activity.");
      return { count: 0, ids: [] };
    }
    // Distinguish "this activity genuinely has no questions" from "the page did
    // not load". A video or text-only activity still renders components; an
    // activity that failed to load renders none. Only the latter is an error
    // worth stopping the whole module for.
    const rendered = await page
      .locator(".lesson-activity-component, .text-component, .media-component, .quiz-page, [id^=\"settings-card-\"]")
      .count()
      .catch(() => 0);
    if (rendered > 0) {
      console.log(
        `    No question cards in "${activity.title}" (${rendered} non-question components present); continuing.`
      );
      return { count: 0, ids: [], noQuestions: true };
    }
    throw new GuardError(
      `${activity.title} rendered no components at all, so its questions could not be read.`
    );
  }

  const cardDetails = await listQuestionCards(page);
  // FA-Math hydrates the custom <akit-interaction> only when its question scrolls
  // into view. Read and cache every stem before opening any settings modal: once a
  // modal is open, the overlay prevents later off-screen questions from hydrating,
  // which previously made Q2 onward look blank after each reload.
  const questionStems = await readQuestionStems(page, questionIds);
  const questionMetadata = await readQuestionMetadata(page);
  // Re-read per question rather than once per activity: a map harvested while
  // tagging one question must be available to the next, otherwise each question in
  // turn harvests the same syllabus again.
  const dictionariesFor = async () => (options.tagQuestions ? loadDictionaries(process.cwd()) : []);
  const previousChoices = [];
  for (let index = 0; index < questionIds.length; index += 1) {
    const questionId = questionIds[index];
    const details = cardDetails.find((card) => card.id === questionId);
    const facts = details ? questionMetadata.get(details.number) : null;
    const reviewedOutcomePrefix = details
      ? activity.reviewedOutcomePrefixes?.[String(details.number)] ?? null
      : null;
    const applyKeyword = Boolean(facts && facts.feedbackAssistant);
    // A question that awards marks is a real assessed question, so it belongs in
    // Learning Progress.
    const includeInProgress = Boolean(facts && facts.marks);
    console.log(`    Verifying question ${index + 1} of ${questionIds.length}...`);
    if (index > 0) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await assertAuthenticated(page);
    }
    // Which questions are worth tagging. An FA-Math question is always in scope.
    // A question a human has already tagged is left alone - we do not second-guess
    // their choice. Anything else in scope is tagged only if it is untagged, and a
    // reflective question ("How could I have answered this better?") drops out
    // further down anyway, because no mathematics can be read from it.
    const worthTagging = applyKeyword || !(facts && facts.alreadyTagged);
    if (options.tagQuestions && !worthTagging) {
      console.log(`      Question ${questionId} is already tagged (${facts.questionTags}); leaving it alone.`);
    }

    // In surgical mode one awkward question must not cost the rest of the activity:
    // a single question whose content map SLS will not offer previously aborted the
    // whole activity, leaving its other questions untouched. The replacement pass
    // keeps failing loudly, because there a half-finished activity is unsafe.
    const isolateFailures = options.mode === "tag";
    try {
      await ensureQuestionTags(page, {
        questionId,
        contentMap: section.contentMap,
        keyword: activity.questionKeyword,
        applyKeyword,
        includeInProgress,
        questionText: questionStems.get(questionId) || "",
        questionTags: facts ? facts.questionTags : "",
        sectionSubject: section.subject,
        sectionLevel: section.level,
        sectionContentMaps: section.contentMaps,
        activityTitle: activity.title,
        options,
        tagQuestions: options.tagQuestions && worthTagging,
        dictionaries: await dictionariesFor(),
        previousChoices,
        reviewedOutcomePrefix,
        onlyQuestion: options.tagOnlyQuestion
      });
    } catch (error) {
      if (!isolateFailures) throw error;
      console.log(`      Question ${questionId} could not be tagged: ${firstLine(error.message)}`);
    }
    if (!activityState.completedQuestions.includes(questionId)) {
      activityState.completedQuestions.push(questionId);
    }
    await saveCheckpoint(checkpointPath, checkpoint);
    await page.screenshot({
      path: path.join(runDir, `${section.label}-${questionId}-verified.png`),
      fullPage: false
    });
  }
  return { count: questionIds.length, ids: questionIds };
}


// Proposes an outcome from the mathematics in the question and appends it, using
// the levels the question is already tagged for to decide which content maps are
// even eligible. Runs with the question's settings modal already open. Skips and
// reviews are logged rather than acted on: a tie means the evidence does not
// single out one outcome, and guessing there is how wrong tags get written.
// Reads one question's own text.
//
// The activity page shows a settings card per question, and that card's title has
// the mathematics stripped out of it - "Q1 Solve ." for a question that plainly
// reads "Solve 7x = 3x + 8". The full text lives in ".question-body", which carries
// no question number of its own. A paginated activity mounts only its current page,
// so the reader visits every page before matching bodies to settings cards. Bodies
// sit inside
// "#component-<questionId>", which is what ties one back to its question.
export async function readOpenQuestionText(page, questionId) {
  return page
    .evaluate((id) => {
      const deepText = (root) => {
        let out = "";
        const walk = (node) => {
          if (!node) return;
          const tag = node.nodeName ? node.nodeName.toLowerCase() : "";
          if (tag === "style" || tag === "script") return;
          // The equation is a WIRIS <img>: a data-URI SVG carrying the original
          // MathML in an HTML comment, and no text nodes at all.
          if (tag === "img") {
            const alternative = node.getAttribute
              ? node.getAttribute("alt") || node.getAttribute("title") || ""
              : "";
            if (alternative) out += ` ${alternative} `;
            const src = node.getAttribute ? node.getAttribute("src") || "" : "";
            if (src.slice(0, 18) === "data:image/svg+xml") {
              try {
                const svg = decodeURIComponent(src.replace(/^data:image\/svg\+xml[^,]*,/, ""));
                const found = /<!--\s*MathML:\s*([\s\S]*?)-->/.exec(svg);
                if (found) out += ` ${found[1]} `;
              } catch {
                // A malformed data URI is not worth failing the run over.
              }
            }
            return;
          }
          if (node.nodeType === Node.TEXT_NODE) {
            out += ` ${node.nodeValue}`;
            return;
          }
          if (node.shadowRoot) walk(node.shadowRoot);
          for (const child of node.childNodes || []) walk(child);
        };
        walk(root);
        return out.replace(/\s+/g, " ").trim();
      };

      const component = document.querySelector(`#component-${id}`);
      if (!component) return "";
      // FA-Math question stems live in the first <akit-interaction> shadow root;
      // the second instance is the suggested solution. The old .question-body-only
      // selector returned an empty string for these questions.
      const interaction = Array.from(component.querySelectorAll("akit-interaction"))
        .find((element) => element.getClientRects().length > 0 && deepText(element));
      if (interaction) return deepText(interaction);
      // Multiple-choice answer options are part of the question evidence. They
      // often contain the discriminating physics concept (for example efficiency
      // or the direction of a magnetic force), while feedback and suggested
      // solutions are deliberately excluded.
      const bodies = Array.from(
        component.querySelectorAll(".question-body, .answer-options")
      ).filter(
        (element) => element.getClientRects().length > 0
      );
      // A component repeats its question in the suggested-answer block, so the same
      // equation arrives twice. Duplicates change no feature but make the log
      // unreadable.
      return [...new Set(bodies.map(deepText).filter(Boolean))].join(" ");
    }, questionId)
    .catch(() => "");
}

function standardActivityPageButtons(page) {
  return page.locator(
    ".activity-navigator .activity-navigator-button.page-button > button:visible",
  );
}

function quizQuestionPageButtons(page) {
  return page.locator(".quiz-navigator-button.page-button:visible");
}

async function isQuestionPageSelected(button) {
  const parentClass = (await button.locator("..").getAttribute("class").catch(() => "")) || "";
  const ownClass = (await button.getAttribute("class").catch(() => "")) || "";
  return (
    (await button.getAttribute("aria-current").catch(() => null)) === "page" ||
    /(^|\s)(active|selected)(\s|$)/i.test(`${ownClass} ${parentClass}`)
  );
}

async function selectQuestionPage(page, kind, index) {
  const buttons = kind === "activity" ? standardActivityPageButtons(page) : quizQuestionPageButtons(page);
  const count = await buttons.count();
  if (index < 0 || index >= count) return false;
  const button = buttons.nth(index);
  if (!(await isQuestionPageSelected(button))) await button.click();
  const parameter = kind === "activity" ? "pageNo" : "quizPage";
  const expectedValue = kind === "activity" ? String(index + 1) : String(index);
  await expect
    .poll(async () => {
      const currentButtons = kind === "activity" ? standardActivityPageButtons(page) : quizQuestionPageButtons(page);
      const current = currentButtons.nth(index);
      if ((await current.count()) === 0) return false;
      const selected = await isQuestionPageSelected(current);
      const value = new URL(page.url()).searchParams.get(parameter);
      return selected || value === expectedValue;
    })
    .toBe(true);
  await page.waitForTimeout(450);
  return true;
}

async function readHydratedQuestionText(page, questionId) {
  const component = page.locator(`#component-${questionId}`);
  if ((await component.count()) === 0 || !(await component.isVisible().catch(() => false))) return "";
  await component.scrollIntoViewIfNeeded().catch(() => {});
  let text = "";
  // The page button and URL update before FA-Math's <akit-interaction> has
  // hydrated. Poll the actual question evidence instead of assuming a short
  // fixed pause is enough on every network connection.
  await expect
    .poll(
      async () => {
        text = await readOpenQuestionText(page, questionId);
        return Boolean(text);
      },
      { timeout: 12_000, intervals: [250, 400, 650, 1_000] },
    )
    .toBe(true)
    .catch(() => {});
  return text;
}

async function visibleMountedQuestionIds(page, questionIds) {
  return page
    .evaluate((ids) =>
      ids.filter((id) => {
        const component = document.getElementById(`component-${id}`);
        return Boolean(component && component.getClientRects().length > 0);
      }), questionIds)
    .catch(() => []);
}

async function visibleMountedQuestionCount(page, questionIds) {
  return (await visibleMountedQuestionIds(page, questionIds)).length;
}

async function ocrQuestionImages(page, questionId, ocr) {
  const component = page.locator(`#component-${questionId}`);
  const images = component.locator("img:visible");
  const eligible = [];
  for (let index = 0; index < (await images.count()); index += 1) {
    const image = images.nth(index);
    const facts = await image
      .evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        src: element.getAttribute("src") || "",
        width: element.getBoundingClientRect().width,
      }))
      .catch(() => null);
    if (
      facts &&
      facts.width >= 100 &&
      facts.height >= 50 &&
      !facts.src.startsWith("data:image/svg+xml")
    ) {
      eligible.push(image);
    }
  }
  if (eligible.length === 0) return "";

  const recovered = [];
  for (const image of eligible.slice(0, 3)) {
    const buffer = await image.screenshot({ animations: "disabled", type: "png" }).catch(() => null);
    if (!buffer) continue;
    const result = await ocr.recognize(buffer).catch(() => null);
    if (result?.text && result.confidence >= 35) {
      recovered.push(result.text);
      console.log(`      Local OCR read diagram text (${Math.round(result.confidence)}% confidence).`);
    }
  }
  return [...new Set(recovered)].join(" ");
}

export async function readQuestionStems(page, questionIds, { enableOcr = true } = {}) {
  const stems = new Map();
  const pending = new Set(questionIds);
  const originalUrl = new URL(page.url());
  const activityPageCount = await standardActivityPageButtons(page).count();
  const quizPageCount = await quizQuestionPageButtons(page).count();
  const ocr = createQuestionImageOcr();

  const collectMountedQuestions = async ({ waitForNewPage = false } = {}) => {
    if (waitForNewPage && pending.size > 0) {
      // SLS may leave the preceding page mounted while the next page request is
      // in flight. Waiting for a still-pending component prevents us from reading
      // the old page, advancing immediately, and later declaring Q2 onward blank.
      await expect
        .poll(
          () => visibleMountedQuestionCount(page, [...pending]),
          { timeout: 12_000, intervals: [250, 400, 650, 1_000] },
        )
        .toBeGreaterThan(0)
        .catch(() => {});
    }
    for (const questionId of [...pending]) {
      const text = await readHydratedQuestionText(page, questionId);
      if (!text) continue;
      let completeText = text;
      if (enableOcr && shouldUseImageOcr(text)) {
        const imageText = await ocrQuestionImages(page, questionId, ocr);
        if (imageText) completeText = `${text} [Diagram OCR: ${imageText}]`;
      }
      stems.set(questionId, completeText);
      pending.delete(questionId);
    }
  };

  try {
    if (activityPageCount > 0) {
      for (let index = 0; index < activityPageCount; index += 1) {
        await selectQuestionPage(page, "activity", index);
        await collectMountedQuestions({ waitForNewPage: true });
      }
    } else if (quizPageCount > 0) {
      for (const questionId of questionIds) {
        const cardText = await page
          .locator(`#settings-card-${questionId}`)
          .innerText()
          .catch(() => "");
        const number = /^\s*Q(\d+)\b/i.exec(cardText)?.[1];
        const pageIndex = number ? Number(number) - 1 : -1;
        if (pageIndex >= 0 && pageIndex < quizPageCount) {
          await selectQuestionPage(page, "quiz", pageIndex);
          await collectMountedQuestions({ waitForNewPage: true });
        }
      }
    } else {
      await collectMountedQuestions();
    }

    for (const questionId of pending) {
      // A Quiz renders one question body at a time, while its settings sidebar
      // exposes all Q1..Q30 headings at once. Those headings contain the complete
      // stem and are the authoritative fallback for off-page quiz questions.
      const cardText = await page
        .locator(`#settings-card-${questionId}`)
        .innerText()
        .catch(() => "");
      const text = questionStemFromSettingsCardText(cardText);
      if (text) stems.set(questionId, text);
    }
  } finally {
    const originalActivityPage = Number(originalUrl.searchParams.get("pageNo") || "1") - 1;
    const originalQuizPage = Number(originalUrl.searchParams.get("quizPage") || "0");
    if (activityPageCount > 0) await selectQuestionPage(page, "activity", originalActivityPage).catch(() => {});
    else if (quizPageCount > 0) await selectQuestionPage(page, "quiz", originalQuizPage).catch(() => {});
    await ocr.terminate();
  }
  return stems;
}

// A question offers no content maps until it has a Subject and Level: the three
// controls cascade, and an untagged question starts with all three empty. Reaching
// straight for the content map found an empty dropdown, and the "options actually
// offered" report then listed leftovers from another control, which is why the
// failure looked like SLS refusing a map it should have had.
//
// Only ever writes into an empty row. Typing over a pair somebody already set would
// change their tagging, which this tool never does.
async function ensureQuestionSubjectLevel(page, { subject, level, questionId }) {
  const subjects = page.getByPlaceholder("Select Subject", { exact: true });
  const levels = page.getByPlaceholder("Select Level", { exact: true });
  if ((await subjects.count()) === 0 || !subject || !level) return false;

  const valueAt = async (locator, row) => (await locator.nth(row).inputValue().catch(() => "")).trim();

  for (let row = 0; row < (await subjects.count()); row += 1) {
    if ((await valueAt(subjects, row)).includes(subject) && (await valueAt(levels, row)).includes(level)) {
      return true;
    }
  }

  const emptyRow = async () => {
    for (let row = 0; row < (await subjects.count()); row += 1) {
      if (!(await valueAt(subjects, row)) && !(await valueAt(levels, row))) return row;
    }
    return -1;
  };

  let target = await emptyRow();
  if (target === -1) {
    const add = page.getByRole("button", { name: /^ADD SUBJECT AND LEVEL$/i }).first();
    if ((await add.count()) > 0) {
      await add.click().catch(() => {});
      await page.waitForTimeout(900);
      target = await emptyRow();
    }
  }
  if (target === -1) {
    throw new GuardError(
      `Question ${questionId}: every Subject and Level row is already filled, and no empty one could be added.`
    );
  }

  console.log(`         setting subject "${subject}" and level "${level}" first...`);
  await selectComboboxOption(page, subjects.nth(target), subject);
  await page.waitForTimeout(700);
  await selectComboboxOption(page, levels.nth(target), level);
  await page.waitForTimeout(1000);
  return true;
}

async function appendProposedOutcome(page, {
  questionId,
  questionText,
  questionTags,
  dictionaries: initialDictionaries,
  previousChoices,
  onlyQuestion,
  reviewedOutcomePrefix,
  sectionContentMap,
  sectionContentMaps,
  sectionSubject,
  sectionLevel,
  activityTitle,
  options
}) {
  let dictionaries = initialDictionaries;
  const levelCombos = page.getByPlaceholder("Select Level", { exact: true });
  const levels = [];
  for (let row = 0; row < (await levelCombos.count()); row += 1) {
    const value = (await levelCombos.nth(row).inputValue().catch(() => "")).trim();
    if (value) levels.push(value);
  }
  const allowedContentMaps = [...new Set(levels.map(levelToContentMap).filter(Boolean))];

  // Primary levels name their content map ("Primary 4" -> "Pri 4 Mathematics
  // (2021)"). Secondary ones do not: "Secondary 1" does not say whether the
  // syllabus is G1, G2 or G3, nor which year's revision, and guessing would tag
  // against the wrong syllabus. The section itself already answers it - it carries
  // the content map this module is written against - so use that, but only if it
  // has actually been harvested.
  const configuredMaps = Array.isArray(sectionContentMaps) ? sectionContentMaps.filter(Boolean) : [];
  if (allowedContentMaps.length === 0 && configuredMaps.length === 0 && sectionContentMap) {
    // With no configured list, fall back to the section's single map - but only if
    // its syllabus has been harvested. When a list is configured the loop below
    // handles each map, harvesting any that is missing.
    const harvested = dictionaries.some(
      (entry) => entry.contentMap.toLowerCase() === sectionContentMap.toLowerCase()
    );
    if (harvested) {
      allowedContentMaps.push(sectionContentMap);
    } else {
      console.log(
        `      Question ${questionId}: no tag proposed (no dictionary harvested for "${sectionContentMap}"; run npm run sls:harvest).`
      );
      return;
    }
  }

  // No recognised level means no dictionary can be trusted for this question. An
  // empty allow-list reads as "unrestricted" downstream, which would let a
  // Secondary question take a Primary outcome, so stop here instead.
  if (allowedContentMaps.length === 0 && configuredMaps.length === 0) {
    console.log(
      `      Question ${questionId}: no tag proposed (no dictionary for level ${levels.join(", ") || "(none set)"}).`
    );
    return;
  }

  // A module written for two streams needs both tagged: "Sec 1 G2/G3" questions
  // carry a G3 pair and a G2 pair, each with its own content map. The config names
  // them; a single contentMap stays a list of one.
  const targets = configuredMaps.length > 0 ? configuredMaps : allowedContentMaps;

  let wrote = false;
  for (const target of targets) {
    const harvested =
      !options?.refreshTaxonomy &&
      dictionaries.some((entry) => entry.contentMap.toLowerCase() === String(target).toLowerCase());
    if (!harvested) {
      // Nothing in taxonomy/ describes this map. If this is a substantive assessed
      // question, read the syllabus straight off the tree the map renders and cache
      // it for every question after this one. This is deliberately subject-neutral:
      // conceptual Physics questions need not contain a mathematical operator.
      if (!isSubstantiveCurriculumQuestion(questionText, sectionSubject)) continue;
      console.log(`      Question ${questionId}: harvesting "${target}" from this question...`);
      const harvestedMap = await harvestMapFromQuestion(page, {
        contentMap: target,
        subject: subjectForContentMap(target, sectionSubject),
        level: levelForContentMap(target, sectionLevel),
        questionId
      }).catch((error) => {
        console.log(`         could not harvest: ${firstLine(error.message)}`);
        return null;
      });
      if (!harvestedMap || harvestedMap.outcomes.length === 0) {
        console.log(`         no outcomes found for "${target}"; leaving this question alone.`);
        continue;
      }
      const cachePath = taxonomyCachePath(process.cwd(), target);
      await saveJson(cachePath, { ...harvestedMap, harvestedAt: new Date().toISOString() });
      console.log(`         harvested ${harvestedMap.outcomes.length} outcomes; cached to ${path.relative(process.cwd(), cachePath)}.`);
      resetDictionaries();
      dictionaries = await loadDictionaries(process.cwd());
    }
    const applied = await applyContentMapToQuestion(page, {
      questionId,
      questionText,
      questionTags,
      dictionaries,
      previousChoices,
      onlyQuestion,
      contentMap: target,
      activityTitle,
      reviewedOutcomePrefix,
      sectionSubject,
      sectionLevel
    });
    wrote = wrote || applied;
  }

  if (wrote) {
    console.log("         saving the question.");
    await page.locator('button:has(svg[name="Save24"])').first().click();
    await assertNoSlsError(page);
    await page.waitForTimeout(1500);
  }
  return wrote;
}

// Harvests a content map that no section carries, by adding it to the question that
// needs it and reading the tree SLS then renders.
//
// A module can be written against a syllabus none of its sections is tagged with -
// the G2/G3 modules put the content map on the questions only - so there is nowhere
// else to read it from. The map is one this question is going to be tagged with
// anyway, so no extra change is made to reach it.
async function harvestMapFromQuestion(page, { contentMap, subject, level, questionId }) {
  // The question may already carry this map from an earlier run. Adding it again
  // finds an empty chooser - SLS does not offer a map that is already attached - so
  // read the tree of the row that is already there instead.
  const existing = page
    .getByRole("button", { name: new RegExp(`^${escapeRegExp(contentMap)} - \d+ selected$`) })
    .first();
  if ((await existing.count()) > 0) {
    return readMapTree(page, { contentMap });
  }

  await ensureQuestionSubjectLevel(page, { subject, level, questionId });

  let chooser = page.getByRole("button", { name: "Content Map", exact: true }).last();
  if ((await chooser.count()) === 0) {
    const addRow = page.getByRole("button", { name: /^ADD CONTENT MAP AND TOPIC$/i }).first();
    if ((await addRow.count()) > 0) {
      await addRow.click().catch(() => {});
      await page.waitForTimeout(1200);
      chooser = page.getByRole("button", { name: "Content Map", exact: true }).last();
    }
  }
  if ((await chooser.count()) === 0) return null;

  await chooser.click();
  const combo = page.getByPlaceholder("Select Content Map", { exact: true }).last();
  await selectComboboxOption(page, combo, contentMap);
  await page.waitForTimeout(1200);
  return readMapTree(page, { contentMap });
}

// Expands one content map's tree, with every other map collapsed, and reads it.
async function readMapTree(page, { contentMap }) {
  // Another map's tree left open would be read as part of this one: that is how a
  // 42-outcome syllabus arrived as 89 outcomes carrying a second syllabus's branch
  // names, which then matched nothing when the outcome came to be ticked.
  for (const other of await page.getByRole("button", { name: /- \d+ selected$/ }).all()) {
    const label = (await other.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (label.startsWith(contentMap)) continue;
    if ((await other.getAttribute("aria-expanded").catch(() => null)) === "true") {
      await other.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  const treeRows = page.locator("ul.tree-list li.tree-row:visible");
  if (!(await treeRows.first().isVisible().catch(() => false))) {
    const summary = page
      .getByRole("button", { name: new RegExp(`^${escapeRegExp(contentMap)} - \d+ selected$`) })
      .first();
    if ((await summary.count()) > 0) {
      await summary.click().catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  if (!(await treeRows.first().isVisible().catch(() => false))) return null;

  for (let pass = 1; pass <= 400; pass += 1) {
    const rows = await readTaxonomyRows(page);
    const next = rows.findIndex((row) => row.collapsed && !row.isOutcome);
    if (next === -1) break;
    const chevron = treeRows.nth(next).locator(".tree-row-item-icon-wrapper").first();
    try {
      await chevron.scrollIntoViewIfNeeded({ timeout: 5_000 });
      await chevron.click({ timeout: 5_000 });
    } catch (error) {
      // A long tree can place a chevron under a transient SLS overlay after the
      // scroll. Dispatch the same click once against the re-located wrapper; never
      // silently return a zero-outcome taxonomy from a half-expanded syllabus.
      const retry = treeRows.nth(next).locator(".tree-row-item-icon-wrapper").first();
      try {
        await retry.dispatchEvent("click");
      } catch {
        throw new GuardError(
          `Could not expand learning-objective branch "${rows[next].text.slice(0, 80)}": ${firstLine(error.message)}`
        );
      }
    }
    await page.waitForTimeout(250);
  }

  const rows = await readTaxonomyRows(page);
  const outcomes = buildOutcomePaths(rows);
  if (outcomes.length === 0) {
    throw new GuardError(`${contentMap} exposed a tree but no readable learning outcomes.`);
  }
  return { contentMap, rowCount: rows.length, outcomes };
}

// Applies one content map to the open question: proposes an outcome from that
// map's dictionary, sets the Subject and Level the map belongs to, adds the map
// and ticks the outcome. Returns true when something was written.
async function applyContentMapToQuestion(page, {
  questionId,
  questionText,
  questionTags,
  dictionaries,
  previousChoices,
  onlyQuestion,
  contentMap,
  activityTitle,
  reviewedOutcomePrefix,
  sectionSubject,
  sectionLevel
}) {
  // The activity title is the teacher's own description of the skill being
  // practised - "Find number of objects of a fractional part given whole" says far
  // more than a bare question can. It is used only to choose between outcomes,
  // never to decide whether a question is mathematical: a reflection prompt sitting
  // in a mathematics activity must still count as a reflection.
  const proposal = proposeQuestionTag(questionText, dictionaries, {
    allowedContentMaps: [contentMap],
    contextText: activityTitle ?? "",
    reviewedOutcomePrefix
  });
  if (proposal.decision === "skip") {
    console.log(`      Question ${questionId}: no tag proposed (${proposal.reason}).`);
    return false;
  }

  // Whether this question already carries the map, read from its own settings card.
  //
  // This used to search the whole page for a "<map> - N selected" button, which is
  // not specific to the question: a section tagged with the same content map puts
  // exactly that button on the page, so every question looked already-tagged and
  // none were ever tagged. The card's "Question Tags" field belongs to the question
  // and nothing else.
  if (questionCarriesMap(questionTags, proposal.contentMap)) {
    console.log(`      Question ${questionId}: ${proposal.contentMap} already present; leaving it alone.`);
    return false;
  }

  previousChoices.push({ contentMap: proposal.contentMap, outcome: proposal.outcome });
  console.log(
    `      Question ${questionId}: ${proposal.contentMap} -> ${proposal.outcome.slice(0, 56)}`
  );
  console.log(`         basis: ${proposal.basis}`);
  console.log(
    `         evidence: topics [${proposal.evidence.topics.join(", ") || "none"}], ` +
      `operations [${proposal.evidence.operations.join(", ") || "none"}], ` +
      `question "${proposal.evidence.question.slice(0, 120)}"`
  );

  if (onlyQuestion && String(onlyQuestion) !== String(questionId)) {
    console.log("         (not the nominated question; nothing written)");
    return false;
  }

  // Add the content map if the question has no row for it yet, otherwise open the
  // row it already has. Either way the outcome is ticked additively, and
  // selectOutcomeByPath refuses to touch anything already selected.
  let mapRow = page
    .getByRole("button", { name: new RegExp(`^${escapeRegExp(proposal.contentMap)} - \\d+ selected$`) })
    .first();
  if ((await mapRow.count()) === 0) {
    console.log("         adding the content map to this question...");
    // The control that adds a content map differs between the section editor and
    // the question modal, so report what this modal actually offers rather than
    // failing blind.
    let chooser = page.getByRole("button", { name: "Content Map", exact: true }).last();
    if ((await chooser.count()) === 0) {
      const addRow = page.getByRole("button", { name: /^ADD CONTENT MAP AND TOPIC$/i }).first();
      if ((await addRow.count()) > 0) {
        await addRow.click().catch(() => {});
        await page.waitForTimeout(1200);
        chooser = page.getByRole("button", { name: "Content Map", exact: true }).last();
      }
    }
    if ((await chooser.count()) === 0) {
      const offered = [];
      for (const button of await page.getByRole("button").all()) {
        if (!(await button.isVisible().catch(() => false))) continue;
        const name = (
          (await button.getAttribute("aria-label")) ||
          (await button.innerText().catch(() => "")) ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim();
        if (name) offered.push(name.slice(0, 54));
      }
      throw new GuardError(
        `Question ${questionId} exposed no Content Map control. Buttons in the modal: ` +
          [...new Set(offered)].join(" | ")
      );
    }
    // Subject and Level first, or the content map list is empty.
    await ensureQuestionSubjectLevel(page, {
      subject: subjectForContentMap(proposal.contentMap, sectionSubject),
      level: levelForContentMap(proposal.contentMap, sectionLevel),
      questionId
    });

    await chooser.click();
    const combo = page.getByPlaceholder("Select Content Map", { exact: true }).last();
    await selectComboboxOption(page, combo, proposal.contentMap);
    await page.waitForTimeout(900);
    mapRow = page
      .getByRole("button", { name: new RegExp(`^${escapeRegExp(proposal.contentMap)} - \\d+ selected$`) })
      .first();
  }

  // With two content maps on one question, both trees can be open at once and the
  // rows are read from the page as a whole - so the outcome for the second map was
  // looked up in the first map's tree and ticked nothing, leaving it "0 selected".
  // Collapse every other map so the visible rows belong to this one alone.
  const others = await page.getByRole("button", { name: /- \d+ selected$/ }).all();
  for (const other of others) {
    const label = (await other.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (label.startsWith(proposal.contentMap)) continue;
    if ((await other.getAttribute("aria-expanded").catch(() => null)) === "true") {
      await other.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  const treeRows = page.locator("ul.tree-list li.tree-row:visible");
  if ((await mapRow.count()) > 0 && (await mapRow.getAttribute("aria-expanded").catch(() => null)) !== "true") {
    await mapRow.click().catch(() => {});
    await page.waitForTimeout(1200);
  } else if (!(await treeRows.first().isVisible().catch(() => false)) && (await mapRow.count()) > 0) {
    await mapRow.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  await expect(treeRows.first()).toBeVisible();

  await selectOutcomeByPath(page, {
    label: `question ${questionId}`,
    contentMap: proposal.contentMap,
    outcomePath: proposal.outcomePath,
    outcome: proposal.outcome
  });

  const commit = page.getByRole("button", { name: /^ADD CONTENT MAP AND TOPIC$/i }).first();
  if (await commit.isVisible().catch(() => false)) await commit.click();
  await assertNoSlsError(page);
  console.log(`         ${proposal.contentMap} added.`);
  // Saving closes the panel, so it cannot happen here: a question tagged against
  // two syllabuses needs both maps applied while the panel is still open. The
  // caller saves once, after every map has been added.
  return true;
}

async function ensureQuestionTags(page, {
  questionId,
  contentMap,
  keyword,
  applyKeyword,
  includeInProgress,
  questionText,
  questionTags,
  sectionSubject,
  sectionLevel,
  sectionContentMaps,
  activityTitle,
  options,
  tagQuestions,
  dictionaries,
  previousChoices,
  reviewedOutcomePrefix,
  onlyQuestion
}) {
  let card = page.locator(`#settings-card-${questionId}`);
  await expect(card, `Question card ${questionId} must exist`).toBeVisible();
  await openQuestionSettings(card, page);

  // Read the question itself before deciding anything. The settings card shows a
  // title with the mathematics stripped out ("Q1 Solve ."), and both decisions
  // below - Learning Progress and which outcome to propose - depend on what the
  // question actually asks.
  // The tagging area renders a moment after the panel opens. Deciding before it
  // does makes an already-attached content map look missing - the run then tries to
  // add a map SLS will not offer twice, and reports either an empty dropdown or a
  // missing Content Map control while the tag is sitting right there.
  await page
    .getByRole("button", { name: /^ADD CONTENT MAP AND TOPIC$|^Content Map$|- \d+ selected$/ })
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(600);

  // Prefer the stem cached while its component was deliberately scrolled into
  // view. A fresh read is still useful for ordinary non-lazy question types.
  const openText = questionText || (await readOpenQuestionText(page, questionId));
  // Only the live question stem is evidence for outcome tagging. The metadata text
  // contains drawer labels and suggested answers, and previously allowed an empty
  // stem to be replaced silently by an activity title.
  const fullText = openText.trim();
  if (openText) {
    console.log(`      Question ${questionId} reads: "${flattenMathml(openText).slice(0, 80)}"`);
  } else {
    console.log(`      Question ${questionId}: question body could not be read; no outcome will be added.`);
  }
  const curriculumQuestion = isSubstantiveCurriculumQuestion(fullText, sectionSubject);

  // A question that awards marks is a real assessed question, so it is included in
  // Learning Progress. Anything else is left exactly as the author set it, and the
  // box is never unticked - only ever ticked when it should be on and is not.
  const progress = page.locator("#question-include-in-content-mastery-checkbox");
  await expect(progress).toBeVisible();
  // Awarding marks is not enough on its own. A reflection prompt can carry a mark
  // and is still not a mathematics question, and putting it into Learning Progress
  // would count it towards a pupil's mastery of the syllabus. It has to be both.
  // The box is still never unticked - only ever ticked when it should be on.
  if (includeInProgress && !curriculumQuestion) {
    console.log(
      `      Question ${questionId} awards marks but is reflective or unreadable; left out of Learning Progress.`
    );
  } else if (includeInProgress && !(await progress.isChecked())) {
    await page
      .locator('label[for="question-include-in-content-mastery-checkbox"]')
      .filter({ hasText: "Include in Learning Progress" })
      .click()
      .catch(() => {});
    await expect(progress).toBeChecked();
    console.log(`      Question ${questionId} awards marks; included in Learning Progress.`);
  }

  const mapRow = page.getByRole("button", {
    // Any number of topics may be selected: tagging only ever appends, so a
    // question that a human already tagged will show more than one.
    name: new RegExp(`^${escapeRegExp(contentMap)} - \\d+ selected$`)
  });
  // If the question carries this content map, confirm it is still there (we never
  // strip a tag). If it carries none at all - common for FA-Math prompts, which
  // show "Question Tags -" - there is nothing to retain, so leave it be and carry
  // on rather than failing the whole module.
  if ((await mapRow.count()) === 0) {
    console.log(`      Question ${questionId} has no ${contentMap} tag; leaving its tags unchanged.`);
  } else {
    await expect(mapRow, `Question ${questionId} must retain ${contentMap}`).toBeVisible();
  }

  // Only questions using Feedback Assistant - Mathematics carry the keyword. On
  // any other question type the keyword is not added, and an existing one is
  // still never removed.
  if (tagQuestions) {
    await appendProposedOutcome(page, {
      questionId,
      questionText: fullText,
      questionTags,
      dictionaries,
      previousChoices,
      reviewedOutcomePrefix,
      onlyQuestion,
      sectionContentMap: contentMap,
      sectionContentMaps,
      sectionSubject,
      sectionLevel,
      activityTitle,
      options
    });
  }

  const modalKeywordArea = page.locator(".keywords").first();
  if (applyKeyword) {
    const keywordText = await modalKeywordArea.innerText().catch(() => "");
    if (!keywordText.includes(keyword)) {
      const input = page.getByPlaceholder("Add descriptive tags for others to find it", { exact: true });
      await input.fill(keyword);
      await input.press("Enter");
      await expect(modalKeywordArea).toContainText(keyword);
    }
  } else {
    console.log(`      Question ${questionId} has no Feedback Assistant; no keyword tag added.`);
  }

  await page.locator('button:has(svg[name="Save24"])').click();
  await assertNoSlsError(page);
  await page.waitForTimeout(700);
  await page.locator("svg.btn-close").click();
  await expect(progress).toBeHidden();

  await page.reload({ waitUntil: "domcontentloaded" });
  await assertAuthenticated(page);
  card = page.locator(`#settings-card-${questionId}`);
  if (applyKeyword) await expect(card).toContainText(keyword);

  await openQuestionSettings(card, page);
  if (applyKeyword) await expect(page.locator(".keywords").first()).toContainText(keyword);
  if (includeInProgress && curriculumQuestion) {
    await expect(
      page.locator("#question-include-in-content-mastery-checkbox"),
      `Question ${questionId} must retain Include in Learning Progress after save and reopen`
    ).toBeChecked();
  }
  await page.locator("svg.btn-close").click();
}

async function openQuestionSettings(card, page) {
  const button = card.locator('button:has(svg[name="Settings24"])');
  await expect(button).toHaveCount(1);
  await expect(button).toBeVisible();
  await button.dispatchEvent("click");
  await expect(page.locator("#question-include-in-content-mastery-checkbox")).toBeVisible();
}


// Walks the configured branch path and ticks the outcome, additively:
//  * a branch already open is left open (clicking would collapse it)
//  * an outcome already ticked is left alone (clicking would UNTICK it, stripping
//    a tag a human may have set deliberately)
// Rows are matched on text *and* depth, because branch names repeat across the
// tree - P5 has "Four operations" under both Whole Numbers and Fractions.
async function selectOutcomeByPath(page, section) {
  const steps = [
    ...section.outcomePath.map((text, depth) => ({ text, depth, label: "Content map branch" })),
    { text: section.outcome, depth: section.outcomePath.length, label: "Learning outcome" }
  ];

  for (const step of steps) {
    const rows = await readTaxonomyRows(page);
    let index = rows.findIndex((row) => row.text === step.text && row.depth === step.depth);
    if (index === -1) index = rows.findIndex((row) => row.text === step.text);
    if (index === -1) {
      const panel = await page.locator("main").innerText().catch(() => "");
      throw new GuardError(
        [
          `Section ${section.label}: ${step.label} "${step.text}" was not offered by SLS.`,
          "Copy the exact wording from the panel text below into the config:",
          "----- tagging panel text -----",
          panel.slice(0, 3000),
          "------------------------------"
        ].join(String.fromCharCode(10))
      );
    }

    const row = rows[index];
    const locator = page.locator("ul.tree-list li.tree-row:visible").nth(index);
    if (row.isOutcome) {
      if (row.selected) {
        console.log(`    Outcome "${step.text}" is already tagged; leaving it untouched.`);
        continue;
      }
      await locator.locator(".input-checkbox").first().click();
    } else if (row.collapsed) {
      await locator.locator(".tree-row-item-icon-wrapper").first().click();
    }
    await page.waitForTimeout(500);
  }
}


// A row counts as empty only when both its Subject and Level are blank.
async function emptySubjectLevelRow(subjectCombos, levelCombos) {
  const rows = await subjectCombos.count();
  for (let row = 0; row < rows; row += 1) {
    const subject = (await subjectCombos.nth(row).inputValue().catch(() => "")).trim();
    const level = (await levelCombos.nth(row).inputValue().catch(() => "")).trim();
    if (!subject && !level) return row;
  }
  return -1;
}

// SLS warns before discarding linked content maps and outcomes. That is never
// acceptable here: back out of the dialog without confirming and stop, rather
// than clicking through a prompt whose whole purpose is to delete tagging.
async function assertNoDestructiveTagWarning(page) {
  const warning = page
    .locator(".bx--modal.is-visible")
    .filter({ hasText: /will remove all linked/i })
    .first();
  if ((await warning.count()) === 0) return;

  const cancel = warning.getByRole("button", { name: /cancel|no|back|close/i }).first();
  if ((await cancel.count()) > 0) {
    await cancel.click().catch(() => {});
  } else {
    await page.keyboard.press("Escape").catch(() => {});
  }
  throw new GuardError(
    "SLS warned that changing Subject and Level would remove all linked outcomes. " +
    "Backed out without confirming; no tagging was changed."
  );
}

// True when the open tagging editor shows both a completed Subject/Level row and
// at least one content map with a selection ("<map> - N selected", N >= 1).
async function sectionAlreadyTagged(page) {
  const subjectCombos = page.getByPlaceholder("Select Subject", { exact: true });
  const levelCombos = page.getByPlaceholder("Select Level", { exact: true });
  const rows = await subjectCombos.count();
  let hasSubjectLevel = false;
  for (let row = 0; row < rows; row += 1) {
    const subject = (await subjectCombos.nth(row).inputValue().catch(() => "")).trim();
    const level = (await levelCombos.nth(row).inputValue().catch(() => "")).trim();
    if (subject && level) {
      hasSubjectLevel = true;
      break;
    }
  }
  if (!hasSubjectLevel) return false;

  const selectedMaps = page.getByRole("button", { name: /- [1-9]\d* selected$/ });
  return (await selectedMaps.count()) > 0;
}

async function ensureSectionOutcome(page, config, section) {
  const sectionUrl = sectionUrlFor(config, section.id);
  await openExactUrl(page, sectionUrl);
  await assertAuthenticated(page);
  if (await sectionOutcomeIsPersisted(page, section)) return;

  const component = page.locator(`#component-${section.id}`);
  await expect(component).toBeVisible();
  await dismissVisibleShellOverlay(page);
  await component.click();
  await openSectionTagsEditor(page, section);

  // If a human has already tagged this section - a subject and level, plus at
  // least one selected content-map outcome - leave it exactly as it is and move
  // on to the activities. Adding to somebody's existing tagging is not worth the
  // risk, and the activity work is what the run is really for.
  if (await sectionAlreadyTagged(page)) {
    console.log(`  Section ${section.label} is already tagged; leaving its tags untouched.`);
    return;
  }

  // A section can carry several Subject/Level rows plus one empty row for adding
  // another, so these locators match more than one input. Every existing row is
  // read to see whether the wanted pair is already there; if it is not, the empty
  // row at the end is filled in. Writing into the first row would overwrite a
  // tag somebody else set.
  const subjectCombos = page.getByPlaceholder("Select Subject", { exact: true });
  const levelCombos = page.getByPlaceholder("Select Level", { exact: true });
  const subjectRows = await subjectCombos.count();
  if (subjectRows === 0 || (await levelCombos.count()) === 0) {
    throw new GuardError(`Section ${section.label} did not expose Subject and Level controls.`);
  }

  let subjectLevelPresent = false;
  for (let row = 0; row < subjectRows; row += 1) {
    const subjectValue = await subjectCombos.nth(row).inputValue().catch(() => "");
    const levelValue = await levelCombos.nth(row).inputValue().catch(() => "");
    if (subjectValue.includes(section.subject) && levelValue.includes(section.level)) {
      subjectLevelPresent = true;
      break;
    }
  }

  if (!subjectLevelPresent) {
    // Only ever write into a genuinely empty row. Typing into a row that already
    // holds a value makes SLS treat it as a change and warn that it "will remove
    // all linked" content maps and outcomes - which would destroy tagging somebody
    // else set. If no empty row exists, ask SLS for one first.
    let target = await emptySubjectLevelRow(subjectCombos, levelCombos);
    if (target === -1) {
      await page.getByRole("button", { name: "Add Subject and Level", exact: true }).click();
      await page.waitForTimeout(900);
      target = await emptySubjectLevelRow(subjectCombos, levelCombos);
    }
    if (target === -1) {
      throw new GuardError(
        `Section ${section.label}: no empty Subject and Level row was available, so nothing was changed.`
      );
    }

    await selectComboboxOption(page, subjectCombos.nth(target), section.subject);
    await assertNoDestructiveTagWarning(page);
    await selectComboboxOption(page, levelCombos.nth(target), section.level);
    await assertNoDestructiveTagWarning(page);
    await page.getByRole("button", { name: "Add Subject and Level", exact: true }).click();
  }

  await openContentMapTree(page, section);
  await selectOutcomeByPath(page, section);
  await page.getByRole("button", { name: "Add Content Map and Topic", exact: true }).click();
  await assertNoSlsError(page);
  const commitTarget = page.locator(".page-nav-info.right:visible, .page-nav-info.left:visible").first();
  await expect(commitTarget).toBeVisible();
  const taggingSaved = page.waitForResponse((response) =>
    response.url().includes("/apis/resource/tagging/save/") && response.request().method() === "POST"
  );
  await commitTarget.click();
  await taggingSaved;
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await assertNoSlsError(page);

  if (!(await sectionOutcomeIsPersisted(page, section))) {
    throw new GuardError(`Section ${section.label} did not persist outcome ${section.outcome}.`);
  }
}

async function sectionOutcomeIsPersisted(page, section) {
  if (await visibleOutcomeExists(page, section.outcome)) return true;

  const component = page.locator(`#component-${section.id}`);
  if ((await component.count()) !== 1 || !(await component.isVisible())) return false;
  await dismissVisibleShellOverlay(page);
  await component.click();

  // Read the tagging tree itself rather than inferring from the section cover.
  // A section whose editor opens only via the pencil used to look untagged here,
  // so an already-correct section was re-tagged and then failed its own check.
  let persisted = false;
  try {
    await openSectionTagsEditor(page, section);
    await openContentMapTree(page, section);
    const rows = await readTaxonomyRows(page);
    persisted = rows.some((row) => row.text === section.outcome && row.selected);
  } catch {
    persisted = false;
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await assertAuthenticated(page);
  return persisted;
}

// In the narrow/windowed SLS editor the activity sidebar behaves as a temporary
// drawer. Navigating directly to another section can preserve that drawer in its
// open state, leaving header .ui-shell-overlay over the whole main canvas. The
// section component is visible underneath, but every ordinary click is intercepted
// until the drawer closes. Click the overlay itself (the same action as a person
// clicking outside the drawer), then verify it is genuinely gone before touching
// section metadata. This is not a force-click and never hides a modal or mutates
// lesson content.
export async function dismissVisibleShellOverlay(page) {
  const overlay = page.locator("header .ui-shell-overlay.is-visible:visible").first();
  if ((await overlay.count()) === 0 || !(await overlay.isVisible().catch(() => false))) return false;

  console.log("  Closing the open SLS navigation drawer before editing section metadata...");
  await overlay.click({ position: { x: 8, y: 8 }, timeout: 5_000 }).catch(async () => {
    // Some SLS builds attach the close handler to the drawer's visible pin
    // control instead of the overlay. Re-locate it after the failed click because
    // the header may have rerendered.
    const close = page.locator(".left-menu-pin .pin-control:visible").first();
    if ((await close.count()) > 0) await close.click({ timeout: 5_000 });
  });
  await expect(overlay).toBeHidden({ timeout: 5_000 });
  return true;
}

async function visibleOutcomeExists(page, outcome) {
  if ((await page.getByText(outcome, { exact: true }).count()) > 0) return true;
  const learningOutcomes = page.getByRole("button", { name: "Learning Outcomes", exact: true });
  if ((await learningOutcomes.count()) === 0) return false;
  await learningOutcomes.click();
  return (await page.getByText(outcome, { exact: true }).count()) > 0;
}

// These comboboxes are type-ahead. The Subject list alone holds over 400 entries and
// only a slice is rendered, so looking for an option by name in the unfiltered list
// finds nothing and reports "SLS did not offer it" about an option that is genuinely
// there. Typing the text filters the list down first, exactly as a person would.
async function selectComboboxOption(page, combo, optionText) {
  await combo.click();
  await combo.fill("").catch(() => {});
  await combo.type(String(optionText).slice(0, 40), { delay: 15 }).catch(async () => {
    await combo.fill(String(optionText)).catch(() => {});
  });
  await page.waitForTimeout(900);

  let option = page.getByRole("option", { name: optionText, exact: true });
  if ((await option.count()) === 0) {
    // Fall back to a case-insensitive exact match: SLS is not always consistent
    // about capitalisation between the summary text and the option itself.
    const wanted = String(optionText).replace(/\s+/g, " ").trim().toLowerCase();
    for (const candidate of await page.getByRole("option").all()) {
      const text = (await candidate.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      if (text.toLowerCase() === wanted) {
        option = candidate;
        break;
      }
    }
  }

  if ((await option.count()) === 0 && (await page.getByRole("option").count()) === 0) {
    // Nothing rendered at all usually means the list had not opened yet rather than
    // that the option is missing. Reopen and type again before giving up.
    await combo.click().catch(() => {});
    await page.waitForTimeout(700);
    await combo.fill("").catch(() => {});
    await combo.type(String(optionText).slice(0, 40), { delay: 20 }).catch(() => {});
    await page.waitForTimeout(1200);
    option = page.getByRole("option", { name: optionText, exact: true });
  }

  if ((await option.count()) === 0) {
    const offered = (await page.getByRole("option").allTextContents().catch(() => []))
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    throw new GuardError(
      `SLS did not offer the option "${optionText}" even after typing it. ` +
      `Options actually offered: ${offered.length ? offered.slice(0, 20).join(" | ") : "(none rendered)"}`
    );
  }
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await page.waitForTimeout(400);
}

// SLS renders section metadata in two states. An untagged section exposes a
// "Section Tags" button directly. A section that already carries learning
// outcomes renders a read-only card instead, whose hover pencil
// (div.edit-indicator, not a button) switches it into the same tagging editor.
async function openSectionTagsEditor(page, section) {
  const sectionTags = page.getByRole("button", { name: "Section Tags", exact: true });
  if ((await sectionTags.count()) === 1) {
    await sectionTags.click();
    return;
  }

  const pencil = page.locator(`#component-${section.id} .edit-indicator`).first();
  if ((await pencil.count()) === 0) {
    throw new GuardError(
      `Section ${section.label} exposed neither a Section Tags button nor an edit pencil; ` +
      "the metadata card may have failed to load."
    );
  }
  await pencil.scrollIntoViewIfNeeded();
  await pencil.click().catch(async () => {
    await pencil.dispatchEvent("click");
  });

  await expect(sectionTags).toBeVisible();
  await sectionTags.click();
}

async function clickTaxonomyOption(page, section, text, label) {
  const option = page.getByText(text, { exact: true });
  const count = await option.count();
  if (count === 0) {
    const panel = await page.locator("main").innerText().catch(() => "");
    throw new GuardError(
      [
        `Section ${section.label}: ${label} "${text}" was not offered by SLS.`,
        "Copy the exact wording from the panel text below into the config:",
        "----- tagging panel text -----",
        panel.slice(0, 3000),
        "------------------------------"
      ].join("\n")
    );
  }
  if (count > 1) {
    throw new GuardError(
      `Section ${section.label}: ${label} "${text}" matched ${count} elements; ` +
      "make the config wording more specific."
    );
  }
  await option.click();
}

async function duplicateCurrentActivity(page, originalTitle, copyTitle, section = null) {
  const sectionTitle = typeof section === "string" ? section : (section?.title ?? null);
  await clickOverflowMenuItem(page, originalTitle, "Duplicate Activity", sectionTitle);
  await expect
    .poll(async () => (await sidebarActivityMatch(page, copyTitle, section)).count)
    .toBe(1);
}

async function deleteVerifiedOriginal({
  page,
  config,
  section,
  originalTitle,
  copyTitle,
  activityState
}) {
  await openSection(page, config, section);
  const originals = await sidebarActivityMatch(page, originalTitle, section);
  const copies = await sidebarActivityMatch(page, copyTitle, section);
  if (originals.count === 0 && activityState.originalDeleted) return;
  if (originals.count !== 1 || copies.count !== 1) {
    throw new GuardError(`Deletion guard failed for ${originalTitle}: expected one original and one copy.`);
  }

  const originalUrl = await openSidebarActivity(page, originalTitle, section);
  const questionIds = await listQuestionCardIds(page);
  for (const questionId of questionIds) {
    const text = await page.locator(`#settings-card-${questionId}`).innerText();
    if (text.includes(section.contentMap)) {
      throw new GuardError(`Original ${originalTitle} unexpectedly contains tagged question ${questionId}.`);
    }
  }

  await clickOverflowMenuItem(page, originalTitle, "Delete", section.title);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Delete Activity?", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Delete Component?", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await assertNoSlsError(page);
  await page.waitForTimeout(900);

  await openSection(page, config, section);
  const remainingCopy = await sidebarActivityMatch(page, copyTitle, section);
  const remainingOriginal = await sidebarActivityMatch(page, originalTitle, section);
  if (remainingCopy.count !== 1 || remainingOriginal.count !== 0) {
    throw new GuardError(`Deletion result for ${originalTitle} is uncertain; inspect the trace.`);
  }
  activityState.originalId ??= activityIdFromUrl(originalUrl);
}

async function renameRetainedCopy({
  page,
  config,
  section,
  originalTitle,
  copyTitle,
  activityState
}) {
  await openSection(page, config, section);
  const copy = await sidebarActivityMatch(page, copyTitle, section);
  const clean = await sidebarActivityMatch(page, originalTitle, section);
  if (copy.count === 0 && clean.count === 1 && activityState.originalDeleted) return;
  if (copy.count !== 1) {
    throw new GuardError(`Cannot rename ${copyTitle}: exact retained copy was not found.`);
  }
  await openSidebarActivity(page, copyTitle, section);
  const mainTitle = page.locator("main").getByText(copyTitle, { exact: true }).first();
  await expect(mainTitle).toBeVisible();
  await mainTitle.click();
  const titleInput = page.locator("input.bx--text-input").first();
  await expect(titleInput).toBeVisible();
  await titleInput.fill(originalTitle);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForTimeout(900);
  await openExactUrl(page, modulePlanEditUrlFor(config));
  await openSection(page, config, section);
  const cleanAfter = await sidebarActivityMatch(page, originalTitle, section);
  const copyAfter = await sidebarActivityMatch(page, copyTitle, section);
  if (cleanAfter.count !== 1 || copyAfter.count !== 0) {
    throw new GuardError(`The clean title did not persist for ${originalTitle}.`);
  }
}

// Finds the one sidebar heading for a section. A module can carry two sections with
// exactly the same title - B and C both called "Finding Percentage Increase and
// Percentage Decrease" - so the title alone does not identify one. The section
// label does.
async function sectionHeadingLocator(page, section) {
  // Wait for the accordions before counting. Counting is instantaneous and does not
  // retry, so on a slow load it sees zero, skips the disambiguation below, and
  // leaves an ambiguous locator to fail later.
  await expect(page.locator("button.bx--accordion__heading").first()).toBeVisible();
  const byTitle = page.locator("button.bx--accordion__heading").filter({ hasText: section.title });

  const titleMatches = await byTitle.count();
  if (titleMatches <= 1) return byTitle;

  const labels = [];
  const matching = [];
  for (let index = 0; index < titleMatches; index += 1) {
    const candidate = byTitle.nth(index);
    const label = await candidate
      .locator("..")
      .locator(".section-label")
      .first()
      .getAttribute("data-section-icon-text")
      .catch(() => null);
    labels.push(label ?? "(no label)");
    if (label && normalize(label) === normalize(section.label ?? "")) matching.push(candidate);
  }
  if (matching.length !== 1) {
    throw new GuardError(
      `Section "${section.title}" matched ${titleMatches} headings and label "${section.label}" ` +
        `did not single one out. Labels present: ${labels.join(", ")}.`
    );
  }
  return matching[0];
}

async function openSection(page, config, section) {
  if (section.id) {
    await openExactUrl(page, sectionUrlFor(config, section.id));
  } else {
    await openExactUrl(page, modulePlanEditUrlFor(config));
    const heading = await sectionHeadingLocator(page, section);
    await expect(heading).toHaveCount(1);
    await heading.click();
    await expect(page).toHaveURL(/\/section\/\d+/);
  }
  await assertAuthenticated(page);
  await assertModule(page, config.module);
  const id = sectionIdFromUrl(page.url());
  if (!id) throw new GuardError(`Could not resolve section ID for ${section.title}.`);
  // SLS prefixes the section label and sometimes preserves an author-entered
  // numeric prefix too (for example "E. 5. Expressing..."). Compare the visible
  // heading after removing only those display prefixes; the remaining title must
  // still match exactly.
  const headings = page.locator(
    "main dl.field-set.title .output-text, main h1, main h2, main h3, " +
      "main h4, main h5, main h6, main span.title"
  );
  const wanted = normalizeSectionDisplayTitle(section.title);
  const visibleHeadings = [];
  let matched = false;
  for (let index = 0; index < await headings.count(); index += 1) {
    const heading = headings.nth(index);
    if (!(await heading.isVisible().catch(() => false))) continue;
    const text = (await heading.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    visibleHeadings.push(text);
    if (normalizeSectionDisplayTitle(text) === wanted) matched = true;
  }
  if (!matched) {
    throw new GuardError(
      `Opened section ${section.label}, but its visible heading did not match "${section.title}". ` +
        `Visible headings: ${visibleHeadings.join(" | ") || "(none)"}.`
    );
  }
  return { id, url: page.url() };
}

async function openSidebarActivity(page, title, section = null) {
  let match = await sidebarActivityMatch(page, title, section);
  if (match.count !== 1) {
    throw new GuardError(`Expected one sidebar activity named ${title}; found ${match.count}.`);
  }
  if (!(await match.locator.isVisible())) {
    const drawerControl = page.locator(".left-menu-pin .pin-control");
    if ((await drawerControl.count()) === 1 && (await drawerControl.isVisible())) {
      await drawerControl.click();
      await page.waitForTimeout(250);
      match = await sidebarActivityMatch(page, title, section);
    }
  }
  if (!(await match.locator.isVisible()) && section) {
    // Expand the section that owns this activity. Resolving the heading through
    // sectionHeadingLocator keeps this working when two sections share a title.
    const heading =
      typeof section === "string"
        ? page.locator("button.bx--accordion__heading").filter({ hasText: section })
        : await sectionHeadingLocator(page, section);
    await expect(heading).toHaveCount(1);
    if ((await heading.getAttribute("aria-expanded")) !== "true") {
      const toggle = heading.locator('button:has(svg[name="ArrowDown24"])');
      if ((await toggle.count()) === 1) {
        await toggle.click();
      } else {
        await heading.click();
      }
      await page.waitForTimeout(250);
    }
    match = await sidebarActivityMatch(page, title, section);
  }
  await expect(match.locator).toBeVisible();
  await match.locator.click();
  await expect(page).toHaveURL(/\/activity\/[^/?]+/);
  return page.url();
}

// The sidebar renders each section as an accordion item holding both its heading
// (button.bx--accordion__heading) and its activities (div.bx--accordion__content).
// Scoping to that item is what makes an activity lookup exact when two sections
// share a title and each holds an "Activity 1". Returns null when the section's
// item cannot be identified, so the caller falls back to the whole sidebar.
async function sectionActivityScope(page, section) {
  if (!section || typeof section !== "object" || !section.title) return null;
  try {
    const heading = await sectionHeadingLocator(page, section);
    return heading
      .locator("xpath=ancestor::li[contains(@class,'cv-accordion-item')][1]")
      .locator("div.bx--accordion__content");
  } catch {
    return null;
  }
}

export async function sidebarActivityMatch(page, title, section = null) {
  const sectionTitle = typeof section === "string" ? section : (section?.title ?? null);
  const scope = await sectionActivityScope(page, section);
  const root = scope ?? page;

  const rows = root.locator(".bx--side-nav__link-text");
  const matches = [];
  const wanted = normalizeActivityRowTitle(title);
  for (let index = 0; index < await rows.count(); index += 1) {
    const row = rows.nth(index);
    const label = normalizeActivityRowTitle(await row.innerText().catch(() => ""));
    if (label === wanted) matches.push(row);
  }
  const rawCount = matches.length;
  const fallback = rows.first();

  // Scoped to one section's content, the section heading is not among the matches,
  // so there is no heading/activity collision to correct for.
  if (scope) return { count: rawCount, locator: matches[0] ?? fallback };

  const count = activityRowCount(rawCount, title, sectionTitle);
  // On a collision the section heading is listed before its activities, so the
  // activity itself is the later match.
  const locator = count === 0
    ? fallback
    : count === rawCount
      ? matches[0]
      : matches[matches.length - 1];
  return { count, locator };
}

// The sidebar re-renders after each activity is processed. A locator captured by
// index before that re-render can end up pointing at a recycled, now-empty row,
// and clicking it opens nothing while still reporting a successful click. So
// re-resolve the menu on every attempt and confirm the options actually opened.
// Opening the menu and clicking an item must retry together. Two things go wrong
// independently: the sidebar re-renders between lookup and click, leaving a
// recycled empty row; and the popup can render partly off-screen, whereupon
// Playwright scrolls to reach the item and that scroll dismisses the popup.
// Centring the trigger first gives the popup room so no further scrolling is
// needed, and any failure closes the menu and starts over from a fresh lookup.
// Takes whatever is floating on top of a menu item out of the way.
//
// SLS pins a "Help us improve" launcher to the bottom-left of the viewport, which
// lands exactly on the last item - "Delete" - of an overflow menu opened near the
// foot of the sidebar. Playwright then refuses the click because a different
// element would receive it. Only floating chrome is hidden, never the menu itself,
// and everything is put back afterwards.
export function hideCoveringOverlays(element) {
  const hidden = [];
  for (let pass = 0; pass < 4; pass += 1) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) break;
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (!top || top === element || element.contains(top) || top.contains(element)) break;
    // The open menu is what we are trying to click; never hide that.
    if (top.closest(".bx--overflow-menu-options--open")) break;
    const style = window.getComputedStyle(top);
    const floating = style.position === "fixed" || style.position === "sticky";
    const blocker = floating ? top : top.closest("[class*='feedback'], [class*='float'], [class*='fab']") || top;
    blocker.setAttribute("data-sls-hidden-overlay", "1");
    blocker.style.setProperty("display", "none", "important");
    hidden.push((blocker.innerText || blocker.className || blocker.tagName).toString().replace(/\s+/g, " ").trim().slice(0, 40));
  }
  return hidden;
}

async function restoreHiddenOverlays(page) {
  await page
    .evaluate(() => {
      for (const element of document.querySelectorAll("[data-sls-hidden-overlay]")) {
        element.style.removeProperty("display");
        element.removeAttribute("data-sls-hidden-overlay");
      }
    })
    .catch(() => {});
}

// Playwright names the element that stole a click, but only in the call log below
// the first line. Reporting just the first line turned "the feedback widget is on
// top of Delete" into a bare "Timeout 5000ms exceeded".
function clickDiagnosis(error) {
  const message = error?.message ?? "unknown";
  const intercept = /(<[^>]+>)[^\n]*intercepts pointer events/.exec(message);
  if (intercept) return `${firstLine(message)} - blocked by ${intercept[1]}`;
  const notable = message
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /intercept|not visible|not stable|not enabled|outside of the viewport|scrolling/i.test(line));
  return notable.length > 0 ? `${firstLine(message)} - ${notable.slice(-2).join("; ")}` : firstLine(message);
}

async function clickOverflowMenuItem(page, title, itemName, sectionTitle = null) {
  const openMenu = page.locator(".bx--overflow-menu-options--open");
  let lastError = null;
  // Where the trigger sits decides where the menu lands. The menu opens downward,
  // so a trigger near the foot of the sidebar puts its last item - "Delete" - under
  // the floating widget, or off the bottom of the viewport entirely. Once open the
  // menu is positioned against the viewport and cannot be scrolled, so the position
  // has to be right before it opens; each attempt tries a different one.
  const placements = ["start", "center", "end"];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const menu = await overflowMenuForTitle(page, title, sectionTitle);
    await menu
      .evaluate((element, block) => element.scrollIntoView({ block, inline: "nearest" }), placements[attempt - 1])
      .catch(() => {});
    await page.waitForTimeout(300);
    await menu.click();
    try {
      await expect(openMenu).toBeVisible({ timeout: 5_000 });
      const item = openMenu.getByRole("button", { name: itemName, exact: true });
      await expect(item).toBeVisible({ timeout: 5_000 });

      // Take anything floating on top of the item out of the way.
      const covered = await item.evaluate(hideCoveringOverlays).catch(() => []);
      if (covered.length > 0) {
        console.log(`      moved "${covered.join('", "')}" aside to reach "${itemName}"`);
      }

      // If the item still lies outside the viewport there is nothing to click and
      // no amount of waiting will help, because the menu is anchored to the
      // viewport rather than the page. Reopen it from a different position instead.
      const offScreen = await item.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.bottom > window.innerHeight || box.top < 0;
      }).catch(() => false);
      if (offScreen) {
        throw new Error(`"${itemName}" rendered outside the viewport (menu placement "${placements[attempt - 1]}")`);
      }

      await item.click({ timeout: 5_000 });
      await restoreHiddenOverlays(page);
      return;
    } catch (error) {
      lastError = error;
      console.log(`      attempt ${attempt} (placement "${placements[attempt - 1]}") failed: ${clickDiagnosis(error)}`);
      await restoreHiddenOverlays(page);
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(750);
    }
  }
  throw new GuardError(
    `Could not click "${itemName}" in the overflow menu for ${title}` +
      (sectionTitle ? ` (section "${sectionTitle}")` : "") +
      ` after 3 attempts. Last failure: ${clickDiagnosis(lastError)}`
  );
}

export async function overflowMenuForTitle(page, title, sectionTitle = null) {
  let menuScope = page;
  if (sectionTitle) {
    const headings = page.locator("button.bx--accordion__heading");
    const sectionItems = [];
    for (let index = 0; index < (await headings.count()); index += 1) {
      const heading = headings.nth(index);
      const label = normalize(
        (await heading.locator("span.title").first().textContent().catch(() => "")) ||
          (await heading.innerText().catch(() => "")),
      );
      if (label !== normalize(sectionTitle)) continue;
      const item = heading.locator(
        "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' bx--accordion__item ')][1]",
      );
      if ((await item.count()) === 1) sectionItems.push(item);
    }
    if (sectionItems.length !== 1) {
      throw new GuardError(
        `Expected one sidebar section named "${sectionTitle}"; found ${sectionItems.length}.`,
      );
    }
    menuScope = sectionItems[0];
  }

  // Activity titles are not unique across sections ("Success Criteria" and
  // "Assess your Learning" commonly repeat). Restrict the search to the current
  // section before matching the row title, so the correct menu is deterministic.
  const menus = menuScope.locator(".bx--overflow-menu.side-nav-toolbar");
  const count = await menus.count();
  const matches = [];
  for (let index = 0; index < count; index += 1) {
    const menu = menus.nth(index);
    // Read the row's own title element rather than the whole row. A quiz activity
    // appends affordances such as "Facilitate Demonstration" to the row, so
    // comparing the full innerText never matched. Prefix matching is not an option
    // either: "…Practice 1" is a prefix of "…Practice 1 - Copy".
    const parent = menu.locator("..");
    const titleElement = parent.locator("span.title, .ellipsis-text.title").first();
    let label;
    if ((await titleElement.count()) > 0) {
      label = normalize(
        (await titleElement.getAttribute("title")) || (await titleElement.innerText())
      );
    } else {
      label = normalize(await parent.innerText());
    }
    if (label === normalize(title)) matches.push(menu);
  }
  if (matches.length > 1) {
    const selected = [];
    for (const menu of matches) {
      const isSelected = await menu.evaluate((element) =>
        Boolean(element.closest(".active, .selected, [aria-current='page']"))
      );
      if (isSelected) selected.push(menu);
    }
    if (selected.length === 1) return selected[0];

    // A section whose title equals one of its own activity titles contributes a
    // second menu with identical text. The sidebar lists the section before its
    // activities, so the activity's menu is the later one - the same rule
    // sidebarActivityMatch already applies for this collision.
    if (sectionTitle && normalize(title) === normalize(sectionTitle) && matches.length === 2) {
      return matches[matches.length - 1];
    }
  }
  if (matches.length !== 1) {
    throw new GuardError(
      `Expected one overflow menu for ${title}; found ${matches.length}` +
      (sectionTitle ? ` (section "${sectionTitle}")` : "") + "."
    );
  }
  return matches[0];
}

// Question cards render progressively, so a single sample undercounts: the same
// activity has reported 7, 18 and 22 across runs. Scroll to pull in anything
// lazily rendered, then wait for the count to hold steady before reading it.
async function settleQuestionCards(page) {
  await page
    .evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    .catch(() => {});
  await page.waitForTimeout(600);

  const cards = page.locator('[id^="settings-card-"]');
  let previous = -1;
  let steady = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const count = await cards.count();
    if (count === previous) {
      steady += 1;
      // Zero is only believed after giving the page real time to render: a count
      // of 0 looks perfectly "steady" before any card has appeared, which is how
      // an activity with 7 questions silently reported none.
      if (steady >= 3 && (count > 0 || attempt >= 12)) break;
    } else {
      steady = 0;
      previous = count;
    }
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(300);
}

// A quiz activity opens on its cover, which lists no question cards. Selecting
// any page reveals the settings panel for the whole quiz - all questions at once,
// not just that page - so a single click is enough and pages need not be walked.
async function openQuizPageIfNeeded(page) {
  const pageButtons = page.locator(".quiz-navigator-button.page-button");
  if ((await pageButtons.count()) === 0) return false;
  console.log("    Quiz activity: opening its first page to list the questions.");
  await pageButtons.first().click().catch(() => {});
  await page.waitForTimeout(1500);
  return true;
}

async function collectQuestionCards(page) {
  const cards = page.locator('[id^="settings-card-"]');
  const count = await cards.count();
  const found = [];
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const text = normalize(await card.innerText());
    const id = await card.getAttribute("id");
    const hasSettings = (await card.locator('svg[name="Settings24"]').count()) === 1;
    const number = /^Q(\d+)\b/.exec(text);
    if (number && id && hasSettings) {
      found.push({ id: id.replace("settings-card-", ""), number: Number(number[1]) });
    }
  }
  return found;
}

async function listQuestionCards(page) {
  await settleQuestionCards(page);
  let found = await collectQuestionCards(page);
  if (found.length === 0 && (await openQuizPageIfNeeded(page))) {
    await settleQuestionCards(page);
    found = await collectQuestionCards(page);
  }
  return found;
}

async function listQuestionCardIds(page) {
  return (await listQuestionCards(page)).map((card) => card.id);
}

// Reads per-question facts from the question body, not the settings card: the
// card never shows the Feedback Assistant banner or the marks. Both quizzes and
// ordinary activities can mount one page at a time, so every page is opened.
export async function readQuestionMetadata(page) {
  const metadata = new Map();
  const originalUrl = new URL(page.url());
  const questionCards = await listQuestionCards(page);
  const pendingQuestionIds = new Set(questionCards.map((card) => card.id));
  const questionNumberById = Object.fromEntries(questionCards.map((card) => [card.id, card.number]));

  const waitForPendingQuestionPage = async () => {
    if (pendingQuestionIds.size === 0) return;
    await expect
      .poll(
        () => visibleMountedQuestionCount(page, [...pendingQuestionIds]),
        { timeout: 12_000, intervals: [250, 400, 650, 1_000] },
      )
      .toBeGreaterThan(0)
      .catch(() => {});
  };

  const recordVisible = async () => {
    // SLS renders the mathematics as MathML/KaTeX inside a shadow root on
    // <akit-interaction>, so innerText alone returns the wrapper and none of the
    // maths - every question then looks like it contains no operation at all.
    // Walk into shadow roots and pick up the LaTeX as well.
    const blocks = await page
      .evaluate((numberById) => {
        const deepText = (root) => {
          let out = "";
          const walk = (node) => {
            if (!node) return;
            // Shadow roots carry their own <style> blocks. Left in, that CSS reads
            // as mathematics: "0.5em" looks like a decimal and "%" like a
            // percentage, which is how spurious operands crept into every question.
            const tag = node.nodeName ? node.nodeName.toLowerCase() : "";
            if (tag === "style" || tag === "script") return;
            // An equation is drawn by WIRIS as an <img> whose src is a data-URI SVG.
            // It contributes no text nodes at all, which is why "Solve 7x = 3x + 8"
            // was read as "Solve .". The SVG carries the original MathML in an HTML
            // comment; lift it out so the equation survives into the text.
            if (tag === "img") {
              const alternative = node.getAttribute
                ? node.getAttribute("alt") || node.getAttribute("title") || ""
                : "";
              if (alternative) out += ` ${alternative} `;
              const src = node.getAttribute ? node.getAttribute("src") || "" : "";
              if (src.slice(0, 18) === "data:image/svg+xml") {
                try {
                  const svg = decodeURIComponent(src.replace(/^data:image\/svg\+xml[^,]*,/, ""));
                  const found = /<!--\s*MathML:\s*([\s\S]*?)-->/.exec(svg);
                  if (found) out += ` ${found[1]} `;
                } catch {
                  // A malformed data URI is not worth failing the scan over.
                }
              }
              return;
            }
            if (node.nodeType === Node.TEXT_NODE) {
              out += ` ${node.nodeValue}`;
              return;
            }
            if (node.shadowRoot) walk(node.shadowRoot);
            for (const child of node.childNodes || []) walk(child);
          };
          walk(root);
          return out.replace(/\s+/g, " ").trim();
        };
        // A ".question-body" holds the question and nothing else - the "Q1" label
        // sits outside it - so climb until something carries the number.
        const questionNumber = (element) => {
          let node = element;
          for (let up = 0; up < 8 && node; up += 1) {
            const id = String(node.id || "").replace(/^(?:component|settings-card)-/, "");
            if (id && numberById[id]) return Number(numberById[id]);
            const found = /^\s*Q(\d+)\b/.exec(node.innerText || "");
            if (found) return Number(found[1]);
            node = node.parentElement;
          }
          return null;
        };
        // ".question-body" is the question itself. Without it only the settings card
        // in the right-hand drawer was read, and that card shows a title with the
        // mathematics stripped out ("Q1 Solve .") plus its own tag controls.
        const containers = document.querySelectorAll(
          ".lesson-activity-container, .lesson-activity-component, .quiz-question-container, .question-body, [id^='settings-card-']"
        );
        return Array.from(containers).map((element) => ({
          number: questionNumber(element),
          text: deepText(element)
        }));
      }, questionNumberById)
      .catch((error) => {
        return [];
      });

    for (const block of blocks) {
      const text = block.text || "";
      const match = /^Q(\d+)\b/.exec(text);
      const number = match ? Number(match[1]) : block.number;
      if (!number || !text) continue;
      const existing = metadata.get(number);
      // Different containers expose different parts - the drawer card carries the
      // marks and the Feedback Assistant banner, the body carries the mathematics -
      // so combine them rather than keeping only the longest. Repeated reads of the
      // same page must not append the same text twice.
      const combined = !existing
        ? text
        : existing.text.includes(text)
          ? existing.text
          : `${existing.text} ${text}`;
      // The settings card prints "Question Tags <values>", or "Question Tags -"
      // when the question carries none. That is the cheapest reliable read of
      // whether a human has already tagged this question, and it needs no extra
      // page visit.
      const { questionTags, alreadyTagged } = questionTagState(combined);
      metadata.set(number, {
        feedbackAssistant: /feedback assistant/i.test(combined),
        marks: /MARKS?\s*\[?\s*\d/i.test(combined),
        questionTags,
        alreadyTagged,
        text: combined
      });
    }
  };

  const activityButtons = standardActivityPageButtons(page);
  const quizButtons = quizQuestionPageButtons(page);
  const activityPageCount = await activityButtons.count();
  const quizPageCount = await quizButtons.count();
  const pageCount = activityPageCount || quizPageCount;
  if (pageCount === 0) {
    await waitForPendingQuestionPage();
    await recordVisible();
    return metadata;
  }

  for (let index = 0; index < pageCount; index += 1) {
    await selectQuestionPage(page, activityPageCount ? "activity" : "quiz", index);
    await waitForPendingQuestionPage();
    await recordVisible();
    for (const questionId of await visibleMountedQuestionIds(page, [...pendingQuestionIds])) {
      pendingQuestionIds.delete(questionId);
    }
  }
  const originalIndex = activityPageCount
    ? Number(originalUrl.searchParams.get("pageNo") || "1") - 1
    : Number(originalUrl.searchParams.get("quizPage") || "0");
  await selectQuestionPage(page, activityPageCount ? "activity" : "quiz", originalIndex).catch(() => {});
  return metadata;
}

async function inventoryModule(page) {
  const originalUrl = page.url();
  const sectionHeadings = page.locator("button.bx--accordion__heading");
  const sections = [];
  const count = await sectionHeadings.count();
  for (let index = 0; index < count; index += 1) {
    const heading = sectionHeadings.nth(index);
    const item = heading.locator("..");
    const activities = await item
      .locator(".bx--accordion__content span.ellipsis-text.title")
      .allTextContents();
    // SLS omits the letter badge on a module with a single section - the sidebar
    // still calls it "Section A - A" - so the attribute comes back empty. Sections
    // are lettered in order, so fall back to that rather than leaving the label
    // blank, which fails validation and makes the section impossible to name.
    const badge = await item.locator(".section-label").first().getAttribute("data-section-icon-text");
    sections.push({
      label: normalize(badge ?? "") || String.fromCharCode(65 + index),
      title: normalize((await heading.locator("span.title").first().textContent()) ?? ""),
      activities: activities.map(normalize)
    });
  }
  const moduleEvidence = await readModuleEvidence(page, originalUrl);
  if (moduleEvidence.subjectLevels?.length || moduleEvidence.contentMaps?.length) {
    const pairs = (moduleEvidence.subjectLevels ?? [])
      .map((entry) => `${entry.subject} / ${entry.level}`)
      .join(" | ");
    console.log(
      `Existing saved Module Tags: ${pairs || "(no Subject/Level)"}; ` +
        `${(moduleEvidence.contentMaps ?? []).join(" | ") || "(no selected Content Map)"}.`,
    );
  } else if (moduleEvidence.error) {
    console.log(`Module-level curriculum evidence could not be read: ${moduleEvidence.error}`);
  }
  return {
    url: page.url(),
    title: await page.title(),
    sectionCount: count,
    sections,
    moduleEvidence,
  };
}

// Module Tags are saved on Introduction, independently of the Section Tags that
// the older scanner reads. They are authoritative evidence for Subject, Level,
// and Content Map when a module title omits P/S markers. This reader never types,
// selects, or saves: it only opens the existing module-details form and navigates
// back to the original URL afterwards.
async function readModuleEvidence(page, restoreUrl) {
  const moduleId = /\/module\/(?:edit|view)\/([0-9a-f-]{36})/i.exec(restoreUrl)?.[1];
  if (!moduleId) return { subjectLevels: [], contentMaps: [], error: "module ID was not present in the URL" };
  try {
    await page.goto(`${SLS_ORIGIN}/admin/community-gallery/module/edit/${moduleId}`, {
      waitUntil: "domcontentloaded",
    });
    await assertAuthenticated(page);
    await page.waitForTimeout(1_200);

    const { subjects, levels } = await openModuleTagsEditor(page);

    const subjectLevels = [];
    const rowCount = Math.min(await subjects.count(), await levels.count());
    for (let index = 0; index < rowCount; index += 1) {
      const subject = normalize(await subjects.nth(index).inputValue().catch(() => ""));
      const level = normalize(await levels.nth(index).inputValue().catch(() => ""));
      if (subject && level) subjectLevels.push({ subject, level });
    }

    // The Module Tags accordion is a sibling of the Learning Outcomes heading,
    // not a descendant of its component wrapper. Search visible accordion
    // headings on this dedicated module-details route.
    const contentMaps = (await page
      .locator("button.bx--accordion__heading:visible")
      .allTextContents()
      .catch(() => []))
      .filter((text) => /-\s*[1-9]\d* selected\s*$/i.test(normalize(text)))
      .map((text) => normalize(text).replace(/\s*-\s*[1-9]\d* selected$/, "").trim())
      .filter(Boolean);
    const moduleText = normalize(await page.locator("body").innerText().catch(() => "")).slice(0, 8_000);
    const descriptionLabel = page.getByText("Module Description", { exact: true }).first();
    const descriptionEditor = descriptionLabel.locator(
      "xpath=following::*[@contenteditable='true' or self::textarea][1]",
    );
    let description = "";
    if ((await descriptionEditor.count()) > 0) {
      description = normalize(
        (await descriptionEditor.innerText().catch(() => "")) ||
          (await descriptionEditor.inputValue().catch(() => "")),
      ).slice(0, 4_000);
    }

    return {
      subjectLevels,
      contentMaps: [...new Set(contentMaps)],
      moduleText,
      description,
      sourceUrl: page.url(),
      readOnly: true,
    };
  } catch (error) {
    return { subjectLevels: [], contentMaps: [], error: firstLine(error.message), readOnly: true };
  } finally {
    if (page.url() !== restoreUrl) {
      await page.goto(restoreUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
      await assertAuthenticated(page).catch(() => {});
    }
  }
}

// Opens the module's Learning Outcomes editor and its blue Module Tags accordion.
// Both the evidence reader and the taxonomy harvester must enter through this
// component first; the module edit route initially renders only the cover card.
// This helper opens existing UI only and never changes or saves a field.
async function openModuleTagsEditor(page) {
  const learningOutcomes = page.getByText("Learning Outcomes", { exact: true }).first();
  let scope = learningOutcomes.locator("xpath=ancestor::*[starts-with(@id,'component-')][1]");
  if ((await scope.count()) === 0) {
    scope = learningOutcomes.locator("xpath=ancestor::*[contains(@class,'card-component')][1]");
  }
  if ((await scope.count()) === 0) scope = page.locator("body");

  let subjects = page.getByPlaceholder("Select Subject", { exact: true });
  let levels = page.getByPlaceholder("Select Level", { exact: true });
  if ((await subjects.count()) === 0 || (await levels.count()) === 0) {
    // The edit indicator can be mounted while the Learning Outcomes card is
    // collapsed, but SLS ignores its click until the card is open. Expand the
    // saved read-only summary first so a fresh browser state is deterministic.
    const summary = page.getByRole("button", { name: "Learning Outcomes", exact: true }).first();
    if (
      (await summary.count()) > 0 &&
      (await summary.getAttribute("aria-expanded").catch(() => null)) !== "true"
    ) {
      await summary.click().catch(() => {});
      await page.waitForTimeout(500);
    }
    const pencil = scope
      .locator('.edit-indicator, button:has(svg[name="Pencil24"]), svg[name="Pencil24"]')
      .first();
    if ((await pencil.count()) > 0) {
      await scope.hover().catch(() => {});
      await pencil.click({ timeout: 5_000 }).catch(async () => pencil.dispatchEvent("click"));
      await page.waitForTimeout(1_200);
      subjects = page.getByPlaceholder("Select Subject", { exact: true });
      levels = page.getByPlaceholder("Select Level", { exact: true });
    }
  }

  // The form keeps Subject/Level inputs mounted while the blue Module Tags
  // accordion is collapsed, but hides the selected Content Map row.
  const expanded = await expandModuleTagsAccordion(page);
  return {
    subjects: page.getByPlaceholder("Select Subject", { exact: true }),
    levels: page.getByPlaceholder("Select Level", { exact: true }),
    expanded
  };
}

async function expandModuleTagsAccordion(page) {
  const title = page
    .locator("p.bx--accordion__title")
    .filter({ hasText: /^\s*Module Tags\s*$/i })
    .first();
  if ((await title.count().catch(() => 0)) === 0) return false;

  let heading = title.locator("xpath=ancestor::button[contains(@class,'bx--accordion__heading')][1]");
  if ((await heading.count().catch(() => 0)) === 0) {
    const item = title.locator(
      "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' bx--accordion__item ')][1]"
    );
    heading = item.locator("button.bx--accordion__heading").first();
  }
  if ((await heading.count().catch(() => 0)) !== 1) return false;

  const expanded = await heading.getAttribute("aria-expanded").catch(() => null);
  const item = heading.locator(
    "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' bx--accordion__item ')][1]"
  );
  const content = item.locator(".bx--accordion__content").first();
  if (expanded !== "true" && !(await content.isVisible().catch(() => false))) {
    await heading.click();
    await page.waitForTimeout(700);
  }
  return true;
}

async function enterEditMode(page, module) {
  await openExactUrl(page, module.adminViewUrl ?? moduleViewUrlFor(module.id));
  await assertAuthenticated(page);
  await assertModule(page, module);

  const editButton = page.getByRole("button", { name: "Edit", exact: true });
  await expect(editButton).toBeVisible();
  console.log("Clicking Edit...");
  await editButton.click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/community-gallery/module/edit/${escapeRegExp(module.id)}/module-plan`)
  );
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
}

async function assertModule(page, module) {
  if (!page.url().includes(module.id)) {
    throw new GuardError(`The page URL does not contain expected module ID ${module.id}.`);
  }
  if (!module.title) return;

  // SLS may prepend the saved Subject and Level to the module title in its
  // header (for example, "Mathematics - G3MATHS Secondary 2 ..."). An exact
  // text-node locator therefore rejects the correct module even though its UUID
  // and complete configured core title are both present. Check normalized,
  // visible page text instead: prefixes and harmless punctuation are accepted,
  // while a different title still stops before Edit is clicked.
  let visibleText = "";
  try {
    await expect
      .poll(
        async () => {
          visibleText = await page.locator("body").innerText().catch(() => "");
          return visiblePageContainsModuleTitle(module.title, visibleText);
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  } catch {
    await assertAuthenticated(page);
    const preview = normalize(visibleText).slice(0, 500);
    throw new GuardError(
      `The page URL has the expected module ID, but its visible title does not contain ` +
        `"${module.title}". Visible page text starts: ${preview || "(empty)"}`,
    );
  }
}

async function assertAuthenticated(page) {
  await page.waitForFunction(() => document.body?.innerText?.trim().length > 0).catch(() => {});
  const url = page.url();
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const loginControlsVisible = await page
    .getByRole("button", { name: /LOGIN WITH (SLS|MIMS)/i })
    .first()
    .isVisible()
    .catch(() => false);
  if (
    !url.startsWith(`${SLS_ORIGIN}/`) ||
    loginControlsVisible ||
    /mims|sign in|log in/i.test(`${url}\n${bodyText.slice(0, 2_000)}`)
  ) {
    throw new GuardError(
      `SLS authentication is required. Run npm run sls:auth (npm.cmd on Windows) and sign in manually. Current URL: ${url}`
    );
  }
}

export async function assertAuthStateAvailable(authStatePath) {
  try {
    await fs.access(authStatePath);
  } catch {
    throw new GuardError(
      `Reusable SLS authentication was not found at ${authStatePath}. Run npm run sls:auth (npm.cmd on Windows) and sign in manually.`
    );
  }
}

export async function assertNoSlsError(page) {
  const error = page.getByText("Something went wrong while performing this action. Please try again later.", {
    exact: true
  });
  if ((await error.count()) > 0 && (await error.first().isVisible())) {
    throw new GuardError("SLS reported that the action result is uncertain. Inspect the trace before retrying.");
  }
}

async function openExactUrl(page, url) {
  const parsed = new URL(url);
  if (parsed.origin !== SLS_ORIGIN || !parsed.pathname.startsWith("/admin/community-gallery/")) {
    throw new GuardError(`Refusing navigation outside the supplied SLS admin origin: ${url}`);
  }
  if (page.url() !== url) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }
}

function sectionUrlFor(config, sectionId) {
  return `${SLS_ORIGIN}/admin/community-gallery/module/edit/${config.module.id}/section/${sectionId}`;
}

function moduleViewUrlFor(moduleId) {
  return `${SLS_ORIGIN}/admin/community-gallery/module/view/${moduleId}/module-plan`;
}

function modulePlanEditUrlFor(config) {
  return `${SLS_ORIGIN}/admin/community-gallery/module/edit/${config.module.id}/module-plan`;
}

function sectionActivityUrl(config, sectionId, activityId) {
  return `${sectionUrlFor(config, sectionId)}/activity/${activityId}`;
}

function sectionIdFromUrl(url) {
  return new URL(url).pathname.match(/\/section\/([^/]+)/)?.[1] ?? null;
}

function activityIdFromUrl(url) {
  return new URL(url).pathname.match(/\/activity\/([^/]+)/)?.[1] ?? null;
}

function normalize(value) {
  return value.replace(/^\d+\.\s*/, "").replace(/\s+/g, " ").trim();
}

function safeName(value) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 70).toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The whole-of-government feedback widget (<wog-sentiments>, the floating
// "Help us improve" button) is appended straight to <body> and floats over the
// lesson sidebar. It silently swallows clicks on the activity overflow menus
// underneath it, so hide it on every navigation before any interaction.
export async function suppressOverlayWidgets(context) {
  await context.addInitScript(() => {
    const STYLE_ID = "sls-automation-overlay-suppression";
    const hide = () => {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent =
        "wog-sentiments, wog-tabbed-widget { display: none !important; }";
      (document.head || document.documentElement).appendChild(style);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", hide, { once: true });
    } else {
      hide();
    }
  });
}

// ---------------------------------------------------------------------------
// Read-only content scan.
//
// The tagging tree renders as a flat list of li.tree-row inside ul.tree-list.
// Depth is carried by an inline `padding-left` (24px per level) rather than by
// nesting, a row is a selectable outcome when it contains
// .learning-outcome-node-container, and a branch is expandable when its
// .tree-row-item-icon-wrapper holds an icon. Expanding every branch and then
// reading the rows in order yields each outcome with the exact branch path and
// exact wording SLS expects.
//
// Nothing here saves: the tagging editor is opened, read, and abandoned.
// ---------------------------------------------------------------------------
async function readTaxonomyRows(page) {
  // Child rows are nested inside their parent <li>, so every read is scoped to
  // the row's own .tree-row-item. Using li.innerText would fold the whole subtree
  // into the parent's label (making an expanded branch look like a new one and
  // getting it clicked shut again), and an unscoped querySelector would report a
  // branch as an outcome merely because a descendant is one.
  return page.$$eval("ul.tree-list li.tree-row", (nodes) => {
    const deepText = (root) => {
      let out = "";
      const walk = (node) => {
        if (!node) return;
        const tag = node.nodeName ? node.nodeName.toLowerCase() : "";
        if (tag === "style" || tag === "script") return;
        if (tag === "img") {
          // WIRIS equation images expose a human-readable alt value (for example
          // "F equals m r omega squared"). Keep it so otherwise-identical H2
          // Physics outcomes remain distinguishable during question matching.
          const alt = node.getAttribute ? node.getAttribute("alt") || "" : "";
          if (alt) out += ` ${alt} `;
          else {
            const src = node.getAttribute ? node.getAttribute("src") || "" : "";
            if (src.startsWith("data:image/svg+xml")) {
              try {
                const svg = decodeURIComponent(src.replace(/^data:image\/svg\+xml[^,]*,/, ""));
                const found = /<!--\s*MathML:\s*([\s\S]*?)-->/.exec(svg);
                if (found) out += ` ${found[1]} `;
              } catch {
                // Preserve the surrounding official wording when one equation
                // image is malformed.
              }
            }
          }
          return;
        }
        if (node.nodeType === Node.TEXT_NODE) {
          out += ` ${node.nodeValue}`;
          return;
        }
        for (const child of node.childNodes || []) walk(child);
      };
      walk(root);
      return out.replace(/\s+/g, " ").trim();
    };

    return nodes
      .filter((li) => li.getClientRects().length > 0)
      .map((li) => {
        const item = li.querySelector(":scope > .tree-row-item");
        const label = item ? item.querySelector(".node-container .rich-text") : null;
        return {
          text: deepText(label),
          // Depth comes from nesting, not padding: every row carries the same
          // padding-left, and the visual indent comes from being inside its parent.
          depth: (() => {
            let level = 0;
            for (let node = li.parentElement; node; node = node.parentElement) {
              if (node.matches && node.matches("li.tree-row")) level += 1;
            }
            return level;
          })(),
          isOutcome: Boolean(item && item.querySelector(":scope > .learning-outcome-node-container")),
          selected: Boolean(item && item.querySelector(":scope > .node-container .input-checkbox.selected")),
          // Collapsed branches show a down chevron and expanded ones do not, so the
          // DOM itself says what still needs opening. Tracking that by label would
          // fail wherever two branches share a name - P5 has "Four operations"
          // under both Whole Numbers and Fractions.
          collapsed: Boolean(
            item &&
              item.querySelector(':scope > .tree-row-item-icon-wrapper svg[name="ArrowDown24"]')
          ),
          expandable: Boolean(item && item.querySelector(":scope > .tree-row-item-icon-wrapper svg"))
        };
      });
  });
}

// A harvested content map is reusable across every module at that level, so it is
// cached by content-map name. Pass --refresh-taxonomy to re-walk it in SLS.
function taxonomyCachePath(root, contentMap) {
  const slug = contentMap.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return path.join(root, "taxonomy", `${slug}.json`);
}

async function loadCachedTaxonomy(cachePath) {
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    return null;
  }
}

// Getting the content-map tree open has three cases and both the tagging pass and
// the scan need all three, so they share this. A section with no content map has
// to pick one; a section that already has one renders the tree collapsed behind a
// summary button; and only then are the branch rows clickable.
// allowAnyMap is for read-only callers (harvesting, verification) that just need
// whatever tree the section has. The tagging path leaves it off: opening a map the
// config never named would append outcomes to the wrong taxonomy.
async function openContentMapTree(page, section, { allowAnyMap = false, readOnly = false } = {}) {
  const treeRows = page.locator("ul.tree-list li.tree-row:visible");
  // The map actually opened, which is the configured one unless the fallback ran.
  let opened = section.contentMap;
  if ((await treeRows.count()) === 0 && !readOnly) {
    // Choosing a content map attaches it to the section, so this is a write. A
    // harvest must never do it: reading a syllabus is not a reason to change
    // somebody's module.
    const chooser = page.getByRole("button", { name: "Content Map", exact: true });
    if ((await chooser.count()) > 0) {
      await chooser.click();
      // A section may already hold content maps, so target the empty row at the
      // end rather than the first, which would replace an existing one.
      const combo = page.getByPlaceholder("Select Content Map", { exact: true }).last();
      await selectComboboxOption(page, combo, section.contentMap);
    }
  }
  if (!(await treeRows.first().isVisible().catch(() => false))) {
    const wanted = page
      .getByRole("button", { name: new RegExp(`${escapeRegExp(section.contentMap)} - \\d+ selected`) })
      .first();
    if ((await wanted.count()) > 0) {
      await wanted.click().catch(() => {});
    } else {
      // A scaffolded config still carries a placeholder content map, and a section
      // may hold maps this run has never seen (Secondary uses names like
      // "Sec 1 Mathematics (G2) (2020)"). Open whichever map the section actually
      // has so a read-only scan can still harvest it, and say which one.
      const anyMap = page.getByRole("button", { name: /- \d+ selected$/ }).first();
      if (allowAnyMap && (await anyMap.count()) > 0) {
        const label = (await anyMap.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
        opened = label.replace(/\s*-\s*\d+ selected$/, "").trim();
        console.log(`    Content map "${section.contentMap}" is not on this section; opening "${opened}".`);
        await anyMap.click().catch(() => {});
      }
    }
  }
  if (!(await treeRows.first().isVisible().catch(() => false))) {
    const offered = (
      await page.getByRole("button", { name: /- \d+ selected$/ }).allTextContents().catch(() => [])
    )
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    throw new GuardError(
      `Section ${section.label}: no content-map tree could be opened. ` +
        `Content maps on this section: ${offered.join(" | ") || "(none)"}`
    );
  }
  return { treeRows, contentMap: opened };
}

async function harvestTaxonomy(page, section) {
  await openSectionTagsEditor(page, section);
  const { contentMap } = await openContentMapTree(page, section, { allowAnyMap: true, readOnly: true });

  for (let pass = 1; pass <= 400; pass += 1) {
    const rows = await readTaxonomyRows(page);
    const next = rows.findIndex((row) => row.collapsed && !row.isOutcome);
    if (next === -1) break;
    const row = rows[next];
    const chevron = page
      .locator("ul.tree-list li.tree-row:visible")
      .nth(next)
      .locator(".tree-row-item-icon-wrapper")
      .first();
    try {
      await chevron.scrollIntoViewIfNeeded({ timeout: 5_000 });
      await chevron.click({ timeout: 5_000 });
    } catch (error) {
      // Report rather than swallow: a silently failed expansion still marks the
      // branch as done and quietly truncates the harvested taxonomy.
      console.log(`    could not expand "${row.text.slice(0, 40)}": ${firstLine(error.message)}`);
      break;
    }
    await page.waitForTimeout(600);
  }

  const rows = await readTaxonomyRows(page);
  const outcomes = buildOutcomePaths(rows);

  // What this section is already tagged with. All read-only, and precisely the
  // values a scaffolded config is still missing, so a scan can fill them in
  // instead of stopping the next run at the placeholder guard.
  const selected = rows
    .filter((row) => row.isOutcome && row.selected)
    .map((row) => outcomes.find((entry) => entry.outcome === row.text) ?? { outcome: row.text, outcomePath: [] });

  const firstFilled = async (placeholder) => {
    const combos = page.getByPlaceholder(placeholder, { exact: true });
    for (let row = 0; row < (await combos.count()); row += 1) {
      const value = (await combos.nth(row).inputValue().catch(() => "")).trim();
      if (value) return value;
    }
    return null;
  };

  return {
    rowCount: rows.length,
    outcomes,
    contentMap,
    selected,
    subject: await firstFilled("Select Subject"),
    level: await firstFilled("Select Level")
  };
}

function activitiesInTargetScope(config, section) {
  const targetActivityId = config.target?.activityId;
  if (!targetActivityId) return section.activities;
  return section.activities.filter((activity) => String(activity.id ?? "") === String(targetActivityId));
}

function assertTargetActivityConfigured(config) {
  const targetActivityId = config.target?.activityId;
  if (!targetActivityId) return;
  const matches = config.sections.flatMap((section) =>
    section.activities.filter((activity) => String(activity.id ?? "") === String(targetActivityId))
  );
  if (matches.length !== 1) {
    throw new GuardError(
      `The supplied activity URL targets ${targetActivityId}, but the matching config contains ${matches.length} activity entries with that ID.`
    );
  }
}

async function scanSectionContent(page, config, section) {
  const activities = [];
  for (const activity of activitiesInTargetScope(config, section)) {
    const entry = { title: activity.title, questions: [] };
    try {
      await openSection(page, config, section);
      // A module part-way through a replacement pass holds "<title> - Copy"
      // rather than the original the config names. Fall back to it so a scan of a
      // half-migrated module still reads real questions instead of reporting none.
      const copyTitle = `${activity.title} - Copy`;
      const original = await sidebarActivityMatch(page, activity.title, section);
      if (original.count !== 1) {
        const copy = await sidebarActivityMatch(page, copyTitle, section);
        if (copy.count === 1) {
          entry.readFrom = copyTitle;
          console.log(`      note: "${activity.title}" not present; reading "${copyTitle}" instead.`);
          await openSidebarActivity(page, copyTitle, section);
        } else {
          throw new GuardError(
            `Neither "${activity.title}" nor its copy is in section ${section.label}.`
          );
        }
      } else {
        await openSidebarActivity(page, activity.title, section);
      }
      await page
        .locator('[id^="settings-card-"]')
        .first()
        .waitFor({ state: "attached", timeout: 8_000 })
        .catch(() => {});
      for (const questionId of await listQuestionCardIds(page)) {
        const text = normalize(
          await page.locator(`#settings-card-${questionId}`).innerText()
        );
        entry.questions.push({ id: questionId, text: text.slice(0, 600) });
      }
    } catch (error) {
      entry.error = error.message;
      console.log(`      could not read "${activity.title}": ${firstLine(error.message)}`);
    }
    activities.push(entry);
  }
  return activities;
}

// Reads the syllabus out of whatever content maps a module's sections already
// carry, and caches one dictionary per map. Strictly read-only: no map is chosen,
// no outcome is ticked, nothing is saved. Secondary spans many syllabuses and
// levels, so these dictionaries have to be collected from real modules before
// question tagging can mean anything there.
async function harvestModuleDictionaries(page, config, report, options = {}) {
  const found = [];
  const seen = new Set();
  const sections = (report.inventory?.sections ?? []).map((entry) => ({
    label: entry.label,
    title: entry.title,
    contentMap: config.defaults?.contentMap ?? "",
    activities: []
  }));

  for (const section of sections) {
    try {
      const resolved = await openSection(page, config, section);
      section.id = resolved.id;
      const component = page.locator(`#component-${section.id}`);
      await expect(component).toBeVisible();
      await component.click();

      const taxonomy = await harvestTaxonomy(page, section);
      const name = taxonomy.contentMap;
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const cachePath = taxonomyCachePath(process.cwd(), name);
      const cached = options.refreshTaxonomy ? null : await loadCachedTaxonomy(cachePath);
      if (cached) {
        console.log(`  [${section.label}] ${name}: already cached (${cached.outcomes.length} outcomes).`);
        found.push({ contentMap: name, outcomes: cached.outcomes.length, cached: true });
        continue;
      }

      taxonomy.harvestedAt = new Date().toISOString();
      await saveJson(cachePath, taxonomy);
      console.log(`  [${section.label}] ${name}: harvested ${taxonomy.outcomes.length} outcomes.`);
      found.push({ contentMap: name, outcomes: taxonomy.outcomes.length, cached: false });
    } catch (error) {
      // One awkward section must not cost the whole sweep; the next module may
      // carry the same syllabus anyway.
      console.log(`  [${section.label}] could not harvest: ${firstLine(error.message)}`);
    }
  }
  return { contentMaps: found };
}

// Writes what the scan read off the section into the local config file, so the next
// run has real values instead of the scaffolder's placeholders. This touches nothing
// in SLS.
//
// Only placeholders are filled. A value a human has already set is left exactly as
// it is, even where it disagrees with SLS: we do not know why it was chosen, and
// overwriting it is the one thing this whole tool is built not to do.
async function recordDiscoveredSectionTagging(configPath, config, discovered) {
  const isPlaceholder = (value) => typeof value !== "string" || value.includes(PLACEHOLDER_MARKER) || value === "";
  const fill = (target, key, value) => {
    if (value == null || !target || !isPlaceholder(target[key])) return false;
    target[key] = value;
    return true;
  };

  const wanted = {
    contentMap: discovered.contentMap,
    subject: discovered.subject,
    level: discovered.level,
    outcome: discovered.outcome
  };

  const set = [];
  for (const [key, value] of Object.entries(wanted)) {
    if (fill(config.defaults, key, value)) set.push(key);
    for (const section of config.sections || []) fill(section, key, value);
  }
  if (discovered.outcomePath && isPlaceholderPath(config.defaults?.outcomePath)) {
    config.defaults.outcomePath = discovered.outcomePath;
    set.push("outcomePath");
  }
  if (set.length === 0) return;

  if (!configPath) {
    console.log(`  Discovered ${set.join(", ")}; set them in the config before tagging.`);
    return;
  }
  try {
    const raw = JSON.parse(await fs.readFile(configPath, "utf8"));
    for (const [key, value] of Object.entries(wanted)) {
      fill(raw.defaults, key, value);
      for (const section of raw.sections || []) fill(section, key, value);
    }
    if (discovered.outcomePath && isPlaceholderPath(raw.defaults?.outcomePath)) {
      raw.defaults.outcomePath = discovered.outcomePath;
    }
    await saveJson(configPath, raw);
    console.log(
      `  Recorded ${set.join(", ")} from the section into ${path.relative(process.cwd(), configPath)}.`
    );
  } catch (error) {
    console.log(`  Could not update the config: ${firstLine(error.message)}. Fill in ${set.join(", ")} by hand.`);
  }
}

// An empty outcomePath is what the scaffolder leaves behind; a populated one was
// either discovered already or set deliberately.
function isPlaceholderPath(value) {
  return !Array.isArray(value) || value.length === 0;
}

// Surgical tagging: walk the module's own activities and tag their questions in
// place.
//
// The older duplicate-and-delete pass exists because early modules carried no
// tagging at all, and duplicating an activity was how new section tagging reached
// its questions. A module that already carries tagging needs none of that: the
// duplication rewrites activity identity, creates original/copy ambiguity, and
// forces a delete step, all to achieve something that can be done directly. This
// pass creates nothing and deletes nothing - it only ever appends a tag to a
// question that should have one.
async function tagModuleInPlace(page, config, report, options = {}, checkpoint = null, checkpointPath = null, runDir = null) {
  assertTargetActivityConfigured(config);
  for (const section of config.sections) {
    const targetActivities = activitiesInTargetScope(config, section);
    if (targetActivities.length === 0) continue;
    console.log(`[Section ${section.label}] ${section.title}`);
    const resolved = await openSection(page, config, section);
    section.id = resolved.id;
    // Section-level tags are deliberately untouched here; this pass is about
    // questions.

    const sectionReport = { label: section.label, title: section.title, activities: [] };
    for (const activity of targetActivities) {
      const entry = { title: activity.title, tagged: false };
      try {
        await openSection(page, config, section);
        await openSidebarActivity(page, activity.title, section);
        console.log(`  Activity: ${activity.title}`);
        await tagEveryQuestion({
          page,
          activity,
          section,
          activityState: { completedQuestions: [] },
          checkpoint,
          checkpointPath,
          runDir,
          options
        });
        entry.tagged = true;
      } catch (error) {
        // One awkward activity should not cost the rest of the module.
        entry.error = firstLine(error.message);
        console.log(`    could not tag "${activity.title}": ${entry.error}`);
      }
      sectionReport.activities.push(entry);
    }
    report.sections.push(sectionReport);
  }
}

async function scanModule(page, config, report, options = {}) {
  assertTargetActivityConfigured(config);
  const sections = [];
  let taxonomy = null;
  for (const section of config.sections) {
    console.log(`[Section ${section.label}] scanning ${section.title}`);
    const resolved = await openSection(page, config, section);
    section.id = resolved.id;

    if (!taxonomy) {
      const cachePath = taxonomyCachePath(process.cwd(), config.defaults.contentMap);
      // A scaffolded config names a placeholder, and an earlier run may have filed a
      // taxonomy under that placeholder name. Reusing it hands this module another
      // syllabus entirely and, worse, skips the harvest that would have discovered
      // its real content map, level and outcome.
      const placeholderMap = String(config.defaults.contentMap ?? "").includes(PLACEHOLDER_MARKER);
      const cached = options.refreshTaxonomy || placeholderMap ? null : await loadCachedTaxonomy(cachePath);
      if (cached) {
        taxonomy = cached;
        console.log(`  Reusing ${taxonomy.outcomes.length} learning outcomes cached for ${config.defaults.contentMap}.`);
      } else {
        const component = page.locator(`#component-${section.id}`);
        await expect(component).toBeVisible();
        await component.click();
        const harvested = await harvestTaxonomy(page, section);
        // Cache under the map that was actually read. A scaffolded config still
        // names a placeholder, and filing a real Secondary taxonomy under that
        // name would hand the next run the wrong dictionary. The dictionary keeps
        // only the syllabus: which outcomes this one module happens to have ticked
        // is not a property of the syllabus.
        const contentMap = harvested.contentMap || config.defaults.contentMap;
        taxonomy = {
          contentMap,
          rowCount: harvested.rowCount,
          outcomes: harvested.outcomes,
          harvestedAt: new Date().toISOString()
        };
        const realPath = taxonomyCachePath(process.cwd(), contentMap);
        await saveJson(realPath, taxonomy);
        console.log(`  Harvested ${taxonomy.outcomes.length} learning outcomes; cached to ${path.relative(process.cwd(), realPath)}.`);
        await recordDiscoveredSectionTagging(options.configPath, config, {
          contentMap,
          subject: harvested.subject,
          level: harvested.level,
          outcome: harvested.selected[0]?.outcome ?? null,
          outcomePath: harvested.selected[0]?.outcomePath ?? null
        });
      }
    }

    const activities = await scanSectionContent(page, config, section);
    const questionCount = activities.reduce((total, a) => total + a.questions.length, 0);
    console.log(`  ${activities.length} activities, ${questionCount} questions read.`);
    sections.push({ label: section.label, title: section.title, id: section.id, activities });
  }
  report.scan = { contentMap: config.defaults.contentMap, taxonomy, sections };
}

// Discovers official SLS learning outcomes without saving anything. An existing
// saved Module Tag is authoritative and already exposes the exact syllabus tree,
// so read that first. Only modules without a readable saved map fall back to the
// Subject -> Level -> Content Map cascade in an unsaved question details modal.
async function discoverCurriculumTaxonomies(page, config, options = {}) {
  const clues = inferCurriculumClues(config);
  if (!clues.level) {
    throw new GuardError(
      `Neither the saved Module Tags nor the module title exposed a usable level. ` +
      `Add a level or review the module metadata before crawling SLS.`
    );
  }

  const savedModuleTaxonomies = await harvestSavedModuleTaxonomies(page, config, clues);
  if (savedModuleTaxonomies.length > 0) {
    console.log(
      "  Saved Module Tags discovery complete. No unsaved Subject -> Level -> Content Map search was needed."
    );
    return {
      readOnly: true,
      subjects: [...new Set(savedModuleTaxonomies.map((entry) => entry.subject).filter(Boolean))],
      level: clues.level,
      contentMaps: savedModuleTaxonomies,
      source: {
        type: "existing saved SLS Module Tags",
        url: `${SLS_ORIGIN}/admin/community-gallery/module/edit/${config.module.id}`
      }
    };
  }

  if ((clues.existingContentMaps ?? []).length > 0) {
    console.log(
      "  Existing Module Tag summaries were found, but their learning-objective trees could not be read; " +
        "falling back to the unsaved question cascade."
    );
  }

  const target = await openFirstQuestionForDiscovery(page, config);
  console.log(
    `  Crawling SLS from question ${target.questionId} in ` +
      `${target.section.label}. ${target.activity.title} (nothing will be saved).`
  );
  if (target.questionText) {
    console.log(`    Question evidence: ${target.questionText.slice(0, 180)}`);
  }

  const subjectCombos = page.getByPlaceholder("Select Subject", { exact: true });
  const levelCombos = page.getByPlaceholder("Select Level", { exact: true });
  const initialRow = await ensureEmptyDiscoveryRow(page, subjectCombos, levelCombos);
  const subjectLabels = await collectFilteredOptions(page, subjectCombos.nth(initialRow), clues.subjectQueries);
  const rankedSubjects = rankSubjectOptions(subjectLabels, clues);
  const subjects = selectDiscoverySubjects(rankedSubjects, clues);
  console.log(`    Subject cascade${subjects.length === 1 ? "" : "s"}: ${subjects.map((entry) => entry.label).join(" | ")}`);

  const harvested = [];
  for (const subject of subjects) {
    await openDiscoveryQuestionModal(page, target.questionId);
    const { level, maps } = await discoverMapsForSubject(page, subject, clues);
    console.log(`    ${subject.label} / ${level.label}:`);
    maps.forEach((candidate, index) => console.log(`      ${index + 1}. ${candidate.label}`));

    for (const candidate of maps) {
      await openDiscoveryQuestionModal(page, target.questionId);
      const taxonomy = await harvestMapFromQuestion(page, {
        contentMap: candidate.label,
        subject: subject.label,
        level: level.label,
        questionId: target.questionId
      });
      if (!taxonomy?.outcomes?.length) {
        console.log(`      ${candidate.label}: no outcomes could be read; skipped.`);
        continue;
      }
      const cachePath = taxonomyCachePath(process.cwd(), candidate.label);
      await saveJson(cachePath, {
        ...taxonomy,
        subject: subject.label,
        level: level.label,
        harvestedAt: new Date().toISOString(),
        discoveredFromModule: config.module.id
      });
      console.log(
        `      ${candidate.label}: harvested ${taxonomy.outcomes.length} outcomes to ` +
          `${path.relative(process.cwd(), cachePath)}.`
      );
      harvested.push({
        subject: subject.label,
        level: level.label,
        contentMap: candidate.label,
        outcomes: taxonomy.outcomes.length
      });
    }
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await assertAuthenticated(page);
  if (harvested.length === 0) {
    throw new GuardError("No matching SLS taxonomy could be harvested. No SLS changes were saved.");
  }
  console.log("  Discovery complete. The question modal was reloaded without saving.");
  return {
    readOnly: true,
    subjects: subjects.map((entry) => entry.label),
    level: clues.level,
    contentMaps: harvested,
    source: {
      section: target.section.label,
      activity: target.activity.title,
      questionId: target.questionId,
      questionText: target.questionText
    }
  };
}

// Reads the exact learning-objective trees already attached to the module. This
// route is both safer and more accurate than re-selecting Subject, Level and
// Content Map inside a question: it uses saved SLS metadata, expands only existing
// accordions, never touches a checkbox, and never clicks Save.
async function harvestSavedModuleTaxonomies(page, config, clues) {
  const contentMaps = [...new Set((clues.existingContentMaps ?? []).map(normalize).filter(Boolean))];
  if (contentMaps.length === 0) return [];

  const restoreUrl = page.url();
  const subject = normalize(config.module?.curriculumEvidence?.subject ?? config.defaults?.subject ?? "");
  const level = normalize(config.module?.curriculumEvidence?.level ?? config.defaults?.level ?? clues.level ?? "");
  const harvested = [];

  console.log(
    `  Existing saved Module Tag${contentMaps.length === 1 ? "" : "s"} found; ` +
      "harvesting its official learning objectives first (nothing will be saved)."
  );

  try {
    await page.goto(`${SLS_ORIGIN}/admin/community-gallery/module/edit/${config.module.id}`, {
      waitUntil: "domcontentloaded"
    });
    await assertAuthenticated(page);
    await page.waitForTimeout(1_200);
    const moduleTags = await openModuleTagsEditor(page);
    if (!moduleTags.expanded) {
      console.log("    The saved Module Tags accordion could not be opened.");
      return harvested;
    }

    for (const contentMap of contentMaps) {
      const summary = page
        .getByRole("button", {
          name: new RegExp(`^${escapeRegExp(contentMap)} - \\d+ selected$`)
        })
        .first();
      if ((await summary.count()) === 0) {
        console.log(`    ${contentMap}: the saved summary row was not visible; skipped.`);
        continue;
      }

      const taxonomy = await readMapTree(page, { contentMap });
      if (!taxonomy?.outcomes?.length) {
        console.log(`    ${contentMap}: its saved learning-objective tree exposed no readable outcomes; skipped.`);
        continue;
      }

      const cachePath = taxonomyCachePath(process.cwd(), contentMap);
      const saved = {
        ...taxonomy,
        subject: subject || null,
        level: level || null,
        harvestedAt: new Date().toISOString(),
        discoveredFromModule: config.module.id,
        discoverySource: "existing saved SLS Module Tags"
      };
      await saveJson(cachePath, saved);
      console.log(
        `    ${contentMap}: harvested ${taxonomy.outcomes.length} outcomes from saved Module Tags to ` +
          `${path.relative(process.cwd(), cachePath)}.`
      );
      harvested.push({
        subject: subject || null,
        level: level || null,
        contentMap,
        outcomes: taxonomy.outcomes.length,
        source: "existing saved SLS Module Tags"
      });
    }
  } finally {
    if (page.url() !== restoreUrl) {
      await page.goto(restoreUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
      await assertAuthenticated(page).catch(() => {});
    }
  }

  return harvested;
}

async function discoverMapsForSubject(page, subject, clues) {
  const subjectCombos = page.getByPlaceholder("Select Subject", { exact: true });
  const levelCombos = page.getByPlaceholder("Select Level", { exact: true });
  const row = await ensureEmptyDiscoveryRow(page, subjectCombos, levelCombos);
  await selectComboboxOption(page, subjectCombos.nth(row), subject.label);
  await page.waitForTimeout(700);

  const levelLabels = await collectFilteredOptions(page, levelCombos.nth(row), [clues.level]);
  const levels = rankLevelOptions(levelLabels, clues);
  const level = requireClearDiscoveryChoice("Level", levels, 10, 2);
  await selectComboboxOption(page, levelCombos.nth(row), level.label);
  await page.waitForTimeout(900);

  let chooser = page.getByRole("button", { name: "Content Map", exact: true }).last();
  if ((await chooser.count()) === 0) {
    const addMap = page.getByRole("button", { name: /^ADD CONTENT MAP AND TOPIC$/i }).first();
    if ((await addMap.count()) > 0) {
      await addMap.click();
      await page.waitForTimeout(900);
      chooser = page.getByRole("button", { name: "Content Map", exact: true }).last();
    }
  }
  if ((await chooser.count()) === 0) {
    throw new GuardError(`SLS exposed no Content Map control after selecting ${subject.label} / ${level.label}.`);
  }
  await chooser.click();
  const mapCombo = page.getByPlaceholder("Select Content Map", { exact: true }).last();
  const levelNumber = /([1-6])/.exec(clues.level)?.[1];
  const mapQueries = [
    ...(clues.existingContentMaps ?? []),
    clues.level.startsWith("Primary")
      ? `Pri ${levelNumber}`
      : clues.level.startsWith("Secondary")
        ? `Sec ${levelNumber}`
        : clues.level,
    ...clues.subjectQueries
  ];
  const mapLabels = await collectFilteredOptions(page, mapCombo, mapQueries);
  const maps = rankContentMapOptions(mapLabels, clues)
    .filter((candidate) => candidate.score >= 12)
    .filter((candidate) => contentMapSupportsStreams(candidate.label, clues.streams))
    .slice(0, 8);
  if (maps.length === 0) {
    throw new GuardError(
      `SLS offered no Content Map matching ${subject.label} / ${level.label}. ` +
        `Options seen: ${mapLabels.slice(0, 20).join(" | ") || "(none rendered)"}`
    );
  }
  return { level, maps };
}

async function ensureEmptyDiscoveryRow(page, subjectCombos, levelCombos) {
  let row = await emptySubjectLevelRow(subjectCombos, levelCombos);
  if (row === -1) {
    const add = page.getByRole("button", { name: /^ADD SUBJECT AND LEVEL$/i }).first();
    if ((await add.count()) > 0) {
      await add.click();
      await page.waitForTimeout(700);
      row = await emptySubjectLevelRow(subjectCombos, levelCombos);
    }
  }
  if (row === -1) {
    throw new GuardError("The question details modal exposed no empty Subject and Level row for read-only discovery.");
  }
  return row;
}

async function openDiscoveryQuestionModal(page, questionId) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await assertAuthenticated(page);
  const card = page.locator(`#settings-card-${questionId}`);
  await card.scrollIntoViewIfNeeded();
  await openQuestionSettings(card, page);
}

function selectDiscoverySubjects(ranked, clues) {
  if ((clues.streams ?? []).length === 0) {
    return [requireClearDiscoveryChoice("Subject", ranked, 8, 2)];
  }
  const selected = [];
  for (const stream of clues.streams) {
    const matching = ranked.filter((candidate) =>
      new RegExp(stream, "i").test(candidate.label)
    );
    if (matching.length === 0) continue;
    const choice = requireClearDiscoveryChoice(`${stream} Subject`, matching, 8, 2);
    if (!selected.some((entry) => entry.label === choice.label)) selected.push(choice);
  }
  // Some SLS cascades encode G2/G3 only in the Content Map rather than in the
  // Subject label. In that case, select the one clear academic subject here and
  // enforce the explicit stream when the maps are listed below.
  return selected.length > 0
    ? selected
    : [requireClearDiscoveryChoice("Subject", ranked, 8, 2)];
}

async function openFirstQuestionForDiscovery(page, config) {
  assertTargetActivityConfigured(config);
  for (const section of config.sections ?? []) {
    await openSection(page, config, section);
    for (const activity of activitiesInTargetScope(config, section)) {
      try {
        await openSidebarActivity(page, activity.title, section);
        await page
          .locator('[id^="settings-card-"] svg[name="Settings24"]')
          .first()
          .waitFor({ state: "attached", timeout: 10_000 });
        const questionIds = await listQuestionCardIds(page);
        if (questionIds.length === 0) continue;
        const stems = await readQuestionStems(page, questionIds);
        const questionId = questionIds.find((id) =>
          isSubstantiveCurriculumQuestion(stems.get(id) ?? "", config.defaults?.subject)
        );
        if (!questionId) {
          console.log(`    ${section.label}. ${activity.title}: no substantive question body was readable; skipped.`);
          continue;
        }
        const card = page.locator(`#settings-card-${questionId}`);
        await card.scrollIntoViewIfNeeded();
        const questionText = String(stems.get(questionId) ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);
        await openQuestionSettings(card, page);
        return { section, activity, questionId, questionText };
      } catch (error) {
        console.log(`    ${section.label}. ${activity.title}: ${firstLine(error.message)}`);
      }
    }
  }
  throw new GuardError("No readable question details modal was found for curriculum discovery.");
}

async function collectFilteredOptions(page, combo, queries) {
  const found = new Set();
  for (const query of [...new Set((queries ?? []).filter(Boolean))]) {
    await combo.click();
    await combo.fill("").catch(() => {});
    await combo.type(String(query), { delay: 15 }).catch(async () => combo.fill(String(query)));
    await page.waitForTimeout(900);
    for (const text of await page.getByRole("option").allTextContents().catch(() => [])) {
      const normalized = text.replace(/\s+/g, " ").trim();
      if (normalized) found.add(normalized);
    }
    await page.keyboard.press("Escape").catch(() => {});
  }
  return [...found];
}

function requireClearDiscoveryChoice(label, ranked, minimumScore, minimumMargin) {
  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const margin = best ? best.score - (second?.score ?? 0) : 0;
  if (!best || best.score < minimumScore || (second && margin < minimumMargin)) {
    const choices = ranked.slice(0, 10).map((candidate, index) =>
      `${index + 1}. ${candidate.label} (${candidate.score})`
    );
    throw new GuardError(
      `${label} could not be selected confidently from SLS. ` +
        `Candidates: ${choices.join(" | ") || "(none)"}. Nothing was saved.`
    );
  }
  return best;
}

export async function launchSlsBrowser(options) {
  console.log(`Opening ${options.headless ? "headless" : "visible"} Chrome...`);
  return chromium.launch({
    channel: "chrome",
    headless: options.headless,
    slowMo: options.headless ? 0 : options.slowMoMs,
    args: options.headless ? [] : ["--start-maximized"]
  });
}

export async function createSlsContext(browser, options) {
  const context = await browser.newContext({
    storageState: options.authStatePath,
    viewport: options.headless ? { width: 1440, height: 1000 } : null,
    acceptDownloads: false
  });
  await suppressOverlayWidgets(context);
  return context;
}

function firstLine(message) {
  return String(message).split(String.fromCharCode(10))[0];
}

// Appends a second Subject/Level and Content Map to one question's tags.
// Strictly additive: every existing tag, and the "Include in Learning Progress"
// setting, is left exactly as the author left it. Each control is verified before
// use, so an unexpected layout stops with a clear guard instead of writing
// something wrong into a live module.
async function appendQuestionOutcome(page, card, extra) {
  await openQuestionSettings(card, page);

  const before = await readQuestionTagSummary(page);
  if (before.some((row) => row.startsWith(extra.contentMap))) {
    console.log(`      ${extra.contentMap} is already on this question; leaving it alone.`);
    await page.locator("svg.btn-close").click();
    return { appended: false, reason: "content map already present" };
  }

  const subject = page.getByPlaceholder("Select Subject", { exact: true });
  if ((await subject.count()) === 0) {
    throw new GuardError("The question tag modal exposed no empty Subject control.");
  }
  await selectComboboxOption(page, subject.last(), extra.subject);

  const level = page.getByPlaceholder("Select Level", { exact: true });
  if ((await level.count()) === 0) {
    throw new GuardError("Choosing a subject did not enable a Level control.");
  }
  await selectComboboxOption(page, level.last(), extra.level);

  const addSubject = page.getByRole("button", { name: /^ADD SUBJECT AND LEVEL$/i }).first();
  await expect(addSubject).toBeVisible();
  await addSubject.click();
  await page.waitForTimeout(900);

  // The new Subject/Level makes a further Content Map row available.
  const chooser = page.getByRole("button", { name: "Content Map", exact: true }).last();
  if ((await chooser.count()) === 0) {
    throw new GuardError(`No Content Map control appeared after adding ${extra.level}.`);
  }
  await chooser.click();
  const mapCombo = page.getByPlaceholder("Select Content Map", { exact: true }).last();
  await selectComboboxOption(page, mapCombo, extra.contentMap);
  await page.waitForTimeout(900);

  await selectOutcomeByPath(page, {
    label: `question ${extra.questionId}`,
    outcomePath: extra.outcomePath,
    outcome: extra.outcome,
    contentMap: extra.contentMap
  });

  const addMap = page.getByRole("button", { name: /^ADD CONTENT MAP AND TOPIC$/i }).first();
  await expect(addMap).toBeVisible();
  await addMap.click();
  await assertNoSlsError(page);

  await page.locator('button:has(svg[name="Save24"])').click();
  await assertNoSlsError(page);
  await page.waitForTimeout(900);
  await page.locator("svg.btn-close").click();

  return { appended: true, outcome: extra.outcome, contentMap: extra.contentMap };
}

async function readQuestionTagSummary(page) {
  return page
    .getByRole("button", { name: /- \d+ selected$/ })
    .allTextContents()
    .then((rows) => rows.map((row) => row.replace(/\s+/g, " ").trim()))
    .catch(() => []);
}
