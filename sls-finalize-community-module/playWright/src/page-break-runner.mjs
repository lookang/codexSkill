import fs from "node:fs/promises";
import path from "node:path";
import { expect as baseExpect } from "@playwright/test";
import { createRunPaths, saveJson } from "./io.mjs";
import {
  GuardError,
  assertAuthStateAvailable,
  assertNoSlsError,
  createSlsContext,
  launchSlsBrowser,
} from "./sls-runner.mjs";
import {
  advancePageBreakScan,
  assessPageForBreak,
  normalizePageBreakPolicy,
} from "./page-break.mjs";

const SLS_ORIGIN = "https://vle.learning.moe.edu.sg";
const PAGE_BREAK_MENU_TIMEOUT_MS = 10_000;
const PAGE_BREAK_PAGINATION_TIMEOUT_MS = 45_000;
let expect = baseExpect.configure({ timeout: 20_000 });

export async function runPageBreakWorkflow({ target, options, apply = false }) {
  expect = baseExpect.configure({ timeout: options.timeoutMs ?? 20_000 });
  const policy = normalizePageBreakPolicy(options.pageBreakPolicy);
  const paths = await createRunPaths(options, target.id);
  const report = {
    schemaVersion: 1,
    action: "page-break",
    mode: apply ? "apply" : "review",
    startedAt: new Date().toISOString(),
    target,
    policy,
    status: "running",
    review: null,
    verificationRequested: options.verifyAfterApply === true,
    verification: null,
    insertedBreaks: [],
    skippedAmbiguousPages: [],
    error: null,
  };

  let browser;
  let context;
  let page;
  try {
    await assertAuthStateAvailable(options.authStatePath);
    browser = await launchSlsBrowser(options);
    context = await createSlsContext(browser, options);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(options.timeoutMs ?? 20_000);
    page.setDefaultNavigationTimeout(Math.max(options.timeoutMs ?? 20_000, 30_000));

    await enterEditMode(page, target);
    report.review = await inspectModule(page, target, policy, {
      apply,
      insertedBreaks: report.insertedBreaks,
    });
    report.skippedAmbiguousPages = skippedPageSummaries(report.review);
    await leaveEditMode(page, target);

    if (apply && report.verificationRequested) {
      console.log("\nReopening the module to verify every saved page break...");
      await enterEditMode(page, target);
      report.verification = await inspectModule(page, target, policy, { apply: false });
      const unresolved = unresolvedPages(report.verification);
      await leaveEditMode(page, target);
      if (unresolved.length > 0) {
        throw new GuardError(
          `${unresolved.length} long page(s) still need review after reopening. ` +
            "No further divider was guessed; inspect the report and trace.",
        );
      }
    } else if (apply) {
      console.log(
        "\nSkipping the full reopen audit. Each inserted break was already checked by its save response " +
          "and verified page-count increase; use --verify for a complete second sweep.",
      );
    }

    report.status = apply ? "completed" : "reviewed";
    const screenshotName = apply
      ? report.verificationRequested
        ? "page-break-verified.png"
        : "page-break-completed.png"
      : "page-break-review.png";
    const screenshotPath = path.join(paths.runDir, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    report.screenshotPath = screenshotPath;
    await saveJson(paths.reportPath, { ...report, finishedAt: new Date().toISOString() });

    if (options.holdOpen && !options.headless) {
      console.log("\nThe final Module View is open in Chrome.");
      await options.holdOpen();
    }
  } catch (error) {
    report.status = "stopped";
    report.error = { name: error.name, message: error.message, stack: error.stack };
    if (page) {
      await page
        .screenshot({ path: path.join(paths.runDir, "page-break-failure.png"), fullPage: true })
        .catch(() => {});
    }
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await saveJson(paths.reportPath, report).catch(() => {});
    if (context) {
      await context.tracing.stop({ path: paths.tracePath }).catch(() => {});
      await context.close().catch(() => {});
    }
    if (browser) await browser.close().catch(() => {});
    if (!context) {
      await fs
        .writeFile(
          path.join(paths.runDir, "trace-unavailable.txt"),
          "Chrome did not open, so no Playwright trace was created.\n",
          "utf8",
        )
        .catch(() => {});
    }
  }

  return {
    ...paths,
    report,
    candidateCount: candidatePages(report.review).length,
    blockedCount: blockedPages(report.review).length,
  };
}

async function inspectModule(page, target, policy, { apply, insertedBreaks = [] }) {
  const sections = await inventorySections(page, target);
  const result = { sections: [], sectionCount: sections.length };
  console.log(`Found ${sections.length} section(s).`);

  for (const section of sections) {
    console.log(`\nSection ${section.label}: ${section.title || "(untitled)"}`);
    const opened = await openSection(page, target, section);
    const activities = await inventoryActivities(page, section);
    const sectionReport = { ...section, id: opened.id, activities: [] };
    console.log(`  ${activities.length} activit${activities.length === 1 ? "y" : "ies"}.`);

    for (const activity of activities) {
      const openedActivity = await openActivity(page, target, section, opened.id, activity);
      console.log(`  Activity ${activity.index + 1}: ${activity.title}`);
      const activityReport = await inspectActivity(page, policy, {
        apply,
        section,
        sectionId: opened.id,
        activity: { ...activity, id: openedActivity.id },
        insertedBreaks,
      });
      sectionReport.activities.push({ ...activity, id: openedActivity.id, ...activityReport });
    }
    result.sections.push(sectionReport);
  }
  return result;
}

async function inspectActivity(page, policy, context) {
  let inserted = 0;
  let pages = await inspectActivityPages(page, policy);
  printPageAssessments(pages);
  if (!context.apply) return { pages, insertedBreaks: 0 };

  for (; inserted < policy.maximumBreaksPerActivity; inserted += 1) {
    const wanted = pages.find((entry) => entry.assessment.needsBreak);
    if (!wanted) break;

    await selectPage(page, wanted.pageIndex);
    await settleActivity(page);
    const freshMetrics = await readPageMetrics(page);
    const fresh = assessPageForBreak(freshMetrics, policy);
    if (
      !fresh.needsBreak ||
      fresh.candidate?.dividerIndex !== wanted.assessment.candidate?.dividerIndex ||
      fresh.candidate?.questionId !== wanted.assessment.candidate?.questionId
    ) {
      throw new GuardError(
        `The page-break boundary changed after re-locating ${context.activity.title}. ` +
          "Nothing was clicked on that boundary.",
      );
    }

    const pageCountBefore = await visiblePageCount(page);
    const insertion = await insertOnePageBreak(page, fresh.candidate);
    await expect
      .poll(() => visiblePageCount(page), {
        message: "Wait for the saved page break to add exactly one page",
        timeout: PAGE_BREAK_PAGINATION_TIMEOUT_MS,
      })
      .toBe(pageCountBefore + 1)
      .catch(() => {});
    const pageCountAfter = await visiblePageCount(page);
    if (pageCountAfter !== pageCountBefore + 1) {
      throw new GuardError(
        `SLS accepted a page-break request for ${context.activity.title}, but the page count changed ` +
          `from ${pageCountBefore} to ${pageCountAfter} instead of increasing by one. ` +
          "The result is uncertain; do not retry automatically.",
      );
    }

    const evidence = {
      section: context.section,
      sectionId: context.sectionId,
      activity: context.activity,
      pageIndexBefore: wanted.pageIndex,
      questionId: fresh.candidate.questionId,
      questionText: fresh.candidate.questionText,
      pageCountBefore,
      pageCountAfter,
      responseStatus: insertion.status,
      responseUrl: insertion.url,
    };
    context.insertedBreaks.push(evidence);
    console.log(
      `    Added page break before ${fresh.candidate.questionText || `question ${fresh.candidate.questionIndex + 1}`}; ` +
        `pages ${pageCountBefore} -> ${pageCountAfter}.`,
    );
    const forwardScan = advancePageBreakScan(pages, wanted.pageIndex);
    console.log(
      `    Inspecting only the new continuation page ${forwardScan.nextPageIndex + 1}; ` +
        `pages 1-${forwardScan.nextPageIndex} stay checkpointed until the final reopen audit.`,
    );
    const continuationPage = await inspectActivityPages(page, policy, {
      startPageIndex: forwardScan.nextPageIndex,
      endPageIndexExclusive: forwardScan.nextPageIndex + 1,
    });
    pages = [
      ...forwardScan.completedPages,
      ...continuationPage,
      ...forwardScan.shiftedFollowingPages,
    ];
  }

  if (inserted >= policy.maximumBreaksPerActivity && pages.some((entry) => entry.assessment.needsBreak)) {
    throw new GuardError(
      `${context.activity.title} reached the ${policy.maximumBreaksPerActivity}-break safety limit.`,
    );
  }
  printPageAssessments(pages);
  return { pages, insertedBreaks: inserted };
}

async function inspectActivityPages(
  page,
  policy,
  { startPageIndex = 0, endPageIndexExclusive = null } = {},
) {
  await settleActivity(page);
  const count = await visiblePageCount(page);
  const endPageIndex = endPageIndexExclusive ?? count;
  if (!Number.isInteger(startPageIndex) || startPageIndex < 0 || startPageIndex > count) {
    throw new GuardError(
      `Cannot resume page inspection at page ${startPageIndex + 1}; the activity exposes ${count} page(s).`,
    );
  }
  if (!Number.isInteger(endPageIndex) || endPageIndex < startPageIndex || endPageIndex > count) {
    throw new GuardError(
      `Cannot end page inspection before page ${endPageIndex + 1}; the activity exposes ${count} page(s).`,
    );
  }
  const pages = [];
  for (let pageIndex = startPageIndex; pageIndex < endPageIndex; pageIndex += 1) {
    await selectPage(page, pageIndex);
    await settleActivity(page);
    const metrics = await readPageMetrics(page);
    pages.push({ pageIndex, metrics, assessment: assessPageForBreak(metrics, policy) });
    const currentCount = await visiblePageCount(page);
    if (currentCount !== count) {
      throw new GuardError("The activity page count changed during read-only inspection.");
    }
  }
  return pages;
}

async function readPageMetrics(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const rectFor = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top + window.scrollY,
        bottom: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        right: rect.right + window.scrollX,
        width: rect.width,
        height: rect.height,
      };
    };
    const outermost = (elements) => elements.filter(
      (element) => !elements.some((other) => other !== element && other.contains(element)),
    );

    const questionCandidates = Array.from(
      document.querySelectorAll(
        ".component.question-component, .quiz-question-container, .question-body",
      ),
    ).filter(visible);
    const questions = outermost(questionCandidates).map((element, index) => ({
      ...rectFor(element),
      id:
        element.id ||
        element.closest("[id^='settings-card-']")?.id ||
        `question-${index + 1}`,
      text: (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 240),
    }));

    const componentCandidates = Array.from(
      document.querySelectorAll(
        ".lesson-activity-container, .lesson-activity-component, .component.question-component, .quiz-question-container, .question-body, .text-component, .media-component",
      ),
    ).filter(visible);
    const components = outermost(componentCandidates).map(rectFor);

    const dividerControls = Array.from(document.querySelectorAll(".divider-button"))
      .map((shell) => ({ shell, control: shell.querySelector("button") }))
      .filter(({ control }) => control && visible(control));
    const dividers = dividerControls.map(({ shell, control }, index) => {
      const label = [
        control.getAttribute("aria-label"),
        control.getAttribute("title"),
        shell.innerText,
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      return {
        ...rectFor(control),
        index,
        disabled: Boolean(control.disabled) || control.getAttribute("aria-disabled") === "true",
        existingBreak:
          control.getAttribute("aria-pressed") === "true" ||
          /(^|\s)(active|selected|page-break-active)(\s|$)/i.test(shell.className || "") ||
          /remove|delete page break/i.test(label),
        label,
      };
    });

    const boxes = [...components, ...questions];
    const contentTop = boxes.length ? Math.min(...boxes.map((box) => box.top)) : 0;
    const contentBottom = boxes.length
      ? Math.max(...boxes.map((box) => box.bottom))
      : document.documentElement.scrollHeight;
    return {
      viewportHeight: window.innerHeight,
      contentTop,
      contentBottom,
      questions,
      dividers,
      documentHeight: document.documentElement.scrollHeight,
    };
  });
}

