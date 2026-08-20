// Diagnostic: on the module settings page, find what opens the Featured Image form.
// Read-only.
//
//   node scripts/probe-featured-image.mjs <moduleId>
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [moduleId] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(process.cwd(), ".auth", "sls-state.json"),
  viewport: { width: 1600, height: 1100 }
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

const named = async () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("button, [role='button'], a"))
      .map((node) => ({
        name: (node.innerText || node.getAttribute("aria-label") || node.getAttribute("title") || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 46),
        cls: (node.className || "").toString().split(" ").slice(0, 3).join(" ").slice(0, 50),
        visible: node.getClientRects().length > 0
      }))
      .filter((row) => row.name || /settings|gear|cog|edit/i.test(row.cls))
  );

try {
  await page.goto(`https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForTimeout(6000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }
  console.log(`url: ${page.url()}`);

  const hasFeatured = await page.getByText(/Featured Image/i).count();
  console.log(`"Featured Image" text on the page: ${hasFeatured}`);
  console.log(`ADD IMAGE by role: ${await page.getByRole("button", { name: /ADD IMAGE/i }).count()}`);

  console.log("\nbuttons (v = visible):");
  for (const row of (await named()).slice(0, 40)) {
    console.log(`   ${row.visible ? "v" : " "}  "${row.name}"  [${row.cls}]`);
  }

  // Icon-only settings controls, which is what the gear is.
  const icons = await page.evaluate(() =>
    Array.from(document.querySelectorAll("svg[name]"))
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => node.getAttribute("name"))
  );
  console.log(`\nvisible icons: ${[...new Set(icons)].join(" | ")}`);

  // Try each gear/settings icon in turn and see which reveals the Featured Image.
  for (const icon of ["GearExpand32", "Settings24"]) {
    // The gear is not always wrapped in a button, so fall back to the icon itself.
    let button = page.locator(`button:has(svg[name="${icon}"])`).first();
    if ((await button.count()) === 0) button = page.locator(`svg[name="${icon}"]`).first();
    if ((await button.count()) === 0) continue;
    console.log(`\nclicking the ${icon} control...`);
    await button.click().catch(async () => {
      await button.dispatchEvent("click").catch(() => {});
    });
    await page.waitForTimeout(4000);
    const featured = await page.getByText(/Featured Image/i).count();
    const addImage = await page.getByRole("button", { name: /ADD IMAGE/i }).count();
    console.log(`   "Featured Image": ${featured}   ADD IMAGE: ${addImage}   url: ${page.url()}`);
    if (addImage > 0) {
      console.log("   -> this is the control that opens the Featured Image form.");
      const add = page.getByRole("button", { name: /ADD IMAGE/i }).first();
      const baseline = await page.evaluate(() =>
        Array.from(document.querySelectorAll("li, button"))
          .filter((n) => n.getClientRects().length > 0)
          .map((n) => (n.innerText || "").replace(/\s+/g, " ").trim())
      );
      await add.click().catch(() => {});
      await page.waitForTimeout(2000);
      const menu = (
        await page.evaluate(() =>
          Array.from(document.querySelectorAll("li, button, div"))
            .filter((n) => n.getClientRects().length > 0 && n.children.length === 0)
            .map((n) => (n.innerText || "").replace(/\s+/g, " ").trim())
        )
      ).filter((name) => name && !baseline.includes(name) && name.length < 40);
      console.log(`   ADD IMAGE menu: ${[...new Set(menu)].slice(0, 12).join(" | ")}`);
      await page.keyboard.press("Escape").catch(() => {});
      break;
    }
  }

  // The screenshot shows a right-hand card labelled "Module"; selecting it is what
  // shows the Module Title / Featured Image form.
  if ((await page.getByRole("button", { name: /ADD IMAGE/i }).count()) === 0) {
    for (const label of ["Module", "Module Details", "Module Settings"]) {
      const card = page.getByText(label, { exact: true }).last();
      if ((await card.count()) === 0) continue;
      console.log(`clicking the "${label}" card...`);
      await card.click().catch(async () => {
        await card.dispatchEvent("click").catch(() => {});
      });
      await page.waitForTimeout(4000);
      const featured = await page.getByText(/Featured Image/i).count();
      const addImage = await page.getByRole("button", { name: /ADD IMAGE/i }).count();
      console.log(`   "Featured Image": ${featured}   ADD IMAGE: ${addImage}`);
      if (addImage > 0) {
        console.log(`   -> "${label}" opens the Featured Image form.`);
        break;
      }
    }
  }

  console.log("\nNothing was changed or saved.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
