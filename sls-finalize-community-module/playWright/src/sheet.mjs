// Resolves a resource-sheet row into an SLS module URL, so a run can be started
// by row number instead of copy-pasting links. The sheet is read-only and public
// (CSV export), and rows are numbered exactly as the spreadsheet shows them.
import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_SHEET_ID = "1Gbg2psA-vRxAcnlR-q6czh9EFUTDYlixk72YRKVOF-U";

// The active spreadsheet and tab. Both can be redirected at run time by pasting a
// Google Sheets URL, so a launcher is not tied to one tab.
let activeSheetId = DEFAULT_SHEET_ID;
let activeGid = null;

export function parseSheetUrl(value) {
  const text = String(value || "");
  if (!/docs\.google\.com\/spreadsheets/i.test(text)) return null;
  const sheetId = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(text)?.[1] || null;
  const gid = /[#?&]gid=(\d+)/.exec(text)?.[1] || null;
  if (!sheetId) return null;
  return { sheetId, gid };
}

export function useSheet({ sheetId, gid }) {
  if (sheetId) activeSheetId = sheetId;
  activeGid = gid ?? null;
}

export function activeSheet() {
  return { sheetId: activeSheetId, gid: activeGid };
}
const CACHE_MS = 10 * 60 * 1000;

function cachePath(root, name) {
  return path.join(root, ".sheet-cache", `${name}`);
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Sheet request failed: HTTP ${response.status}`);
  return response.text();
}

async function cached(root, name, url, refresh) {
  const file = cachePath(root, name);
  if (!refresh) {
    const stat = await fs.stat(file).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs < CACHE_MS) return fs.readFile(file, "utf8");
  }
  const text = await fetchText(url);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
  return text;
}

// Tab names and gids are declared in the sheet's own htmlview bootstrap, so the
// list stays correct when tabs are added without anything to maintain here.
export async function listTabs(root, { refresh = false } = {}) {
  const html = await cached(root, `tabs-${activeSheetId}.html`, `https://docs.google.com/spreadsheets/d/${activeSheetId}/htmlview`, refresh);
  const tabs = [];
  const pattern = /items\.push\(\{name:\s*"([^"]+)"[^}]*?gid:\s*"(\d+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) tabs.push({ name: match[1], gid: match[2] });
  if (tabs.length === 0) throw new Error("No tabs could be read from the sheet.");
  return tabs;
}

// Minimal RFC4180 parser: a quoted cell may span newlines (the instructions cell
// does), so splitting on newlines would misalign every row number after it.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

export async function loadTab(root, gid, { refresh = false } = {}) {
  const csv = await cached(root, `${activeSheetId}-${gid}.csv`, `https://docs.google.com/spreadsheets/d/${activeSheetId}/export?format=csv&gid=${gid}`, refresh);
  return parseCsv(csv);
}

const SLS_URL = /https:\/\/vle\.learning\.moe\.edu\.sg\/\S+/;

export function rowToEntry(rows, rowNumber) {
  const row = rows[rowNumber - 1];
  if (!row) return null;
  const cells = row.map((cell) => (cell || "").replace(/\s+/g, " ").trim());
  const url = cells.map((cell) => SLS_URL.exec(cell)?.[0]).find(Boolean);
  if (!url) return null;
  return { rowNumber, title: cells[0] || "(untitled)", source: cells[1] || "", url };
}

export function listEntries(rows) {
  const entries = [];
  for (let i = 1; i <= rows.length; i += 1) {
    const entry = rowToEntry(rows, i);
    if (entry) entries.push(entry);
  }
  return entries;
}
