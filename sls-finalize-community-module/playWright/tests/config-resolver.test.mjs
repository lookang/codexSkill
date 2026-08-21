import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptCurriculumCandidate,
  applyCurriculumResolution,
  resolveCurriculumFromTaxonomies
} from "../src/config-resolver.mjs";

const placeholder = "REVIEW-BEFORE-RUNNING: choose";
const config = {
  module: { title: "Rate (FA-Math)" },
  defaults: {
    subject: "Mathematics - MATHS",
    level: placeholder,
    contentMap: placeholder,
    outcome: placeholder,
    outcomePath: []
  },
  sections: [
    { title: "Find the Rate", activities: [{ title: "Find the rate" }] },
    { title: "Find the total amount", activities: [{ title: "Find the total amount" }] },
    { title: "Find the number of units", activities: [{ title: "Find the number of units" }] }
  ]
};

const primaryFive = {
  contentMap: "Pri 5 Mathematics (2021)",
  outcomes: [
    {
      outcome: "1.1 rate as the amount of a quantity per unit of another quantity",
      outcomePath: ["Number and Algebra", "Rate and speed", "Rate"]
    },
    {
      outcome: "1.2 finding rate, total amount, or number of units given the other two quantities",
      outcomePath: ["Number and Algebra", "Rate and speed", "Rate"]
    }
  ]
};

const secondary = {
  contentMap: "Sec 1 Mathematics (G2) (2028)",
  outcomes: [
    {
      outcome: "Conversion of units (e.g. km/h to m/s)",
      outcomePath: ["NUMBERS AND ALGEBRA", "Rate and Speed"]
    }
  ]
};

test("a rate module resolves to the exact Primary 5 rate outcome", () => {
  const resolution = resolveCurriculumFromTaxonomies(config, [secondary, primaryFive]);
  assert.equal(resolution.resolved, true);
  assert.equal(resolution.contentMap, "Pri 5 Mathematics (2021)");
  assert.equal(resolution.level, "Primary 5");
  assert.match(resolution.outcome, /finding rate, total amount, or number of units/);

  const filled = applyCurriculumResolution(config, resolution);
  assert.equal(filled.defaults.contentMap, "Pri 5 Mathematics (2021)");
  assert.equal(filled.defaults.level, "Primary 5");
  assert.deepEqual(filled.defaults.outcomePath, ["Number and Algebra", "Rate and speed", "Rate"]);
});

test("an ambiguous module is handed back instead of guessed", () => {
  const ambiguous = structuredClone(config);
  ambiguous.module.title = "Practice";
  ambiguous.sections = [{ title: "Practice", activities: [{ title: "Practice" }] }];
  const resolution = resolveCurriculumFromTaxonomies(ambiguous, [primaryFive, secondary]);
  assert.equal(resolution.resolved, false);
});

test("a reviewed numbered candidate can be accepted without weakening automatic guards", () => {
  const ambiguous = structuredClone(config);
  ambiguous.module.title = "Practice";
  ambiguous.sections = [{ title: "Practice", activities: [{ title: "Practice" }] }];
  const resolution = resolveCurriculumFromTaxonomies(ambiguous, [primaryFive, secondary]);
  assert.equal(resolution.resolved, false);

  const reviewed = acceptCurriculumCandidate(resolution, 1);
  assert.equal(reviewed.resolved, true);
  assert.equal(reviewed.selectedByReview, true);
  assert.equal(reviewed.selectedCandidateNumber, 1);
  assert.equal(reviewed.contentMap, resolution.candidates[0].contentMap);

  const filled = applyCurriculumResolution(ambiguous, reviewed);
  assert.equal(filled.defaults.contentMap, reviewed.contentMap);
  assert.equal(filled.defaults.outcome, reviewed.outcome);
});

test("invalid or cancelled candidate choices do not produce a resolution", () => {
  const resolution = { candidates: [{ contentMap: "Pri 5 Mathematics (2021)" }] };
  assert.equal(acceptCurriculumCandidate(resolution, ""), null);
  assert.equal(acceptCurriculumCandidate(resolution, 0), null);
  assert.equal(acceptCurriculumCandidate(resolution, 2), null);
  assert.equal(acceptCurriculumCandidate(resolution, "one"), null);
});
