import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { applyCurriculumResolution, resolveCurriculumFromTaxonomies } from "../src/config-resolver.mjs";
import { saveJson } from "../src/io.mjs";

const configArg = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!configArg) {
  console.error("Usage: node scripts/resolve-config.mjs <config.json> [--dry-run]");
  process.exit(1);
}

const root = process.cwd();
const configPath = path.resolve(root, configArg);
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const taxonomyDir = path.join(root, "taxonomy");
const taxonomies = [];
for (const entry of await fs.readdir(taxonomyDir, { withFileTypes: true }).catch(() => [])) {
  if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
  const taxonomy = await fs
    .readFile(path.join(taxonomyDir, entry.name), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (taxonomy) taxonomies.push(taxonomy);
}

const resolution = resolveCurriculumFromTaxonomies(config, taxonomies);
console.log("\nCached-taxonomy curriculum ranking:");
for (const candidate of resolution.candidates ?? []) {
  console.log(
    `  ${candidate.score.toFixed(2)}  ${candidate.contentMap}  ->  ${candidate.outcome}`
  );
}
if (!resolution.resolved) {
  console.error(`\nCould not resolve this config automatically: ${resolution.reason}.`);
  console.error("No local config or SLS content was changed.");
  process.exit(2);
}

console.log(`\nSelected: ${resolution.level} / ${resolution.contentMap}`);
console.log(`Outcome : ${resolution.outcomePath.join(" > ")} > ${resolution.outcome}`);
console.log(`Margin  : ${resolution.margin.toFixed(2)} over the next taxonomy`);
if (dryRun) {
  console.log("Dry run only; the config was not changed.");
  process.exit(0);
}

await saveJson(configPath, applyCurriculumResolution(config, resolution));
console.log(`Recorded the inferred SLS wording in ${path.relative(root, configPath)}.`);
