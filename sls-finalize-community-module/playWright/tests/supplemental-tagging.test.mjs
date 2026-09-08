import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, mergeDefaults, subjectForContentMap } from "../src/io.mjs";
import {
  exactSupplementalProposal,
  mirroredSupplementalProposal,
  secondaryFiveG2MirrorTarget,
  supplementalSectionTagPlan,
  supplementalOutcomesForQuestion
} from "../src/supplemental-tagging.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

test("reviewed Word mappings can target exact question numbers", () => {
  const activity = {
    supplementalQuestionOutcomes: [
      { contentMap: "P5", outcome: "decimal", questionNumbers: [1, 2, 10] },
      { contentMap: "P6", outcome: "division", questionNumbers: [9, 11] }
    ]
  };
  assert.deepEqual(
    supplementalOutcomesForQuestion(activity, 10).map((entry) => entry.contentMap),
    ["P5"]
  );
  assert.deepEqual(
    supplementalOutcomesForQuestion(activity, 9).map((entry) => entry.contentMap),
    ["P6"]
  );
});

test("reviewed supplemental outcomes become one additive section plan", () => {
  const plan = supplementalSectionTagPlan([
    {
      supplementalQuestionOutcomes: [
        {
          subject: "Foundation Mathematics - FMATHS",
          level: "Primary 6",
          contentMap: "Pri 6 Foundation Mathematics (2021)",
          outcome: "1.1 expressing a part of a whole as a percentage",
          source: "ETD exemplar"
        }
      ]
    },
    {
      supplementalQuestionOutcomes: [
        {
          subject: "Foundation Mathematics - FMATHS",
          level: "Primary 6",
          contentMap: "Pri 6 Foundation Mathematics (2021)",
          outcome: "1.1 expressing a part of a whole as a percentage",
          source: "ETD exemplar"
        }
      ]
    }
  ]);

  assert.equal(plan.copyable, true);
  assert.deepEqual(plan.subjectLevels, [
    { subject: "Foundation Mathematics - FMATHS", level: "Primary 6" }
  ]);
  assert.deepEqual(plan.contentMaps, ["Pri 6 Foundation Mathematics (2021)"]);
  assert.equal(plan.maps[0].outcomes.length, 1, "duplicate reviewed outcomes are collapsed");
});

test("empty or incomplete supplemental mappings do not create a section plan", () => {
  assert.equal(supplementalSectionTagPlan([]).copyable, false);
  assert.equal(supplementalSectionTagPlan([{
    supplementalQuestionOutcomes: [{
      subject: "Foundation Mathematics - FMATHS",
      level: "Primary 5",
      contentMap: "",
      outcome: "fraction as part of a set"
    }]
  }]).copyable, false);
});

test("Sec 3 and 4 Mathematics enables an additive Secondary 5 G2 mirror", () => {
  const target = secondaryFiveG2MirrorTarget({
    contentMaps: [
      "Sec 3 & 4 Mathematics (G3) (2020)",
      "Sec 3 & 4 Additional Mathematics (G3) (2020)"
    ]
  });
  assert.equal(target.subject, "Mathematics - G2MATHS");
  assert.equal(target.level, "Secondary 5");
  assert.equal(target.contentMap, "Sec 5 Mathematics (G2) (2020)");
});

test("Additional Mathematics alone never enables the Secondary 5 G2 mirror", () => {
  assert.equal(
    secondaryFiveG2MirrorTarget({
      contentMaps: ["Sec 3 & 4 Additional Mathematics (G3) (2020)"]
    }),
    null
  );
});

test("reviewed and mirrored outcomes require one exact target-map outcome", () => {
  const dictionaries = [
    {
      contentMap: "Pri 5 Foundation Mathematics (2021)",
      outcome: "1.2 fraction as part of a set",
      outcomePath: ["Number and Algebra", "Fractions", "Concepts of Fractions"]
    },
    {
      contentMap: "Sec 5 Mathematics (G2) (2020)",
      outcome: "Display of information in the form of a matrix of any order",
      outcomePath: ["NUMBERS AND ALGEBRA", "Matrices"]
    }
  ];
  const reviewed = exactSupplementalProposal({
    contentMap: "Pri 5 Foundation Mathematics (2021)",
    outcome: "1.2 fraction as part of a set",
    source: "ETD exemplar"
  }, dictionaries);
  assert.deepEqual(reviewed.outcomePath, ["Number and Algebra", "Fractions", "Concepts of Fractions"]);

  const target = secondaryFiveG2MirrorTarget({
    contentMaps: ["Sec 3 & 4 Mathematics (G3) (2020)"]
  });
  const mirrored = mirroredSupplementalProposal({
    contentMap: "Sec 3 & 4 Mathematics (G3) (2020)",
    outcome: "Display of information in the form of a matrix of any order"
  }, target, dictionaries);
  assert.equal(mirrored.contentMap, "Sec 5 Mathematics (G2) (2020)");
  assert.equal(mirrored.outcome, "Display of information in the form of a matrix of any order");
});

test("Foundation Mathematics content maps select the FMATHS subject", () => {
  assert.equal(
    subjectForContentMap("Pri 6 Foundation Mathematics (2021)", "Mathematics - MATHS"),
    "Foundation Mathematics - FMATHS"
  );
});

test("all five ETD-matched module configs validate and inherit reviewed mappings", async () => {
  const files = [
    "percentages-fa-maths.json",
    "rate-fa-math.json",
    "fractions-of-a-set-of-objects-fa-maths.json",
    "fractions-and-decimals-fa-math.json",
    "unit-conversion-length-mass-volume-fa-math.json"
  ];
  for (const file of files) {
    const config = mergeDefaults(await loadConfig(path.join(root, "configs", file)));
    const reviewedCount = config.sections.flatMap((section) => section.activities)
      .reduce((count, activity) => count + activity.supplementalQuestionOutcomes.length, 0);
    assert.ok(reviewedCount > 0, `${file} should contain reviewed supplemental tagging`);
  }
});
