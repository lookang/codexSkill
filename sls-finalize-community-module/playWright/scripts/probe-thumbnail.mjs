// Diagnostic: finds where a module's cover image / thumbnail is set, and what the
// generator offers. Read-only: it opens menus and panels to read them, and never
// generates or saves anything.
//
//   node scripts/probe-thumbnail.mjs <moduleId>
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [moduleId] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(process.cwd(), ".auth", "sls-state.json"),
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

const visibleButtons = async () =>
  page.evaluate(() =>
    [
      ...new Set(
        Array.from(document.querySelectorAll("button, a[role='menuitem'], li[role='menuitem']"))
          .filter((element) => element.getClientRects().length > 0)
          .map((element) =>
            (element.innerText || element.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()
          )
          .filter((text) => text && text.length < 60)
      )
    ]
  );

try {
  await page.goto(
    `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/module-plan`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForTimeout(7000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }

  console.log("buttons on the module plan:");
  for (const name of await visibleButtons()) console.log(`   ${name}`);

  const more = page.getByRole("button", { name: "More Actions", exact: true }).first();
  if ((await more.count()) > 0) {
    await more.click().catch(() => {});
    await page.waitForTimeout(1500);
    console.log("\nMore Actions menu:");
    for (const name of await visibleButtons()) console.log(`   ${name}`);

    // The menu entries are plain text nodes, not buttons, so read them from the
    // menu itself rather than from the button list.
    const entries = await page.evaluate(() =>
      Array.from(document.querySelectorAll("li, div, span"))
        .filter((element) => element.getClientRects().length > 0 && element.children.length === 0)
        .map((element) => (element.innerText || "").replace(/\s+/g, " ").trim())
        .filter((text) => /appearance|image|thumbnail|cover|picture|banner/i.test(text) && text.length < 60)
    );
    const interesting = [...new Set(entries)];
    console.log(`\nimage-related entries: ${interesting.join(" | ") || "(none)"}`);

    for (const label of interesting) {
      const entry = page.getByText(label, { exact: true }).first();
      if ((await entry.count()) === 0) continue;
      console.log(`\nopening "${label}"...`);
      await entry.click().catch(() => {});
      await page.waitForTimeout(4000);
      console.log(`   url: ${page.url()}`);
      const inside = await visibleButtons();
      console.log("   controls inside:");
      for (const name of inside.slice(0, 30)) console.log(`      ${name}`);
      const text = await page
        .evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 600))
        .catch(() => "");
      console.log(`   text: ${text.slice(0, 400)}`);
      break;
    }
  } else {
    console.log("\nNo More Actions button found on the module plan.");
  }

  console.log("\nNothing was generated or saved.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
