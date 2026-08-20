// Read-only DOM probe. Drives the saved SLS session to a given section's tagging
// editor and dumps what is actually on screen, so selectors can be written from
// evidence instead of guesswork. Never saves anything.
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [moduleId, sectionTitle] = process.argv.slice(2);
if (!moduleId || !sectionTitle) {
  console.error('Usage: node scripts/probe.mjs <moduleId> "<section title>"');
  process.exit(1);
}
const authStatePath = path.resolve(process.cwd(), ".auth", "sls-state.json");
const base = "https://vle.learning.moe.edu.sg/admin/community-gallery/module";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ storageState: authStatePath, viewport: { width: 1500, height: 1100 } });
const page = await context.newPage();
page.setDefaultTimeout(20_000);

const out = (label, value) => console.log(`\n=== ${label} ===\n${value}`);

try {
  await page.goto(`${base}/edit/${moduleId}/module-plan`, { waitUntil: "domcontentloaded" });
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.error("Saved SLS session has expired. Run: npm run sls:auth");
    process.exit(2);
  }

  const heading = page.locator("button.bx--accordion__heading").filter({ hasText: sectionTitle });
  await heading.first().click();
  await page.waitForURL(/\/section\/\d+/);
  const sectionId = page.url().match(/\/section\/(\d+)/)?.[1];
  out("section", `${sectionTitle} -> id ${sectionId}\n${page.url()}`);

  await page.locator(`#component-${sectionId}`).click();
  await page.waitForTimeout(800);

  const describe = async (stage) => {
    const buttons = await page.getByRole("button").all();
    const names = [];
    for (const b of buttons) {
      if (!(await b.isVisible().catch(() => false))) continue;
      const name = (await b.getAttribute("aria-label")) || (await b.innerText().catch(() => "")) || "";
      const clean = name.replace(/\s+/g, " ").trim();
      if (clean) names.push(clean.slice(0, 70));
    }
    out(`${stage}: visible buttons`, [...new Set(names)].map((n) => `  - ${n}`).join("\n") || "  (none)");
    out(`${stage}: tree-list rows`, String(await page.locator("ul.tree-list li.tree-row").count()));
  };

  await describe("after clicking the section component");

  const sectionTags = page.getByRole("button", { name: "Section Tags", exact: true });
  if ((await sectionTags.count()) === 0) {
    const pencil = page.locator(`#component-${sectionId} .edit-indicator`).first();
    if (await pencil.count()) {
      await pencil.click().catch(async () => pencil.dispatchEvent("click"));
      await page.waitForTimeout(800);
    }
  }
  if (await sectionTags.count()) {
    await sectionTags.first().click();
    await page.waitForTimeout(800);
  }
  await describe("after opening Section Tags");

  out("panel text", (await page.locator("main").innerText().catch(() => "")).slice(0, 2500));
} catch (error) {
  console.error(`probe stopped: ${error.message}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
