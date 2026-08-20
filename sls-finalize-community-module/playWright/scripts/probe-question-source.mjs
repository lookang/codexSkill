// Diagnostic: opens the first question of the first activity in a section and
// reports the Subject, Level and Content Map it already carries.
//
// This is what discovery should read when the section itself has no content map:
// the questions may still be tagged, and their tagging is the module's real answer.
// Read-only: opens the question settings, reads them, changes nothing.
//
//   node scripts/probe-question-source.mjs <moduleId> <sectionId>
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [moduleId, sectionId] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(process.cwd(), ".auth", "sls-state.json"),
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

try {
  await page.goto(
    `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/section/${sectionId}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForTimeout(7000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }

  // Open the first activity in the sidebar.
  const activity = page.locator(".bx--side-nav__link-text").nth(3);
  await activity.click({ force: true }).catch(() => {});
  await page.waitForTimeout(6000);
  console.log(`activity url: ${page.url()}`);

  const cards = await page.locator('[id^="settings-card-"]').all();
  console.log(`question cards: ${cards.length}`);
  if (cards.length === 0) {
    console.log("No question cards on this activity.");
    process.exit(0);
  }

  const first = cards[0];
  const id = (await first.getAttribute("id")) || "";
  const settings = first.locator('button:has(svg[name="Settings24"])').first();
  await settings.dispatchEvent("click").catch(() => {});
  await page.locator("#question-include-in-content-mastery-checkbox").waitFor({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log(`\nopened ${id}`);

  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input"))
      .filter((element) => element.getClientRects().length > 0 && element.type !== "checkbox")
      .map((element) => `${element.getAttribute("placeholder") || "(none)"} = "${element.value || ""}"`)
  );
  console.log("subject / level / other inputs:");
  for (const row of inputs) console.log(`   ${row}`);

  const maps = (await page.getByRole("button", { name: /- \d+ selected$/ }).allTextContents().catch(() => []))
    .map((text) => text.replace(/\s+/g, " ").trim());
  console.log(`\ncontent maps on this question: ${maps.join(" | ") || "(none)"}`);

  console.log("\nNothing was changed or saved.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
