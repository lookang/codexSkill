import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { openContentMapTree, readMapTree, readTaxonomyRows } from "../src/sls-runner.mjs";

test("a checked child outcome does not make its parent or sibling selected", async (t) => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <ul class="tree-list">
      <li class="tree-row">
        <div class="tree-row-item">
          <div class="tree-row-item-icon-wrapper"><svg name="ArrowUp24"></svg></div>
          <div class="node-container"><div class="rich-text">Coordinate Geometry</div></div>
          <ul class="tree-list">
            <li class="tree-row">
              <div class="tree-row-item">
                <div class="tree-row-item-icon-wrapper"></div>
                <div class="node-container learning-outcome-node-container">
                  <div class="input-checkbox"><input type="checkbox"></div>
                  <div class="rich-text">Area of rectilinear figure</div>
                </div>
              </div>
            </li>
            <li class="tree-row">
              <div class="tree-row-item">
                <div class="tree-row-item-icon-wrapper"></div>
                <div class="node-container learning-outcome-node-container">
                  <div class="input-checkbox selected"><input type="checkbox" checked></div>
                  <div class="rich-text">Coordinate geometry of circles</div>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  `);

  const rows = await readTaxonomyRows(page);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(({ text, isOutcome, selected }) => ({ text, isOutcome, selected })), [
    { text: "Coordinate Geometry", isOutcome: false, selected: false },
    { text: "Area of rectilinear figure", isOutcome: true, selected: false },
    { text: "Coordinate geometry of circles", isOutcome: true, selected: true }
  ]);
});

test("a saved Module Tag read is scoped to its exact map and waits for checked outcomes", async (t) => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <ul>
      <li class="bx--accordion__item">
        <button class="bx--accordion__heading">Other Map - 1 selected</button>
        <ul class="tree-list">
          <li class="tree-row"><div class="tree-row-item">
            <div class="node-container learning-outcome-node-container">
              <div class="input-checkbox"><input type="checkbox" checked></div>
              <div class="rich-text">Wrong map outcome</div>
            </div>
          </div></li>
        </ul>
      </li>
      <li class="bx--accordion__item">
        <button class="bx--accordion__heading">Wanted Map - 1 selected</button>
        <ul class="tree-list">
          <li class="tree-row"><div class="tree-row-item">
            <div class="node-container learning-outcome-node-container">
              <div class="input-checkbox"><input id="wanted" type="checkbox"></div>
              <div class="rich-text">Wanted outcome</div>
            </div>
          </div></li>
        </ul>
      </li>
    </ul>
    <script>setTimeout(() => { document.querySelector('#wanted').checked = true; }, 300);</script>
  `);

  const tree = await readMapTree(page, {
    contentMap: "Wanted Map",
    expectedSelectedCount: 1
  });
  assert.deepEqual(tree.selected, [{ outcome: "Wanted outcome", outcomePath: [] }]);
  assert.deepEqual(tree.outcomes, [{ outcome: "Wanted outcome", outcomePath: [] }]);
});

test("an existing zero-selected Section map waits for its delayed tree instead of adding another map", async (t) => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <button id="summary">Wanted Map - 0 selected</button>
    <button id="chooser">Content Map</button>
    <ul id="tree" class="tree-list" hidden>
      <li class="tree-row"><div class="tree-row-item">Algebra</div></li>
    </ul>
    <script>
      document.querySelector('#summary').addEventListener('click', () => {
        setTimeout(() => document.querySelector('#tree').removeAttribute('hidden'), 300);
      });
      document.querySelector('#chooser').addEventListener('click', () => {
        document.body.dataset.chooserClicked = 'true';
      });
    </script>
  `);

  const opened = await openContentMapTree(page, {
    label: "A",
    contentMap: "Wanted Map"
  });

  assert.equal(opened.contentMap, "Wanted Map");
  assert.equal(await opened.treeRows.count(), 1);
  assert.equal(await page.locator("body").getAttribute("data-chooser-clicked"), null);
});