async function insertOnePageBreak(page, candidate) {
  const dividers = page.locator(".divider-button button:visible");
  const count = await dividers.count();
  if (candidate.dividerIndex < 0 || candidate.dividerIndex >= count) {
    throw new GuardError(
      `Expected recorded divider ${candidate.dividerIndex + 1}, but only ${count} visible divider(s) remain.`,
    );
  }
  const divider = dividers.nth(candidate.dividerIndex);
  await divider.scrollIntoViewIfNeeded();
  const dividerY = await divider.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return rect.top + window.scrollY + rect.height / 2;
  });

  // SLS delegates the plus-button click to its divider shell. A normal pointer
  // click on the nested icon is intercepted by that shell, so dispatch the
  // shell's own click and then follow the real Display > Page Break > Single
  // menu path.
  await divider.evaluate((button) => button.closest(".divider-button")?.click());
  const single = await waitForScopedPageBreakSingle(page, dividerY, {
    timeoutMs: PAGE_BREAK_MENU_TIMEOUT_MS,
  });

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/apis/lesson/page/break/"),
    { timeout: 20_000 },
  );
  await single.evaluate((label) => label.closest("li")?.click());
  let response;
  try {
    response = await responsePromise;
  } catch {
    throw new GuardError(
      "The page-break control was clicked, but its save response could not be observed. " +
        "The result is uncertain; do not retry automatically.",
    );
  }
  await assertNoSlsError(page);
  if (!response.ok()) {
    throw new GuardError(`SLS page-break save returned HTTP ${response.status()}.`);
  }
  await page.waitForTimeout(1200);
  return { status: response.status(), url: response.url() };
}

