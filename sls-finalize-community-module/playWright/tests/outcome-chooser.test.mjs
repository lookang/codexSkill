import test from "node:test";
import assert from "node:assert/strict";
import { chooseOutcome, outcomeProposalIsWritable, tokenize } from "../src/outcome-chooser.mjs";

// Shape as harvested from SLS: dispositional entries have an empty path,
// content outcomes carry the branch path that reaches them.
const P4 = [
  { outcome: "Acquire mathematical concepts and skills for everyday use and continuous learning in mathematics", outcomePath: [] },
  { outcome: "Develop thinking, reasoning, communication, application and metacognitive skills through a mathematical approach to problem-solving", outcomePath: [] },
  { outcome: "Build confidence and foster interest in mathematics", outcomePath: [] },
  { outcome: "1.1 reading and writing numbers in numerals and in words", outcomePath: ["Number and Algebra", "Whole Numbers", "Numbers up to 100 000"] },
  { outcome: "2.1 word problems involving the 4 operations", outcomePath: ["Number and Algebra", "Whole Numbers", "Four Operations"] },
  { outcome: "2.2 order of operations without calculator", outcomePath: ["Number and Algebra", "Whole Numbers", "Four Operations"] },
  { outcome: "3.1 adding and subtracting like fractions", outcomePath: ["Number and Algebra", "Fractions", "Four operations"] }
];

test("a confidence check is tagged to the dispositional outcome, not a content skill", () => {
  const picked = chooseOutcome(P4, {
    moduleTitle: "AST FA-Math P4 Operations of whole numbers - Word Problem (internal transfer, total given)",
    sectionTitle: "Pre-Lesson and Digital Literacy",
    questionText: "I am confident that I can do the questions."
  });
  assert.match(picked.outcome, /problem-solving/);
  assert.deepEqual(picked.outcomePath, []);
  assert.match(picked.reason, /reflective or orientation/);
});

test("a whole-number word-problem section picks the word-problem content outcome", () => {
  const picked = chooseOutcome(P4, {
    moduleTitle: "AST FA-Math P4 Operations of whole numbers - Word Problem (internal transfer, total given)",
    sectionTitle: "Let's practise",
    questionText:
      "Ali had 240 stickers. He gave 60 to his brother and shared the rest equally among 4 friends. " +
      "How many stickers did each friend receive? Show your working for the operations used."
  });
  assert.equal(picked.outcome, "2.1 word problems involving the 4 operations");
  assert.deepEqual(picked.outcomePath, ["Number and Algebra", "Whole Numbers", "Four Operations"]);
});

test("a section whose questions add no signal is handed back, not guessed", () => {
  // The module title alone matches "Four Operations" for both 2.1 and 2.2, so
  // there is nothing to choose between them.
  const picked = chooseOutcome(P4, {
    moduleTitle: "AST FA-Math P4 Operations of whole numbers",
    sectionTitle: "Section C",
    questionText: "zzz qqq"
  });
  assert.match(picked.outcome, /problem-solving/);
  assert.match(picked.reason, /tied/);
  assert.ok(picked.alternatives.length >= 2, "the tied candidates are surfaced for review");
  assert.equal(outcomeProposalIsWritable(picked), false);
});

test("an intentional reflective outcome may be written", () => {
  const picked = chooseOutcome(P4, {
    moduleTitle: "P4 Mathematics",
    sectionTitle: "Pre-Lesson reflection",
    questionText: "I am confident."
  });
  assert.equal(outcomeProposalIsWritable(picked), true);
});

test("alternatives are returned so a human can review the runners-up", () => {
  const picked = chooseOutcome(P4, {
    moduleTitle: "P4 whole numbers",
    sectionTitle: "Practice",
    questionText: "word problems involving the 4 operations on whole numbers"
  });
  assert.equal(picked.outcome, "2.1 word problems involving the 4 operations");
  assert.ok(picked.alternatives.length > 0);
});

test("tokenize drops stopwords, punctuation and plurals", () => {
  assert.deepEqual([...tokenize("The questions, and operations!")].sort(), ["operation"]);
});

test("a confidence prompt inside a practice section does not reclassify the section", () => {
  const picked = chooseOutcome(P4, {
    moduleTitle: "AST FA-Math P4 Operations of whole numbers - Word Problem",
    sectionTitle: "Let's practise",
    questionText:
      "I am confident that I can do the questions. " +
      "Ali had 240 stickers and shared them equally. word problems involving the 4 operations."
  });
  assert.equal(picked.outcome, "2.1 word problems involving the 4 operations");
  assert.doesNotMatch(picked.reason, /reflective/);
});
