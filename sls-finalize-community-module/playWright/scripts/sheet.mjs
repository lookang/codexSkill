// Browse the resource sheet and resolve a row to its SLS module URL.
//   npm run sls:sheet                 list the default tab
//   npm run sls:sheet -- --tabs       list every tab
//   npm run sls:sheet -- 22           show what row 22 resolves to
//   npm run sls:sheet -- p6           filter rows by text
//   npm run sls:sheet -- --tab "Secondary School Resources" 14
import process from "node:process";
import { listEntries, listTabs, loadTab, rowToEntry } from "../src/sheet.mjs";

const root = process.cwd();
const argv = process.argv.slice(2);
const refresh = argv.includes("--refresh");
const tabFlag = argv.indexOf("--tab");
const wantedTab = tabFlag >= 0 ? argv[tabFlag + 1] : null;
// Guard the tab-value index: with no --tab, tabFlag is -1 and tabFlag + 1 is 0,
// which would silently swallow the first positional argument.
const tabValueIndex = tabFlag >= 0 ? tabFlag + 1 : -1;
const rest = argv.filter((a, i) => !a.startsWith("--") && i !== tabValueIndex);

const tabs = await listTabs(root, { refresh });
if (argv.includes("--tabs")) {
  console.log("\nTabs in the resource sheet:");
  for (const tab of tabs) console.log(`   ${tab.name}`);
  process.exit(0);
}

const tab =
  (wantedTab && tabs.find((t) => t.name.toLowerCase().includes(wantedTab.toLowerCase()))) || tabs[0];
const rows = await loadTab(root, tab.gid, { refresh });
const query = rest[0];

if (query && /^\d+$/.test(query)) {
  const entry = rowToEntry(rows, Number(query));
  if (!entry) {
    console.error(`Row ${query} of "${tab.name}" has no SLS link.`);
    process.exit(1);
  }
  console.log(`\n[${tab.name}] row ${entry.rowNumber}`);
  console.log(`  ${entry.title}`);
  console.log(`  ${entry.url}`);
  process.exit(0);
}

const entries = listEntries(rows).filter(
  (entry) => !query || entry.title.toLowerCase().includes(query.toLowerCase())
);
console.log(`\n[${tab.name}] ${entries.length} module link(s)${query ? ` matching "${query}"` : ""}:\n`);
for (const entry of entries) {
  console.log(`  ${String(entry.rowNumber).padStart(3)}  ${entry.title.slice(0, 78)}`);
}
console.log(`\nStart a run with: npm run sls:one-shot -- --row <number>`);
