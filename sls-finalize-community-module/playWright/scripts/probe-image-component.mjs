// Diagnostic: finds the image component that serves as a module's cover picture and
// reports the controls its editor offers, including any Authoring Copilot image
// generator. Read-only: it opens menus and editors to read them, creates no
// component and saves nothing.
//
//   node scripts/probe-image-component.mjs <moduleId> [sectionId]
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

const namesOf = async (scope) =>
  scope.evaluate((element) =>
    [
      ...new Set(
        Array.from((element || document).querySelectorAll("button, [role='menuitem'], li"))
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => (node.innerText || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim())
          .filter((text) => text && text.length < 70)
      )
    ]
  );

try {
  const url = sectionId
    ? `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/section/${sectionId}`
    : `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/module-plan`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }

  // Step into the first section if we are still on the module plan.
  if (!/\/section\/\d+/.test(page.url())) {
    const heading = page.locator("button.bx--accordion__heading").first();
    if ((await heading.count()) > 0) {
      await heading.click().catch(() => {});
      await page.waitForURL(/\/section\/\d+/, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
  }
  console.log(`url: ${page.url()}`);

  // What component types can be added? Read the menu, then close it.
  const addNew = page.getByRole("button", { name: /^ADD NEW$/i }).first();
  if ((await addNew.count()) > 0) {
    await addNew.click().catch(() => {});
    await page.waitForTimeout(2000);
    const options = await page.evaluate(() =>
      [
        ...new Set(
          Array.from(document.querySelectorAll("li, button, div"))
            .filter((node) => node.getClientRects().length > 0 && node.children.length === 0)
            .map((node) => (node.innerText || "").replace(/\s+/g, " ").trim())
            .filter((text) => text && text.length < 40)
        )
      ]
    );
    console.log("\nADD NEW offers:");
    for (const option of options.slice(0, 40)) console.log(`   ${option}`);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(800);
  }

  // Existing images already in this section, and the component that owns them.
  const images = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img[src*="resource.learning.moe.edu.sg"], img[class*="thumb"]'))
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const owner = node.closest('[id^="component-"]');
        return {
          src: (node.getAttribute("src") || "").slice(0, 80),
          owner: owner ? owner.id : "(no component ancestor)"
        };
      })
  );
  console.log("\nimages served from SLS resources:");
  for (const image of images) console.log(`   ${image.owner}  ${image.src}`);

  // Anything mentioning image generation anywhere on the page.
  const generators = await page.evaluate(() =>
    [
      ...new Set(
        Array.from(document.querySelectorAll("button, div, span, li"))
          .filter((node) => node.getClientRects().length > 0 && node.children.length === 0)
          .map((node) => (node.innerText || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim())
          .filter((text) => /generate image|image \(beta\)|generate.*image|copilot/i.test(text) && text.length < 70)
      )
    ]
  );
  console.log(`\nimage-generation controls on the page: ${generators.join(" | ") || "(none visible yet)"}`);

  console.log("\nNothing was created or saved.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
