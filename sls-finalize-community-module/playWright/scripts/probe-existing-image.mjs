// Diagnostic: on a module that already has a cover picture, find the component that
// holds it and report the controls its editor offers. Read-only.
//
//   node scripts/probe-existing-image.mjs <moduleId> [sectionId]
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
        Array.from(document.querySelectorAll("button, [role='menuitem'], li"))
          .filter((node) => node.getClientRects().length > 0)
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
      await page.waitForTimeout(3500);
    }
  }
  console.log(`url: ${page.url()}`);

  // Walk every section until one holds a picture: the cover is rarely in the first
  // section, which is usually teacher notes.
  const readComponents = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[id^="component-"]')).map((element) => ({
        id: element.id,
        pictures: Array.from(element.querySelectorAll("img"))
          .filter((img) => !(img.getAttribute("src") || "").startsWith("data:"))
          .map((img) => (img.getAttribute("src") || "").slice(0, 70))
      }))
    );

  const headings = page.locator("button.bx--accordion__heading");
  const sectionCount = await headings.count();
  console.log(`sections in the sidebar: ${sectionCount}`);
  for (let index = 0; index < sectionCount; index += 1) {
    const found = (await readComponents()).some((component) => component.pictures.length > 0);
    if (found) break;
    if (index + 1 >= sectionCount) break;
    await headings.nth(index + 1).click().catch(() => {});
    await page.waitForTimeout(3500);
    console.log(`   moved to ${page.url().split("/section/")[1] ?? page.url()}`);
  }

  // Components on this page, and which of them contain a picture.
  const components = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[id^="component-"]')).map((element) => {
      const pictures = Array.from(element.querySelectorAll("img")).filter(
        (img) => !(img.getAttribute("src") || "").startsWith("data:")
      );
      return {
        id: element.id,
        pictures: pictures.map((img) => (img.getAttribute("src") || "").slice(0, 70)),
        text: (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60)
      };
    })
  );
  console.log(`\ncomponents: ${components.length}`);
  for (const component of components) {
    console.log(`   ${component.id}  pictures=${component.pictures.length}  "${component.text}"`);
    for (const picture of component.pictures) console.log(`        ${picture}`);
  }

  const withPicture = components.find((component) => component.pictures.length > 0);
  if (!withPicture) {
    console.log("\nNo component on this page holds a picture.");
  } else {
    console.log(`\nopening the editor for ${withPicture.id}...`);
    const owner = page.locator(`#${withPicture.id}`);
    const baseline = await controls();
    const edit = owner.locator('button:has(svg[name="Settings24"]), .edit-indicator, button').first();
    await edit.scrollIntoViewIfNeeded().catch(() => {});
    await edit.click().catch(async () => {
      await edit.dispatchEvent("click").catch(() => {});
    });
    await page.waitForTimeout(4000);
    const revealed = (await controls()).filter((name) => !baseline.includes(name));
    console.log("controls its editor offers:");
    for (const name of revealed.slice(0, 30)) console.log(`   ${name}`);
    if (revealed.length === 0) console.log("   (nothing new appeared)");
    console.log(
      `\ngeneration entries: ${revealed.filter((n) => /generate|copilot|beta|image|picture/i.test(n)).join(" | ") || "(none)"}`
    );
    await page.keyboard.press("Escape").catch(() => {});
  }

  console.log("\nNothing was created or saved.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
