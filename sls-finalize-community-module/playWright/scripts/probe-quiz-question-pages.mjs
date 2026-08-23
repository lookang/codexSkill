// Read-only diagnostic for quiz-page question discovery. It inventories every
// visible quiz navigator page and reports which question settings cards and
// question bodies SLS exposes on that page. Nothing is saved.
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [targetUrl] = process.argv.slice(2);
if (!targetUrl) {
  console.error("Usage: node scripts/probe-quiz-question-pages.mjs <SLS activity URL>");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(".auth", "sls-state.json"),
  viewport: { width: 1600, height: 1000 }
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);

const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function snapshot(label) {
  const result = await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const cards = Array.from(document.querySelectorAll('[id^="settings-card-"]')).map((element) => ({
      id: element.id,
      text: (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 260),
      visible: visible(element),
      settings: element.querySelectorAll('svg[name="Settings24"]').length
    }));
    const components = Array.from(document.querySelectorAll('[id^="component-"]')).map((element) => ({
      id: element.id,
      text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 260),
      visible: visible(element),
      questionBodies: element.querySelectorAll(".question-body").length
    })).filter((entry) => entry.questionBodies > 0 || /^component-/.test(entry.id));
    const numericControls = Array.from(document.querySelectorAll("button, a, [role='button']"))
      .filter(visible)
      .map((element) => ({
        text: (element.innerText || "").replace(/\s+/g, " ").trim(),
        aria: element.getAttribute("aria-label"),
        current: element.getAttribute("aria-current"),
        className: typeof element.className === "string" ? element.className : ""
      }))
      .filter((entry) => /^\d+$/.test(entry.text) || /quiz|page|navigator/i.test(`${entry.text} ${entry.aria || ""} ${entry.className}`));
    return { cards, components, numericControls };
  });
  return { label, url: page.url(), ...result };
}

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4_000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    throw new Error("SESSION_EXPIRED - run npm run sls:auth (npm.cmd on Windows) first.");
  }

  const pages = page.locator(".quiz-navigator-button.page-button");
  const pageCount = await pages.count();
  const report = [await snapshot("initial")];
  for (let index = 0; index < pageCount; index += 1) {
    await pages.nth(index).click().catch(() => {});
    await page.waitForTimeout(1_500);
    report.push(await snapshot(`navigator-${index + 1}`));
  }

  console.log(JSON.stringify({ pageCount, report }, null, 2));
  console.log("Nothing was changed or saved.");
} catch (error) {
  console.error(`Quiz probe stopped: ${normalize(error.message).slice(0, 500)}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
