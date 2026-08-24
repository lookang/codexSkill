import test from "node:test";
import assert from "node:assert/strict";
import { featureScore, looksMathematical, mathFeatures, stripBoilerplate } from "../src/math-features.mjs";

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

test("an en dash in an activity title is punctuation, not subtraction", () => {
  const features = mathFeatures("Length – Convert from smaller unit to larger unit");
  assert.ok(!features.operations.has("subtract"));
});

test("mass conversion is understood as measurement, not fractions", () => {
  const features = mathFeatures("Convert 3 kg 250 g to grams.");
  assert.ok(features.topics.has("measurement"));
  assert.ok(features.topics.has("mass"));
  assert.ok(features.topics.has("compound units"));
  assert.ok(features.topics.has("unit conversion"));
  assert.ok(!features.operands.has("fraction"));
});

test("length conversion written as an equality is understood", () => {
  const features = mathFeatures("4 m 25 cm = ____ cm");
  assert.ok(features.topics.has("length"));
  assert.ok(features.topics.has("unit conversion"));
});

test("the litre symbol used by live SLS questions is understood", () => {
  const features = mathFeatures("Write 79 ℓ 888 ml in ml.");
  assert.ok(features.topics.has("liquid volume"));
  assert.ok(features.topics.has("compound units"));
  assert.ok(features.topics.has("unit conversion"));
});

test("fraction-decimal representation questions are mathematical", () => {
  const liveFractionStem = "Express 19 100 \\frac{19}{100} 100 19 as a decimal.";
  const liveDecimalStem = "Express 0 . 1 0\\text{.}1 0 . 1 as a fraction.";
  const liveMixedNumberStem = "Express 3 . 9 3\\text{.}9 3 . 9 as a mixed number in its simplest form.";

  assert.equal(looksMathematical(liveFractionStem), true);
  assert.ok(mathFeatures(liveFractionStem).topics.has("fraction to decimal"));
  assert.equal(looksMathematical(liveDecimalStem), true);
  assert.ok(mathFeatures(liveDecimalStem).topics.has("decimal to fraction"));
  assert.equal(looksMathematical(liveMixedNumberStem), true);
  assert.ok(mathFeatures(liveMixedNumberStem).topics.has("decimal to fraction"));
  assert.equal(looksMathematical("How did the feedback help me express my thinking?"), false);
});

test("expanded decimal notation is recognised as decimal place value", () => {
  const liveStem =
    "Find the value of 10 + 4 10 + 5 1000 10+ \\frac{4}{10}+ \\frac{5}{1000} 10 + 10 4";
  const features = mathFeatures(liveStem);

  assert.ok(features.operations.has("add"));
  assert.ok(features.topics.has("place value"));
  assert.ok(features.topics.has("decimal place value"));
  assert.ok(features.operands.has("decimal"));
});

test("one fraction with denominator 10 remains an ordinary fractions question", () => {
  const features = mathFeatures("1/10 + 2/5");
  assert.ok(features.operands.has("fraction"));
  assert.ok(!features.topics.has("decimal place value"));
});

test("a digit-place-value stem is recognised as whole-number mathematics", () => {
  const features = mathFeatures("In 418 672, what does the digit 4 stand for?");
  assert.ok(features.topics.has("place value"));
  assert.ok(features.operands.has("whole number"));
  assert.equal(looksMathematical("In 418 672, what does the digit 4 stand for?"), true);
});

test("a pie-chart subquestion is recognised as interpreting represented data", () => {
  const features = mathFeatures(
    "There were 100 students who ate apples. How many students ate papaya? " +
      "[Shared stimulus: The pie chart below shows the type of fruits students ate.]"
  );
  assert.ok(features.topics.has("data representation"));
  assert.ok(features.topics.has("pie chart"));
  assert.ok(features.topics.has("interpret data"));
  assert.equal(looksMathematical("The pie chart below shows the fruits students ate."), true);
});

test("completing a table remains distinct from interpreting a chart", () => {
  const features = mathFeatures("Complete the table from the given data.");
  assert.ok(features.topics.has("table"));
  assert.ok(features.topics.has("complete table"));
  assert.ok(!features.topics.has("interpret data"));
});

test("a straight-line diagram question is recognised as angle mathematics", () => {
  const features = mathFeatures("AOB is a straight line. Find the value of a.");
  assert.ok(features.topics.has("angle"));
  assert.ok(features.topics.has("straight-line angles"));
  assert.equal(looksMathematical("AOB is a straight line. Find the value of a."), true);
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
