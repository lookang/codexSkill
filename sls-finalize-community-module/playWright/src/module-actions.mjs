import fs from "node:fs/promises";
import path from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";
import { createRunPaths, saveJson, validateGamificationConfig } from "./io.mjs";
import {
  GuardError,
  assertAuthStateAvailable,
  assertNoSlsError,
  suppressOverlayWidgets
} from "./sls-runner.mjs";

const SLS_ORIGIN = "https://vle.learning.moe.edu.sg";
// Exactly as the SLS teacher directory lists it. The directory shows title case
// ("Wee Loo Kang"); an uppercase spelling matched nothing.
const EXACT_TEACHER = "Wee Loo Kang";
const COMPLETED_ASSIGNMENT_PERMISSION_ID = "printableAnswers";
const COMPLETED_ASSIGNMENT_PERMISSION_LABEL =
  "Allow viewing as print-friendly completed assignment";
const GENERATION_TIMEOUT_MS = 180_000;
let expect = baseExpect.configure({ timeout: 20_000 });

export function validateModuleAction(action, config) {
  if (!new Set(["gamify", "add-teacher", "thumbnail"]).has(action)) {
    throw new Error(`Unknown module action: ${action}.`);
  }
  if (action === "gamify") {
    if (!config?.gamification) {
      throw new Error("This module needs a reviewed gamification block in its JSON config before it can be gamified.");
    }
    validateGamificationConfig(config.gamification);
  }
}

export function exactTeacherMatches(candidates, teacherName = EXACT_TEACHER) {
  return candidates.filter((candidate) => candidate.trim() === teacherName);
}

export async function runModuleAction({ action, config, target, options }) {
  validateModuleAction(action, config);
  expect = baseExpect.configure({ timeout: options.timeoutMs ?? 20_000 });
  const paths = await createRunPaths(options, target.id);
  const report = {
    schemaVersion: 1,
    action,
    startedAt: new Date().toISOString(),
    target,
    moduleTitle: config?.module?.title ?? null,
    status: "running",
    result: null,
    error: null,
    externalServiceFailures: []
  };

  let browser;
  let context;
  let page;
  try {
    await assertAuthStateAvailable(options.authStatePath);
    const headless = Boolean(options.headless);
    console.log(`Opening ${headless ? "headless" : "visible"} Chrome...`);
    browser = await chromium.launch({
      channel: "chrome",
      headless,
      // Kept in headless too. It reads like a concession to human eyes, but the
      // settings modal closes and reopens several times in this flow and the pause
      // is what lets it settle in between; removing it made the reopened modal
      // assert against content that had not rendered yet.
      slowMo: 200,
      args: headless ? [] : ["--start-maximized"]
    });
    context = await browser.newContext({
      storageState: options.authStatePath,
      // A visible window supplies its own size; a headless one has none, and
      // leaving it null yields a viewport too short for controls that sit below
      // the fold in the settings modal.
      viewport: headless ? { width: 1440, height: 1000 } : null,
      acceptDownloads: false
    });
    await suppressOverlayWidgets(context);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    page = context.pages()[0] ?? (await context.newPage());
    page.on("response", (response) => {
      let endpoint;
      try {
        endpoint = new URL(response.url());
      } catch {
        return;
      }
      if (endpoint.hostname !== "api.openai.com" || response.status() < 400) return;
      report.externalServiceFailures.push({
        service: "SLS Authoring Copilot",
        status: response.status(),
        endpoint: `${endpoint.origin}${endpoint.pathname}`
      });
    });
    page.setDefaultTimeout(options.timeoutMs ?? 20_000);
    page.setDefaultNavigationTimeout(Math.max(options.timeoutMs ?? 20_000, 30_000));

    await enterEditMode(page, target, config?.module?.title ?? null);
    if (action === "gamify") {
      report.result = await gamifyModule(page, config.gamification, report.externalServiceFailures);
    } else if (action === "thumbnail") {
      report.result = await generateModuleThumbnail(page, config, {
        ...options,
        externalServiceFailures: report.externalServiceFailures
      });
    } else {
      report.result = await addCreditedTeacher(page, EXACT_TEACHER);
    }
    report.status = "completed";

    const shot = path.join(paths.runDir, `${action}-verified.png`);
    await page.screenshot({ path: shot, fullPage: true });
    if (options.holdOpen && !options.headless) {
      console.log("\nVerified final state is open in Chrome.");
      await options.holdOpen();
    } else if (options.headless) {
      // There is no window to review, so point at the evidence instead of
      // blocking on a prompt nobody can answer.
      console.log(`\nVerified final state captured: ${path.relative(process.cwd(), shot)}`);
    }
  } catch (error) {
    report.status = "stopped";
    report.error = { name: error.name, message: error.message, stack: error.stack };
    if (page) {
      await page.screenshot({ path: path.join(paths.runDir, `${action}-failure.png`), fullPage: true }).catch(() => {});
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
      await fs.writeFile(
        path.join(paths.runDir, "trace-unavailable.txt"),
        "Chrome did not open, so no Playwright trace was created.\n",
        "utf8"
      ).catch(() => {});
    }
  }

  return paths;
}

