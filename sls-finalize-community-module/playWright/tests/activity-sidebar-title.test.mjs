import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { inventoryActivities, readActivityTitle } from "../src/page-break-runner.mjs";

test("activity inventory excludes ALP badges across hidden and revealed sidebar states", async (t) => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`<ul><li class="cv-accordion-item">
    <button class="bx--accordion__heading">Fractions</button>
    <div class="bx--accordion__content" style="display:none">
      <div class="bx--side-nav__item"><span class="bx--side-nav__link-text"><span class="title">Operations on Proper Fractions_Practice 1</span><span class="phase">Facilitate Demonstration of Learning</span></span></div>
    </div></li></ul>`);
  const section = { index: 0 };
  const before = await inventoryActivities(page, section);
  assert.equal(before[0].title, "Operations on Proper Fractions_Practice 1");
  await page.locator(".bx--accordion__content").evaluate(el => { el.style.display = "block"; });
  await page.locator(".phase").evaluate(el => { el.textContent = " FACILITATE DEMONSTRATION OF LEARNING"; });
  assert.deepEqual(await inventoryActivities(page, section), before);
  await page.locator(".title").evaluate(el => { el.textContent = "Operations on Proper Fractions_Practice 2"; });
  assert.notEqual((await inventoryActivities(page, section))[0].title, before[0].title);
  await page.setContent('<div id="plain">Plain activity title</div>');
  assert.equal(await readActivityTitle(page.locator("#plain")), "Plain activity title");
});
