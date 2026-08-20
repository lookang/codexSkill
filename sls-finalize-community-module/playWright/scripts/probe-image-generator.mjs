// Diagnostic: drives Featured Image > ADD IMAGE > Generate Image (Beta) as far as a
// generated result, then reports exactly what the generator offers so the result can
// be applied correctly. It stops before applying anything and saves nothing.
//
//   node scripts/probe-image-generator.mjs <moduleId> "<prompt>"
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [moduleId, prompt = "A simple classroom illustration of fractions of a set. No text."] =
  process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(process.cwd(), ".auth", "sls-state.json"),
  viewport: { width: 1600, height: 1100 }
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

const dump = async (label) => {
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const icon = node.querySelector("svg[name]");
        return {
          text: (node.innerText || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 40),
          icon: icon ? icon.getAttribute("name") : "",
          cls: (node.className || "").toString().split(" ").slice(0, 2).join(" ").slice(0, 38)
        };
      })
  );
  console.log(`\n[${label}] visible buttons:`);
  for (const row of rows) console.log(`   "${row.text}" | ${row.icon} | ${row.cls}`);
  const images = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img"))
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => (node.getAttribute("src") || "").slice(0, 60))
  );
  console.log(`[${label}] visible images: ${images.length}`);
  for (const src of images.slice(0, 8)) console.log(`      ${src}`);
};

try {
  await page.goto(`https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForTimeout(6000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }

  const pencil = page.locator('.edit-indicator, button:has(svg[name="Pencil24"]), svg[name="Pencil24"]').first();
  await pencil.hover({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  await pencil.click({ timeout: 5_000 }).catch(async () => {
    await pencil.dispatchEvent("click").catch(() => {});
  });
  await page.waitForTimeout(3000);

  await page.getByRole("button", { name: /^ADD IMAGE$/i }).first().click();
  await page.waitForTimeout(1500);
  await page.getByText(/generate image/i).filter({ hasNot: page.locator("button") }).last().click();
  await page.waitForTimeout(3500);
  await dump("generator opened");

  const box = page
    .locator(".bx--modal-container:visible")
    .last()
    .locator(".mce-content-body[contenteditable='true'], textarea, input[type='text']")
    .last();
  if (await box.isVisible().catch(() => false)) {
    await box.fill(prompt).catch(() => {});
    console.log(`\nprompt filled: ${prompt.slice(0, 60)}`);
  }

  const create = page
    .locator(".bx--modal-container:visible")
    .last()
    .getByRole("button", { name: /^(create|generate)$/i })
    .first();
  if (await create.isVisible().catch(() => false)) {
    console.log("clicking Create...");
    await create.click();
  } else {
    console.log("no Create button found");
  }

  // Wait for something to appear that was not there before.
  await page.waitForTimeout(45_000);
  await dump("after generating");

  console.log("\nStopped before applying. Nothing was saved.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
