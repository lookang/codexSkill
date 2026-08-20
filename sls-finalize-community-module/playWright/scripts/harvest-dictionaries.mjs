// Builds the learning-outcome dictionaries by reading the content maps that real
// modules already carry.
//
// Secondary is not one syllabus. Levels, streams and syllabus years each have their
// own content map ("Sec 1 Mathematics (G2) (2020)" is only one of them), and a
// question cannot be tagged sensibly until the matching dictionary is on disk. This
// sweeps the resource sheet and caches one dictionary per content map it meets.
//
// It is strictly read-only. It never chooses a content map, never ticks an outcome
// and never saves: harvesting a syllabus is not a reason to change somebody's
// module.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../src/cli.mjs";
import { parseAdminModuleEditUrl } from "../src/io.mjs";
import { createSlsContext, launchSlsBrowser, runSlsWorkflow } from "../src/sls-runner.mjs";
import { activeSheet, listEntries, listTabs, loadTab, parseSheetUrl, useSheet } from "../src/sheet.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

function flag(name, fallback = null) {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith("--") ? argv[at + 1] : fallback;
}

// "--rows 2-40" or "--rows 3,7,11". Without it every row on the tab is swept.
function wantedRows() {
  const raw = flag("rows");
  if (!raw) return null;
  const rows = new Set();
  for (const part of raw.split(",")) {
    const span = /^(\d+)\s*-\s*(\d+)$/.exec(part.trim());
    if (span) {
      for (let row = Number(span[1]); row <= Number(span[2]); row += 1) rows.add(row);
    } else if (/^\d+$/.test(part.trim())) {
      rows.add(Number(part.trim()));
    }
  }
  return rows.size > 0 ? rows : null;
}

async function chooseTab() {
  const sheetUrl = argv.find((value) => /docs\.google\.com\/spreadsheets/i.test(value));
  if (sheetUrl) {
    const target = parseSheetUrl(sheetUrl);
    if (target) useSheet(target);
  }
  const tabs = await listTabs(root);
  const wanted = flag("tab");
  if (wanted) {
    const named = tabs.find((tab) => tab.name.toLowerCase().includes(wanted.toLowerCase()));
    if (named) return named;
  }
  const { gid } = activeSheet();
  if (gid) {
    const byGid = tabs.find((tab) => tab.gid === String(gid));
    if (byGid) return byGid;
  }
  return tabs[0];
}

const shared = { browser: null, context: null };

async function harvestModule(entry) {
  const options = parseArgs(["harvest", "--url", entry.url, ...argv.filter((value) => value === "--headless" || value === "--refresh-taxonomy")]);
  if (!shared.browser) shared.browser = await launchSlsBrowser(options);
  if (!shared.context) shared.context = await createSlsContext(shared.browser, options);

  // Harvesting reads the module's own inventory, so it needs no per-module config -
  // just enough of one to address the module.
  const config = {
    module: parseAdminModuleEditUrl(entry.url),
    defaults: { contentMap: "" },
    sections: []
  };

  const result = await runSlsWorkflow(config, options, shared);
  return result.report?.scan?.contentMaps ?? [];
}

async function main() {
  const tab = await chooseTab();
  const rows = wantedRows();
  const entries = listEntries(await loadTab(root, tab.gid)).filter(
    (entry) => !rows || rows.has(entry.rowNumber)
  );

  console.log(`\n[${tab.name}] harvesting dictionaries from ${entries.length} module(s).`);
  console.log("This is read-only: no content map is chosen and nothing is saved to SLS.\n");

  const dictionaries = new Map();
  const failures = [];

  for (const entry of entries) {
    console.log(`Row ${entry.rowNumber}: ${entry.title.slice(0, 70)}`);
    try {
      for (const found of await harvestModule(entry)) {
        const existing = dictionaries.get(found.contentMap);
        if (!existing || found.outcomes > existing) dictionaries.set(found.contentMap, found.outcomes);
      }
    } catch (error) {
      const reason = error.message.split("\n")[0];
      console.log(`  skipped: ${reason}`);
      failures.push({ row: entry.rowNumber, reason });
      // A session that has expired will fail on every remaining row, so stop
      // rather than grind through the rest of the sheet producing noise.
      if (/sign in|log in|authenticat/i.test(reason)) {
        console.log("\nThe SLS session is no longer valid. Run `npm run sls:auth` and start again.");
        break;
      }
    }
  }

  console.log(`\n${dictionaries.size} content map(s) now cached in taxonomy/:`);
  for (const [name, outcomes] of [...dictionaries].sort()) {
    console.log(`  ${String(outcomes).padStart(4)} outcomes  ${name}`);
  }
  if (failures.length > 0) {
    console.log(`\n${failures.length} module(s) could not be read:`);
    for (const failure of failures) console.log(`  row ${failure.row}: ${failure.reason}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(`\nHarvest stopped: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (shared.context) await shared.context.close().catch(() => {});
  if (shared.browser) await shared.browser.close().catch(() => {});
}
