import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  acceptCurriculumCandidate,
  applyCurriculumResolution,
  resolveCurriculumFromTaxonomies
} from "../src/config-resolver.mjs";
import { saveJson } from "../src/io.mjs";

const configArg = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const interactive = process.argv.includes("--interactive");
const chooseIndex = process.argv.indexOf("--choose");
const requestedChoice = chooseIndex >= 0 ? process.argv[chooseIndex + 1] : null;
if (!configArg) {
  console.error(
    "Usage: node scripts/resolve-config.mjs <config.json> " +
      "[--dry-run] [--interactive | --choose <number>]"
  );
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

let resolution = resolveCurriculumFromTaxonomies(config, taxonomies);
console.log("\nCached-taxonomy curriculum ranking:");
for (const [index, candidate] of (resolution.candidates ?? []).entries()) {
  console.log(
    `  ${index + 1}. ${candidate.score.toFixed(2)}  ${candidate.contentMap}  ->  ${candidate.outcome}`
  );
}
if (!resolution.resolved) {
  console.error(`\nCould not resolve this config automatically: ${resolution.reason}.`);
  const reviewed = requestedChoice != null
    ? acceptCurriculumCandidate(resolution, requestedChoice)
    : interactive
      ? await askForCandidate(resolution)
      : null;
  if (!reviewed) {
    console.error("No curriculum candidate was selected. No local config or SLS content was changed.");
    process.exit(2);
  }
  resolution = reviewed;
  console.log(`\nReviewed selection: candidate ${resolution.selectedCandidateNumber}.`);
}

console.log(`\nSelected: ${resolution.level} / ${resolution.contentMap}`);
console.log(`Outcome : ${resolution.outcomePath.join(" > ")} > ${resolution.outcome}`);
if (resolution.selectedByReview) {
  console.log("Basis   : explicitly selected from the numbered cached-taxonomy review.");
} else {
  console.log(`Margin  : ${resolution.margin.toFixed(2)} over the next taxonomy`);
}
if (dryRun) {
  console.log("Dry run only; the config was not changed.");
  process.exit(0);
}

await saveJson(configPath, applyCurriculumResolution(config, resolution));
console.log(`Recorded the inferred SLS wording in ${path.relative(root, configPath)}.`);

async function askForCandidate(unresolved) {
  const count = unresolved.candidates?.length ?? 0;
  if (count === 0) return null;
  const prompt = readline.createInterface({ input, output });
  try {
    while (true) {
      const answer = await prompt.question(
        `\nSelect 1-${count} to use that reviewed curriculum and continue, ` +
          "or press Enter to stop safely: "
      );
      if (!answer.trim()) return null;
      const accepted = acceptCurriculumCandidate(unresolved, answer.trim());
      if (accepted) return accepted;
      console.log(`Please enter one number from 1 to ${count}, or press Enter to stop.`);
    }
  } finally {
    prompt.close();
  }
}
