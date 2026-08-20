// Diagnostic: opens the Module Settings modal and reports everything in it, so a
// feature can be built against what is actually there. Read-only: it opens the
// modal, reads it, and closes it without saving.
//
//   node scripts/probe-module-settings.mjs <moduleId>
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [moduleId] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(process.cwd(), ".auth", "sls-state.json"),
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

try {
  await page.goto(
    `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/module-plan`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForTimeout(7000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }

  const cardSelector = ".card-component.settings-card.edit.multi-actions:not(.section-settings)";
  if ((await page.locator(cardSelector).count()) === 0) {
    const heading = page.locator("button.bx--accordion__heading").first();
    if ((await heading.count()) > 0) {
      await heading.click().catch(() => {});
      await page.waitForURL(/\/section\/\d+/, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
  }

  const card = page.locator(cardSelector).first();
  if ((await card.count()) === 0) {
    console.log("No module settings card found.");
    process.exit(1);
  }
  const pencil = card.locator(".edit-indicator, button").first();
  await pencil.click().catch(async () => {
    await pencil.dispatchEvent("click").catch(() => {});
  });
  await page.waitForTimeout(3000);

  const modal = page.locator(".bx--modal-container:visible").last();
  if ((await modal.count()) === 0) {
    console.log("Module settings modal did not open.");
    process.exit(1);
  }

  const text = (await modal.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  console.log("modal text (first 900 chars):");
  console.log(`   ${text.slice(0, 900)}`);

  const buttons = await modal.evaluate((element) =>
    [
      ...new Set(
        Array.from(element.querySelectorAll("button"))
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => (node.innerText || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim())
          .filter((name) => name && name.length < 60)
      )
    ]
  );
  console.log("\nbuttons in the modal:");
  for (const name of buttons) console.log(`   ${name}`);

  const images = await modal.evaluate((element) =>
    Array.from(element.querySelectorAll("img")).map((node) => ({
      src: (node.getAttribute("src") || "").slice(0, 70),
      alt: node.getAttribute("alt") || ""
    }))
  );
  console.log("\nimages in the modal:");
  for (const image of images) console.log(`   src="${image.src}" alt="${image.alt}"`);

  const fileInputs = await modal.evaluate((element) => element.querySelectorAll('input[type="file"]').length);
  console.log(`\nfile inputs: ${fileInputs}`);

  await page.keyboard.press("Escape").catch(() => {});
  console.log("\nNothing was changed or saved.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
