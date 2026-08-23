import test from "node:test";
import assert from "node:assert/strict";
import { flattenMathml, mathFeatures, featureScore, looksMathematical } from "../src/math-features.mjs";
import { proposeQuestionTag } from "../src/question-tagger.mjs";

// The exact MathML WIRIS embeds in the data-URI SVG for "Solve 7x = 3x + 8",
// taken from a real scan trace of a Sec 1 module.
const SOLVE_7X = [
  '<math xmlns="http://www.w3.org/1998/Math/MathML">',
  "<mn>7</mn><mi>x</mi><mo>=</mo><mn>3</mn><mi>x</mi><mo>+</mo><mn>8</mn>",
  "</math>"
].join("");

test("flattenMathml recovers the equation a WIRIS image draws", () => {
  assert.equal(flattenMathml(`Solve ${SOLVE_7X}.`), "Solve 7x=3x+8 .");
});

test("flattenMathml keeps an index distinguishable from a two-digit number", () => {
  const squared = "<math><msup><mi>x</mi><mn>2</mn></msup></math>";
  assert.match(flattenMathml(squared), /\^/);
});

test("flattenMathml leaves text without mathematics alone", () => {
  assert.equal(flattenMathml("How many were left?"), "How many were left?");
});

test("a solve-the-equation question reads as one, not as an addition", () => {
  const features = mathFeatures(`Q1 Solve ${SOLVE_7X}.`);
  assert.ok(features.topics.has("solve"), "expected the solve topic");
  assert.ok(features.topics.has("equation"), "expected the equation topic");
  assert.ok(features.topics.has("variable"), "expected the variable topic");
});

// A hermetic stand-in for the Sec 1 content map, built the same way the harvested
// dictionaries are, so the test does not depend on a taxonomy file.
const outcome = (text, path) => ({
  contentMap: "Sec 1 Mathematics (G2) (2020)",
  outcome: text,
  outcomePath: path,
  features: mathFeatures(`${path.join(" ")} ${text}`)
});

const SEC1 = [
  outcome("Solving linear equations with integral coefficients in one variable", [
    "NUMBERS AND ALGEBRA",
    "Equations and inequalities"
  ]),
  outcome("Formulating a linear equation in one variable to solve problems", [
    "NUMBERS AND ALGEBRA",
    "Equations and inequalities"
  ]),
  outcome("Addition and subtraction of linear expressions", ["NUMBERS AND ALGEBRA", "Algebraic expressions"])
];

test("solving an equation beats the linear-expressions outcome that shares its plus sign", () => {
  const result = proposeQuestionTag(`Q1 Solve ${SOLVE_7X}.`, SEC1, {
    allowedContentMaps: ["Sec 1 Mathematics (G2) (2020)"],
    previousChoices: []
  });
  assert.equal(result.decision, "tag");
  assert.equal(result.outcome, "Solving linear equations with integral coefficients in one variable");
});

test("a bare equation is not read as a word problem", () => {
  const question = mathFeatures(`Q1 Solve ${SOLVE_7X}.`);
  const solving = featureScore(question, SEC1[0].features);
  const formulating = featureScore(question, SEC1[1].features);
  assert.ok(
    solving > formulating,
    `expected solving (${solving}) to beat formulating (${formulating}) on a question with no word problem`
  );
});

test("an equation with no trusted operation still tags on its topic alone", () => {
  // "-" is deliberately not treated as subtraction, so 8z = 11 - 2z carries no
  // operation at all. It is still plainly a linear equation to solve.
  const q = "Q4 Solve <math><mn>8</mn><mi>z</mi><mo>=</mo><mn>11</mn><mo>-</mo><mn>2</mn><mi>z</mi></math>.";
  assert.equal(mathFeatures(q).operations.size, 0);
  const result = proposeQuestionTag(q, SEC1, {
    allowedContentMaps: ["Sec 1 Mathematics (G2) (2020)"],
    previousChoices: []
  });
  assert.equal(result.decision, "tag");
  assert.equal(result.outcome, "Solving linear equations with integral coefficients in one variable");
});