export async function waitForScopedPageBreakSingle(
  page,
  dividerY,
  { timeoutMs = PAGE_BREAK_MENU_TIMEOUT_MS, maximumDistance = 600 } = {},
) {
  const displayTriggers = page.locator(
    ".add-component-bar .multi-layer-menu li.display:visible > .item-wrapper:visible",
  );
  const deadline = Date.now() + timeoutMs;
  let closest = null;

  while (Date.now() < deadline) {
    const positions = await displayTriggers.evaluateAll((triggers) => triggers.map((trigger, index) => {
      const rect = trigger.getBoundingClientRect();
      return {
        index,
        y: rect.top + window.scrollY + rect.height / 2,
      };
    }));
    closest = positions
      .map((entry) => ({ ...entry, distance: Math.abs(entry.y - dividerY) }))
      .sort((left, right) => left.distance - right.distance)[0] ?? null;
    if (closest && Number.isFinite(closest.distance) && closest.distance <= maximumDistance) break;
    await page.waitForTimeout(200);
  }

  if (!closest || !Number.isFinite(closest.distance) || closest.distance > maximumDistance) {
    throw new GuardError(
      "SLS did not expose a visible Display menu near the selected divider within the allowed wait.",
    );
  }

  const displayTrigger = displayTriggers.nth(closest.index);
  await displayTrigger.hover();
  const displayItem = displayTrigger.locator("xpath=parent::li");
  const pageBreakLabel = displayItem.getByText("Page Break", { exact: true });
  try {
    await pageBreakLabel.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    throw new GuardError("SLS's visible Display menu did not expose Page Break in time.");
  }

  const pageBreakItem = pageBreakLabel.locator("xpath=ancestor::li[1]");
  const single = pageBreakItem.getByText("Single", { exact: true });
  // SLS can place its fixed page navigator over this fly-out even though the
  // Page Break item is visible. Activating the already-scoped menu item in the
  // DOM opens its submenu without depending on pointer hit-testing; this does
  // not create a break (only choosing Single below performs the mutation).
  await pageBreakLabel.evaluate((label) => label.closest("li")?.click());
  if (!(await single.isVisible().catch(() => false))) {
    // Retain compatibility with CSS-only hover menus used by older SLS views.
    try {
      await pageBreakLabel.hover({ timeout: Math.min(1_000, timeoutMs) });
    } catch {
      throw new GuardError(
        "SLS's Page Break menu was visible but could not be activated because another control covered it.",
      );
    }
  }
  try {
    await single.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    throw new GuardError("SLS's Page Break menu did not expose one visible Single option in time.");
  }
  if ((await single.count()) !== 1) {
    throw new GuardError("SLS's Page Break menu exposed an ambiguous Single option.");
  }
  return single;
}

