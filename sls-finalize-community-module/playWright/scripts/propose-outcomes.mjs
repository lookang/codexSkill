// Reads the newest scan for a module and proposes a learning outcome per section
// from that module's own questions, ranked against the harvested content map.
// Prints a reviewable proposal; writing it into a config is a separate step.
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chooseOutcome, outcomeProposalIsWritable } from "../src/outcome-chooser.mjs";

const moduleId = process.argv[2];
const writeFlag = process.argv.indexOf("--write");
const configPath = writeFlag >= 0 ? process.argv[writeFlag + 1] : null;
if (!moduleId) {
  console.error("Usage: node scripts/propose-outcomes.mjs <moduleId>");
  process.exit(1);
}

const moduleDir = path.resolve(process.cwd(), "output", moduleId);
const entries = (await fs.readdir(moduleDir).catch(() => [])).sort().reverse();
let report = null;
for (const name of entries) {
  const candidate = await fs
    .readFile(path.join(moduleDir, name, "report.json"), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (candidate?.scan?.taxonomy?.outcomes?.length) {
    report = candidate;
    break;
  }
}
if (!report) {
  console.error(`No scan with a harvested taxonomy found for ${moduleId}. Run: npm run sls:scan`);
  process.exit(1);
}

const taxonomy = report.scan.taxonomy.outcomes;
console.log(`\nModule    : ${report.module.title}`);
console.log(`Dictionary: ${taxonomy.length} outcomes from ${report.scan.contentMap}\n`);

const proposals = new Map();

for (const section of report.scan.sections) {
  const questions = section.activities.flatMap((activity) => activity.questions);
  const questionText = questions.map((question) => question.text).join(" ");
  const picked = chooseOutcome(taxonomy, {
    moduleTitle: report.module.title,
    sectionTitle: section.title,
    questionText
  });

  console.log(`[${section.label}] ${section.title}`);
  console.log(`      evidence: ${questions.length} questions`);
  if (!picked) {
    console.log("      -> no outcome could be proposed");
    console.log("");
    continue;
  }
  if (outcomeProposalIsWritable(picked)) proposals.set(section.title, picked);
  console.log(`      propose : ${picked.outcome}`);
  console.log(`      path    : ${picked.outcomePath.join(" > ") || "(top level)"}`);
  console.log(`      why     : ${picked.reason}`);
  for (const alternative of (picked.alternatives ?? []).slice(0, 2)) {
    console.log(`      runner-up ${alternative.score.toFixed(2)}: ${alternative.outcome.slice(0, 58)}`);
  }
  console.log("");
}
console.log("Review these before putting them into a config; uncertain fallbacks will not overwrite configured outcomes.");

if (configPath) {
  const resolved = path.resolve(process.cwd(), configPath);
  const config = JSON.parse(await fs.readFile(resolved, "utf8"));
  let written = 0;
  for (const section of config.sections) {
    const picked = proposals.get(section.title);
    if (!picked) continue;
    section.outcome = picked.outcome;
    section.outcomePath = picked.outcomePath;
    written += 1;
  }
  await fs.writeFile(resolved, `${JSON.stringify(config, null, 2)}
`, "utf8");
  console.log(`Wrote per-section outcomes for ${written} section(s) into ${path.relative(process.cwd(), resolved)}.`);
  console.log(
    written > 0
      ? "Confident section-specific outcomes were recorded; review them before the edit pass."
      : "Uncertain section proposals were skipped; the configured default outcome remains in effect."
  );
}
