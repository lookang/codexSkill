// Read-only browser smoke test for the four public launchers. It enters edit mode
// and opens the relevant menus/forms, but never changes a control or clicks Save.
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium, expect } from "@playwright/test";
import { pickAndRememberModule } from "../src/module-picker.mjs";

const root = process.cwd();
const defaultUrl =
  "https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/428156f1-90f1-4b64-865f-66b354b5501f";
const target = await pickAndRememberModule({
  root,
  defaultUrl,
  ask,
  stop: async (message) => {
    throw new Error(message);
  }
});
const authStatePath = path.resolve(root, ".auth", "sls-state.json");
if (!(await fileExists(authStatePath))) {
  console.error("No reusable SLS session was found. Run 01-authenticate-sls.cmd first.");
  process.exit(1);
}
const headless = process.argv.includes("--headless");
console.log(`Opening ${headless ? "headless" : "visible"} Chrome for a read-only check...`);
const browser = await chromium.launch({
  channel: "chrome",
  headless,
  args: headless ? [] : ["--start-maximized"]
});
const context = await browser.newContext({
  storageState: authStatePath,
  viewport: headless ? { width: 1440, height: 1000 } : null
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const checks = [];
let stage = "opening Module View";
const runDir = path.resolve(
  root,
  "output",
  target.id,
  `smoke-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`
);
await fs.mkdir(runDir, { recursive: true });

try {
  await page.goto(target.adminViewUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    throw new Error("SLS authentication is required. Run npm run sls:auth (npm.cmd on Windows) first.");
  }
  checks.push(["URL parser", true, `${target.scope} URL -> module ${target.id}`]);

  stage = "finding Edit on Module View";
  const edit = page.getByRole("button", { name: "Edit", exact: true });
  await expect(edit).toBeVisible();
  await edit.click();
  await expect(page).toHaveURL(new RegExp(`/admin/community-gallery/module/edit/${target.id}`));
  checks.push(["Main automation", true, "Module View opens Edit mode"]);

  stage = "opening Gamification settings";
  const more = page.getByRole("button", { name: "More Actions", exact: true });
  await expect(more).toBeVisible();
  await more.click();
  const gamification = page.getByText("Manage Gamification Settings", { exact: true });
  await expect(gamification).toBeVisible();
  await gamification.click();
  let modal = page.locator(".bx--modal-container:visible").last();
  await expect(modal).toBeVisible();
  await expect(modal.locator("input.toggle.bx--toggle-input").first()).toHaveCount(1);
  checks.push(["Gamification", true, "Settings modal and toggle are available"]);
  await closeWithoutSaving(page, modal);

  stage = "opening Module Settings";
  if (!/\/section\//.test(page.url())) {
    const firstSection = page.locator("button.bx--accordion__heading").first();
    await expect(firstSection).toBeVisible();
    await firstSection.click();
    await page.waitForURL(/\/section\/[0-9a-f-]+/i);
  }
  const settingsCard = page.locator(
    ".card-component.settings-card.edit.multi-actions:not(.section-settings)"
  ).first();
  await expect(settingsCard).toBeVisible();
  await settingsCard.hover();
  const settingsOpen = settingsCard.locator('.edit-indicator, button:has(svg[name="Settings24"])').first();
  await expect(settingsOpen).toBeVisible();
  await settingsOpen.click();
  modal = page.locator(".bx--modal-container:visible").last();
  await expect(modal.getByRole("button", { name: /^edit or add teachers$/i }).first()).toBeVisible();
  checks.push(["Teacher credit", true, "Module Settings exposes Edit or Add teachers"]);
  await closeWithoutSaving(page, modal);

  stage = "opening Featured Image controls";
  await page.goto(`https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${target.id}`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForTimeout(2500);
  const pencil = page.locator('.edit-indicator, button:has(svg[name="Pencil24"]), svg[name="Pencil24"]').first();
  await expect(pencil).toBeVisible();
  await pencil.click().catch(() => pencil.dispatchEvent("click"));
  const addImage = page.getByRole("button", { name: /^ADD IMAGE$/i }).first();
  await expect(addImage).toBeVisible();
  await addImage.click();
  await expect(page.getByText(/generate image/i).last()).toBeVisible();
  checks.push(["Thumbnail", true, "Featured Image exposes Generate Image"]);
  await page.keyboard.press("Escape").catch(() => {});

  console.log("\nREAD-ONLY SLS SMOKE TEST");
  for (const [name, ok, detail] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
  console.log("No fields were changed and nothing was saved.");
} catch (error) {
  const screenshot = path.join(runDir, "failure.png");
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  const controls = await visibleControlNames(page);
  console.error(`\nSmoke test stopped while ${stage}: ${error.message.split("\n")[0]}`);
  console.error(`Current URL: ${page.url()}`);
  console.error(`Visible controls: ${controls.slice(0, 25).join(" | ") || "(none)"}`);
  console.error(`Screenshot: ${screenshot}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

async function visibleControlNames(page) {
  return page.locator("button, [role='button'], [role='menuitem']").evaluateAll((nodes) => [
    ...new Set(
      nodes
        .filter((node) => node.getClientRects().length > 0)
        .map((node) =>
          (node.innerText || node.getAttribute("aria-label") || node.getAttribute("title") || "")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean)
    )
  ]).catch(() => []);
}

async function closeWithoutSaving(page, modal) {
  const close = modal.locator("button.bx--modal-close, .close-wrapper button").first();
  if ((await close.count()) > 0) await close.click().catch(() => {});
  else await page.keyboard.press("Escape").catch(() => {});
  await expect(modal).toBeHidden();
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ask(question) {
  const prompt = readline.createInterface({ input, output });
  const answer = await prompt.question(question);
  prompt.close();
  return answer;
}
