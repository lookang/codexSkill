import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { hideCoveringOverlays } from "../src/sls-runner.mjs";

// Reproduces the geometry that broke the delete pass: an overflow menu opened low
// in the sidebar, with SLS's "Help us improve" launcher pinned to the bottom-left
// of the viewport, sitting directly over the menu's last item. The item is visible
// to a person and reported visible by Playwright, but a click lands on the widget,
// so the delete step failed three times and gave up.
const FIXTURE = `
<style>
  body { margin: 0; height: 1200px; font: 14px sans-serif; }
  .menu { position: absolute; left: 20px; top: 620px; width: 200px; background: #fff; }
  .item { display: block; width: 100%; height: 40px; }
  .widget { position: fixed; left: 0; bottom: 0; width: 260px; height: 56px; background: #1f4fd8; color: #fff; }
</style>
<div class="menu bx--overflow-menu-options--open">
  <button class="item" id="move">Move Down</button>
  <button class="item" id="del">Delete</button>
</div>
<div class="widget">Help us improve</div>
`;

const atCentre = (page, selector) =>
  page.$eval(selector, (element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return top ? `${top.tagName.toLowerCase()}.${top.className}`.trim() : "none";
  });

test("a floating widget covering Delete is moved aside, then restored", async (t) => {
  const browser = await chromium.launch({ channel: "chrome" });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(FIXTURE);

  // The widget really is on top of Delete, which is what defeated the click.
  assert.match(await atCentre(page, "#del"), /widget/, "fixture should start with Delete covered");

  const hidden = await page.$eval("#del", hideCoveringOverlays);
  assert.ok(hidden.length > 0, "expected the covering widget to be reported");
  assert.match(hidden.join(" "), /Help us improve/);

  assert.match(await atCentre(page, "#del"), /item/, "Delete should be reachable once the widget is hidden");

  // And the page is put back the way it was found.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll("[data-sls-hidden-overlay]")) {
      element.style.removeProperty("display");
      element.removeAttribute("data-sls-hidden-overlay");
    }
  });
  assert.match(await atCentre(page, "#del"), /widget/, "the widget should be visible again afterwards");
});

test("an unobstructed menu item is left completely alone", async (t) => {
  const browser = await chromium.launch({ channel: "chrome" });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(FIXTURE);

  // "Move Down" sits above the widget and was never the problem.
  assert.match(await atCentre(page, "#move"), /item/);
  const hidden = await page.$eval("#move", hideCoveringOverlays);
  assert.deepEqual(hidden, [], "nothing should be hidden for an already-clickable item");
  assert.equal(await page.locator("[data-sls-hidden-overlay]").count(), 0);
});

test("the open menu itself is never hidden", async (t) => {
  const browser = await chromium.launch({ channel: "chrome" });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // A transparent child of the menu covering the item must not cause the menu to
  // be hidden - that would remove the very thing being clicked.
  await page.setContent(`
    <div class="bx--overflow-menu-options--open" style="position:relative">
      <button id="del" style="width:200px;height:40px">Delete</button>
      <div style="position:absolute;inset:0"></div>
    </div>
  `);
  const hidden = await page.$eval("#del", hideCoveringOverlays);
  assert.deepEqual(hidden, []);
  assert.equal(await page.locator(".bx--overflow-menu-options--open:visible").count(), 1);
});
