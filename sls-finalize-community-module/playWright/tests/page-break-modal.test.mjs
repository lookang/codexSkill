import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import {
  dismissModuleUrlUpdatedModal,
  waitForScopedPageBreakSingle,
} from "../src/page-break-runner.mjs";

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

test("a delayed nearby Page Break menu is preferred over a distant mounted menu", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
    await page.setContent(`
      <style>
        body { height: 2600px; margin: 0; }
        .add-component-bar { position: absolute; width: 600px; }
        #distant { top: 2100px; }
        #nearby { top: 980px; }
        .menu, .submenu { list-style: none; margin: 0; padding: 0; }
        .submenu { display: none; position: absolute; left: 80px; top: 0; }
        li { position: relative; width: 120px; min-height: 32px; }
        li:hover > .submenu { display: block; }
        .item-wrapper { display: block; height: 32px; }
      </style>
      <div id="distant" class="add-component-bar">
        <div class="multi-layer-menu"><ul class="menu">
          <li class="display"><span class="item-wrapper">Display</span>
            <ul class="submenu"><li><span>Page Break</span>
              <ul class="submenu"><li><span>Single</span></li></ul>
            </li></ul>
          </li>
        </ul></div>
      </div>
      <script>
        setTimeout(() => {
          const nearby = document.createElement('div');
          nearby.id = 'nearby';
          nearby.className = 'add-component-bar';
          nearby.innerHTML = '<div class="multi-layer-menu"><ul class="menu">' +
            '<li class="display"><span class="item-wrapper">Display</span>' +
            '<ul class="submenu"><li><span>Page Break</span>' +
            '<ul class="submenu"><li><span>Single</span></li></ul>' +
            '</li></ul></li></ul></div>';
          document.body.appendChild(nearby);
        }, 650);
      </script>
    `);

    const single = await waitForScopedPageBreakSingle(page, 1000, {
      timeoutMs: 3_000,
      maximumDistance: 200,
    });

    assert.equal(await single.isVisible(), true);
    assert.equal(await single.evaluate((node) => node.closest(".add-component-bar")?.id), "nearby");
  } finally {
    await browser.close();
  }
});

test("a fixed overlay cannot block opening the scoped Page Break submenu", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    await page.setContent(`
      <style>
        body { margin: 0; }
        .add-component-bar { position: absolute; left: 40px; top: 100px; }
        .menu, .submenu { list-style: none; margin: 0; padding: 0; }
        .submenu { display: none; position: absolute; left: 140px; top: 0; }
        li { position: relative; width: 120px; min-height: 32px; }
        li.display:hover > .submenu, li.open > .submenu { display: block; }
        .item-wrapper { display: block; height: 32px; }
        #page-nav-overlay {
          position: fixed;
          left: 170px;
          top: 90px;
          width: 160px;
          height: 70px;
          z-index: 10;
        }
      </style>
      <div class="add-component-bar">
        <div class="multi-layer-menu"><ul class="menu">
          <li class="display"><span class="item-wrapper">Display</span>
            <ul class="submenu"><li onclick="this.classList.add('open')"><span>Page Break</span>
              <ul class="submenu"><li><span>Single</span></li></ul>
            </li></ul>
          </li>
        </ul></div>
      </div>
      <div id="page-nav-overlay"></div>
    `);

    const single = await waitForScopedPageBreakSingle(page, 116, {
      timeoutMs: 1_000,
      maximumDistance: 100,
    });

    assert.equal(await single.isVisible(), true);
    assert.equal(await single.evaluate((node) => node.textContent), "Single");
  } finally {
    await browser.close();
  }
});
