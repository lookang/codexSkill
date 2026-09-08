import { expect } from "@playwright/test";

export const TITLE_TRACKING_HEADER = "New Module Title";

export function columnName(number) {
  if (!Number.isInteger(number) || number < 1) throw new Error("Sheet column number must be a positive integer.");
  let value = number;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

export function findTrackingColumn(rows, header = TITLE_TRACKING_HEADER) {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => String(cell).trim() === "Lesson / Module Title") &&
    row.some((cell) => String(cell).trim() === "Module ID")
  );
  if (headerIndex < 0) throw new Error("The Sheet header row could not be identified.");
  const row = rows[headerIndex];
  const existing = row.findIndex((cell) => String(cell).trim().toLowerCase() === header.toLowerCase());
  const lastUsed = row.reduce((last, cell, index) => String(cell).trim() ? index : last, -1);
  const columnIndex = existing >= 0 ? existing : lastUsed + 1;
  return {
    header,
    headerRow: headerIndex + 1,
    columnIndex,
    columnNumber: columnIndex + 1,
    column: columnName(columnIndex + 1),
    existing: existing >= 0
  };
}

export async function isGoogleSheetEditable(page) {
  if (/accounts\.google\.com/i.test(page.url())) return false;
  const nameBox = page.locator("#t-name-box");
  const formula = page.locator("#t-formula-bar-input .cell-input[contenteditable='true']");
  if (!(await nameBox.isVisible().catch(() => false)) || !(await formula.isVisible().catch(() => false))) return false;
  const viewOnly = await page.getByText("View only", { exact: true }).isVisible().catch(() => false);
  return !viewOnly;
}

export async function prepareGoogleSheet(page, sheetUrl, tracking, { timeout = 30_000 } = {}) {
  const url = new URL(sheetUrl);
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !url.pathname.startsWith("/spreadsheets/d/")) {
    throw new Error(`Refusing to open a non-Google-Sheets URL: ${sheetUrl}`);
  }
  await page.goto(sheetUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#t-name-box").waitFor({ state: "visible", timeout }).catch(() => {});
  if (!(await isGoogleSheetEditable(page))) {
    throw new Error("The Google Sheet is not editable in this Chrome session. Sign in with an account that can edit this Sheet.");
  }
  const writer = createGoogleSheetWriter(page, { timeout });
  const headerCell = `${tracking.column}${tracking.headerRow}`;
  const current = await writer.readCell(headerCell);
  if (current && current !== tracking.header) {
    throw new Error(`${headerCell} already contains "${current}"; refusing to overwrite it with the tracking header.`);
  }
  if (current !== tracking.header) await writer.writeCell(headerCell, tracking.header);
  return writer;
}

export function createGoogleSheetWriter(page, { timeout = 30_000 } = {}) {
  const nameBox = page.locator("#t-name-box");
  const formula = page.locator("#t-formula-bar-input .cell-input[contenteditable='true']");

  async function selectCell(reference) {
    await expect(nameBox).toBeVisible({ timeout });
    await nameBox.click();
    await nameBox.press("ControlOrMeta+A");
    await nameBox.fill(reference);
    await nameBox.press("Enter");
    await expect(nameBox).toHaveValue(new RegExp(`^${reference}$`, "i"), { timeout });
    await expect(formula).toBeVisible({ timeout });
  }

  async function readCell(reference) {
    await selectCell(reference);
    return ((await formula.innerText().catch(() => "")) || (await formula.textContent().catch(() => "")) || "").trim();
  }

  async function writeCell(reference, value) {
    const text = String(value);
    if (!text || /[\r\n\t\x00-\x1f]/.test(text)) throw new Error(`Cell ${reference} requires non-empty, single-line text.`);
    await selectCell(reference);
    await formula.click();
    await formula.press("ControlOrMeta+A");
    await page.keyboard.insertText(text);
    await formula.press("Enter");
    await page.getByText("Saving...", { exact: true }).waitFor({ state: "hidden", timeout }).catch(() => {});
    const reopened = await readCell(reference);
    if (reopened !== text) throw new Error(`Sheet cell ${reference} saved as "${reopened}" instead of "${text}".`);
    return text;
  }

  return { readCell, writeCell };
}
