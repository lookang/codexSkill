import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { dismissModuleUrlUpdatedModal } from "../src/page-break-runner.mjs";

test("the Module URL Updated notice is dismissed before the next Edit click", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <button id="edit">Edit</button>
      <div class="bx--modal is-visible content-modal message-modal" id="notice">
        <div role="dialog" aria-label="Information modal">
          <p>Module URL Updated</p>
          <button class="bx--modal-close" aria-label="Close"
            onclick="document.querySelector('#notice').classList.remove('is-visible')">Close</button>
          <div>This module's URL has been updated. Please use the new URL in your browser for future access.</div>
          <button>OK</button>
        </div>
      </div>
      <style>
        .bx--modal.is-visible { position: fixed; inset: 0; z-index: 10; }
        .bx--modal:not(.is-visible) { display: none; }
      </style>
    `);

    assert.equal(await dismissModuleUrlUpdatedModal(page), true);
    assert.equal(await page.locator("#notice").isVisible(), false);
    await page.locator("#edit").click();
  } finally {
    await browser.close();
  }
});

test("an unrelated message modal is never dismissed", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="bx--modal is-visible content-modal message-modal" id="warning">
        <div role="dialog">
          <p>Confirm changes</p>
          <div>This action may remove linked content.</div>
          <button class="bx--modal-close" aria-label="Close">Close</button>
        </div>
      </div>
    `);

    assert.equal(await dismissModuleUrlUpdatedModal(page), false);
    assert.equal(await page.locator("#warning").isVisible(), true);
  } finally {
    await browser.close();
  }
});
