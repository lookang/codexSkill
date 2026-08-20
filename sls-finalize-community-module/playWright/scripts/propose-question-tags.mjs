// Proposes a learning outcome per QUESTION by reading the mathematics in the
// question and matching it against every harvested content map. Levels are not
// assumed: a question is tagged at whichever level actually fits its operation,
// which is the point of tagging per question rather than per activity.
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { featureScore, mathFeatures } from "../src/math-features.mjs";

const root = process.cwd();
const levelsWanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const taxonomyDir = path.join(root, "taxonomy");
const files = (await fs.readdir(taxonomyDir).catch(() => [])).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error("No harvested content maps under taxonomy/. Run a scan first.");
  process.exit(1);
}

const dictionaries = [];
for (const file of files) {
  const data = JSON.parse(await fs.readFile(path.join(taxonomyDir, file), "utf8"));
  const contentMap = data.contentMap || file.replace(/\.json$/, "");
  if (levelsWanted.length && !levelsWanted.some((l) => contentMap.toLowerCase().includes(l.toLowerCase()))) continue;
  for (const outcome of data.outcomes) {
    if (!outcome.outcomePath?.length) continue; // dispositional, not content
    dictionaries.push({
      contentMap,
      outcome: outcome.outcome,
      outcomePath: outcome.outcomePath,
      features: mathFeatures(`${outcome.outcomePath.join(" ")} ${outcome.outcome}`)
    });
  }
}
console.log(`Dictionary: ${dictionaries.length} content outcomes from ${new Set(dictionaries.map((d) => d.contentMap)).size} map(s)\n`);

// A question already carries Subject/Level tags, and those levels say which
// syllabus it is meant for. Restricting the pool to them is the single biggest
// accuracy win: without it a P4 fraction sum matches a P3 outcome just as well.
export function proposeForQuestion(questionText, options = {}) {
  const { allowedContentMaps = null } = options;
  const pool = allowedContentMaps
    ? dictionaries.filter((entry) =>
        allowedContentMaps.some((wanted) => entry.contentMap.toLowerCase().includes(wanted.toLowerCase()))
      )
    : dictionaries;
  const features = mathFeatures(questionText);
  if (features.operations.size === 0 && features.operands.size === 0) {
    return { decision: "skip", reason: "no mathematical content detected" };
  }
  const ranked = pool
    .map((entry) => ({ ...entry, score: featureScore(features, entry.features) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return { decision: "skip", reason: "no outcome matched the mathematics", features };
  const best = ranked[0];
  const tied = ranked.filter((entry) => entry.score === best.score);
  return {
    decision: "tag",
    contentMap: best.contentMap,
    outcome: best.outcome,
    outcomePath: best.outcomePath,
    score: best.score,
    tiedCount: tied.length,
    alternatives: ranked.slice(1, 4),
    features
  };
}

// Demonstration against the questions seen on row 23 and the P6 module.
const allowed = ["Pri 4 Mathematics (2021)", "Pri 6 Mathematics (2021)"];
console.log(`Restricting to the levels this module is tagged for: ${allowed.join(", ")}
`);
const samples = [
  ["Practice 1 Q1", "Q1 Find FEEDBACK ASSISTANT Feedback Assistant - Mathematics will provide marks and feedback for this question. 2/5 + 3/7 MARKS [1]"],
  ["a division item", "Q4 Find FEEDBACK ASSISTANT Feedback Assistant - Mathematics. 3/4 ÷ 2 MARKS [1]"],
  ["mixed numbers", "Q2 Find 2 1/2 + 1 3/4 MARKS [1]"],
  ["P6 books word problem", "Q1 A box with 4 identical books has a total mass of 14 kg. The mass of the empty box is 2 kg. What is the mass of each book in kg?"],
  ["reflection prompt", "Q5 Instruction: Compare your model against the suggested answer and select the appropriate option below."]
];
for (const [label, text] of samples) {
  const result = proposeForQuestion(text, { allowedContentMaps: allowed });
  console.log(`${label}`);
  if (result.decision === "skip") {
    console.log(`   SKIP  ${result.reason}\n`);
    continue;
  }
  console.log(`   ${result.contentMap}`);
  console.log(`   ${result.outcomePath.join(" > ")}`);
  console.log(`   -> ${result.outcome.slice(0, 74)}`);
  console.log(`   score=${result.score} tied=${result.tiedCount} ops=[${[...result.features.operations]}] operands=[${[...result.features.operands]}]\n`);
}
