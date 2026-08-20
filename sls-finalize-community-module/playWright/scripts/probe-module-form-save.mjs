// Diagnostic: opens the module details form via its hover pencil and reports every
// control in it, to find how the form is saved. Read-only: it opens the form and
// reads it; it changes no field and clicks no save.
//
//   node scripts/probe-module-form-save.mjs <moduleId>
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

try {
  await page.goto(`https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForTimeout(6000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }

  const pencil = page
    .locator('.edit-indicator, button:has(svg[name="Pencil24"]), svg[name="Pencil24"]')
    .first();
  await pencil.hover({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  await pencil.click({ timeout: 5_000 }).catch(async () => {
    await pencil.dispatchEvent("click").catch(() => {});
  });
  await page.waitForTimeout(3500);

  console.log(`ADD IMAGE present: ${await page.getByRole("button", { name: /ADD IMAGE/i }).count()}`);
  console.log(`"Click to upload" present: ${await page.getByText(/Click to upload/i).count()}`);

  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const icon = node.querySelector("svg[name]");
        return {
          text: (node.innerText || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 40),
          icon: icon ? icon.getAttribute("name") : "",
          cls: (node.className || "").toString().split(" ").slice(0, 2).join(" ").slice(0, 40)
        };
      })
  );
  console.log("\nvisible buttons (text | icon | class):");
  for (const button of buttons) console.log(`   "${button.text}" | ${button.icon} | ${button.cls}`);

  const icons = await page.evaluate(() =>
    [
      ...new Set(
        Array.from(document.querySelectorAll("svg[name]"))
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => node.getAttribute("name"))
      )
    ]
  );
  console.log(`\nvisible icons: ${icons.join(" | ")}`);
  console.log("\nNothing was changed or saved.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
