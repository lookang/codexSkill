// Diagnostic: opens Module Settings and lists every permission checkbox it holds,
// scrolling the modal to the bottom first. Read-only: nothing is ticked or saved.
//
//   node scripts/probe-permissions.mjs <moduleId>
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
  await page.waitForTimeout(6000);
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
  await card.hover().catch(() => {});
  await page.waitForTimeout(400);
  const pencil = card.locator('.edit-indicator, button:has(svg[name="Settings24"])').first();
  const opener = (await pencil.count()) > 0 ? pencil : card;
  await opener.click({ timeout: 10_000 }).catch(async () => {
    await opener.dispatchEvent("click").catch(() => {});
  });
  await page.waitForTimeout(2500);

  const modal = page.locator(".bx--modal-container:visible").last();
  // Scroll the modal body to the bottom so anything lazily rendered appears.
  for (let pass = 0; pass < 6; pass += 1) {
    await modal.evaluate((element) => {
      const scroller = element.querySelector(".bx--modal-content") || element;
      scroller.scrollTop = scroller.scrollHeight;
    }).catch(() => {});
    await page.waitForTimeout(700);
  }

  const rows = await modal.evaluate((element) =>
    Array.from(element.querySelectorAll(".bx--checkbox-wrapper, label")).map((node) => ({
      text: (node.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70),
      checked: Boolean(node.querySelector('input[type="checkbox"]:checked'))
    })).filter((row) => row.text)
  );
  console.log("checkbox rows in Module Settings:");
  for (const row of rows) console.log(`   [${row.checked ? "x" : " "}] ${row.text}`);

  // Exactly the locators the helper uses, so we can see which one fails.
  const LABEL = "Allow viewing as print-friendly completed assignment";
  const byRole = await modal.getByRole("checkbox", { name: LABEL }).count().catch(() => -1);
  const wrappers = await modal.locator(".bx--checkbox-wrapper").filter({ hasText: LABEL }).count().catch(() => -1);
  const inputs = await modal
    .locator(".bx--checkbox-wrapper")
    .filter({ hasText: LABEL })
    .locator('input[type="checkbox"]')
    .count()
    .catch(() => -1);
  const byText = await modal.getByText(LABEL).count().catch(() => -1);
  const byLabelTag = await modal.locator("label").filter({ hasText: LABEL }).count().catch(() => -1);
  console.log("\nthe helper's own locators, against this modal:");
  console.log(`   getByRole checkbox name=LABEL      -> ${byRole}`);
  console.log(`   .bx--checkbox-wrapper hasText      -> ${wrappers}`);
  console.log(`   ...its input[type=checkbox]        -> ${inputs}`);
  console.log(`   getByText(LABEL)                   -> ${byText}`);
  console.log(`   label hasText                      -> ${byLabelTag}`);
  console.log(`   visible modal containers on page   -> ${await page.locator(".bx--modal-container:visible").count()}`);

  const text = ((await modal.innerText().catch(() => "")) || "").replace(/\s+/g, " ");
  console.log(`\n"completed assignment" appears in the modal text: ${/completed assignment/i.test(text)}`);
  console.log("\nNothing was changed or saved.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
