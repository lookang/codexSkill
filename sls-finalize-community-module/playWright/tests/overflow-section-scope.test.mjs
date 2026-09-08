import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { overflowMenuForTitle, sidebarActivityMatch } from "../src/sls-runner.mjs";

const fixture = `
  <div class="bx--accordion__item">
    <button class="bx--accordion__heading"><span class="title">Expansion</span></button>
    <div class="activity-row">
      <span class="ellipsis-text title" title="Success Criteria">Success Criteria</span>
      <button data-owner="expansion" class="bx--overflow-menu side-nav-toolbar"></button>
    </div>
  </div>
  <div class="bx--accordion__item">
    <button class="bx--accordion__heading"><span class="title">Factorisation</span></button>
    <div class="activity-row">
      <span class="ellipsis-text title" title="Success Criteria">Success Criteria</span>
      <button data-owner="factorisation" class="bx--overflow-menu side-nav-toolbar"></button>
    </div>
  </div>`;

test("a repeated activity title resolves to the overflow menu in the requested section", async (t) => {
  const browser = await chromium.launch({ channel: "chrome" });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(fixture);

  const expansion = await overflowMenuForTitle(page, "Success Criteria", "Expansion");
  const factorisation = await overflowMenuForTitle(page, "Success Criteria", "Factorisation");
  assert.equal(await expansion.getAttribute("data-owner"), "expansion");
  assert.equal(await factorisation.getAttribute("data-owner"), "factorisation");
});

test("the same repeated title remains guarded without a section", async (t) => {
  const browser = await chromium.launch({ channel: "chrome" });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(fixture);

  await assert.rejects(
    () => overflowMenuForTitle(page, "Success Criteria"),
    /Expected one overflow menu.*found 2/,
  );
});

test("sidebar activity matching ignores appended Active Learning Process affordances", async (t) => {
  const browser = await chromium.launch({ channel: "chrome" });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <a class="bx--side-nav__link-text">
      <span class="ellipsis-text title" title="Skydiving Experience">Skydiving Experience</span>
      <span class="alp-phase">ACTIVATE LEARNING</span>
    </a>
  `);

  const match = await sidebarActivityMatch(page, "Skydiving Experience");
  assert.equal(match.count, 1);
});
