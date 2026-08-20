// Diagnostic: opens one question's settings and reports exactly what the tagging
// panel contains - every combobox, its current value, and the options each one
// offers. Read-only: it opens dropdowns to read them, then presses Escape and
// never saves.
//
//   node scripts/probe-question-tagging.mjs <moduleId> <sectionId> <activityId> <questionId>
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [moduleId, sectionId, activityId, questionId] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(process.cwd(), ".auth", "sls-state.json"),
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

const flat = (value) => (value || "").replace(/\s+/g, " ").trim();

try {
  await page.goto(
    `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/section/${sectionId}/activity/${activityId}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForTimeout(8000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }

  const card = page.locator(`#settings-card-${questionId}`);
  await card.waitFor({ state: "visible", timeout: 20_000 });
  const settings = card.locator('button:has(svg[name="Settings24"])').first();
  await settings.dispatchEvent("click");
  await page.locator("#question-include-in-content-mastery-checkbox").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  console.log(`question ${questionId} settings opened\n`);

  // Every text input in the panel, with its placeholder and current value.
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input"))
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({
        placeholder: element.getAttribute("placeholder") || "",
        value: element.value || "",
        id: element.id || "",
        type: element.type
      }))
      .filter((row) => row.type !== "checkbox")
  );
  console.log("visible inputs:");
  for (const input of inputs) console.log(`   placeholder="${input.placeholder}"  value="${input.value}"`);

  const buttons = await page.evaluate(() =>
    [
      ...new Set(
        Array.from(document.querySelectorAll("button"))
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => (element.innerText || element.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim())
          .filter((text) => text && text.length < 60)
      )
    ].slice(0, 30)
  );
  console.log("\nvisible buttons:");
  for (const button of buttons) console.log(`   ${button}`);

  // Open each combobox in turn and read only the options it actually shows.
  for (const placeholder of ["Select Subject", "Select Level", "Select Content Map"]) {
    const combo = page.getByPlaceholder(placeholder, { exact: true }).last();
    if ((await combo.count()) === 0) {
      console.log(`\n[${placeholder}] not present`);
      continue;
    }
    await combo.click().catch(() => {});
    await page.waitForTimeout(1200);
    const options = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="option"]'))
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => (element.innerText || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    );
    console.log(`\n[${placeholder}] value="${flat(await combo.inputValue().catch(() => ""))}" offers ${options.length}:`);
    for (const option of options.slice(0, 25)) console.log(`   ${option}`);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);
  }

  console.log("\nNothing was changed or saved.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
