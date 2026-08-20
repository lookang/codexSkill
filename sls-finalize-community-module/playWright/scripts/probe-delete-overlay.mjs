// Diagnostic: opens an activity's overflow menu and reports whether "Delete" is
// actually clickable, before and after the overlay fix.
//
// It never clicks Delete. Run it to confirm the floating "Help us improve" widget
// is no longer covering the menu item.
//
//   node scripts/probe-delete-overlay.mjs <moduleId> <sectionId>
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { hideCoveringOverlays } from "../src/sls-runner.mjs";

const [moduleId, sectionId] = process.argv.slice(2);
if (!moduleId || !sectionId) {
  console.error("Usage: node scripts/probe-delete-overlay.mjs <moduleId> <sectionId>");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(process.cwd(), ".auth", "sls-state.json"),
  viewport: { width: 1280, height: 800 }
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

const describePoint = (item) =>
  item.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (!top) return "nothing at that point (off screen)";
    if (top === element || element.contains(top) || top.contains(element)) return "CLICKABLE (the item itself)";
    const label = (top.innerText || top.className || "").toString().replace(/\s+/g, " ").trim();
    return `BLOCKED by <${top.tagName.toLowerCase()}> "${label.slice(0, 45)}"`;
  });

try {
  await page.goto(
    `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/section/${sectionId}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForTimeout(6000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }

  const menus = page.locator(".bx--overflow-menu.side-nav-toolbar");
  const count = await menus.count();
  console.log(`overflow menus in the sidebar: ${count}`);
  if (count === 0) throw new Error("no activity overflow menus found");

  // The lowest activity reproduces the problem best: its menu opens near the foot
  // of the viewport, which is where the floating widget sits.
  const wanted = Number(process.argv[4] ?? count - 1);
  const menu = menus.nth(Math.min(Math.max(wanted, 0), count - 1));
  console.log(`using menu index ${Math.min(Math.max(wanted, 0), count - 1)} of ${count - 1}`);
  await menu.evaluate((element) => element.scrollIntoView({ block: "center" })).catch(() => {});
  await page.waitForTimeout(400);
  await menu.click();

  const open = page.locator(".bx--overflow-menu-options--open");
  await open.waitFor({ state: "visible", timeout: 8000 });
  const item = open.getByRole("button", { name: "Delete", exact: true });
  await item.waitFor({ state: "visible", timeout: 8000 });

  const geometry = () =>
    item.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        height: Math.round(box.height),
        viewport: window.innerHeight,
        belowFold: box.bottom > window.innerHeight,
        aboveFold: box.top < 0
      };
    });

  console.log(`\nviewport height: ${(await geometry()).viewport}`);
  console.log(`Delete box     : ${JSON.stringify(await geometry())}`);
  console.log(`BEFORE         : ${await describePoint(item)}`);

  await item.scrollIntoViewIfNeeded().catch(() => {});
  // A Carbon overflow menu can close on scroll. If that is what is happening, the
  // click times out because the item is gone, and no overlay is ever involved.
  const stillOpen = await open.isVisible().catch(() => false);
  console.log(`menu still open after scrolling the item: ${stillOpen}`);
  console.log(`Delete box     : ${JSON.stringify(await geometry().catch(() => "gone"))}`);

  const hidden = await item.evaluate(hideCoveringOverlays).catch((error) => [`<failed: ${error.message.split("\n")[0]}>`]);
  console.log(`moved aside    : ${hidden.length ? hidden.join(" | ") : "(nothing needed)"}`);
  console.log(`AFTER          : ${await describePoint(item).catch(() => "gone")}`);

  // What would a real click hit? Reported, never performed.
  const verdict = await item
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (!top) return "click would MISS - centre point is outside the viewport";
      if (top === element || element.contains(top)) return "click would LAND on Delete";
      return `click would hit <${top.tagName.toLowerCase()}> instead`;
    })
    .catch((error) => `could not evaluate: ${error.message.split("\n")[0]}`);
  console.log(`verdict        : ${verdict}`);

  await page.keyboard.press("Escape");
  console.log("\nMenu closed. Nothing was deleted.");
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