test("a question with neither an operation nor a topic is still refused", () => {
  const result = proposeQuestionTag("Q9 Write your reflection below.", SEC1, {
    allowedContentMaps: ["Sec 1 Mathematics (G2) (2020)"],
    previousChoices: []
  });
  assert.equal(result.decision, "skip");
});

// Percentage change: the syllabus has an outcome named exactly "Finding percentage
// increase/decrease", but the question names no operation this extractor trusts and
// no algebra, so it used to be dropped as having no mathematics at all.
const PERCENT_UP =
  "The price of a mobile phone increased from $250 to $325. Find the percentage increase. " +
  "(% notation is required at every step where needed.)";
const PERCENT_DOWN =
  "The population of a town decreases from 3600 to 2700 . Find the percentage decrease. " +
  "(% notation is required at every step where needed.)";

const PERCENT_MAP = [
  outcome("Finding percentage increase/decrease", ["Number and Algebra", "Percentage"]),
  outcome("Increasing/decreasing a quantity by a given percentage", ["Number and Algebra", "Percentage"]),
  outcome("Expressing percentage as a fraction or decimal", ["Number and Algebra", "Percentage"])
].map((entry) => ({ ...entry, contentMap: "Sec 1 Mathematics (G1) (2028)" }));

test("a percentage-increase question finds the outcome named after it", () => {
  const result = proposeQuestionTag(PERCENT_UP, PERCENT_MAP, {
    allowedContentMaps: ["Sec 1 Mathematics (G1) (2028)"],
    previousChoices: []
  });
  assert.equal(result.decision, "tag");
  assert.equal(result.outcome, "Finding percentage increase/decrease");
});

test("a percentage-decrease question finds the same outcome", () => {
  const result = proposeQuestionTag(PERCENT_DOWN, PERCENT_MAP, {
    allowedContentMaps: ["Sec 1 Mathematics (G1) (2028)"],
    previousChoices: []
  });
  assert.equal(result.decision, "tag");
  assert.equal(result.outcome, "Finding percentage increase/decrease");
});

test("finding a percentage change beats merely applying one", () => {
  const question = mathFeatures(PERCENT_UP);
  assert.ok(
    featureScore(question, PERCENT_MAP[0].features) > featureScore(question, PERCENT_MAP[1].features),
    "\"Finding percentage increase/decrease\" should beat \"Increasing/decreasing a quantity\""
  );
});

// Learning Progress follows the same rule as tagging: marks alone are not enough,
// because a reflection prompt can award a mark and still assess no mathematics.
test("mathematical questions qualify for Learning Progress", () => {
  assert.equal(looksMathematical(PERCENT_UP), true);
  assert.equal(looksMathematical(PERCENT_DOWN), true);
  assert.equal(looksMathematical("Solve 7x=3x+8"), true);
});

test("reflection prompts do not qualify, even when they award marks", () => {
  assert.equal(looksMathematical("How did the hints/feedback help me?"), false);
  assert.equal(looksMathematical("What changes will I make in my next attempt?"), false);
  assert.equal(looksMathematical("What error(s) did I make?"), false);
});

const ANGLES_MAP = [
  outcome("Right, acute, obtuse and reflex angles", [
    "Geometry and Measurement",
    "Angles, triangles and quadrilaterals"
  ]),
  outcome("Vertically opposite angles, angles on a straight line and angles at a point", [
    "Geometry and Measurement",
    "Angles, triangles and quadrilaterals"
  ]),
  outcome("Angles formed by two parallel lines and a transversal: corresponding angles, alternate angles, interior angles", [
    "Geometry and Measurement",
    "Angles, triangles and quadrilaterals"
  ])
].map((entry) => ({ ...entry, contentMap: "Sec 1 Mathematics (G1) (2020) - 2020" }));

test("a straight-line angle stem chooses the exact angle-relationship outcome", () => {
  const stem = "AOB is a straight line. Find the value of a.";
  const result = proposeQuestionTag(stem, ANGLES_MAP, {
    allowedContentMaps: ["Sec 1 Mathematics (G1) (2020) - 2020"],
    contextText: "Chapter 6 Angles"
  });
  assert.equal(result.decision, "tag");
  assert.equal(
    result.outcome,
    "Vertically opposite angles, angles on a straight line and angles at a point"
  );
  assert.equal(looksMathematical(stem), true);
});