export async function settleActivity(page) {
  let previous = null;
  let steady = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => {});
    await page.waitForTimeout(350);
    const signature = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      questions: document.querySelectorAll(
        ".component.question-component, .quiz-question-container, .question-body",
      ).length,
      dividers: document.querySelectorAll(".divider-button").length,
    }));
    const current = JSON.stringify(signature);
    if (current === previous) steady += 1;
    else steady = 0;
    previous = current;
    if (steady >= 2) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(250);
}

export async function visiblePageCount(page, { timeoutMs = 2_000 } = {}) {
  await expect
    .poll(() => activityPageButtons(page).count(), {
      message: "Wait for delayed activity pagination",
      timeout: timeoutMs,
      intervals: [250, 500, 750],
    })
    .toBeGreaterThan(0)
    .catch(() => {});
  const count = await activityPageButtons(page).count();
  return Math.max(1, count);
}

export async function selectPage(page, index, { timeoutMs = 12_000 } = {}) {
  if (index > 0) {
    await expect
      .poll(() => activityPageButtons(page).count(), {
        message: `Wait for activity page ${index + 1}`,
        timeout: timeoutMs,
        intervals: [250, 500, 750, 1000],
      })
      .toBeGreaterThan(index)
      .catch(() => {});
  }
  const buttons = activityPageButtons(page);
  const count = await buttons.count();
  if (count === 0) {
    if (index !== 0) throw new GuardError(`Activity exposes no page ${index + 1}.`);
    return;
  }
  if (index >= count) throw new GuardError(`Activity exposes ${count} page(s), not page ${index + 1}.`);
  const button = buttons.nth(index);
  const wrapperClass = (await button.locator("..").getAttribute("class")) || "";
  const selected =
    (await button.getAttribute("aria-current")) === "page" ||
    /(^|\s)(active|selected)(\s|$)/i.test(
      `${(await button.getAttribute("class")) || ""} ${wrapperClass}`,
    );
  if (!selected) {
    await button.click();
    await page.waitForTimeout(700);
  }
}

