// Diagnostic: what Subject / Level / Content Map a section is actually tagged with.
//   node scripts/probe-section-subject.mjs <moduleId> <sectionId>
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
  if (/\/login/i.test(new URL(page.url()).pathname)) { console.log("SESSION_EXPIRED"); process.exit(2); }

  // A tagged section renders a read-only card whose hover pencil opens the editor;
  // an untagged one exposes the Section Tags button directly. Handle both.
  const tags = page.getByRole("button", { name: "Section Tags", exact: true });
  if ((await tags.count()) > 0) {
    await tags.first().click().catch(() => {});
    await page.waitForTimeout(2500);
  } else {
    const pencil = page.locator(".edit-indicator").first();
    if ((await pencil.count()) > 0) {
      await pencil.scrollIntoViewIfNeeded().catch(() => {});
      await pencil.click().catch(async () => { await pencil.dispatchEvent("click").catch(() => {}); });
      await page.waitForTimeout(2000);
      const again = page.getByRole("button", { name: "Section Tags", exact: true });
      if ((await again.count()) > 0) { await again.first().click().catch(() => {}); await page.waitForTimeout(2500); }
    }
  }
  const buttons = await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll("button"))
    .filter((n) => n.getClientRects().length > 0)
    .map((n) => (n.innerText || n.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim())
    .filter((t) => t && t.length < 50))]);
  console.log("visible buttons:", buttons.slice(0, 18).join(" | "));

  const values = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input"))
      .filter((element) => element.getClientRects().length > 0 && element.type !== "checkbox")
      .map((element) => `${element.getAttribute("placeholder") || "(no placeholder)"} = "${element.value || ""}"`)
  );
  console.log("section tagging inputs:");
  for (const value of values) console.log(`   ${value}`);

  const maps = await page.getByRole("button", { name: /- \d+ selected$/ }).allTextContents().catch(() => []);
  console.log("\ncontent maps on the section:");
  for (const map of maps) console.log(`   ${map.replace(/\s+/g, " ").trim()}`);
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
