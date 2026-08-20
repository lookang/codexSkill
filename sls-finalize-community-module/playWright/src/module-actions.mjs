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
    error: null
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
    page.setDefaultTimeout(options.timeoutMs ?? 20_000);
    page.setDefaultNavigationTimeout(Math.max(options.timeoutMs ?? 20_000, 30_000));

    await enterEditMode(page, target, config?.module?.title ?? null);
    if (action === "gamify") {
      report.result = await gamifyModule(page, config.gamification);
    } else if (action === "thumbnail") {
      report.result = await generateModuleThumbnail(page, config, options);
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

async function gamifyModule(page, gamification) {
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
    await expect(addButtons.first()).toBeVisible({ timeout: GENERATION_TIMEOUT_MS });
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
  const leaderboard = await enableLeaderboards(page, modal);
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
  if (leaderboardAfter.individual === false || leaderboardAfter.team === false) {
    console.log(
      `Leaderboard settings did not persist (individual=${leaderboardAfter.individual}, team=${leaderboardAfter.team}).`
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
    leaderboardRequested: leaderboard,
    ...verified,
    ...evidence
  };
}

async function addCreditedTeacher(page, teacherName) {
  console.log("Opening Module Settings...");
  let modal = await openModuleSettings(page);
  if ((await modal.getByText(teacherName, { exact: true }).count()) > 0) {
    await closeModal(modal);
    modal = await openModuleSettings(page);
    await expect(modal.getByText(teacherName, { exact: true }).first()).toBeVisible();
    const permission = await enablePrintFriendlyCompletedAssignment(page, modal);
    // Only a real change is worth saving; re-saving an unchanged module is a write
    // for nothing.
    if (permission === "enabled") {
      await saveAndCloseModal(page, modal);
      modal = await openModuleSettings(page);
      const persisted = await printFriendlyState(page, modal);
      if (persisted !== "on") {
        throw new GuardError(
          `"${PRINT_FRIENDLY_LABEL}" did not persist: it reads "${persisted ?? "not offered"}" after saving and reopening.`
        );
      }
      console.log(`Verified after reopening: ${PRINT_FRIENDLY_LABEL}`);
    }
    console.log(`${teacherName} is already a credited teacher; no change was needed.`);
    return { changed: false, teacherName, verified: true, printFriendlyCompleted: permission !== null };
  }

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

  await expect(modal.getByText(teacherName, { exact: true }).first()).toBeVisible();
  await modal.getByText("Back to Module Details", { exact: true }).click();
  await expect(modal.getByText("Module Settings", { exact: true }).first()).toBeVisible();
  // SLS only offers this permission once the module actually has a credited
  // teacher saved, so on a module gaining its first one the control does not exist
  // yet. Try anyway - some modules do offer it here - but stay quiet about it
  // missing, because the real attempt comes after the save.
  let permission = await enablePrintFriendlyCompletedAssignment(page, modal, { quiet: true });
  await saveAndCloseModal(page, modal);

  modal = await openModuleSettings(page);
  await expect(modal.getByText(teacherName, { exact: true }).first()).toBeVisible();
  console.log(`Credited teacher verified after reopening: ${teacherName}`);

  // Now the teacher is committed, so the permission exists and can be set.
  if (permission === null) {
    permission = await enablePrintFriendlyCompletedAssignment(page, modal);
    if (permission === "enabled") {
      await saveAndCloseModal(page, modal);
      modal = await openModuleSettings(page);
      const persisted = await printFriendlyState(page, modal);
      if (persisted !== "on") {
        throw new GuardError(
          `"${PRINT_FRIENDLY_LABEL}" did not persist: it reads "${persisted ?? "not offered"}" after saving and reopening.`
        );
      }
      console.log(`Verified after reopening: ${PRINT_FRIENDLY_LABEL}`);
    }
  }

  return { changed: true, teacherName, verified: true, printFriendlyCompleted: permission !== null };
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
  if ((await addImage.count()) === 0) {
    const offered = await visibleControlNames(page);
    throw new GuardError(
      `No ADD IMAGE control on ${settingsUrl}. Controls there: ${offered.slice(0, 25).join(" | ")}`
    );
  }

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
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  while (!accepted && Date.now() < deadline) {
    for (const candidate of candidates) {
      if ((await candidate.count().catch(() => 0)) === 0) continue;
      const target = candidate.last();
      if (!(await target.isVisible().catch(() => false))) continue;
      console.log("Generated image ready; applying it with ADD.");
      await target.click({ timeout: 10_000 }).catch(async () => {
        await target.dispatchEvent("click").catch(() => {});
      });
      accepted = true;
      break;
    }
    if (!accepted) await page.waitForTimeout(3000);
  }
  if (!accepted) {
    const offered = await visibleControlNames(page);
    throw new GuardError(
      "The generated images appeared but no ADD control could be clicked. " +
        `Controls on screen: ${offered.slice(0, 25).join(" | ")}`
    );
  }
  await page.waitForTimeout(3000);

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
    await page.waitForTimeout(3000);
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
  return { generated: true, prompt };
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

  const modal = page.locator(".bx--modal-container:visible").last();
  await expect(modal).toBeVisible();
  await page.waitForTimeout(1200);
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
  const close = modal.locator("button.bx--modal-close, .close-wrapper button").first();
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
  const save = modal
    .locator('button:has(svg[name="Save24"])')
    .or(modal.getByRole("button", { name: /^(save|update|done)$/i }))
    .first();
  if ((await save.count()) === 0) {
    const offered = await visibleControlNames(modal);
    throw new GuardError(`The modal offered no Save control. Controls in it: ${offered.slice(0, 20).join(" | ")}`);
  }
  await save.click();
  await assertNoSlsError(page);
  await page.waitForTimeout(2500);
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

// Both leaderboards are switched on, and neither is ever switched off.
async function enableLeaderboards(page, modal) {
  const tab = modal.getByRole("tab", { name: /leaderboard/i }).first();
  if ((await tab.count()) > 0) {
    await tab.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  const boxes = leaderboardCheckboxes(modal);
  const count = await boxes.count().catch(() => 0);
  if (count === 0) {
    console.log("No leaderboard checkboxes were offered on this module.");
    return { individual: null, team: null };
  }
  for (let index = 0; index < Math.min(count, 2); index += 1) {
    const box = boxes.nth(index);
    if (await box.isChecked().catch(() => false)) continue;
    const id = await box.getAttribute("id");
    const label = id ? page.locator(`label[for="${id}"]`).first() : null;
    if (label && (await label.count()) > 0) {
      await label.click().catch(() => {});
    } else {
      await box.check({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(600);
  }
  return {
    individual: await boxes.nth(0).isChecked().catch(() => null),
    team: count > 1 ? await boxes.nth(1).isChecked().catch(() => null) : null
  };
}

const PRINT_FRIENDLY_LABEL = "Allow viewing as print-friendly completed assignment";

// Finds the permission checkbox, or null when SLS is not offering it. Permissions
// sit below the fold in a scrolling modal, so the control has to be brought into
// view before it can be found or clicked.
async function printFriendlyCheckbox(page, passedModal) {
  // Resolve the modal fresh rather than trusting the handle passed in: this flow
  // closes and reopens Module Settings, and a handle captured before that points at
  // the old container.
  const live = page.locator(".bx--modal-container:visible").last();
  const modal = (await live.count()) > 0 ? live : passedModal;

  // The permissions sit at the foot of a scrolling modal and render lazily, so the
  // control is genuinely absent until the body has been scrolled down. Scroll and
  // re-check until it appears rather than looking once and concluding the module
  // does not offer it.
  // Find it through its <label>, then follow the label's "for" to the input.
  //
  // Carbon hides the real checkbox, so it is outside the accessibility tree until
  // scrolled into view - getByRole("checkbox") therefore reports nothing while the
  // row is plainly in the modal. The label is always present, and its "for"
  // attribute names the input regardless of visibility.
  const label = modal.locator("label").filter({ hasText: PRINT_FRIENDLY_LABEL }).first();
  for (let pass = 0; pass < 8; pass += 1) {
    if ((await label.count().catch(() => 0)) > 0) break;
    await modal
      .evaluate((element) => {
        const scroller = element.querySelector(".bx--modal-content") || element;
        scroller.scrollTop = scroller.scrollHeight;
      })
      .catch(() => {});
    await page.waitForTimeout(700);
  }
  if ((await label.count().catch(() => 0)) === 0) return null;

  await label.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);

  const inputId = await label.getAttribute("for").catch(() => null);
  if (inputId) {
    const byId = modal.locator(`input[id="${inputId}"]`).first();
    if ((await byId.count().catch(() => 0)) > 0) return byId;
  }
  const byRole = modal.getByRole("checkbox", { name: PRINT_FRIENDLY_LABEL }).first();
  if ((await byRole.count().catch(() => 0)) > 0) return byRole;

  const paired = modal
    .locator(".bx--checkbox-wrapper")
    .filter({ hasText: PRINT_FRIENDLY_LABEL })
    .locator('input[type="checkbox"]')
    .first();
  return (await paired.count().catch(() => 0)) === 0 ? null : paired;
}

// Reads the permission without touching it, for verifying that a save stuck.
async function printFriendlyState(page, modal) {
  const checkbox = await printFriendlyCheckbox(page, modal);
  if (!checkbox) return null;
  return (await checkbox.isChecked()) ? "on" : "off";
}

// Returns "already" when it was on, "enabled" when this call turned it on, and
// null when the module does not offer it. Callers need those apart: only a real
// change is worth a save.
async function enablePrintFriendlyCompletedAssignment(page, modal, { quiet = false } = {}) {
  const checkbox = await printFriendlyCheckbox(page, modal);
  if (!checkbox) {
    if (!quiet) {
      // Say what was actually on screen: "not offered" on its own hid the fact that
      // the row was present but the wrong container was being searched.
      const live = page.locator(".bx--modal-container:visible");
      const modals = await live.count().catch(() => -1);
      const text = ((await live.last().innerText().catch(() => "")) || "").replace(/\s+/g, " ");
      console.log(
        `Permission not offered on this module: ${PRINT_FRIENDLY_LABEL} ` +
          `(visible modals: ${modals}; the modal mentions it: ${/completed assignment/i.test(text)}; ` +
          `heading: "${text.slice(0, 60)}")`
      );
    }
    return null;
  }
  if (await checkbox.isChecked()) {
    console.log(`Already on: ${PRINT_FRIENDLY_LABEL}`);
    return "already";
  }
  const clickable = modal.locator("label").filter({ hasText: PRINT_FRIENDLY_LABEL }).first();
  if ((await clickable.count()) > 0) {
    await clickable.click().catch(() => {});
  } else {
    await checkbox.check({ force: true }).catch(() => {});
  }
  await expect(checkbox).toBeChecked();
  console.log(`Turned on: ${PRINT_FRIENDLY_LABEL}`);
  return "enabled";
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