function activityPageButtons(page) {
  return page.locator(
    ".activity-navigator .activity-navigator-button.page-button > button:visible, " +
      ".quiz-navigator-button.page-button:visible",
  );
}

export async function inventorySections(page, target) {
  await openExactUrl(page, target.adminEditUrl);
  const headings = page.locator("button.bx--accordion__heading");
  await expect(headings.first()).toBeVisible();
  const sections = [];
  for (let index = 0; index < await headings.count(); index += 1) {
    const heading = headings.nth(index);
    const item = heading.locator("..");
    const badge = await item.locator(".section-label").first().getAttribute("data-section-icon-text").catch(() => null);
    const title = normalizeText(
      (await heading.locator("span.title").first().textContent().catch(() => null)) ||
        (await heading.innerText()),
    );
    sections.push({ index, label: normalizeText(badge || "") || String.fromCharCode(65 + index), title });
  }
  return sections;
}

export async function openSection(page, target, section) {
  await openExactUrl(page, target.adminEditUrl);
  let observedTitle = "";
  const sectionReady = await expect
    .poll(async () => {
      const headings = page.locator("button.bx--accordion__heading");
      if ((await headings.count()) <= section.index) return "";
      const heading = headings.nth(section.index);
      if (!(await heading.isVisible().catch(() => false))) return "";
      observedTitle = normalizeText(
        (await heading.locator("span.title").first().textContent().catch(() => null)) ||
          (await heading.innerText().catch(() => "")),
      );
      return observedTitle;
    }, {
      message: `Wait for section ${section.label}: ${section.title}`,
      timeout: 20_000,
      intervals: [250, 500, 750, 1000],
    })
    .toBe(section.title)
    .then(() => true)
    .catch(() => false);
  if (!sectionReady) {
    const available = await page
      .locator("button.bx--accordion__heading")
      .evaluateAll((headings) => headings.map((heading) =>
        (heading.innerText || "").replace(/\s+/g, " ").trim(),
      ))
      .catch(() => []);
    throw new GuardError(
      `Section ${section.label} did not finish loading with title "${section.title}". ` +
        `Last observed title: "${observedTitle || "none"}"; ` +
        `available sections: ${available.length ? available.join(" | ") : "none"}.`,
    );
  }

  // The SLS module plan rerenders after its loading overlay disappears. Resolve
  // the exact section again immediately before verifying and clicking it.
  const heading = page.locator("button.bx--accordion__heading").nth(section.index);
  await expect(heading).toBeVisible();
  const currentTitle = normalizeText(
    (await heading.locator("span.title").first().textContent().catch(() => null)) ||
      (await heading.innerText()),
  );
  if (currentTitle !== section.title) {
    throw new GuardError(
      `Section ${section.label} changed from "${section.title}" to "${currentTitle}" during the run.`,
    );
  }
  await heading.click();
  await expect(page).toHaveURL(new RegExp(`/admin/community-gallery/module/edit/${escapeRegExp(target.id)}/section/[^/?]+`));
  const id = new URL(page.url()).pathname.match(/\/section\/([^/]+)/)?.[1];
  if (!id) throw new GuardError(`Could not resolve the ID for section ${section.label}.`);
  return { id };
}

