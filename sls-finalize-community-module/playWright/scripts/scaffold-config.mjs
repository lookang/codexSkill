// Turns the newest read-only inspection report for a module into a draft config.
// Structure (sections, activities) is taken verbatim from what SLS reported.
// Curriculum tagging is left as an explicit placeholder, because `outcome` must
// match the SLS dropdown character-for-character and cannot be inferred.
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseAdminModuleEditUrl, detectScope } from "../src/io.mjs";
import { inferCurriculumClues } from "../src/curriculum-discovery.mjs";
import { applyModuleEvidenceToConfig } from "../src/module-evidence.mjs";

const PROBLEM_SOLVING_OUTCOME =
  "Develop thinking, reasoning, communication, application and metacognitive " +
  "skills through a mathematical approach to problem-solving";

const root = process.cwd();
const [target, ...rest] = process.argv.slice(2);
if (!target) stop("Usage: node scripts/scaffold-config.mjs <module-url-or-id> [--out configs/name.json] [--include-notes]");

const includeNotes = rest.includes("--include-notes");
const outFlag = rest.indexOf("--out");
const moduleId = /^[0-9a-f-]{36}$/i.test(target.trim())
  ? target.trim()
  : parseAdminModuleEditUrl(target, { scope: detectScope(target) }).id;

const inventory = await newestInventory(moduleId);
if (!inventory) stop(`No inspection report with an inventory was found for ${moduleId}. Run an inspect first.`);

const skipped = [];
const sections = inventory.sections
  .filter((section) => {
    const isNotes = /notes for teachers/i.test(section.title);
    if (isNotes && !includeNotes) {
      skipped.push(`${section.label}. ${section.title}`);
      return false;
    }
    return true;
  })
  .map((section) => ({
    label: section.label,
    title: section.title,
    // Copies are artefacts of an earlier run, not source activities. Listing one
    // would make the pass try to duplicate a duplicate.
    activities: section.activities
      .filter((title) => !/ - Copy(?: - Copy)*$/i.test(title))
      .map((title) => {
      const activity = { title };
      if (/reflection|notes for teachers|lesson outcome|success criteria/i.test(title)) {
        activity.allowNoQuestions = true;
      }
      return activity;
    })
  }));

if (sections.length === 0) stop("Every section was filtered out; nothing to scaffold.");

const inferred = inferOutcome(inventory.title, sections.map((section) => section.title));
const evidenceSeed = applyModuleEvidenceToConfig(
  { module: { title: inventory.title }, defaults: {}, sections },
  inventory.moduleEvidence,
).config;
const curriculumClues = inferCurriculumClues(evidenceSeed);
const primaryNumber = /^Primary ([1-6])$/.exec(curriculumClues.level ?? "")?.[1] ?? null;
const exactSubjectKnown = curriculumClues.subjectId === "mathematics" ? "Mathematics - MATHS" : null;

let config = {
  schemaVersion: 1,
  module: {
    id: moduleId,
    title: inventory.title,
    adminEditUrl: `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/module-plan`
  },
  gamification: gamificationFor(inventory.title, curriculumClues.level),
  defaults: {
    subject: exactSubjectKnown ?? "REVIEW-BEFORE-RUNNING: select the exact SLS subject",
    level: curriculumClues.level ?? "REVIEW-BEFORE-RUNNING: set the level exactly as SLS lists it",
    contentMap: primaryNumber && exactSubjectKnown
      ? `Pri ${primaryNumber} Mathematics (2021)`
      : "REVIEW-BEFORE-RUNNING: set the content map exactly as SLS lists it",
    outcomePath: inferred ? inferred.outcomePath : [],
    outcome: inferred
      ? inferred.outcome
      : "REVIEW-BEFORE-RUNNING: paste the exact learning outcome text from the SLS dropdown",
    questionKeyword: "FA Math"
  },
  sections
};
const evidenceResult = applyModuleEvidenceToConfig(config, inventory.moduleEvidence);
config = evidenceResult.config;

const outPath = path.resolve(
  root,
  outFlag >= 0 ? rest[outFlag + 1] : path.join("configs", `${slug(inventory.title)}.json`)
);
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log(`\nDraft config written to ${path.relative(root, outPath)}`);
console.log(`Module: ${inventory.title}`);
if (evidenceResult.evidence.usable) {
  console.log(
    `Saved Module Tags: ${evidenceResult.evidence.subject} / ${evidenceResult.evidence.level} / ` +
      evidenceResult.evidence.contentMap,
  );
}
for (const line of skipped) console.log(`  skipped section (teacher notes): ${line}`);
for (const section of sections) {
  console.log(`  ${section.label}. ${section.title}`);
  for (const activity of section.activities) {
    console.log(`       - ${activity.title}${activity.allowNoQuestions ? "  [allowNoQuestions]" : ""}`);
  }
}
if (inferred) {
  console.log("");
  console.log("Learning outcome inferred (" + inferred.reason + "):");
  console.log("  " + inferred.outcome);
  console.log("  Review it against the SLS dropdown before the edit pass.");
} else {
  console.log("\nBefore running an edit pass, replace every REVIEW-BEFORE-RUNNING value.");
}
console.log("If the outcome wording is wrong, the run stops at a guard and prints the options SLS offers.");


// Outcome wording must match the SLS dropdown character-for-character, so only
// strings actually observed in the tagging panel are ever filled in
// automatically. This one is offered at the top level of every Primary
// Mathematics content map, and is the outcome a word-problem module wants: the
// syllabus has no "word problems" node, and content-specific outcomes under
// Whole Numbers or Decimals would each describe only half of such a module.

function inferOutcome(moduleTitle, sectionTitles) {
  const haystack = [moduleTitle, ...sectionTitles].join(" ").toLowerCase();
  if (/word problem|problem[- ]solving|heuristic/.test(haystack)) {
    return {
      outcomePath: [],
      outcome: PROBLEM_SOLVING_OUTCOME,
      reason: "title indicates word problems / problem-solving"
    };
  }
  return null;
}


// A scaffolded config also gets a gamification block, so `sls:gamify` is usable
// on a new module without hand-editing. The wording is derived from the module
// title and is meant to be reviewed, like every other scaffolded value.
function gamificationFor(moduleTitle, level) {
  const topic = moduleTitle
    .replace(/^AST[\s_-]*FA[-\s]?Math[\s_-]*/i, "")
    .replace(/^P\d\s*/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = topic.split(/[\s,()]+/).filter((word) => word.length > 3);
  const shortName = words.slice(0, 2).join(" ") || "Maths";
  return {
    recipe: "Fantasy Hero Journey",
    instructions:
      `Create a friendly fantasy mathematics quest for ${level || "Primary"} learners practising ` +
      `${topic.toLowerCase()}. Keep the story encouraging, age-appropriate, concise, and focused on ` +
      "effort, accuracy, and reflection.",
    title: `${shortName} Quest`,
    shortTitle: `${shortName.split(" ")[0]} Quest`,
    description: `Build confidence and accuracy while mastering ${topic.toLowerCase()}.`
  };
}

async function newestInventory(id) {
  const moduleDir = path.join(root, "output", id);
  const entries = await fs.readdir(moduleDir).catch(() => []);
  for (const name of entries.sort().reverse()) {
    try {
      const report = JSON.parse(await fs.readFile(path.join(moduleDir, name, "report.json"), "utf8"));
      if (report?.inventory?.sections?.length) return report.inventory;
    } catch {
      // Runs that stopped before inventory have no usable report.
    }
  }
  return null;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function stop(message) {
  console.error(`\n${message}`);
  process.exit(1);
}