async function gamifyModule(page, gamification, externalServiceFailures = []) {
  console.log("Opening Gamification settings...");
  let modal = await openGamification(page);

  // SLS leaves the Details fields disabled and does not mount the rich-text
  // description editor until gamification is switched on, so a module that has
  // never been gamified must be enabled before anything can be read from it.
  const toggle = modal.locator("input.toggle.bx--toggle-input").first();
  const wasEnabled = await toggle.isChecked();
  if (!wasEnabled) {
    console.log("Gamification was off; switching it on before reading details.");
    await setToggle(toggle, true);
  }

  const before = await readGamificationDetails(modal);
  const beforeEvidence = await readGeneratedGameEvidence(modal);
  const hasGeneratedContent =
    beforeEvidence.gameStoriesPresent && beforeEvidence.collectiblesPresent;
  const alreadyConfigured = wasEnabled &&
    [gamification.title, gamification.shortTitle].includes(before.title) &&
    before.description.includes(gamification.description) &&
    hasGeneratedContent;
  if (hasGeneratedContent) {
    console.log("Game stories and collectibles already exist; skipping generation.");
  }

  let generated = false;
  if (!hasGeneratedContent) {
    console.log(`Generating game with recipe: ${gamification.recipe}`);
    const modalDepth = await page.locator(".bx--modal-container:visible").count();
    const openMenu = await openAddGameMenu(page, modal);
    await openMenu.getByText("Generate Game", { exact: true }).click();

    const generator = page.locator(".bx--modal-container:visible").last();
    await expect(generator.getByText("Generate Game", { exact: true }).first()).toBeVisible();

    // Recipe and instructions are filled in when the generator offers them, but
    // neither is treated as mandatory: the aim is simply to trigger Generate Game
    // and accept what comes back, so a generator that pre-selects a recipe or
    // omits the instructions box goes straight to Create instead of failing.
    const recipe = generator.getByText(gamification.recipe, { exact: true });
    if ((await recipe.count()) === 1) {
      await recipe.click();
    } else {
      console.log(`Recipe "${gamification.recipe}" was not offered; using whatever is preselected.`);
    }

    const instructionEditor = generator.locator(".mce-content-body[contenteditable='true']").last();
    if (await instructionEditor.isVisible().catch(() => false)) {
      await instructionEditor.fill(gamification.instructions);
    } else {
      console.log("No instructions box in the generator; generating with its defaults.");
    }

    const create = generator.getByRole("button", { name: /^(create|generate)$/i }).first();
    if (await create.isVisible().catch(() => false)) {
      await create.click();
    } else {
      throw new GuardError("The generator offered no Create button.");
    }

    console.log("Waiting for Authoring Copilot to finish generating (usually ~30s)...");
    const addButtons = generator.getByRole("button", { name: /^Add$/i });
    try {
      await expect(addButtons.first()).toBeVisible({ timeout: GENERATION_TIMEOUT_MS });
    } catch (error) {
      await throwIfAuthoringCopilotFailed(page, externalServiceFailures);
      throw error;
    }
    const generatedChoiceCount = await addButtons.count();
    if (generatedChoiceCount < 1 || generatedChoiceCount > 6) {
      throw new GuardError(`Expected 1 to 6 generated Add choices; found ${generatedChoiceCount}.`);
    }
    console.log(`Generated ${generatedChoiceCount} option(s); accepting the first.`);
    await addButtons.first().click();
    // `generator` is .last() of a live locator: once the generator modal closes
    // it re-resolves to the gamification modal underneath, which stays visible.
    // Wait for the modal stack to return to its pre-generator depth instead.
    await expect(page.locator(".bx--modal-container:visible"))
      .toHaveCount(modalDepth, { timeout: 30_000 });
    generated = true;
    modal = page.locator(".bx--modal-container:visible").last();
  }

  await setGamificationDetails(modal, gamification.title, gamification.description);
  const leaderboardBefore = await readLeaderboardState(page, modal);
  // Details live on the Details tab; return to it before saving so the save
  // button acts on the same modal state the title was typed into.
  await modal.getByRole("tab", { name: "Details", exact: true }).click().catch(() => {});
  await saveAndCloseModal(page, modal);

  modal = await openGamification(page);
  let verified = await readGamificationDetails(modal);
  let retriedShortTitle = false;
  if (verified.title === "Untitled Game") {
    console.log("SLS reverted the title; retrying once with the shorter title.");
    await setGamificationDetails(modal, gamification.shortTitle, gamification.description);
    await saveAndCloseModal(page, modal);
    modal = await openGamification(page);
    verified = await readGamificationDetails(modal);
    retriedShortTitle = true;
  }

  const acceptedTitles = [gamification.title, gamification.shortTitle];
  if (!verified.enabled || !acceptedTitles.includes(verified.title) ||
      !verified.description.includes(gamification.description)) {
    throw new GuardError("Gamification details did not persist after save and reopen.");
  }

  const leaderboardAfter = await readLeaderboardState(page, modal);
  if (leaderboardChanged(leaderboardBefore, leaderboardAfter)) {
    throw new GuardError(
      "The gamification save unexpectedly changed an existing leaderboard setting. Inspect the trace before retrying."
    );
  }
  const evidence = await readGeneratedGameEvidence(modal);
  if (!evidence.gameStoriesPresent || !evidence.collectiblesPresent) {
    throw new GuardError(
      "Persistent Game Stories and Collectibles could not both be verified after reopening. Inspect the trace."
    );
  }

  console.log(`Gamification verified: ${verified.title}`);
  return {
    changed: !alreadyConfigured,
    generated,
    retriedShortTitle,
    leaderboard: leaderboardAfter,
    leaderboardBefore,
    ...verified,
    ...evidence
  };
}