export async function inventoryActivities(page, section) {
  const rows = activityRowsForSection(page, section);
  const activities = [];
  for (let index = 0; index < await rows.count(); index += 1) {
    activities.push({ index, title: normalizeText(await rows.nth(index).innerText()) });
  }
  return activities;
}

export async function openActivity(page, target, section, sectionId, activity) {
  const sectionUrl = `${SLS_ORIGIN}/admin/community-gallery/module/edit/${target.id}/section/${sectionId}`;
  await openExactUrl(page, sectionUrl);
  let rows = activityRowsForSection(page, section);
  await expect
    .poll(() => activityRowsForSection(page, section).count(), {
      message: `Wait for activity ${activity.index + 1} in section ${section.label}`,
      timeout: 12_000,
    })
    .toBeGreaterThan(activity.index)
    .catch(() => {});
  rows = activityRowsForSection(page, section);
  if ((await rows.count()) <= activity.index) {
    throw new GuardError(`Activity ${activity.index + 1} disappeared from section ${section.label}.`);
  }
  let row = rows.nth(activity.index);
  const currentTitle = normalizeText(await row.innerText());
  if (currentTitle !== activity.title) {
    throw new GuardError(
      `Activity ${activity.index + 1} changed from "${activity.title}" to "${currentTitle}" during the run.`,
    );
  }
  if (!(await row.isVisible())) {
    const drawerControl = page.locator(".left-menu-pin .pin-control");
    if ((await drawerControl.count()) === 1 && (await drawerControl.isVisible())) {
      await drawerControl.click();
      await page.waitForTimeout(350);
      rows = activityRowsForSection(page, section);
      row = rows.nth(activity.index);
    }
  }
  if (!(await row.isVisible())) {
    let heading = page.locator("button.bx--accordion__heading").nth(section.index);
    if ((await heading.getAttribute("aria-expanded")) !== "true") {
      const toggle = heading.locator('button:has(svg[name="ArrowDown24"])');
      if ((await toggle.count()) === 1 && (await toggle.isVisible())) {
        await toggle.click();
      } else {
        await heading.click();
      }
      await page.waitForTimeout(350);
    }
    rows = activityRowsForSection(page, section);
    row = rows.nth(activity.index);
  }
  await expect(row).toBeVisible();
  const revealedTitle = normalizeText(await row.innerText());
  if (revealedTitle !== activity.title) {
    throw new GuardError(
      `Revealing the sidebar changed activity ${activity.index + 1} from ` +
        `"${activity.title}" to "${revealedTitle}".`,
    );
  }
  await row.scrollIntoViewIfNeeded();
  // The drawer and its section can both rerender while being revealed. Resolve
  // the exact row once more immediately before the click instead of reusing a
  // potentially stale locator.
  row = activityRowsForSection(page, section).nth(activity.index);
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/community-gallery/module/edit/${escapeRegExp(target.id)}/section/${escapeRegExp(sectionId)}/activity/[^/?]+`),
  );
  const id = new URL(page.url()).pathname.match(/\/activity\/([^/]+)/)?.[1];
  if (!id) throw new GuardError(`Could not resolve the ID for activity "${activity.title}".`);
  return { id };
}

export function activityEditUrl(target, sectionId, activityId) {
  return `${SLS_ORIGIN}/admin/community-gallery/module/edit/${target.id}/section/${sectionId}/activity/${activityId}`;
}

export async function openActivityById(page, target, sectionId, activityId) {
  const url = activityEditUrl(target, sectionId, activityId);
  await openExactUrl(page, url);
  await expect(page).toHaveURL(
    new RegExp(
      `/admin/community-gallery/module/edit/${escapeRegExp(target.id)}/section/` +
        `${escapeRegExp(sectionId)}/activity/${escapeRegExp(activityId)}`,
    ),
  );
}

function activityRowsForSection(page, section) {
  return page
    .locator("button.bx--accordion__heading")
    .nth(section.index)
    .locator("xpath=ancestor::li[contains(@class,'cv-accordion-item')][1]")
    .locator(
      ".bx--accordion__content .bx--side-nav__item:not(.section-end) .bx--side-nav__link-text",
    );
}

export async function enterEditMode(page, target) {
  console.log(`Opening admin Module View:\n${target.adminViewUrl}`);
  await openExactUrl(page, target.adminViewUrl);
  await assertAuthenticated(page, target.id);
  await dismissModuleUrlUpdatedModal(page);
  const editButton = page.getByRole("button", { name: "Edit", exact: true });
  await expect(editButton).toBeVisible();
  await editButton.click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/community-gallery/module/edit/${escapeRegExp(target.id)}/module-plan`),
  );
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  console.log("Edit mode verified.");
}

