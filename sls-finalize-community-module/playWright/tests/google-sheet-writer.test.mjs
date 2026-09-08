import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { columnName, findTrackingColumn, prepareGoogleSheet } from "../src/google-sheet-writer.mjs";

test("tracking column reuses its header or chooses the next free column", () => {
  const rows = [
    ["SLS Modules"],
    [], [], [], [],
    ["Lesson / Module Title", "SLS Module URL", "Admin View URL", "Module ID", "Saved Runs"]
  ];
  assert.deepEqual(findTrackingColumn(rows), {
    header: "New Module Title", headerRow: 6, columnIndex: 5,
    columnNumber: 6, column: "F", existing: false
  });
  rows[5][7] = "New Module Title";
  assert.equal(findTrackingColumn(rows).column, "H");
  assert.equal(findTrackingColumn(rows).existing, true);
  assert.equal(columnName(11), "K");
  assert.equal(columnName(27), "AA");
});

test("tracking column requires the expected Sheet header", () => {
  assert.throws(() => findTrackingColumn([["Something else"]]), /header row/);
});

async function sheetFixture(t, { editable = true, initial = {} } = {}) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("https://docs.google.com/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><body>
      ${editable ? "" : "<div>View only</div>"}
      <input id="t-name-box" value="A1">
      <div id="t-formula-bar-input"><div class="cell-input" role="textbox" contenteditable="${editable}"></div></div>
      <script>
        const cells = ${JSON.stringify(initial)};
        const name = document.querySelector('#t-name-box');
        const formula = document.querySelector('.cell-input');
        const show = () => formula.textContent = cells[name.value.toUpperCase()] || '';
        name.addEventListener('keydown', event => { if (event.key === 'Enter') { name.value = name.value.toUpperCase(); show(); }});
        formula.addEventListener('keydown', event => {
          if (event.key === 'Enter') { event.preventDefault(); cells[name.value.toUpperCase()] = formula.textContent; }
        });
        window.__cells = cells;
        show();
      </script>
    </body></html>`
  }));
  return { page, cells: () => page.evaluate(() => window.__cells) };
}

test("Google Sheet writer creates and verifies the tracking header and title cell", async (t) => {
  const { page, cells } = await sheetFixture(t);
  const tracking = { header: "New Module Title", headerRow: 6, column: "K" };
  const writer = await prepareGoogleSheet(page, "https://docs.google.com/spreadsheets/d/test/edit?gid=44#gid=44", tracking, { timeout: 2_000 });
  assert.equal((await cells()).K6, "New Module Title");
  await writer.writeCell("K7", "Topical Revision - Addition within 100 (FA-Math)");
  assert.equal(await writer.readCell("K7"), "Topical Revision - Addition within 100 (FA-Math)");
});

test("Google Sheet writer stops on view-only access and occupied header cells", async (t) => {
  const first = await sheetFixture(t, { editable: false });
  await assert.rejects(
    prepareGoogleSheet(first.page, "https://docs.google.com/spreadsheets/d/test/edit?gid=44#gid=44", { header: "New Module Title", headerRow: 6, column: "K" }, { timeout: 500 }),
    /not editable/
  );
  const second = await sheetFixture(t, { initial: { K6: "Someone else's column" } });
  await assert.rejects(
    prepareGoogleSheet(second.page, "https://docs.google.com/spreadsheets/d/test/edit?gid=44#gid=44", { header: "New Module Title", headerRow: 6, column: "K" }, { timeout: 1_000 }),
    /refusing to overwrite/
  );
});