async function addCreditedTeacher(page, teacherName) {
  console.log("Opening Module Settings...");
  let modal = await openModuleSettings(page);
  if ((await modal.getByText(teacherName, { exact: true }).count()) > 0) {
    const permissionChanged = await ensureCompletedAssignmentPermission(modal);
    if (permissionChanged) await saveAndCloseModal(page, modal);
    else await closeModal(modal);
    modal = await openModuleSettings(page);
    await expect(modal.getByText(teacherName, { exact: true }).first()).toBeVisible();
    await verifyCompletedAssignmentPermission(modal);
    console.log(`${teacherName} and the completed-assignment print permission are verified.`);
    return {
      changed: permissionChanged,
      teacherChanged: false,
      permissionChanged,
      teacherName,
      completedAssignmentPrint: true,
      verified: true
    };
  }

  // Do not change a permission before opening the credited-teacher subpage. SLS
  // warns "Any changes made may not be saved" when navigating away from a dirty
  // Module Settings form; Playwright dismisses that confirmation by default, so
  // the Back link appears to click while the credited page actually remains open.
  // Add the teacher first, return cleanly, then enable the permission and Save.
  let permissionChanged = false;

  await modal.getByRole("button", { name: /^edit or add teachers$/i }).first().click();
  await expect(modal.getByText(/Module Credited to/i).first()).toBeVisible();
  await modal.getByRole("button", { name: "Add", exact: true }).click();
  await expect(modal.getByText("Add Teachers", { exact: true }).first()).toBeVisible();

  const search = modal.getByPlaceholder("Find Teachers", { exact: true });
  await search.fill(teacherName);
  await search.press("Enter").catch(() => {});

  // The directory filters asynchronously. Reading the rows after a fixed pause
  // returned the whole unfiltered list (everyone from "A Rathi" onwards), so wait
  // for the searched name to actually appear before inspecting rows.
  await expect(modal.getByText(teacherName, { exact: true }).first()).toBeVisible({
    timeout: 20_000
  });
  await page.waitForTimeout(600);

  const rows = modal.getByRole("row");
  const exactRows = [];
  for (let index = 0; index < await rows.count(); index += 1) {
    const row = rows.nth(index);
    const names = await row.getByText(teacherName, { exact: true }).allTextContents();
    if (exactTeacherMatches(names, teacherName).length === 1) exactRows.push(row);
  }
  if (exactRows.length !== 1) {
    // Report what the directory actually returned, so a spelling mismatch is
    // obvious instead of just a count.
    const listed = [];
    for (let index = 0; index < (await rows.count()); index += 1) {
      const text = (await rows.nth(index).innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      if (text) listed.push(text.slice(0, 70));
    }
    throw new GuardError(
      `Expected one exact teacher-directory match for "${teacherName}"; found ${exactRows.length}. ` +
        `The directory returned: ${listed.join(" // ") || "(no rows)"}`
    );
  }

  const checkbox = exactRows[0].getByRole("checkbox");
  await expect(checkbox).toHaveCount(1);
  await checkbox.check();
  const addButtons = modal.getByRole("button", { name: "Add", exact: true });
  const commitAdd = addButtons.last();
  await expect(commitAdd).toBeEnabled();
  await commitAdd.click();

  // ADD returns from the directory to the credited-teachers subpage. The modal
  // body rerenders in place, so every locator captured on the directory is stale
  // conceptually even though Playwright can still resolve it. Wait for the exact
  // next-page control and reacquire the active modal before proceeding.
  await expect(page.getByText("Back to Module Details", { exact: true }).last()).toBeVisible({
    timeout: 20_000
  });
  modal = activeModal(page);
  await expect(modal.getByText(teacherName, { exact: true }).first()).toBeVisible();
  // ADD selects the teacher but leaves the credited-teachers page dirty. Its own
  // blue disk must be clicked before going back; otherwise SLS raises "Any changes
  // made may not be saved" and refuses to leave this page.
  await saveCreditedTeachers(page, modal);
  modal = (await page.locator(`#${COMPLETED_ASSIGNMENT_PERMISSION_ID}:visible`).count()) === 1
    ? await waitForModuleSettingsPanel(page)
    : await openModuleSettings(page);
  permissionChanged = (await ensureCompletedAssignmentPermission(modal)) || permissionChanged;
  await saveAndCloseModal(page, modal);

  modal = await openModuleSettings(page);
  await expect(modal.getByText(teacherName, { exact: true }).first()).toBeVisible();
  await verifyCompletedAssignmentPermission(modal);
  console.log(`Credited teacher and completed-assignment print permission verified: ${teacherName}`);

  return {
    changed: true,
    teacherChanged: true,
    permissionChanged,
    teacherName,
    completedAssignmentPrint: true,
    verified: true
  };
}

async function ensureCompletedAssignmentPermission(modal) {
  const checkbox = modal.locator(`#${COMPLETED_ASSIGNMENT_PERMISSION_ID}`);
  if ((await checkbox.count()) !== 1) {
    throw new GuardError(
      `Module Settings did not expose one ${COMPLETED_ASSIGNMENT_PERMISSION_LABEL} checkbox.`,
    );
  }
  if (await checkbox.isChecked()) return false;
  await expect(checkbox).toBeEnabled();
  // Carbon/Vue rejects direct changes to its hidden input. Click the one visible
  // label in the active Module Settings modal so the component updates its bound
  // value, then verify the underlying input changed before Save.
  const label = modal.locator("label").filter({
    hasText: COMPLETED_ASSIGNMENT_PERMISSION_LABEL,
  });
  await expect(label).toHaveCount(1);
  await label.click();
  await expect(checkbox).toBeChecked();
  console.log(`Enabled: ${COMPLETED_ASSIGNMENT_PERMISSION_LABEL}`);
  return true;
}

async function verifyCompletedAssignmentPermission(modal) {
  const checkbox = modal.locator(`#${COMPLETED_ASSIGNMENT_PERMISSION_ID}`);
  await expect(checkbox).toHaveCount(1);
  await expect(checkbox).toBeChecked();
  return true;
}

// The Gamification header renders three controls whose accessible names all
// match /add game/i: a tertiary button, the overflow-menu trigger beside it,
// and an info tooltip ("Add game-based elements from..."). Only the overflow
// trigger opens the Generate Game menu, so target it first and fall back to the
// plain button if SLS moves the menu to the other half of the pair.
async function openAddGameMenu(page, modal) {
  const named = modal.getByRole("button", { name: "Add Game", exact: true });
  const openMenu = page.locator(".bx--overflow-menu-options--open:visible");
  const candidates = [
    named.and(modal.locator("button.overflow-menu-button")),
    named
  ];

  for (const candidate of candidates) {
    if ((await candidate.count()) === 0) continue;
    const trigger = candidate.first();
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await trigger.click({ timeout: 10_000 }).catch(async () => {
      await trigger.dispatchEvent("click").catch(() => {});
    });
    await page.waitForTimeout(1200);
    if (await openMenu.first().isVisible().catch(() => false)) return openMenu.first();
    // A tooltip or the plain button was clicked instead of the menu trigger; close
    // anything that opened and try the next candidate.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(600);
  }

  const offered = await visibleControlNames(modal);
  throw new GuardError(
    `No Add Game control opened the Generate Game menu. Controls in the modal: ${offered.slice(0, 20).join(" | ")}`
  );
}

async function generateModuleThumbnail(page, config, options = {}) {
  const prompt =
    options.imagePrompt ??
    config?.thumbnail?.prompt ??
    `A clear, uncluttered cover illustration for a school mathematics lesson titled ` +
      `"${config?.module?.title ?? "this module"}". No text in the image.`;

  // The cover picture is the module's "Featured Image", which lives on the module
  // settings page - the edit URL with no /module-plan suffix. It is not in More
  // Actions, not in the section editor, and not in the Generate Module Plan modal.
  const settingsUrl = `${SLS_ORIGIN}/admin/community-gallery/module/edit/${config.module.id}`;
  console.log("Opening module settings for the Featured Image...");
  await page.goto(settingsUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  await openModuleDetailsForm(page);

  const addImage = page.getByRole("button", { name: /^ADD IMAGE$/i }).first();
  // Already has one? Replacing somebody's chosen picture is not this tool's job.
  //
  // "Click to upload" is the empty state and is the only trustworthy signal: looking
  // for any SLS-hosted image matched the user avatar in the header and reported
  // every module as already having a cover.
  const emptyState = await page
    .getByText(/Click to upload/i)
    .first()
    .isVisible()
    .catch(() => false);
  const existing = !emptyState;
  if (existing && !options.replaceExisting) {
    console.log("This module already has a Featured Image; leaving it as it is.");
    return { generated: false, reason: "featured image already set" };
  }
  if ((await addImage.count()) === 0) {
    const offered = await visibleControlNames(page);
    throw new GuardError(
      options.replaceExisting
        ? "A Featured Image already exists, but SLS offered no ADD IMAGE control. " +
            "Remove the existing image manually before using --replace-existing."
        : `No ADD IMAGE control on ${settingsUrl}. Controls there: ${offered.slice(0, 25).join(" | ")}`
    );
  }

  console.log("Opening ADD IMAGE...");
  await addImage.click();
  await page.waitForTimeout(1500);

  // The label wraps onto two lines ("Generate Image" / "(Beta)"), so an anchored
  // exact match finds nothing even though the item is plainly in the menu.
  const generate = page
    .getByText(/generate image/i)
    .filter({ hasNot: page.locator("button") })
    .last();
  if ((await generate.count()) === 0) {
    const offered = await visibleControlNames(page);
    throw new GuardError(
      "ADD IMAGE did not offer \"Generate Image (Beta)\". It offered: " +
        offered.slice(0, 25).join(" | ")
    );
  }
  await generate.click();
  await page.waitForTimeout(3000);

  const generator = page.locator(".bx--modal-container:visible").last();
  const box = generator
    .locator(".mce-content-body[contenteditable='true'], textarea, input[type='text']")
    .last();
  if (await box.isVisible().catch(() => false)) {
    await box.fill(prompt).catch(() => {});
    console.log(`Prompt: ${prompt.slice(0, 100)}`);
  } else {
    console.log("No prompt box was offered; generating with the generator's defaults.");
  }

  const create = generator.getByRole("button", { name: /^(create|generate)$/i }).first();
  if (!(await create.isVisible().catch(() => false))) {
    const offered = await visibleControlNames(generator);
    throw new GuardError(
      `The image generator offered no Create button. Controls in it: ${offered.slice(0, 25).join(" | ")}`
    );
  }
  await create.click();

  console.log("Waiting for Authoring Copilot to produce an image (this can take a while)...");
  // The finished image is applied with a plain "ADD" button, and it renders outside
  // the generator's modal container - scoping the search to that container matched
  // some other control instead, which is why the picture was never applied.
  // Match on the button's text, not its accessible name: the name carries the icon
  // as well, so an exact-name lookup finds nothing.
  // The apply control is a floating round button whose "+" icon and "ADD" label are
  // stacked, and the label is not always inside the button element - so try the
  // button, then the label itself, then an aria-labelled control, and report what
  // was on screen if none of them is there.
  const candidates = [
    page.locator("button").filter({ hasText: /^\s*ADD\s*$/ }),
    page.getByText(/^\s*ADD\s*$/),
    page.locator('[aria-label="ADD"], [title="ADD"]')
  ];
  let accepted = false;
  let appliedAutomatically = false;
  const startedWaiting = Date.now();
  const deadline = startedWaiting + GENERATION_TIMEOUT_MS;
  let nextProgressAt = 15_000;
  while (!accepted && Date.now() < deadline) {
    if (await featuredImageApplied(page)) {
      console.log("Generated image was automatically applied by SLS; no ADD click was needed.");
      accepted = true;
      appliedAutomatically = true;
      break;
    }
    if (await applyGeneratedImageSelection(page)) {
      accepted = true;
      break;
    }
    for (const candidate of candidates) {
      const count = await candidate.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const target = candidate.nth(index);
        if (!(await target.isVisible().catch(() => false))) continue;
        console.log("Generated image ready; applying it with ADD.");
        let clicked = false;
        try {
          await target.click({ timeout: 10_000 });
          clicked = true;
        } catch {
          clicked = await target.dispatchEvent("click").then(() => true).catch(() => false);
        }
        if (!clicked) continue;
        accepted = true;
        break;
      }
      if (accepted) break;
    }
    if (!accepted) {
      const elapsed = Date.now() - startedWaiting;
      if (elapsed >= nextProgressAt) {
        console.log(`Still waiting for Authoring Copilot... ${Math.round(elapsed / 1000)}s elapsed.`);
        nextProgressAt += 15_000;
      }
      await page.waitForTimeout(3000);
    }
  }
  if (!accepted) {
    await throwIfAuthoringCopilotFailed(page, options.externalServiceFailures ?? []);
    const offered = await visibleControlNames(page);
    throw new GuardError(
      "The generated images appeared but no ADD control could be clicked. " +
        `Controls on screen: ${offered.slice(0, 25).join(" | ")}`
    );
  }
  console.log("Waiting for the selected image to finish uploading into the Featured Image field...");
  if (!(await waitForFeaturedImageApplied(page, 90_000))) {
    throw new GuardError(
      "The generated option was accepted, but no image preview appeared in the Featured Image field. " +
        "Done was not clicked, so an incomplete upload was not committed."
    );
  }
  console.log("Generated image preview is ready in the Featured Image field.");

  // The module details form has no Save button of its own - the probe found none.
  // "Done" (the checkmark in the header) is what commits it, which is what a person
  // clicks to finish editing. A disk icon is still tried first in case some views
  // offer one.
  const save = page.locator('button:has(svg[name="Save24"])').first();
  const done = page.locator('button:has(svg[name="CheckmarkCircle32"])').first();
  if (await save.isVisible().catch(() => false)) {
    await save.click();
    await page.waitForTimeout(2500);
    console.log("Saved.");
  } else if (await done.isVisible().catch(() => false)) {
    await done.click();
    await page.waitForTimeout(8000);
    console.log("Committed with Done.");
  } else {
    console.log("No save or Done control was offered; the image may not persist.");
  }

  // Verify by reloading: a picture that did not persist is not a success. The form
  // has to be reopened first - after a reload the card is read-only again, and the
  // empty-state text this checks for exists only inside the form.
  await page.goto(settingsUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await openModuleDetailsForm(page);
  const stillEmpty = await page
    .getByText(/Click to upload/i)
    .first()
    .isVisible()
    .catch(() => false);
  if (stillEmpty) {
    throw new GuardError("The generated image did not persist: no Featured Image after reopening settings.");
  }
  console.log("Featured Image verified after reopening the module settings.");
  return { generated: true, prompt, appliedAutomatically };
}

async function applyGeneratedImageSelection(page) {
  // Current SLS renders this as a nested content subpage rather than a conventional
  // dialog. The first image is selected by default, and the floating action is a
  // .btn-add button containing Plus24 and a mixed-case "Add" label.
  const selection = page.locator(".acp-image-selection-subpage.is-visible").last();
  if (!(await selection.isVisible().catch(() => false))) return false;

  const radios = selection.locator('input[type="radio"]');
  if ((await radios.count()) > 0 && (await selection.locator('input[type="radio"]:checked').count()) === 0) {
    const first = radios.first();
    await first.check({ force: true });
    await expect(first).toBeChecked();
    console.log("Generated images are ready; selected the first option.");
  }

  const add = selection.locator('.btn-add button:has(svg[name="Plus24"])').first();
  if (!(await add.isVisible().catch(() => false))) return false;

  console.log("Generated images are ready; applying the selected option with ADD.");
  await add.click({ timeout: 10_000 }).catch(async () => add.click({ force: true }));
  await selection.waitFor({ state: "hidden", timeout: 12_000 }).catch(() => {});
  if (!(await selection.isVisible().catch(() => false))) return true;

  const visibleError = await selection
    .locator(".message-component:visible")
    .innerText()
    .catch(() => "");
  if (visibleError.trim()) {
    throw new GuardError(`SLS did not add the generated image: ${visibleError.replace(/\s+/g, " ").trim()}`);
  }
  return false;
}

async function featuredImageApplied(page) {
  const form = page.locator("form.cv-form").filter({ hasText: "Featured Image" }).first();
  if ((await form.count().catch(() => 0)) === 0) return false;
  const empty = await form.getByText(/Click to upload/i).first().isVisible().catch(() => false);
  if (empty) return false;
  // Before Done, SLS may show the generated /success URL or a local blob while it
  // copies the file through its scan bucket. After saving it becomes /thumbnail/.
  // Any visible image is safe here because the locator is scoped to the Featured
  // Image form rather than the page header, where the user avatar also lives.
  const thumbnail = form.locator('img[src]:not([src=""])').first();
  const fileName = form.getByText(/\.(?:jpe?g|png|webp)$/i).first();
  return (
    (await thumbnail.isVisible().catch(() => false)) ||
    (await fileName.isVisible().catch(() => false))
  );
}

async function waitForFeaturedImageApplied(page, timeoutMs) {
  const started = Date.now();
  let nextProgressAt = 15_000;
  while (Date.now() - started < timeoutMs) {
    if (await featuredImageApplied(page)) return true;
    const elapsed = Date.now() - started;
    if (elapsed >= nextProgressAt) {
      console.log(`Still waiting for the image upload... ${Math.round(elapsed / 1000)}s elapsed.`);
      nextProgressAt += 15_000;
    }
    await page.waitForTimeout(2000);
  }
  return false;
}

async function stepIntoFirstSection(page) {
  if (/\/section\/\d+/.test(page.url())) return;
  const heading = page.locator("button.bx--accordion__heading").first();
  if ((await heading.count()) === 0) return;
  await heading.click().catch(() => {});
  await page.waitForURL(/\/section\/\d+/, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

// Looks for the image generator by the names SLS is known to use for it. Returns
// null rather than guessing, so the caller can report what was actually offered.
async function findImageGenerator(page) {
  const wanted = [/generate image/i, /image \(beta\)/i, /generate picture/i];
  for (const candidate of await page.getByRole("button").all()) {
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const label = (
      (await candidate.innerText().catch(() => "")) ||
      (await candidate.getAttribute("aria-label").catch(() => "")) ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (wanted.some((pattern) => pattern.test(label))) return { locator: candidate, label };
  }
  return null;
}

async function visibleControlNames(scope) {
  // Works for a Page or a Locator alike. The previous version passed an element
  // argument that page.evaluate never supplies, so it threw and reported an empty
  // list - turning a helpful "here is what SLS offered" into a bare guard message.
  const nodes = scope.locator("button, [role='menuitem'], li");
  const names = [];
  for (const node of await nodes.all().catch(() => [])) {
    if (!(await node.isVisible().catch(() => false))) continue;
    const name = (
      (await node.innerText().catch(() => "")) ||
      (await node.getAttribute("aria-label").catch(() => "")) ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (name && name.length < 70) names.push(name);
  }
  return [...new Set(names)];
}
// ---------------------------------------------------------------------------
// Module-level helpers.
//
// RECONSTRUCTED after a bad edit deleted this section. The generic pieces
// (authentication, overlay suppression, error checking) are now imported from
// sls-runner rather than duplicated. The gamification readers below are rebuilt
// from their observed behaviour and need re-verifying against a live module.
// ---------------------------------------------------------------------------

// Opens the module in edit mode. Unlike the workflow runner's version this takes
// the parsed target and reports the URL it opens, which is what the module action
// launchers print.
async function enterEditMode(page, target, title = null) {
  const viewUrl = target.adminViewUrl ?? `${SLS_ORIGIN}/admin/community-gallery/module/view/${target.id}/module-plan`;
  console.log(`Opening admin Module View:\n${viewUrl}`);
  await page.goto(viewUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  if (/\/login/i.test(new URL(page.url()).pathname)) {
    throw new GuardError(
      `SLS authentication is required. Run npm.cmd run sls:auth and sign in manually. Current URL: ${page.url()}`
    );
  }

  const editButton = page.getByRole("button", { name: "Edit", exact: true });
  if ((await editButton.count()) > 0) {
    console.log("Clicking Edit...");
    await editButton.first().click();
    await page.waitForTimeout(3000);
  }
  await expect(page).toHaveURL(new RegExp(`/admin/community-gallery/module/edit/${target.id}`));
  if (title) {
    // A wrong module would be worse than no module: confirm the title before any
    // action touches it.
    const heading = page.getByText(title, { exact: false }).first();
    if ((await heading.count()) === 0) {
      throw new GuardError(`Opened ${target.id} but its title does not read "${title}".`);
    }
  }
  console.log("Edit mode verified.");
}

// The module settings card lives on a section page, not the module plan, so a run
// that starts on the plan steps into the first section to reach it.
async function openModuleSettings(page) {
  const cardSelector = ".card-component.settings-card.edit.multi-actions:not(.section-settings)";

  if ((await page.locator(cardSelector).count()) === 0) {
    const heading = page.locator("button.bx--accordion__heading").first();
    if ((await heading.count()) > 0) {
      console.log("Stepping into the first section to reach Module Settings...");
      await heading.click().catch(() => {});
      await page.waitForURL(/\/section\/\d+/, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
  }

  const settingsCard = page.locator(cardSelector);
  if ((await settingsCard.count()) === 0) {
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
      if (name) offered.push(name.slice(0, 46));
    }
    throw new GuardError(
      `No Module settings card was found on ${page.url()}. Visible buttons: ` +
        [...new Set(offered)].join(" | ")
    );
  }

  // The card is read-only until its hover pencil is clicked - the same pattern the
  // module details form uses.
  const card = settingsCard.first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.hover().catch(() => {});
  await page.waitForTimeout(400);
  const pencil = card.locator('.edit-indicator, button:has(svg[name="Settings24"])').first();
  const opener = (await pencil.count()) > 0 ? pencil : card;
  await opener.click({ timeout: 10_000 }).catch(async () => {
    await opener.dispatchEvent("click").catch(() => {});
  });

  const modal = activeModal(page);
  await expect(modal).toBeVisible();
  return waitForModuleSettingsPanel(page);
}

function activeModal(page) {
  return page.locator(".bx--modal-container:visible").last();
}

// Returns only after the main Module Settings / Module Details page has mounted.
// Breadcrumb text is deliberately not used: nested teacher pages keep that text
// visible and caused the old run to query the wrong page after ADD.
async function waitForModuleSettingsPanel(page) {
  await expect
    .poll(
      () => page.locator(`#${COMPLETED_ASSIGNMENT_PERMISSION_ID}:visible`).count(),
      {
        message: `Wait for ${COMPLETED_ASSIGNMENT_PERMISSION_LABEL}`,
        timeout: 20_000,
        intervals: [250, 500, 750, 1000]
      }
    )
    .toBe(1);
  const modal = activeModal(page);
  await expect(modal.locator(`#${COMPLETED_ASSIGNMENT_PERMISSION_ID}`)).toHaveCount(1);
  return modal;
}

// Gamification settings are reached from More Actions.
async function openGamification(page) {
  const more = page.getByRole("button", { name: "More Actions", exact: true }).first();
  await expect(more).toBeVisible();
  await more.click();
  await page.waitForTimeout(1200);

  const entry = page.getByText("Manage Gamification Settings", { exact: true }).first();
  if ((await entry.count()) === 0) {
    const offered = await visibleControlNames(page);
    throw new GuardError(
      `More Actions did not offer "Manage Gamification Settings". It offered: ${offered.slice(0, 20).join(" | ")}`
    );
  }
  await entry.click();
  await page.waitForTimeout(2500);

  const modal = page.locator(".bx--modal-container:visible").last();
  await expect(modal).toBeVisible();
  return modal;
}

async function closeModal(modal) {
  const close = modal
    .locator("button.bx--modal-close, .close-wrapper button, .close-wrapper svg.btn-close, svg.btn-close")
    .first();
  if ((await close.count()) > 0) {
    await close.click().catch(() => {});
  } else {
    await modal.press("Escape").catch(() => {});
  }
  await modal.page().waitForTimeout(1200);
}

// Saves the open modal and waits for it to close, so the next read sees committed
// state rather than the form that was just submitted.
async function saveAndCloseModal(page, modal) {
  const visibleModalCount = await page.locator(".bx--modal-container:visible").count();
  const save = modal
    .locator('button:has(svg[name="Save24"])')
    .or(modal.getByRole("button", { name: /^(save|update|done)$/i }))
    .first();
  if ((await save.count()) === 0) {
    const offered = await visibleControlNames(modal);
    throw new GuardError(`The modal offered no Save control. Controls in it: ${offered.slice(0, 20).join(" | ")}`);
  }
  await expect(save).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await assertNoSlsError(page);
  // Module Settings saves in place. Let the request and Vue state settle, then
  // close the saved panel explicitly before reopening it for persistence checks.
  await page.waitForTimeout(1500);
  await closeModal(modal);
  await expect
    .poll(
      () => page.locator(".bx--modal-container:visible").count(),
      {
        message: "Wait for the saved modal to close",
        timeout: 20_000,
        intervals: [250, 500, 750, 1000]
      }
    )
    .toBeLessThan(visibleModalCount);
  console.log("Module Settings saved with the blue disk.");
  await page.waitForTimeout(500);
}

// The teacher picker has a separate transaction from Module Settings. Clicking
// the floating ADD only stages the selected teacher; the Save24 disk on the
// credited-teachers page commits it and returns to (or closes) Module Settings.
async function saveCreditedTeachers(page, modal) {
  const contributorPage = page.locator(".contributor-content-subpage.is-visible").last();
  await expect(contributorPage).toBeVisible();
  const save = modal.locator('button:has(svg[name="Save24"])').first();
  await expect(save).toHaveCount(1);
  await expect(save).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await assertNoSlsError(page);
  await page.waitForTimeout(1500);
  // This Save commits in place; unlike the Module Settings disk it does not close
  // the credited-teachers subpage. Navigate back only after the save has settled.
  const back = contributorPage.getByText("Back to Module Details", { exact: true });
  await expect(back).toBeVisible();
  await back.click();
  await expect(contributorPage).toBeHidden({ timeout: 20_000 });
  console.log("Credited teachers saved with the blue disk.");
  await page.waitForTimeout(500);
}

// Carbon hides the real checkbox, so the label is what responds to a click. The
// toggle is only ever moved when it is not already in the wanted state.
async function setToggle(toggle, wanted) {
  if ((await toggle.isChecked()) === wanted) return false;
  const id = await toggle.getAttribute("id");
  const page = toggle.page();
  const label = id ? page.locator(`label[for="${id}"]`).first() : null;
  if (label && (await label.count()) > 0) {
    await label.click().catch(() => {});
  } else {
    await toggle.check({ force: true }).catch(() => {});
  }
  await page.waitForTimeout(800);
  return true;
}

async function readGamificationDetails(modal) {
  const toggle = modal.locator("input.toggle.bx--toggle-input").first();
  const enabled = await toggle.isChecked().catch(() => false);
  const titleInput = modal.locator("input.bx--text-input").first();
  const title = ((await titleInput.inputValue().catch(() => "")) || "").trim();
  const editor = modal.locator(".mce-content-body[contenteditable='true']").first();
  const description = ((await editor.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
  return { enabled, title, description };
}

async function setGamificationDetails(modal, title, description) {
  const titleInput = modal.locator("input.bx--text-input").first();
  if ((await titleInput.count()) > 0) {
    await titleInput.fill(title).catch(() => {});
  }
  const editor = modal.locator(".mce-content-body[contenteditable='true']").first();
  if (await editor.isVisible().catch(() => false)) {
    await editor.fill(description).catch(() => {});
  }
  await modal.page().waitForTimeout(600);
}

// Whether a game has actually been generated.
//
// This deliberately looks for positive signals rather than the gamification
// toggle: the toggle only says the feature is on. SLS also renders headings whose
// wording differs from the labels in the generator ("Game Story Background", not
// "Game Story Image"), so matching on those alone produced false positives.
async function readGeneratedGameEvidence(modal) {
  const text = ((await modal.innerText().catch(() => "")) || "").replace(/\s+/g, " ");
  const kebabs = await modal.locator('button:has(svg[name="Kebab24"])').count().catch(() => 0);
  const conditions = /CONDITIONS\s*\(\s*[1-9]\d*\s*\)/i.test(text);
  const gameStoriesPresent = /Game Stor(y|ies)/i.test(text) && (kebabs > 0 || conditions);
  const collectiblesPresent = /Collectible/i.test(text) && (kebabs > 0 || conditions);
  return { gameStoriesPresent, collectiblesPresent, kebabs, conditions };
}

function leaderboardCheckboxes(modal) {
  return modal
    .locator(".bx--checkbox-wrapper")
    .filter({ hasText: /leaderboard/i })
    .locator('input[type="checkbox"]');
}

async function readLeaderboardState(page, modal) {
  const tab = modal.getByRole("tab", { name: /leaderboard/i }).first();
  if ((await tab.count()) > 0) {
    await tab.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  const boxes = leaderboardCheckboxes(modal);
  const count = await boxes.count().catch(() => 0);
  if (count === 0) return { individual: null, team: null };
  return {
    individual: await boxes.nth(0).isChecked().catch(() => null),
    team: count > 1 ? await boxes.nth(1).isChecked().catch(() => null) : null
  };
}

function leaderboardChanged(before, after) {
  for (const key of ["individual", "team"]) {
    if (before[key] !== null && after[key] !== null && before[key] !== after[key]) return true;
  }
  return false;
}

async function throwIfAuthoringCopilotFailed(page, failures = []) {
  const body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
  const failure = failures.find((item) => item.status === 401) ??
    (/401\s+Unauthorized.*api\.openai\.com\/v1\/responses/i.test(body)
      ? { status: 401, endpoint: "https://api.openai.com/v1/responses" }
      : null);
  if (!failure) return;
  throw new GuardError(
    `SLS Authoring Copilot returned HTTP ${failure.status} from ${failure.endpoint}. ` +
      "This is an upstream Authoring Copilot authentication failure, not an expired SLS login. " +
      "No generated result was accepted or saved."
  );
}

// The module's details form - Module Title, Featured Image, Module Description -
// is behind a hover pencil, the same read-only-card pattern SLS uses for section
// metadata. Until it is clicked the card shows only "Learning Outcomes", which is
// why the settings page looked as though it had no image control at all.
async function openModuleDetailsForm(page) {
  if ((await page.getByRole("button", { name: /^ADD IMAGE$/i }).count()) > 0) return true;
  const pencil = page
    .locator('.edit-indicator, button:has(svg[name="Pencil24"]), svg[name="Pencil24"]')
    .first();
  if ((await pencil.count()) === 0) return false;

  console.log("Hovering the module card to reveal its edit pencil...");
  await pencil.scrollIntoViewIfNeeded().catch(() => {});
  await pencil.hover({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  // The pencil can still be invisible to Playwright's actionability check, so fall
  // back to dispatching the click directly, as the section editor does.
  await pencil.click({ timeout: 5_000 }).catch(async () => {
    await pencil.dispatchEvent("click").catch(() => {});
  });
  await page.waitForTimeout(3000);
  return (await page.getByRole("button", { name: /^ADD IMAGE$/i }).count()) > 0;
}

// Clicks the control the discovery helper would name exactly this. Locator-based
// lookups kept missing the generator's ADD button because its label comes from an
// aria-label rather than its text; finding it the same way it is reported removes
// that mismatch entirely.
async function clickControlNamed(scope, wanted) {
  const nodes = scope.locator("button, [role='menuitem'], li");
  for (const node of await nodes.all().catch(() => [])) {
    if (!(await node.isVisible().catch(() => false))) continue;
    const name = (
      (await node.innerText().catch(() => "")) ||
      (await node.getAttribute("aria-label").catch(() => "")) ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (name.toUpperCase() !== wanted.toUpperCase()) continue;
    await node.click({ timeout: 10_000 }).catch(async () => {
      await node.dispatchEvent("click").catch(() => {});
    });
    return true;
  }
  return false;
}
