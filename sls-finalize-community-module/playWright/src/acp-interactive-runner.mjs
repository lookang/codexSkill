import fs from "node:fs/promises";
import path from "node:path";
import { expect as baseExpect } from "@playwright/test";
import {
  assessAcpPage,
  assessAcpPreAddState,
  buildAcpSpecificRequirements,
  normalizeAcpOptions,
  normalizeQuestionText,
  normalizeRandomizationParameters,
} from "./acp-interactive.mjs";
import { createRunPaths, saveJson } from "./io.mjs";
import {
  GuardError,
  assertAuthStateAvailable,
  assertNoSlsError,
  createSlsContext,
  launchSlsBrowser,
} from "./sls-runner.mjs";
import {
  enterEditMode,
  inventoryActivities,
  inventorySections,
  leaveEditMode,
  openActivity,
  openActivityById,
  openSection,
  selectPage,
  settleActivity,
  visiblePageCount,
} from "./page-break-runner.mjs";

const PROMPT_LIBRARY_URL =
  "https://iwant2study.moe.edu.sg/lookangejss/promptLibrary/ai-prompt-library.html";
let expect = baseExpect.configure({ timeout: 20_000 });

export async function runAcpInteractiveWorkflow({ target, options, apply = false }) {
  expect = baseExpect.configure({ timeout: options.timeoutMs ?? 20_000 });
  const policy = normalizeAcpOptions(options.acpInteractive);
  const paths = await createRunPaths(options, target.id);
  const report = {
    schemaVersion: 2,
    action: "acp-interactive",
    mode: apply ? "apply" : "review",
    startedAt: new Date().toISOString(),
    target,
    policy,
    sections: [],
    generated: [],
    failures: [],
    status: "running",
    error: null,
  };

  let browser;
  let context;
  let slsPage;
  let promptPage;
  try {
    await assertAuthStateAvailable(options.authStatePath);
    browser = await launchSlsBrowser(options);
    context = await createSlsContext(browser, options);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    slsPage = context.pages()[0] ?? (await context.newPage());
    slsPage.setDefaultTimeout(options.timeoutMs ?? 20_000);
    slsPage.setDefaultNavigationTimeout(Math.max(options.timeoutMs ?? 20_000, 30_000));

    await enterEditMode(slsPage, target);
    if (apply) {
      promptPage = await context.newPage();
      promptPage.setDefaultTimeout(Math.max(options.timeoutMs ?? 20_000, 30_000));
      await promptPage.goto(PROMPT_LIBRARY_URL, { waitUntil: "domcontentloaded" });
      await expect(promptPage.locator("#topic")).toBeVisible();
    }

    report.sections = await processModule({
      slsPage,
      promptPage,
      target,
      policy,
      apply,
      generated: report.generated,
      failures: report.failures,
      paths,
    });
    await leaveEditMode(slsPage, target);

    if (apply && report.generated.length > 0) {
      console.log("\nReopening generated activities to verify their ACP ZIPs persisted...");
      await enterEditMode(slsPage, target);
      for (const entry of report.generated) {
        try {
          await verifyGeneratedEntry(slsPage, target, entry);
        } catch (error) {
          entry.reopenVerified = false;
          entry.verificationError = serializeAcpError(error);
          const failure = await recordAcpFailure(report.failures, {
            stage: "verify",
            page: slsPage,
            paths,
            section: entry.section,
            activity: entry.activity,
            pageIndex: entry.pageIndex,
            questionText: entry.questionText,
            error,
          });
          console.log(`  Verification follow-up logged: ${formatAcpFailureLine(failure)}`);
        }
      }
      await leaveEditMode(slsPage, target);
    }

    report.status = apply
      ? (report.failures.length > 0 ? "completed_with_errors" : "completed")
      : (report.failures.length > 0 ? "reviewed_with_errors" : "reviewed");
    report.finishedAt = new Date().toISOString();
    const screenshotPath = path.join(paths.runDir, apply ? "acp-interactive-verified.png" : "acp-interactive-review.png");
    await slsPage.screenshot({ path: screenshotPath, fullPage: true });
    report.screenshotPath = screenshotPath;
    await saveJson(paths.reportPath, report);

    if (options.holdOpen && !options.headless) {
      console.log("\nThe final verified Module View is open in Chrome.");
      await options.holdOpen();
    }
  } catch (error) {
    report.status = "stopped";
    report.error = { name: error.name, message: error.message, stack: error.stack };
    if (slsPage) {
      await slsPage.screenshot({
        path: path.join(paths.runDir, "acp-interactive-failure.png"),
        fullPage: true,
      }).catch(() => {});
    }
    throw error;
  } finally {
    report.finishedAt ??= new Date().toISOString();
    await saveJson(paths.reportPath, report).catch(() => {});
    if (context) {
      await context.tracing.stop({ path: paths.tracePath }).catch(() => {});
      await context.close().catch(() => {});
    }
    if (browser) await browser.close().catch(() => {});
    if (!context) {
      await fs.writeFile(
        path.join(paths.runDir, "trace-unavailable.txt"),
        "Chrome did not open, so no Playwright trace was created.\n",
        "utf8",
      ).catch(() => {});
    }
  }

  return {
    ...paths,
    report,
    candidateCount: allPages(report.sections).filter((entry) => entry.assessment.status === "candidate").length,
    blockedCount: allPages(report.sections).filter((entry) => entry.assessment.status === "blocked").length,
    generatedCount: report.generated.length,
    verifiedGeneratedCount: report.generated.filter((entry) => entry.reopenVerified !== false).length,
    failureCount: report.failures.length,
  };
}

