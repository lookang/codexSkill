import fs from "node:fs/promises";
import path from "node:path";
import { expect as baseExpect } from "@playwright/test";
import { createRunPaths, saveJson } from "./io.mjs";
import {
  GuardError,
  assertAuthStateAvailable,
  createSlsContext,
  launchSlsBrowser,
  sidebarActivityMatch,
} from "./sls-runner.mjs";
import {
  enterEditMode,
  inventoryActivities,
  inventorySections,
  leaveEditMode,
  openActivity,
  openSection,
} from "./page-break-runner.mjs";
import { planCopyRemoval } from "./remove-copy.mjs";

let expect = baseExpect.configure({ timeout: 20_000 });

export async function runRemoveCopyWorkflow({ target, options, apply = false }) {
  expect = baseExpect.configure({ timeout: options.timeoutMs ?? 20_000 });
  const paths = await createRunPaths(options, target.id);
  const report = {
    schemaVersion: 1,
    action: "remove-copy-suffix",
    mode: apply ? "apply" : "review",
    startedAt: new Date().toISOString(),
    target,
    status: "running",
    review: null,
    renamedCopies: [],
    verification: null,
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
    report.review = await reviewModule(page, target);
    printReview(report.review);

    if (apply) {
      for (const section of report.review.sections) {
        for (const candidate of section.candidates) {
          report.renamedCopies.push(
            await renameOneCopy(page, target, section, candidate),
          );
        }
      }
    }
    await leaveEditMode(page, target);

    if (apply) {
      console.log("\nReopening edit mode to verify the cleanup...");
      await enterEditMode(page, target);
      report.verification = await verifyRenamedCopies(
        page,
        target,
        report.renamedCopies,
      );
      await leaveEditMode(page, target);
    }

    report.status = apply ? "completed" : "reviewed";
    const screenshotPath = path.join(
      paths.runDir,
      apply ? "remove-copy-suffix-verified.png" : "remove-copy-suffix-review.png",
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    report.screenshotPath = screenshotPath;

    if (options.holdOpen && !options.headless) {
      console.log("\nThe final verified Module View is open in Chrome.");
      await options.holdOpen();
    }
  } catch (error) {
    report.status = "stopped";
    report.error = { name: error.name, message: error.message, stack: error.stack };
    if (page) {
      await page
        .screenshot({ path: path.join(paths.runDir, "remove-copy-suffix-failure.png"), fullPage: true })
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
    candidateCount: allCandidates(report.review).length,
    skippedCount: allSkipped(report.review).length,
  };
}

async function reviewModule(page, target) {
  const sections = await inventorySections(page, target);
  const result = { sectionCount: sections.length, sections: [] };
  for (const section of sections) {
    const opened = await openSection(page, target, section);
    const activities = await inventoryActivities(page, section);
    const plan = planCopyRemoval(activities);
    result.sections.push({ ...section, id: opened.id, activities, ...plan });
  }
  return result;
}

function printReview(review) {
  console.log(`Found ${review.sectionCount} section(s).`);
  for (const section of review.sections) {
    console.log(`\nSection ${section.label}: ${section.title || "(untitled)"}`);
    console.log(`  ${section.activityCount} activities; ${section.ignoredCount} clean title(s) ignored.`);
    for (const candidate of section.candidates) {
      console.log(`  RENAME: ${candidate.title} -> ${candidate.baseTitle}`);
    }
    for (const skipped of section.skipped) {
      console.log(`  SKIPPED: ${skipped.title} - ${skipped.reason}.`);
    }
  }
}

async function renameOneCopy(page, target, section, candidate) {
  const opened = await openSection(page, target, section);
  const currentActivities = await inventoryActivities(page, section);
  const currentPlan = planCopyRemoval(currentActivities);
  const exact = currentPlan.candidates.filter(
    (entry) => normalize(entry.title) === normalize(candidate.title),
  );
  if (exact.length !== 1) {
    throw new GuardError(
      `Cleanup state changed for "${candidate.title}" in section ${section.label}; ` +
        `expected one safe candidate, found ${exact.length}. Nothing was clicked for it.`,
    );
  }

  const targetActivity = exact[0];
  const openedActivity = await openActivity(page, target, section, opened.id, targetActivity);
  const copyBefore = await sidebarActivityMatch(page, targetActivity.title, section);
  const cleanBefore = await sidebarActivityMatch(page, targetActivity.baseTitle, section);
  if (copyBefore.count !== 1 || cleanBefore.count !== 0) {
    throw new GuardError(
      `Rename guard failed for "${targetActivity.title}": expected one copy and no existing clean title.`,
    );
  }

  await saveActivityTitle(page, {
    moduleId: target.id,
    activityId: openedActivity.id,
    oldTitle: targetActivity.title,
    newTitle: targetActivity.baseTitle,
  });

  await openSection(page, target, section);
  const copyAfter = await sidebarActivityMatch(page, targetActivity.title, section);
  const cleanAfter = await sidebarActivityMatch(page, targetActivity.baseTitle, section);
  if (copyAfter.count !== 0 || cleanAfter.count !== 1) {
    throw new GuardError(
      `Rename result for "${targetActivity.title}" is uncertain; ` +
        `old-title count ${copyAfter.count}, clean-title count ${cleanAfter.count}.`,
    );
  }

  console.log(`  Renamed: ${targetActivity.title} -> ${targetActivity.baseTitle}`);
  return {
    section: { label: section.label, title: section.title, id: section.id },
    title: targetActivity.title,
    baseTitle: targetActivity.baseTitle,
  };
}

async function saveActivityTitle(page, { moduleId, activityId, oldTitle, newTitle }) {
  const xsrf = (await page.context().cookies()).find((cookie) => cookie.name === "XSRF-TOKEN")?.value;
  if (!xsrf) throw new GuardError("The authenticated SLS session has no XSRF token for title saving.");

  const result = await page.evaluate(
    async ({ moduleId, activityId, oldTitle, newTitle, xsrf }) => {
      const headers = {
        accept: "application/json, text/plain, */*",
        "cache-control": "no-cache,no-store",
        "request-identifier": crypto.randomUUID(),
        "request-method": "POST",
        "x-csrf-token": xsrf,
        "x-requested-with": "XMLHttpRequest",
        "x-xsrf-token": xsrf,
      };
      const readLesson = async () => {
        const response = await fetch(`/apis/community-gallery/true/lesson/${moduleId}`, {
          headers: { ...headers, "request-method": "GET" },
        });
        if (!response.ok) throw new Error(`metadata read returned HTTP ${response.status}`);
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error(`metadata read returned ${contentType || "an unknown content type"}`);
        }
        return (await response.json()).data?.formData;
      };

      const before = await readLesson();
      const activity = before?.lessonActivityList?.find(
        (entry) => String(entry.id) === String(activityId),
      );
      if (!activity) throw new Error(`activity ${activityId} was not found in live SLS metadata`);
      if (activity.title !== oldTitle) {
        throw new Error(`live title changed from "${oldTitle}" to "${activity.title}"`);
      }

      const form = new FormData();
      form.append("uuid", before.uuid);
      form.append("title", newTitle);
      form.append("recommendedTime", String(activity.recommendedTime ?? 0));
      form.append("optional", String(Boolean(activity.optional)));
      form.append("pageId", String(activity.id));
      const response = await fetch("/apis/lesson/saveactivityheadermetadata", {
        method: "POST",
        headers,
        body: form,
      });
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      if (!response.ok) throw new Error(`title save returned HTTP ${response.status}`);
      if (!contentType.includes("application/json")) {
        throw new Error(`title save returned ${contentType || "an unknown content type"}`);
      }
      const saved = JSON.parse(body);
      if (saved.code !== "ok") throw new Error(`title save returned code ${saved.code ?? "unknown"}`);

      const after = await readLesson();
      const verified = after?.lessonActivityList?.find(
        (entry) => String(entry.id) === String(activityId),
      );
      return {
        title: verified?.title ?? null,
        recommendedTime: verified?.recommendedTime ?? null,
        optional: verified?.optional ?? null,
        originalRecommendedTime: activity.recommendedTime ?? 0,
        originalOptional: Boolean(activity.optional),
      };
    },
    { moduleId, activityId, oldTitle, newTitle, xsrf },
  ).catch((error) => {
    throw new GuardError(`SLS could not safely rename "${oldTitle}": ${error.message}`);
  });

  if (result.title !== newTitle) {
    throw new GuardError(
      `SLS metadata still reports "${result.title ?? "no title"}" after renaming "${oldTitle}".`,
    );
  }
  if (
    String(result.recommendedTime) !== String(result.originalRecommendedTime) ||
    Boolean(result.optional) !== result.originalOptional
  ) {
    throw new GuardError(
      `SLS changed unrelated metadata while renaming "${oldTitle}"; inspect the trace immediately.`,
    );
  }
}

async function verifyRenamedCopies(page, target, renamedCopies) {
  const verified = [];
  const sections = await inventorySections(page, target);
  for (const removed of renamedCopies) {
    const section = sections.find(
      (entry) => entry.label === removed.section.label && entry.title === removed.section.title,
    );
    if (!section) {
      throw new GuardError(`Section ${removed.section.label} disappeared during cleanup verification.`);
    }
    await openSection(page, target, section);
    const copy = await sidebarActivityMatch(page, removed.title, section);
    const clean = await sidebarActivityMatch(page, removed.baseTitle, section);
    if (copy.count !== 0 || clean.count !== 1) {
      throw new GuardError(
        `Reopen verification failed for "${removed.title}": ` +
          `old-title count ${copy.count}, clean-title count ${clean.count}.`,
      );
    }
    verified.push({ ...removed, copyCount: copy.count, cleanSiblingCount: clean.count });
  }
  return { verified, count: verified.length };
}

function allCandidates(review) {
  return (review?.sections ?? []).flatMap((section) => section.candidates ?? []);
}

function allSkipped(review) {
  return (review?.sections ?? []).flatMap((section) => section.skipped ?? []);
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}
