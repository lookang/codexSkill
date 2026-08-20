import test from "node:test";
import assert from "node:assert/strict";
import { levelToContentMap, proposeQuestionTag } from "../src/question-tagger.mjs";
import { mathFeatures } from "../src/math-features.mjs";

const entry = (contentMap, outcomePath, outcome) => ({
  contentMap, outcomePath, outcome,
  features: mathFeatures(`${outcomePath.join(" ")} ${outcome}`)
});

const DICT = [
  entry("Pri 4 Mathematics (2021)", ["Number and Algebra", "Fractions", "Addition and subtraction"],
        "3.1 adding and subtracting fractions with denominators of given fractions"),
  entry("Pri 6 Mathematics (2021)", ["Number and Algebra", "Fractions", "Four operations"],
        "1.1 dividing a proper fraction by a whole number without calculator"),
  entry("Pri 3 Mathematics (2021)", ["Number and Algebra", "Fractions", "Addition and subtraction"],
        "2.1 adding and subtracting two related fractions within one whole")
];
const FA = "Q1 Find FEEDBACK ASSISTANT Feedback Assistant - Mathematics will provide marks and feedback for this question. MARKS [1] ";

test("levels map to their 2021 content maps", () => {
  assert.equal(levelToContentMap("Primary 4"), "Pri 4 Mathematics (2021)");
  assert.equal(levelToContentMap("Secondary 1"), null);
});

test("a fraction sum is tagged at the level the question is restricted to", () => {
  const result = proposeQuestionTag(`${FA} 2/5 + 3/7`, DICT, {
    allowedContentMaps: ["Pri 4 Mathematics (2021)", "Pri 6 Mathematics (2021)"]
  });
  assert.equal(result.decision, "tag");
  assert.equal(result.contentMap, "Pri 4 Mathematics (2021)");
  assert.match(result.outcome, /adding and subtracting fractions/);
});

test("a division question is tagged at P6 even though P4 was also allowed", () => {
  const result = proposeQuestionTag(`${FA} 3/4 ÷ 2`, DICT, {
    allowedContentMaps: ["Pri 4 Mathematics (2021)", "Pri 6 Mathematics (2021)"]
  });
  assert.equal(result.decision, "tag");
  assert.equal(result.contentMap, "Pri 6 Mathematics (2021)");
});

test("a tie is resolved by best guess rather than abandoned", () => {
  // P3 and P4 both offer an addition-of-fractions outcome.
  const result = proposeQuestionTag(`${FA} 2/5 + 3/7`, DICT, {
    allowedContentMaps: ["Pri 3 Mathematics (2021)", "Pri 4 Mathematics (2021)"]
  });
  assert.equal(result.decision, "tag");
  assert.equal(result.tiedCount, 2);
  assert.match(result.basis, /equally good/);
});

test("a tie follows what an earlier question in the same activity was tagged with", () => {
  const previousChoices = [
    { contentMap: "Pri 3 Mathematics (2021)", outcome: "2.1 adding and subtracting two related fractions within one whole" }
  ];
  const result = proposeQuestionTag(`${FA} 2/5 + 3/7`, DICT, {
    allowedContentMaps: ["Pri 3 Mathematics (2021)", "Pri 4 Mathematics (2021)"],
    previousChoices
  });
  assert.equal(result.contentMap, "Pri 3 Mathematics (2021)");
  assert.match(result.basis, /earlier question/);
});

test("a reflection prompt is skipped", () => {
  const result = proposeQuestionTag("Q5 Compare your model against the suggested answer.", DICT);
  assert.equal(result.decision, "skip");
});

test("a question whose levels have no harvested map is skipped, not guessed", () => {
  const result = proposeQuestionTag(`${FA} 2/5 + 3/7`, DICT, {
    allowedContentMaps: ["Sec 1 Mathematics (2021)"]
  });
  assert.equal(result.decision, "skip");
  assert.match(result.reason, /no harvested content map/);
});
