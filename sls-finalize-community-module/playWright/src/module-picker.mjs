// Shared "which module?" prompt for every launcher, so the one-shot pipeline and
// the module actions (gamify, add-teacher) behave identically.
//
// Accepts a pasted URL, a row number from the resource sheet, or "list" to browse
// it. Row numbers match the spreadsheet exactly, so "22" is row 22.
import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseAdminModuleEditUrl } from "./io.mjs";
import { activeSheet, listEntries, listTabs, loadTab, parseSheetUrl, rowToEntry, useSheet } from "./sheet.mjs";

const LAST_MODULE_FILE = "last-module.json";

function lastModulePath(root) {
  return path.join(root, ".state", LAST_MODULE_FILE);
}

export async function readRememberedModuleUrl(root) {
  try {
    const state = JSON.parse(await fs.readFile(lastModulePath(root), "utf8"));
    parseAdminModuleEditUrl(state.url);
    return state.url;
  } catch {
    return null;
  }
}

export async function rememberModuleUrl(root, url) {
  parseAdminModuleEditUrl(url);
  const filePath = lastModulePath(root);
  const temporaryPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify({ schemaVersion: 1, url, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
  await fs.rename(temporaryPath, filePath);
}

export function readRowArg(argv = process.argv.slice(2)) {
  const flag = argv.indexOf("--row");
  if (flag < 0) return null;
  const row = Number(argv[flag + 1]);
  if (!Number.isFinite(row)) return null;
  const tabFlag = argv.indexOf("--tab");
  return { row, tab: tabFlag >= 0 ? argv[tabFlag + 1] : null };
}

async function sheetTab(root, wanted) {
  const tabs = await listTabs(root);
  if (wanted) {
    const named = tabs.find((tab) => tab.name.toLowerCase().includes(wanted.toLowerCase()));
    if (named) return named;
  }
  // A gid set by a pasted Google Sheets URL wins over the default first tab.
  const { gid } = activeSheet();
  if (gid) {
    const byGid = tabs.find((tab) => tab.gid === String(gid));
    if (byGid) return byGid;
  }
  return tabs[0];
}

export async function resolveRow(root, row, wantedTab = null) {
  try {
    const tab = await sheetTab(root, wantedTab);
    return rowToEntry(await loadTab(root, tab.gid), row);
  } catch (error) {
    console.log(`Could not read the resource sheet: ${error.message}`);
    return null;
  }
}

async function showSheet(root, filter) {
  try {
    const tab = await sheetTab(root, null);
    const entries = listEntries(await loadTab(root, tab.gid)).filter(
      (entry) => !filter || entry.title.toLowerCase().includes(filter.toLowerCase())
    );
    console.log(`\n[${tab.name}] ${entries.length} module(s)${filter ? ` matching "${filter}"` : ""}:`);
    for (const entry of entries) {
      console.log(`  ${String(entry.rowNumber).padStart(3)}  ${entry.title.slice(0, 76)}`);
    }
  } catch (error) {
    console.log(`Could not read the resource sheet: ${error.message}`);
  }
}

// `ask` and `stop` are supplied by the caller so each launcher keeps its own
// prompt plumbing and its own exit behaviour.
export async function askForModule({ root, defaultUrl, ask, stop }) {
  const rememberedUrl = await readRememberedModuleUrl(root);
  const enterUrl = rememberedUrl ?? defaultUrl;
  const rowArg = readRowArg();
  if (rowArg) {
    const resolved = await resolveRow(root, rowArg.row, rowArg.tab);
    if (resolved) {
      console.log(`\nRow ${resolved.rowNumber}: ${resolved.title}`);
      return resolved.url;
    }
    await stop(`Row ${rowArg.row} of the resource sheet has no SLS link.`);
  }

  if (rememberedUrl) {
    console.log("\nLast SLS module:");
    console.log(`  ${rememberedUrl}`);
  }

  for (;;) {
    const answer = (
      await ask(
        "\nPaste an SLS URL, or a Google Sheets URL to switch to that tab," +
          "\nor type a row number (e.g. 22). Type 'list' to browse the current tab," +
          `\nor press Enter to use ${rememberedUrl ? "the last SLS module shown above" : "the configured P3 module"}.` +
          "\n\nModule URL, sheet URL, or row: "
      )
    ).trim();

    if (!answer) return enterUrl;

    const sheetTarget = parseSheetUrl(answer);
    if (sheetTarget) {
      useSheet(sheetTarget);
      await showSheet(root, null);
      console.log("");
      console.log("Now type a row number from the list above.");
      continue;
    }

    if (/^https?:\/\//i.test(answer)) return answer;

    if (/^list\b/i.test(answer)) {
      await showSheet(root, answer.replace(/^list\s*/i, "").trim());
      continue;
    }
    if (/^\d+$/.test(answer)) {
      const resolved = await resolveRow(root, Number(answer));
      if (!resolved) {
        console.log(`Row ${answer} has no SLS link. Type 'list' to see the rows.`);
        continue;
      }
      console.log(`\nRow ${resolved.rowNumber}: ${resolved.title}`);
      return resolved.url;
    }
    console.log("Not recognised. Enter a URL, a row number, or 'list'.");
  }
}
