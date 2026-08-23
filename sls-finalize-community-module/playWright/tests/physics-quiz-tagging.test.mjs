import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  proposeQuestionTag,
  questionStemFromSettingsCardText
} from "../src/question-tagger.mjs";
import { mathFeatures } from "../src/math-features.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  await fs.readFile(
    path.join(root, "configs", "physics-8867-paper-1-best-practice-for-using-ai-tools-to-cop.json"),
    "utf8"
  )
);
const taxonomy = JSON.parse(
  await fs.readFile(path.join(root, "taxonomy", "pre-u-physics-h2-2025.json"), "utf8")
);
const dictionary = taxonomy.outcomes
  .filter((entry) => entry.outcomePath?.length)
  .map((entry) => ({
    contentMap: taxonomy.contentMap,
    outcome: entry.outcome,
    outcomePath: entry.outcomePath,
    features: mathFeatures(`${entry.outcomePath.join(" ")} ${entry.outcome}`)
  }));
const quiz = config.sections[0].activities.find((activity) => activity.id === "84503845");

test("the reviewed 30-question Physics mapping is complete and resolves uniquely", () => {
  assert.equal(quiz.expectedQuestionCount, 30);
  assert.deepEqual(
    Object.keys(quiz.reviewedOutcomePrefixes).map(Number),
    Array.from({ length: 30 }, (_, index) => index + 1)
  );

  for (const [number, reviewedOutcomePrefix] of Object.entries(quiz.reviewedOutcomePrefixes)) {
    const result = proposeQuestionTag(
      `Assessed Physics multiple-choice question ${number}.`,
      dictionary,
      {
        allowedContentMaps: [taxonomy.contentMap],
        reviewedOutcomePrefix
      }
    );
    assert.equal(result.decision, "tag", `Q${number}: ${result.reason ?? "not tagged"}`);
    assert.ok(
      result.outcome.startsWith(`${reviewedOutcomePrefix} `),
      `Q${number}: ${result.outcome}`
    );
    assert.match(result.basis, /reviewed question-by-question syllabus mapping/);
  }
});

test("representative reviewed mappings preserve the content decision", () => {
  assert.equal(quiz.reviewedOutcomePrefixes["5"], "3(e)");
  assert.equal(quiz.reviewedOutcomePrefixes["15"], "4(n)");
  assert.equal(quiz.reviewedOutcomePrefixes["23"], "17(f)");
  assert.equal(quiz.reviewedOutcomePrefixes["30"], "20(n)");
});

test("a stale reviewed syllabus code stops instead of selecting a nearby outcome", () => {
  const result = proposeQuestionTag("An assessed Physics question.", dictionary, {
    allowedContentMaps: [taxonomy.contentMap],
    reviewedOutcomePrefix: "99(z)"
  });
  assert.equal(result.decision, "skip");
  assert.match(result.reason, /matched 0 harvested outcomes/);
});

test("quiz settings-card fallback excludes SLS metadata", () => {
  assert.equal(
    questionStemFromSettingsCardText(
      "Q18 A current passes through a meter. Keyword Tags - Question Tags - Authoring Copilot"
    ),
    "A current passes through a meter."
  );
});
