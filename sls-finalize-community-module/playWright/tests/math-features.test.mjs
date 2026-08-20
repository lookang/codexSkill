import test from "node:test";
import assert from "node:assert/strict";
import { featureScore, mathFeatures, stripBoilerplate } from "../src/math-features.mjs";

const FA_WRAPPER =
  "Q1 Move Up Move Down Find FEEDBACK ASSISTANT Feedback Assistant - Mathematics will " +
  "provide marks and feedback for this question. Read Less MARKS [1] ";

test("FA-Math scaffolding does not register as mathematics", () => {
  const features = mathFeatures(FA_WRAPPER);
  assert.equal(features.operations.size, 0, "the wrapper alone implies no operation");
  assert.doesNotMatch(stripBoilerplate(FA_WRAPPER), /Feedback Assistant/i);
});

test("the hyphen in 'Feedback Assistant - Mathematics' is not read as subtraction", () => {
  assert.ok(!mathFeatures(FA_WRAPPER).operations.has("subtract"));
});

test("a wordless fraction sum is recognised as addition of fractions", () => {
  const features = mathFeatures(`${FA_WRAPPER} 2/5 + 3/7`);
  assert.ok(features.operations.has("add"));
  assert.ok(features.operands.has("fraction"));
});

test("a division question is recognised as division", () => {
  const features = mathFeatures(`${FA_WRAPPER} 3/4 ÷ 2`);
  assert.ok(features.operations.has("divide"));
  assert.ok(features.operands.has("fraction"));
});

test("syllabus wording yields the same features as symbols", () => {
  const outcome = mathFeatures("3.1 adding and subtracting fractions with denominators of given fractions");
  assert.ok(outcome.operations.has("add"));
  assert.ok(outcome.operations.has("subtract"));
  assert.ok(outcome.operands.has("fraction"));
});

test("an addition question scores on the addition outcome, not the division one", () => {
  const question = mathFeatures(`${FA_WRAPPER} 2/5 + 3/7`);
  const adding = mathFeatures("3.1 adding and subtracting fractions with denominators of given fractions");
  const dividing = mathFeatures("1.1 dividing a proper fraction by a whole number without calculator");
  assert.ok(featureScore(question, adding) > featureScore(question, dividing));
  assert.equal(featureScore(question, dividing), 0, "a mismatched operation scores nothing");
});

test("a division question prefers the P6 division outcome", () => {
  const question = mathFeatures(`${FA_WRAPPER} 3/4 ÷ 1/2`);
  const adding = mathFeatures("3.1 adding and subtracting fractions with denominators of given fractions");
  const dividing = mathFeatures("1.2 dividing a whole number/proper fraction by a proper fraction without calculator");
  assert.ok(featureScore(question, dividing) > featureScore(question, adding));
});

test("mixed numbers still match an outcome phrased about fractions", () => {
  const question = mathFeatures("2 1/2 + 1 3/4");
  assert.ok(question.operands.has("mixed number"));
  assert.ok(question.operands.has("fraction"), "specific kinds imply the general one");
});

test("LaTeX from the shadow DOM is understood", () => {
  // SLS renders maths as MathML+LaTeX inside a shadow root; this is what the
  // deep text extraction actually returns.
  const features = mathFeatures("Q1 Find 56+12\\frac{5}{6}+\\frac{1}{2}");
  assert.ok(features.operations.has("add"), "the + between fractions is an addition");
  assert.ok(features.operands.has("fraction"), "\\frac means a fraction");
});

test("LaTeX division and multiplication are understood", () => {
  assert.ok(mathFeatures("\\frac{3}{4}\\div 2").operations.has("divide"));
  assert.ok(mathFeatures("\\frac{2}{3}\\times\\frac{1}{5}").operations.has("multiply"));
});

test("a fractions question is not tagged to a whole-numbers outcome", () => {
  const question = mathFeatures("\\frac{2}{3}\\times\\frac{1}{5}");
  const wholeNumbers = mathFeatures(
    "Number and Algebra Whole Numbers Four operations 3.1 multiplication algorithm up to 4 digits by 1 digit"
  );
  assert.equal(
    featureScore(question, wholeNumbers),
    0,
    "same operation, different kind of number - not a match"
  );
});

test("a fractions question still matches a fractions outcome", () => {
  const question = mathFeatures("\\frac{3}{5}+\\frac{2}{3}");
  const fractions = mathFeatures(
    "Number and Algebra Fractions Addition and subtraction 3.1 adding and subtracting fractions"
  );
  assert.ok(featureScore(question, fractions) > 0);
});