async function processModule({ slsPage, promptPage, target, policy, apply, generated, failures, paths }) {
  const sections = await inventorySections(slsPage, target);
  const report = [];
  let matchedSection = !target.sectionId;
  let matchedActivity = !target.activityId;
  console.log(`Found ${sections.length} section(s).`);

  sectionLoop:
  for (const section of sections) {
    console.log(`\nSection ${section.label}: ${section.title || "(untitled)"}`);
    const opened = await openSection(slsPage, target, section);
    if (!acpTargetIncludes(target, { sectionId: opened.id })) continue;
    matchedSection = true;
    const activities = await inventoryActivities(slsPage, section);
    const sectionReport = { ...section, id: opened.id, activities: [] };
    console.log(`  ${activities.length} activit${activities.length === 1 ? "y" : "ies"}.`);

    for (const activity of activities) {
      const openedActivity = await openActivity(slsPage, target, section, opened.id, activity);
      if (!acpTargetIncludes(target, { sectionId: opened.id, activityId: openedActivity.id })) continue;
      matchedActivity = true;
      const activityReport = {
        ...activity,
        id: openedActivity.id,
        pages: [],
      };
      console.log(`  Activity ${activity.index + 1}: ${activity.title}`);
      await settleActivity(slsPage);
      const pageCount = await visiblePageCount(slsPage);

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const pageReport = { pageIndex };
        activityReport.pages.push(pageReport);

        try {
          await selectPage(slsPage, pageIndex);
          await settleActivity(slsPage);
          let state = await readStableAcpPageState(slsPage);
          let assessment = assessAcpPage(state);
          Object.assign(pageReport, { state, assessment });
          console.log(`    Page ${pageIndex + 1}: ${assessment.status} - ${assessment.reason}.`);

          if (!apply || assessment.status !== "candidate") continue;
          if (policy.maximumInteractives !== null && generated.length >= policy.maximumInteractives) {
            pageReport.limited = true;
            console.log(`      Run limit ${policy.maximumInteractives} reached; remaining candidates are unchanged.`);
            continue;
          }

          const questionText = normalizeQuestionText(assessment.question.text);
          pageReport.questionText = questionText;
          const randomization = await readFaMathRandomization(slsPage, assessment.question);
          const specificRequirements = buildAcpSpecificRequirements({ questionText, randomization });
          pageReport.randomization = randomization;
          pageReport.specificRequirements = specificRequirements || null;
          if (specificRequirements) {
            console.log(
              `      Read ${randomization.parameters.length} randomized parameter(s); ` +
                "requesting constrained source-matching sliders.",
            );
          }
          const prompt = await buildPrompt(promptPage, questionText, policy, specificRequirements);
          await slsPage.bringToFront();
          await selectPage(slsPage, pageIndex);
          const before = await readStableAcpPageState(slsPage);
          assessment = assessAcpPage(before);
          const sameQuestion = randomization
            ? assessment.question?.componentId === pageReport.assessment.question?.componentId
            : normalizeQuestionText(assessment.question?.text) === questionText;
          if (assessment.status !== "candidate" || !sameQuestion) {
            throw new GuardError(
              `The candidate changed before ACP generation in ${activity.title}, page ${pageIndex + 1}.`,
            );
          }

          const result = await createInteractive(slsPage, prompt, {
            timeoutMs: policy.generationTimeoutMs,
            completedBefore: before.completedInteractives,
          });
          await leaveEditMode(slsPage, target);
          await enterEditMode(slsPage, target);
          await openSection(slsPage, target, section);
          await openActivity(slsPage, target, section, opened.id, activity);
          await settleActivity(slsPage);
          await selectPage(slsPage, pageIndex);
          await settleActivity(slsPage);
          state = await readStableAcpPageState(slsPage);
          if (state.completedInteractives !== before.completedInteractives + 1) {
            throw new GuardError(
              `ACP reported Add, but the reopened page changed from ${before.completedInteractives} ` +
                `to ${state.completedInteractives} completed interactives instead of increasing by one.`,
            );
          }
          if (result.fileName && !state.completedInteractiveFiles.includes(result.fileName)) {
            throw new GuardError(`ACP ZIP ${result.fileName} was not present after reopening the activity.`);
          }
          pageReport.stateAfter = state;
          pageReport.assessmentAfter = assessAcpPage(state);
          pageReport.applyStatus = "generated";
          const evidence = {
            section: { label: section.label, title: section.title, id: opened.id },
            activity: { title: activity.title, index: activity.index, id: openedActivity.id },
            pageIndex,
            questionText,
            grade: policy.grade,
            subject: policy.subject,
            randomization,
            specificRequirements: specificRequirements || null,
            promptCharacters: prompt.length,
            reopenVerified: true,
            ...result,
          };
          generated.push(evidence);
          console.log(`      Added and locally verified ACP interactive (${result.fileName || "generated ZIP"}).`);
        } catch (error) {
          if (!isRecoverableAcpPageError(error)) throw error;
          const message = firstErrorLine(error);
          if (!pageReport.assessment) {
            pageReport.assessment = { status: "blocked", reason: `ACP page review failed: ${message}` };
          }
          pageReport.applyStatus = apply ? "failed" : null;
          pageReport.error = serializeAcpError(error);
          const failure = await recordAcpFailure(failures, {
            stage: apply ? "apply" : "review",
            page: slsPage,
            paths,
            section: { label: section.label, title: section.title, id: opened.id },
            activity: { title: activity.title, index: activity.index, id: openedActivity.id },
            pageIndex,
            questionText: pageReport.questionText || normalizeQuestionText(pageReport.assessment?.question?.text),
            error,
          });
          pageReport.failureId = failure.id;
          pageReport.assessmentAfter ??= { status: "error", reason: failure.message };
          console.log(`      ACP follow-up logged; continuing after: ${failure.message}`);

          if (apply) {
            try {
              await recoverAfterAcpPageFailure(slsPage, target, {
                sectionId: opened.id,
                activityId: openedActivity.id,
              });
              console.log("      SLS edit view recovered; moving to the next page.");
            } catch (recoveryError) {
              failure.recoveryError = serializeAcpError(recoveryError);
              throw recoveryError;
            }
          }
        }
      }
      sectionReport.activities.push(activityReport);
      if (target.activityId) break;
    }
    report.push(sectionReport);
    if (target.activityId && matchedActivity) break sectionLoop;
  }
  if (!matchedSection) throw new GuardError(`Supplied section ${target.sectionId} was not found in the module.`);
  if (!matchedActivity) throw new GuardError(`Supplied activity ${target.activityId} was not found in the module.`);
  return report;
}

