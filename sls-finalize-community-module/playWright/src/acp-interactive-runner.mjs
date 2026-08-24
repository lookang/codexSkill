import fs from "node:fs/promises";
import path from "node:path";
import { expect as baseExpect } from "@playwright/test";
import { assessAcpPage, normalizeAcpOptions, normalizeQuestionText } from "./acp-interactive.mjs";
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
    schemaVersion: 1,
    action: "acp-interactive",
    mode: apply ? "apply" : "review",
    startedAt: new Date().toISOString(),
    target,
    policy,
    sections: [],
    generated: [],
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
    });
    await leaveEditMode(slsPage, target);

    if (apply && report.generated.length > 0) {
      console.log("\nReopening generated activities to verify their ACP ZIPs persisted...");
      await enterEditMode(slsPage, target);
      for (const entry of report.generated) await verifyGeneratedEntry(slsPage, target, entry);
      await leaveEditMode(slsPage, target);
    }

    report.status = apply ? "completed" : "reviewed";
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
  };
}

async function processModule({ slsPage, promptPage, target, policy, apply, generated }) {
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
        await selectPage(slsPage, pageIndex);
        await settleActivity(slsPage);
        let state = await readAcpPageState(slsPage);
        let assessment = assessAcpPage(state);
        const pageReport = { pageIndex, state, assessment };
        activityReport.pages.push(pageReport);
        console.log(`    Page ${pageIndex + 1}: ${assessment.status} - ${assessment.reason}.`);

        if (!apply || assessment.status !== "candidate") continue;
        if (policy.maximumInteractives !== null && generated.length >= policy.maximumInteractives) {
          pageReport.limited = true;
          console.log(`      Run limit ${policy.maximumInteractives} reached; remaining candidates are unchanged.`);
          continue;
        }

        const questionText = normalizeQuestionText(assessment.question.text);
        const prompt = await buildPrompt(promptPage, questionText, policy);
        await slsPage.bringToFront();
        await selectPage(slsPage, pageIndex);
        const before = await readAcpPageState(slsPage);
        assessment = assessAcpPage(before);
        if (assessment.status !== "candidate" || normalizeQuestionText(assessment.question.text) !== questionText) {
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
        state = await readAcpPageState(slsPage);
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
        const evidence = {
          section: { label: section.label, title: section.title, id: opened.id },
          activity: { title: activity.title, index: activity.index, id: openedActivity.id },
          pageIndex,
          questionText,
          grade: policy.grade,
          subject: policy.subject,
          promptCharacters: prompt.length,
          reopenVerified: true,
          ...result,
        };
        generated.push(evidence);
        console.log(`      Added and locally verified ACP interactive (${result.fileName || "generated ZIP"}).`);
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

export function acpTargetIncludes(target, { sectionId, activityId = null }) {
  if (target.sectionId && String(target.sectionId) !== String(sectionId)) return false;
  if (activityId !== null && target.activityId && String(target.activityId) !== String(activityId)) return false;
  return true;
}

async function buildPrompt(page, questionText, policy) {
  await page.bringToFront();
  if (!page.url().startsWith(PROMPT_LIBRARY_URL)) {
    await page.goto(PROMPT_LIBRARY_URL, { waitUntil: "domcontentloaded" });
  }
  await page.locator("#topic").fill(questionText);
  await page.locator("#gradeLevel").selectOption(policy.grade);
  await page.locator("#subject").selectOption(policy.subject);
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

async function createInteractive(page, prompt, { timeoutMs, completedBefore }) {
  const beforeComponents = await page.locator(".lesson-activity-component").count();
  await selectTextComponentFromAddMenu(page);
  await expect.poll(() => page.locator(".lesson-activity-component").count()).toBe(beforeComponents + 1);

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
    addClicked = await page.locator(".bx--modal-container:visible button")
      .evaluateAll((buttons) => {
        const button = buttons.find((node) =>
          node.getClientRects().length > 0 && !node.disabled && (node.innerText || "").trim() === "ADD");
        if (!button) return false;
        button.click();
        return true;
      });
    if (addClicked) {
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
  const state = await readAcpPageState(page);
  return {
    generationSeconds: Math.round((Date.now() - started) / 1000),
    fileName: state.completedInteractiveFiles.at(-1) ?? null,
  };
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
    const state = await readAcpPageState(page);
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
  return page.evaluate(() => {
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
      return [{ number: Number.isFinite(number) ? number : null, text }];
    });

    const completedInteractiveFiles = currentComponents
      .filter((component) => component.classList.contains("text"))
      .flatMap((component) => {
        const names = Array.from(component.querySelectorAll('a[href*=".zip" i], button, a'))
          .map((node) => (node.textContent || node.getAttribute("download") || "").replace(/\s+/g, " ").trim())
          .flatMap((text) => text.match(/[\w.-]+\.zip\b/gi) || []);
        if (names.length > 0) return names;
        return (component.innerText || "").match(/[\w.-]+\.zip\b/gi) || [];
      });
    return {
      faQuestions,
      completedInteractives: completedInteractiveFiles.length,
      completedInteractiveFiles,
    };
  });
}

function allPages(sections) {
  const pages = [];
  for (const section of sections ?? []) {
    for (const activity of section.activities ?? []) pages.push(...(activity.pages ?? []));
  }
  return pages;
}
