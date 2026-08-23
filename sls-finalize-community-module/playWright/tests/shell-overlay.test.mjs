import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { dismissVisibleShellOverlay } from "../src/sls-runner.mjs";

test("the open SLS navigation overlay is dismissed before a main-canvas click", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <header>
        <div class="ui-shell-overlay is-visible" onclick="this.classList.remove('is-visible')"></div>
      </header>
      <main><button id="section">Section B</button></main>
      <style>
        .ui-shell-overlay.is-visible { position: fixed; inset: 0; z-index: 10; }
      </style>
    `);

    assert.equal(await dismissVisibleShellOverlay(page), true);
    assert.equal(await page.locator(".ui-shell-overlay.is-visible").count(), 0);
    await page.locator("#section").click();
  } finally {
    await browser.close();
  }
});

test("an already-closed drawer requires no action", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<header><div class='ui-shell-overlay'></div></header>");
    assert.equal(await dismissVisibleShellOverlay(page), false);
  } finally {
    await browser.close();
  }
});
