import { expect } from "@playwright/test";
import { assertNoSlsError, dismissVisibleShellOverlay, readModuleEvidence } from "./sls-runner.mjs";

const ORIGIN = "https://vle.learning.moe.edu.sg";
const CARD = ".component.lesson-metadata";
const MODULE_PLAN_HEADER = ".course-plan-module-title";
const TITLE_INPUT = `${CARD} dl.field-set.title input`;

export class TitleLoginRequired extends Error {}

export async function assertTitleSession(page) {
  const url = new URL(page.url());
  if (url.origin !== ORIGIN || /\/(login|mims)(\/|$)/i.test(url.pathname) ||
      await page.getByRole("button", { name: /LOGIN WITH (SLS|MIMS)/i }).first().isVisible()) {
    throw new TitleLoginRequired("SLS login is required. Sign in manually in the visible Chrome window; no credentials are submitted by this flow.");
  }
  await assertNoSlsError(page);
}

export function createTitleBrowser(page, { timeout = 45_000, log = console.log } = {}) {
  const checkRoute = (target, mode) => {
    const url = new URL(page.url());
    if (url.origin !== ORIGIN || !url.pathname.startsWith(`/admin/community-gallery/module/${mode}/${target.id}`) ||
        !new RegExp(`/module/${mode}/${target.id}(?:/|$)`).test(url.pathname)) {
      throw new Error(`Unexpected module route; refusing to edit: ${page.url()}`);
    }
  };

  async function read(target) {
    log(`Reading row(s) ${target.rows.join(", ")}: ${target.sheetTitle}`);
    await page.goto(target.adminViewUrl, { waitUntil: "domcontentloaded" });
    let title;
    try { title = await readVisibleModuleTitle(page, { timeout }); }
    catch (error) { await assertTitleSession(page); throw error; }
    await assertTitleSession(page);
    checkRoute(target, "view");
    return title;
  }

  async function readCurriculum(target) {
    const restoreUrl = target.adminViewUrl;
    if (page.url() !== restoreUrl) {
      await page.goto(restoreUrl, { waitUntil: "domcontentloaded" });
      await assertTitleSession(page);
    }
    log(`Reading saved Subject and Level tags for row(s) ${target.rows.join(", ")}...`);
    const evidence = await readModuleEvidence(page, restoreUrl);
    await assertTitleSession(page);
    if (evidence.error) throw new Error(`Saved Module Tags could not be read: ${evidence.error}`);
    if (!evidence.subjectLevels?.length) {
      throw new Error("No saved Subject and Level tags were found. Add or verify Module Tags before renaming this module.");
    }
    return evidence.subjectLevels;
  }

  async function write(target, before, after) {
    // Always re-read immediately before opening the editor; the Sheet title is never authoritative.
    if (await read(target) !== before) throw new Error("Module title changed before editing. Run the preview again.");
    await dismissVisibleShellOverlay(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click({ timeout });
    await expect(page).toHaveURL(new RegExp(`/admin/community-gallery/module/edit/${target.id}(?:/|$)`), { timeout });
    checkRoute(target, "edit");
    // Module Plan owns the module title. A bare module URL can restore the last
    // visited activity, so every read and edit stays on the canonical route.
    if (!page.url().startsWith(target.adminEditUrl)) {
      await page.goto(target.adminEditUrl, { waitUntil: "domcontentloaded" });
    }
    await assertTitleSession(page);
    checkRoute(target, "edit");
    const modulePlanHeader = page.locator(MODULE_PLAN_HEADER);
    const legacyCard = page.locator(CARD);
    const input = modulePlanHeader.locator("input.bx--text-input:visible")
      .or(page.locator(`${TITLE_INPUT}:visible`));
    if (!(await input.first().isVisible().catch(() => false))) {
      // SLS mounts the Module Plan body after the edit route has loaded. Wait
      // for the real layout before choosing between the current and legacy
      // title editors; an immediate count can incorrectly select legacy mode.
      await page.locator(`${MODULE_PLAN_HEADER}:visible, ${CARD}:visible`)
        .first()
        .waitFor({ state: "visible", timeout });
      if (await modulePlanHeader.first().isVisible().catch(() => false)) {
        await expect(modulePlanHeader).toBeVisible({ timeout });
        const titleControl = modulePlanHeader.locator(".title-view h4:visible, :scope > h4:visible").first();
        await expect(titleControl).toHaveText(before, { timeout });
        // The pencil is decorative and has pointer-events disabled in the current
        // SLS build. Its owning H4 is the actual edit control.
        await titleControl.click({ timeout });
      } else {
        await expect(legacyCard).toHaveCount(1, { timeout });
        await expect(legacyCard).toBeVisible({ timeout });
        await expect(legacyCard.locator("dl.field-set.title .output-text")).toHaveText(before, { timeout });
        await legacyCard.hover();
        const pencil = legacyCard.locator(".edit-indicator");
        await expect(pencil).toHaveCount(1, { timeout });
        await pencil.click({ timeout });
      }
    }
    const titleInput = input.first();
    await expect(titleInput).toBeVisible({ timeout });
    if (await titleInput.inputValue() !== before) throw new Error("Title in the editor differs from the reviewed title.");
    const maximum = await titleInput.getAttribute("maxlength");
    if (maximum !== null && after.length > Number(maximum)) throw new Error(`New title exceeds SLS's ${maximum}-character limit; it will not be truncated.`);
    await expect(titleInput).toBeEditable();
    await titleInput.click();
    await titleInput.press("ControlOrMeta+A");
    await titleInput.pressSequentially(after, { delay: 10 });
    // Confirm the draft while the input still exists. Current SLS closes and
    // rerenders this inline editor as soon as Tab commits the field.
    await expect(titleInput).toHaveValue(after);
    await titleInput.press("Tab");
    await expect.poll(async () => {
      if (await input.first().isVisible().catch(() => false)) {
        return normalizeTitle(await input.first().inputValue());
      }
      const rendered = page.locator([
        `${MODULE_PLAN_HEADER} h4:visible`,
        `${CARD} dl.field-set.title .output-text:visible`,
      ].join(", "));
      const values = (await rendered.allInnerTexts()).map(normalizeTitle).filter(Boolean);
      return values.includes(normalizeTitle(after)) ? normalizeTitle(after) : "";
    }, {
      message: "The inline title editor did not commit to the rendered Module Plan title.",
      timeout,
    }).toBe(normalizeTitle(after));
    await page.getByRole("button", { name: "Done", exact: true }).click({ timeout });
    await expect(page).toHaveURL(new RegExp(`/admin/community-gallery/module/view/${target.id}(?:/|$)`), { timeout });
    await assertTitleSession(page);
    // applyTitles independently reloads the saved module; navigation alone is not proof of a save.
    log(`Saved title; checking persistence: ${after}`);
  }

  return { read, readCurriculum, write };
}

async function readVisibleModuleTitle(page, { timeout }) {
  const titles = page.locator([
    `${MODULE_PLAN_HEADER} h4:visible`,
    `${CARD} dl.field-set.title .output-text:visible`,
  ].join(", "));
  await titles.first().waitFor({ state: "visible", timeout });
  const values = (await titles.allInnerTexts()).map(normalizeTitle).filter(Boolean);
  const distinct = [...new Set(values)];
  if (distinct.length !== 1) {
    throw new Error(
      `Expected one unambiguous module title on Module Plan, but found: ${distinct.join(" | ") || "(none)"}.`,
    );
  }
  return distinct[0];
}

function normalizeTitle(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
