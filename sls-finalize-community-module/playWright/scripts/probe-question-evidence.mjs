// Read-only diagnostic for the question evidence used by surgical tagging.
// It visits every numbered page, waits for the mounted question to hydrate,
// and prints the exact stems the tagger will receive. Nothing is saved.
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { readQuestionStems } from "../src/sls-runner.mjs";

const args = process.argv.slice(2);
const targetUrl = args.find((value) => !value.startsWith("--"));
const enableOcr = !args.includes("--no-ocr");
if (!targetUrl) {
  console.error("Usage: node scripts/probe-question-evidence.mjs <SLS activity URL> [--no-ocr]");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(".auth", "sls-state.json"),
  viewport: { width: 1600, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    throw new Error("SESSION_EXPIRED - run npm run sls:auth (npm.cmd on Windows) first.");
  }

  if (/\/admin\/community-gallery\/module\/view\//i.test(new URL(page.url()).pathname)) {
    const edit = page.getByRole("button", { name: /^Edit$/i }).or(page.getByRole("link", { name: /^Edit$/i })).first();
    await edit.click();
    await page.waitForURL(/\/admin\/community-gallery\/module\/edit\//i, { timeout: 15_000 });
  }

  await page
    .locator('[id^="settings-card-"] svg[name="Settings24"]')
    .first()
    .waitFor({ state: "attached", timeout: 15_000 })
    .catch(() => {});
  console.log(`URL: ${page.url()}`);
  console.log(`Title: ${await page.title()}`);

  const questionIds = await page
    .locator('[id^="settings-card-"]')
    .evaluateAll((elements) => elements
      .filter((element) =>
        element.querySelector('svg[name="Settings24"]') && /^Q\d+\b/i.test(element.innerText || ""))
      .map((element) => element.id.replace("settings-card-", "")));
  if (questionIds.length === 0) {
    const visibleText = String(await page.locator("body").innerText().catch(() => ""))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    throw new Error(`No question settings cards appeared. Visible page text: ${visibleText || "(none)"}`);
  }
  const stems = await readQuestionStems(page, questionIds, { enableOcr });

  console.log(`Question cards: ${questionIds.length}; readable stems: ${stems.size}.`);
  for (const questionId of questionIds) {
    const text = String(stems.get(questionId) ?? "").replace(/\s+/g, " ").trim();
    console.log(`${questionId}: ${text || "(unreadable)"}`);
  }
  console.log("Nothing was changed or saved.");
} catch (error) {
  console.error(`Question-evidence probe stopped: ${String(error.message ?? error).replace(/\s+/g, " ").trim()}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