// SLS can show this informational notice after Done redirects an older lesson URL
// to its current module URL. It has no choices or destructive action, but it sits
// above Module View and intercepts the next Edit click. Match both the title and
// explanatory text so other message, warning, and confirmation modals stay open.
export async function dismissModuleUrlUpdatedModal(page) {
  const modal = page
    .locator(".bx--modal.is-visible.content-modal.message-modal:visible")
    .filter({ hasText: /Module URL Updated/i })
    .filter({ hasText: /module(?:'|’)s URL has been updated/i })
    .first();
  if ((await modal.count()) === 0 || !(await modal.isVisible().catch(() => false))) return false;

  console.log("Closing the informational Module URL Updated notice before clicking Edit...");
  const close = modal
    .locator("button.bx--modal-close")
    .or(modal.getByRole("button", { name: "OK", exact: true }))
    .first();
  if ((await close.count()) === 0) {
    throw new GuardError("The Module URL Updated notice has no recognised Close or OK control.");
  }
  await close.click();
  await expect(modal).toBeHidden({ timeout: 5_000 });
  return true;
}

export async function leaveEditMode(page, target) {
  const done = page.getByRole("button", { name: "Done", exact: true });
  await expect(done).toBeVisible();
  await done.click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/community-gallery/module/view/${escapeRegExp(target.id)}`),
  );
  console.log("Done selected; Module View reopened.");
}

async function assertAuthenticated(page, moduleId) {
  await page.waitForFunction(() => document.body?.innerText?.trim().length > 0).catch(() => {});
  const loginVisible = await page
    .getByRole("button", { name: /LOGIN WITH (SLS|MIMS)/i })
    .first()
    .isVisible()
    .catch(() => false);
  if (loginVisible || /\/login/i.test(new URL(page.url()).pathname)) {
    throw new GuardError(
      `SLS authentication is required. Run npm run sls:auth (npm.cmd on Windows) and sign in manually. Current URL: ${page.url()}`,
    );
  }
  if (!page.url().includes(moduleId)) {
    throw new GuardError(`Opened SLS, but the URL does not contain supplied module ${moduleId}.`);
  }
}

async function openExactUrl(page, url) {
  const parsed = new URL(url);
  if (parsed.origin !== SLS_ORIGIN || !parsed.pathname.startsWith("/admin/community-gallery/")) {
    throw new GuardError(`Refusing navigation outside the supplied SLS admin origin: ${url}`);
  }
  if (page.url() !== url) await page.goto(url, { waitUntil: "domcontentloaded" });
}

function printPageAssessments(pages) {
  for (const page of pages) {
    const assessment = page.assessment;
    const height = Math.round(assessment.pageHeight);
    const marker = assessment.needsBreak ? "CANDIDATE" : assessment.blocked ? "SKIPPED" : "ok";
    const suffix = assessment.blocked ? " Page left unchanged." : "";
    console.log(
      `    Page ${page.pageIndex + 1}: ${marker}; ${assessment.questionCount} question(s) in ` +
        `${assessment.questionRowCount} visual row(s), ` +
        `${height}px content - ${assessment.reason}.${suffix}`,
    );
  }
}

function candidatePages(moduleReport) {
  return allPages(moduleReport).filter((entry) => entry.page.assessment.needsBreak);
}

function blockedPages(moduleReport) {
  return allPages(moduleReport).filter((entry) => entry.page.assessment.blocked);
}

function unresolvedPages(moduleReport) {
  return allPages(moduleReport).filter((entry) => entry.page.assessment.needsBreak);
}

function skippedPageSummaries(moduleReport) {
  return blockedPages(moduleReport).map(({ section, activity, page }) => ({
    section: { label: section.label, title: section.title, id: section.id },
    activity: { index: activity.index, title: activity.title, id: activity.id },
    pageIndex: page.pageIndex,
    reason: page.assessment.reason,
  }));
}

function allPages(moduleReport) {
  const found = [];
  for (const section of moduleReport?.sections ?? []) {
    for (const activity of section.activities ?? []) {
      for (const page of activity.pages ?? []) found.push({ section, activity, page });
    }
  }
  return found;
}

function normalizeText(value) {
  return String(value ?? "").replace(/^\d+\.\s*/, "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