function isRecoverableAcpPageError(error) {
  const message = String(error?.message ?? error ?? "");
  if (/authentication is required|authentication was not found/i.test(message)) return false;
  if (/SLS reported that the action result is uncertain/i.test(message)) return false;
  if (/Target page, context or browser has been closed|Browser has been closed/i.test(message)) return false;
  return true;
}

async function recordAcpFailure(failures, {
  stage,
  page,
  paths,
  section,
  activity,
  pageIndex,
  questionText,
  error,
}) {
  const failure = {
    id: buildAcpFailureId({ stage, section, activity, pageIndex, ordinal: failures.length + 1 }),
    stage,
    section: normalizeFailureSection(section),
    activity: normalizeFailureActivity(activity),
    pageIndex,
    pageNo: Number.isInteger(pageIndex) ? pageIndex + 1 : null,
    questionText: normalizeQuestionText(questionText),
    message: firstErrorLine(error),
    error: serializeAcpError(error),
  };

  if (paths?.runDir && page) {
    const screenshotPath = path.join(paths.runDir, `${failure.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true })
      .then(() => { failure.screenshotPath = screenshotPath; })
      .catch((screenshotError) => {
        failure.screenshotError = firstErrorLine(screenshotError);
      });
  }

  failures.push(failure);
  return failure;
}

function buildAcpFailureId({ stage, section, activity, pageIndex, ordinal }) {
  return [
    "acp",
    String(ordinal).padStart(2, "0"),
    stage,
    `s-${section?.label ?? section?.id ?? "unknown"}`,
    `a-${Number.isInteger(activity?.index) ? activity.index + 1 : activity?.id ?? "unknown"}`,
    `p-${Number.isInteger(pageIndex) ? pageIndex + 1 : "unknown"}`,
  ].map(safeSlug).join("-");
}

function normalizeFailureSection(section = {}) {
  return {
    label: section.label ?? null,
    title: section.title ?? null,
    id: section.id ?? null,
  };
}

function normalizeFailureActivity(activity = {}) {
  return {
    title: activity.title ?? null,
    index: Number.isInteger(activity.index) ? activity.index : null,
    id: activity.id ?? null,
  };
}

function serializeAcpError(error) {
  return {
    name: error?.name ?? "Error",
    message: String(error?.message ?? error ?? ""),
    stack: error?.stack ?? null,
  };
}

function firstErrorLine(error) {
  return String(error?.message ?? error ?? "Unknown ACP failure")
    .split(/\r?\n/)[0]
    .replace(/\s+/g, " ")
    .trim() || "Unknown ACP failure";
}

function safeSlug(value) {
  return String(value ?? "unknown")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "unknown";
}

export function formatAcpFailureSummary(input = []) {
  const failures = Array.isArray(input) ? input : input?.failures ?? [];
  return failures.map((failure) => formatAcpFailureLine(failure));
}

function formatAcpFailureLine(failure) {
  const section = failure.section?.label
    ? `Section ${failure.section.label}`
    : (failure.section?.id ? `Section ${failure.section.id}` : "Unknown section");
  const activityNumber = Number.isInteger(failure.activity?.index)
    ? `Activity ${failure.activity.index + 1}`
    : (failure.activity?.id ? `Activity ${failure.activity.id}` : "Unknown activity");
  const activityTitle = failure.activity?.title ? ` "${failure.activity.title}"` : "";
  const pageNo = failure.pageNo ?? (Number.isInteger(failure.pageIndex) ? failure.pageIndex + 1 : "?");
  const message = failure.message || failure.error?.message || "Unknown ACP failure";
  return `${section}; ${activityNumber}${activityTitle}; Page ${pageNo}; ${failure.stage || "apply"}: ${message}`;
}

async function recoverAfterAcpPageFailure(page, target, { sectionId, activityId } = {}) {
  await page.bringToFront().catch(() => {});
  await closeVisibleAcpDialogs(page);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(750);
  await assertNoSlsError(page);
  if (sectionId && activityId) {
    await openActivityById(page, target, sectionId, activityId);
    await settleActivity(page);
    return;
  }
  await enterEditMode(page, target);
}

async function closeVisibleAcpDialogs(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const modal = page.locator(".bx--modal-container:visible").last();
    if ((await modal.count().catch(() => 0)) === 0 || !(await modal.isVisible().catch(() => false))) return;
    const close = modal
      .locator("button.bx--modal-close:visible")
      .or(modal.getByRole("button", { name: /^(cancel|close)$/i }))
      .first();
    const clicked = (await close.count().catch(() => 0)) > 0 &&
      (await close.isEnabled().catch(() => false));
    if (clicked) {
      await close.click().catch(async () => { await page.keyboard.press("Escape").catch(() => {}); });
    } else {
      await page.keyboard.press("Escape").catch(() => {});
    }
    await page.waitForTimeout(1_000);
  }
}

export function acpTargetIncludes(target, { sectionId, activityId = null }) {
  if (target.sectionId && String(target.sectionId) !== String(sectionId)) return false;
  if (activityId !== null && target.activityId && String(target.activityId) !== String(activityId)) return false;
  return true;
}

async function buildPrompt(page, questionText, policy, specificRequirements = "") {
  await page.bringToFront();
  if (!page.url().startsWith(PROMPT_LIBRARY_URL)) {
    await page.goto(PROMPT_LIBRARY_URL, { waitUntil: "domcontentloaded" });
  }
  await page.locator("#topic").fill(questionText);
  await page.locator("#gradeLevel").selectOption(policy.grade);
  await page.locator("#subject").selectOption(policy.subject);
  await page.locator("#specificRequirements").fill(specificRequirements);
  await page.getByRole("button", { name: "🚀 Generate Prompt", exact: true }).click();
  const copy = page.locator("#copyBtnTop");
  await expect(copy).toBeVisible({ timeout: 30_000 });
  await copy.click();
  const highlighted = page.locator("#highlightedSection");
  await expect(highlighted).toBeVisible();
  const prompt = await highlighted.evaluate((root) => {
    const clone = root.cloneNode(true);
    clone.querySelectorAll(".copied-label").forEach((node) => node.remove());
    return (clone.innerText || clone.textContent || "").replace(/^\s+|\s+$/g, "");
  });
  if (!prompt || prompt.length < 500) {
    throw new GuardError(`Prompt Library returned only ${prompt.length} characters for "${questionText}".`);
  }
  console.log(`      Prompt Library generated ${prompt.length} characters.`);
  return prompt;
}

export async function readFaMathRandomization(page, question) {
  const componentId = String(question?.componentId ?? "");
  if (!/^component-[A-Za-z0-9_-]+$/.test(componentId)) {
    throw new GuardError("The FA Math question did not expose a stable component ID for randomization review.");
  }

  let questionEditorOpened = false;
  let modal;
  try {
    const questionComponent = page.locator(`#${componentId}:visible`);
    if ((await questionComponent.count()) !== 1) {
      throw new GuardError(`FA Math question ${componentId} was not uniquely visible.`);
    }
    const outerEdit = questionComponent.locator(".edit-indicator:visible").first();
    await expect(outerEdit).toBeVisible();
    await outerEdit.click();
    questionEditorOpened = true;
    await expect(page.getByText("Prepopulated Student Response", { exact: true })).toBeVisible();

    const defaultAnswerEditor = page.locator(
      '.field-set.default-answer .rich-text-editor.loaded [contenteditable="true"].mce-content-body:visible',
    );
    await expect(defaultAnswerEditor).toHaveCount(1);

    const algebraKit = defaultAnswerEditor.locator(".sls-algebra-kit");
    const algebraKitLoaded = await algebraKit.waitFor({ state: "attached", timeout: 8_000 })
      .then(() => true, () => false);
    if (!algebraKitLoaded) return null;
    if (await algebraKit.getAttribute("data-has-randomised") !== "true") return null;

    const nestedEdit = defaultAnswerEditor.locator(".sls-algebra-kit-wrapper button.edit:visible");
    await expect(nestedEdit).toHaveCount(1);
    await nestedEdit.click();
    modal = page.locator(".bx--modal-container:visible").filter({ hasText: "Create New Question" }).last();
    await expect(modal).toBeVisible();
    const editor = modal.locator("akit-interaction-editor:visible");
    await expect(editor).toHaveCount(1);

    const randomizationHeading = editor.locator(".heading-button-title").filter({ hasText: /^Randomization$/ });
    await expect(randomizationHeading).toHaveCount(1);
    await randomizationHeading.click();
    await expect.poll(() => editor.locator("tr").count(), {
      timeout: 20_000,
      intervals: [250, 500, 1000],
    }).toBeGreaterThan(1);

    const rowCells = await editor.locator("tr").evaluateAll((rows) => rows.map((row) => ({
      cells: Array.from(row.querySelectorAll("th,td"))
        .map((cell) => (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim()),
    })));
    const parameters = normalizeRandomizationParameters(rowCells);
    if (parameters.length === 0) {
      throw new GuardError("The randomized FA Math response opened, but no parameter definitions were readable.");
    }

    const editorTexts = await editor.locator('div.ql-editor[contenteditable="true"]:visible').allInnerTexts();
    const instructionTemplate = editorTexts
      .map((value) => normalizeQuestionText(value))
      .find((value) => value && parameters.every((parameter) =>
        new RegExp(`\\b${parameter.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(value))) ?? "";
    const expressionInputs = await editor.locator("input.akit-authoring-editor-value")
      .evaluateAll((inputs) => inputs.map((input) => input.value.trim()).filter(Boolean));

    return {
      instructionTemplate,
      answerExpression: expressionInputs[0] ?? "",
      parameters,
    };
  } finally {
    if (modal && await modal.isVisible().catch(() => false)) {
      await modal.locator("button.cancel").click().catch(async () => {
        await modal.locator('button[aria-label="Close"]').click().catch(() => {});
      });
    }
    if (questionEditorOpened) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await settleActivity(page);
      await assertNoSlsError(page);
    }
  }
}

async function createInteractive(page, prompt, { timeoutMs, completedBefore }) {
  const textComponentIdsBefore = await page.locator(".lesson-activity-component.text")
    .evaluateAll((nodes) => nodes.map((node) => node.id).filter(Boolean));
  const beforeComponents = await page.locator(".lesson-activity-component").count();
  await selectTextComponentFromAddMenu(page);
  await expect.poll(() => page.locator(".lesson-activity-component").count()).toBe(beforeComponents + 1);
  const textComponentIdsAfter = await page.locator(".lesson-activity-component.text")
    .evaluateAll((nodes) => nodes.map((node) => node.id).filter(Boolean));
  const ownTextComponentIds = textComponentIdsAfter.filter((id) => !textComponentIdsBefore.includes(id));
  if (ownTextComponentIds.length !== 1) {
    throw new GuardError(
      `Adding the ACP host exposed ${ownTextComponentIds.length} new Text components instead of one.`,
    );
  }
  const ownTextComponentId = ownTextComponentIds[0];

  const editor = page.locator('[contenteditable="true"].mce-content-body:visible').last();
  await expect(editor).toBeVisible();
  await editor.evaluate((node) => { node.focus(); node.click(); });
  await page.waitForTimeout(500);
  const opened = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button[aria-label="Authoring Copilot"]'))
      .find((node) => node.classList.contains("tox-tbtn--select") && node.getClientRects().length > 0);
    button?.click();
    return Boolean(button);
  });
  if (!opened) throw new GuardError("TinyMCE's Authoring Copilot menu was not available.");
  const interactive = page.getByText("Interactive (Beta)", { exact: true }).last();
  await expect(interactive).toBeVisible();
  await interactive.evaluate((node) => (node.closest('[role="menuitem"]') || node).click());

  let dialog = page.locator(".bx--modal-container:visible").filter({ hasText: "Generate Interactive" }).last();
  await expect(dialog).toBeVisible();
  const instructions = dialog.locator('[contenteditable="true"].mce-content-body');
  await expect(instructions).toHaveCount(1);
  await instructions.fill(prompt);
  const createButton = dialog.locator("button.bx--btn--ai").last();
  await expect(createButton).toBeVisible();
  const createClicked = await createButton.evaluate((button) => {
    if (button.disabled || (button.innerText || "").trim() !== "CREATE") return false;
    button.click();
    return true;
  });
  if (!createClicked) throw new GuardError("ACP's CREATE control was unavailable after the prompt was filled.");

  console.log("      ACP generation started; waiting for the generated preview and ADD control...");
  const started = Date.now();
  let nextUpdate = started + 30_000;
  let addClicked = false;
  while (Date.now() - started < timeoutMs) {
    await assertNoSlsError(page);
    const addButton = await findAcpPreviewAddButton(page);
    if (await isUsableLocator(addButton)) {
      const current = await readAcpPageState(page);
      const preAdd = assessAcpPreAddState({
        completedBefore,
        textComponentIdsBefore,
        ownTextComponentId,
      }, current);
      if (!preAdd.safe) {
        throw new GuardError(
          `ACP preview is ready, but ${preAdd.reason}; ADD was not clicked.`,
        );
      }
      await addButton.click();
      addClicked = true;
      break;
    }
    const body = await page.locator("body").innerText().catch(() => "");
    if (/generation (failed|was unsuccessful)|unable to generate|try again/i.test(body)) {
      throw new GuardError("ACP reported that interactive generation failed.");
    }
    if (Date.now() >= nextUpdate) {
      console.log(`      Still generating (${Math.round((Date.now() - started) / 1000)}s elapsed)...`);
      nextUpdate += 30_000;
    }
    await page.waitForTimeout(5_000);
  }
  if (!addClicked) throw new GuardError(`ACP did not expose ADD within ${Math.round(timeoutMs / 1000)} seconds.`);

  await expect(page.locator(".bx--modal-container:visible")).toHaveCount(0, { timeout: 30_000 });

  const completed = async () => (await readAcpPageState(page)).completedInteractives;
  await expect.poll(completed, { timeout: 45_000, intervals: [1000, 2000, 3000] })
    .toBe(completedBefore + 1);
  const state = await readStableAcpPageState(page);
  return {
    generationSeconds: Math.round((Date.now() - started) / 1000),
    fileName: state.completedInteractiveFiles.at(-1) ?? null,
  };
}

export async function findAcpPreviewAddButton(page) {
  const dialog = await activeAcpPreviewDialog(page);
  const roleButton = dialog.getByRole("button", { name: /^add$/i }).last();
  if (await isUsableLocator(roleButton)) return roleButton;
  const iconButton = dialog.locator('button:visible:has(svg[name="Plus24"])')
    .filter({ hasText: /\badd\b/i })
    .last();
  if (await isUsableLocator(iconButton)) return iconButton;
  return dialog.locator("button:visible")
    .filter({ hasText: /\badd\b/i })
    .last();
}

async function activeAcpPreviewDialog(page) {
  const dialogs = page.locator(".bx--modal-container:visible");
  const previewDialog = dialogs.filter({ hasText: /Preview Interactive/i }).last();
  if (await isVisibleLocator(previewDialog)) return previewDialog;
  return dialogs.last();
}

async function isUsableLocator(locator) {
  return await isVisibleLocator(locator) && await locator.isEnabled().catch(() => false);
}

async function isVisibleLocator(locator) {
  return (await locator.count().catch(() => 0)) > 0 && await locator.isVisible().catch(() => false);
}

export async function selectTextComponentFromAddMenu(page, { timeoutMs = 10_000 } = {}) {
  const menu = page.locator(".add-component-bar .multi-layer-menu:visible").last();
  const textMediaTrigger = menu.locator(
    ":scope > ul.menu > li.text-media:visible > .item-wrapper:visible",
  );
  if ((await textMediaTrigger.count()) !== 1) {
    throw new GuardError("Text/Media was not available in the visible ADD NEW menu.");
  }

  // SLS exposes the submenu through the browser's real :hover state. Synthetic
  // mouseenter events do not activate that CSS state, and the Text entry is a
  // generic multi-layer-menu-item rather than the retired li.text selector.
  await textMediaTrigger.hover();
  const textMediaItem = textMediaTrigger.locator("xpath=parent::li");
  const textLabel = textMediaItem.getByText("Text", { exact: true });
  try {
    await textLabel.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    throw new GuardError("SLS's visible Text/Media menu did not expose Text in time.");
  }
  if ((await textLabel.count()) !== 1) {
    throw new GuardError("SLS's visible Text/Media menu exposed an ambiguous Text option.");
  }
  await textLabel.click();
}

async function verifyGeneratedEntry(page, target, entry) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await openActivityById(page, target, entry.section.id, entry.activity.id);
    await settleActivity(page);
    await selectPage(page, entry.pageIndex);
    await settleActivity(page);
    const state = await readStableAcpPageState(page);
    const found = state.completedInteractiveFiles.some((name) =>
      entry.fileName ? name === entry.fileName : /\.zip$/i.test(name),
    );
    if (found) {
      entry.reopenVerified = true;
      console.log(`  Verified ${entry.activity.title}, page ${entry.pageIndex + 1}: ${entry.fileName || "ZIP present"}.`);
      return;
    }
    if (attempt === 0) {
      console.log(`  Reloading ${entry.activity.title}, page ${entry.pageIndex + 1} once before the final ACP check...`);
    }
  }
  throw new GuardError(
    `Generated ACP interactive did not persist in ${entry.activity.title}, page ${entry.pageIndex + 1}.`,
  );
}

export async function readAcpPageState(page) {
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    const visible = (node) => {
      if (!(node instanceof Element)) return false;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const deepText = (root) => {
      let output = "";
      const walk = (node) => {
        if (!node) return;
        const tag = node.nodeName?.toLowerCase?.() || "";
        if (tag === "style" || tag === "script") return;
        if (tag === "img") {
          const alt = node.getAttribute?.("alt") || "";
          if (alt) output += ` ${alt} `;
          const src = node.getAttribute?.("src") || "";
          if (src.startsWith("data:image/svg+xml")) {
            try {
              const svg = decodeURIComponent(src.replace(/^data:image\/svg\+xml[^,]*,/, ""));
              const mathml = /<!--\s*MathML:\s*([\s\S]*?)-->/.exec(svg)?.[1];
              if (mathml) output += ` ${mathml} `;
            } catch {}
          }
        }
        if (node.nodeType === Node.TEXT_NODE) output += ` ${node.nodeValue} `;
        if (node.shadowRoot) walk(node.shadowRoot);
        for (const child of node.childNodes || []) walk(child);
      };
      walk(root);
      return output.replace(/\s+/g, " ").trim();
    };
    const currentComponents = Array.from(document.querySelectorAll(".lesson-activity-component"))
      .filter(visible);
    const questionComponents = currentComponents.filter((component) => component.classList.contains("question"));
    const faQuestions = questionComponents.flatMap((component) => {
      const componentKey = component.id.replace(/^component-/, "");
      const settings = document.getElementById(`settings-card-${componentKey}`);
      const settingsText = deepText(settings);
      if (!/\bFA\s*Math\b/i.test(settingsText) &&
          !/Feedback Assistant\s*-\s*Mathematics/i.test(settingsText)) return [];
      const number = Number(/\bQ(\d+)\b/i.exec(component.innerText || settingsText)?.[1]);
      const algebraKit = Array.from(component.querySelectorAll("akit-interaction"))
        .find((host) => deepText(host).trim());
      let text = algebraKit ? deepText(algebraKit) : "";
      if (!text) {
        const shadowHost = Array.from(component.querySelectorAll("*"))
          .find((host) => host.shadowRoot && deepText(host).trim());
        text = shadowHost ? deepText(shadowHost) : "";
      }
      return [{ componentId: component.id || null, number: Number.isFinite(number) ? number : null, text }];
    });

    const textComponents = currentComponents.filter((component) => component.classList.contains("text"));
    const completedInteractiveFiles = textComponents
      .flatMap((component) => {
        const names = Array.from(component.querySelectorAll('a[href*=".zip" i], button, a'))
          .map((node) => (node.textContent || node.getAttribute("download") || "").replace(/\s+/g, " ").trim())
          .flatMap((text) => text.match(/[\w.-]+\.zip\b/gi) || []);
        if (names.length > 0) return names;
        return (component.innerText || "").match(/[\w.-]+\.zip\b/gi) || [];
      });
    const pendingTextComponentIds = textComponents.filter((component) => {
      const text = (component.innerText || "")
        .replace(/\bMove Up\b|\bMove Down\b|\bRead More\b|\bRead Less\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      return !/[\w.-]+\.zip\b/i.test(text) && !text;
    }).map((component) => component.id || null);
    return {
      faQuestions,
      completedInteractives: completedInteractiveFiles.length,
      completedInteractiveFiles,
      pendingTextComponents: pendingTextComponentIds.length,
      pendingTextComponentIds,
      textComponentIds: textComponents.map((component) => component.id || null),
    };
  });
  state.faQuestions = state.faQuestions.map((question) => ({
    ...question,
    text: normalizeQuestionText(question.text),
  }));
  return state;
}

export async function readStableAcpPageState(page, {
  timeoutMs = 35_000,
  reloadOnPending = true,
} = {}) {
  for (let loadAttempt = 0; loadAttempt < (reloadOnPending ? 2 : 1); loadAttempt += 1) {
    const started = Date.now();
    let previous = "";
    let steady = 0;
    let state;
    while (Date.now() - started < timeoutMs) {
      state = await readAcpPageState(page);
      const signature = JSON.stringify({
        questions: state.faQuestions.map((question) => question.componentId),
        textComponents: state.textComponentIds,
        files: state.completedInteractiveFiles,
        pending: state.pendingTextComponents,
      });
      if (signature === previous && state.pendingTextComponents === 0) steady += 1;
      else steady = 0;
      previous = signature;
      if (steady >= 2) return state;
      await page.waitForTimeout(750);
    }
    if (loadAttempt === 0 && reloadOnPending) {
      console.log("      Text attachment evidence is still loading; reopening this page once before deciding...");
      await page.reload({ waitUntil: "domcontentloaded" });
      await settleActivity(page);
      continue;
    }
    throw new GuardError(
      `SLS left ${state?.pendingTextComponents ?? "unknown"} Text component(s) unhydrated; ` +
        "ACP candidate status cannot be decided safely.",
    );
  }
  throw new GuardError("ACP page state did not stabilize.");
}

function allPages(sections) {
  const pages = [];
  for (const section of sections ?? []) {
    for (const activity of section.activities ?? []) pages.push(...(activity.pages ?? []));
  }
  return pages;
}
