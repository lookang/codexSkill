// Diagnostic: opens the section's Authoring Copilot control and reports what it
// offers, looking for an image generator. Read-only: it opens menus to read them
// and presses Escape. It never clicks ADD IMAGE, which would insert a component.
//
//   node scripts/probe-acp-image.mjs <moduleId> [sectionId]
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

const controls = async () =>
  page.evaluate(() =>
    [
      ...new Set(
        Array.from(document.querySelectorAll("button, [role='menuitem'], li, span, div"))
          .filter((node) => node.getClientRects().length > 0 && node.children.length === 0)
          .map((node) => (node.innerText || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim())
          .filter((text) => text && text.length < 60)
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

  if (!/\/section\/\d+/.test(page.url())) {
    const heading = page.locator("button.bx--accordion__heading").first();
    if ((await heading.count()) > 0) {
      await heading.click().catch(() => {});
      await page.waitForURL(/\/section\/\d+/, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
  }
  console.log(`url: ${page.url()}`);

  // ADD IMAGE only appears once the section editor is open, which is where the
  // earlier probe saw it.
  const tags = page.getByRole("button", { name: "Section Tags", exact: true });
  if ((await tags.count()) === 0) {
    const pencil = page.locator(".edit-indicator").first();
    if ((await pencil.count()) > 0) {
      await pencil.scrollIntoViewIfNeeded().catch(() => {});
      await pencil.click().catch(async () => {
        await pencil.dispatchEvent("click").catch(() => {});
      });
      await page.waitForTimeout(2500);
    }
  }

  const before = await controls();
  console.log(`\nADD IMAGE present: ${before.includes("ADD IMAGE")}`);
  console.log(`Authoring Copilot present: ${before.some((name) => /authoring copilot/i.test(name))}`);

  // Open Authoring Copilot and read the menu. This only opens a menu.
  const acp = page.getByRole("button", { name: /authoring copilot/i }).first();
  if ((await acp.count()) === 0) {
    console.log("\nNo Authoring Copilot button on this page.");
  } else {
    await acp.click().catch(() => {});
    await page.waitForTimeout(2500);
    const after = await controls();
    const added = after.filter((name) => !before.includes(name));
    console.log("\nwhat Authoring Copilot revealed:");
    for (const name of added.slice(0, 30)) console.log(`   ${name}`);
    if (added.length === 0) console.log("   (nothing new appeared)");

    const image = added.filter((name) => /image|picture|visual|graphic/i.test(name));
    console.log(`\nimage entries: ${image.join(" | ") || "(none)"}`);
    await page.keyboard.press("Escape").catch(() => {});
  }

  // "Authoring Copilot" is the accessible name of a tooltip nested inside the real
  // button, which is why clicking by name did nothing. Target the outer button.
  const copilot = page.locator("button.btn-copilot-details");
  console.log(`\nbutton.btn-copilot-details on this page: ${await copilot.count()}`);
  if ((await copilot.count()) > 0) {
    const baseline = await controls();
    await copilot.first().scrollIntoViewIfNeeded().catch(() => {});
    await copilot.first().click().catch(async () => {
      await copilot.first().dispatchEvent("click").catch(() => {});
    });
    await page.waitForTimeout(3500);
    const revealed = (await controls()).filter((name) => !baseline.includes(name));
    console.log("what the Copilot button revealed:");
    for (const name of revealed.slice(0, 30)) console.log(`   ${name}`);
    if (revealed.length === 0) console.log("   (nothing new appeared)");
    console.log(
      `\nimage entries: ${revealed.filter((n) => /image|picture|visual|graphic/i.test(n)).join(" | ") || "(none)"}`
    );
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(600);
  }

  // ADD IMAGE: open it to see whether it offers an Authoring Copilot generator.
  const addImage = page.getByRole("button", { name: /^ADD IMAGE$/i }).first();
  if ((await addImage.count()) > 0) {
    console.log("\nopening ADD IMAGE...");
    const baseline = await controls();
    await addImage.click().catch(() => {});
    await page.waitForTimeout(3500);
    const revealed = (await controls()).filter((name) => !baseline.includes(name));
    console.log("what ADD IMAGE revealed:");
    for (const name of revealed.slice(0, 30)) console.log(`   ${name}`);
    if (revealed.length === 0) console.log("   (nothing new appeared)");
    const generation = revealed.filter((name) => /generate|copilot|beta|ai\b/i.test(name));
    console.log(`\ngeneration entries: ${generation.join(" | ") || "(none)"}`);
    await page.keyboard.press("Escape").catch(() => {});
  } else {
    console.log("\nNo ADD IMAGE button found even with the section editor open.");
  }

  console.log("\nNothing was created or saved.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
