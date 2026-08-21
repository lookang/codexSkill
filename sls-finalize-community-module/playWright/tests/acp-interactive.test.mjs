import assert from "node:assert/strict";
import test from "node:test";
import { assessAcpPage, normalizeAcpOptions, normalizeQuestionText } from "../src/acp-interactive.mjs";

test("one unserved FA Math question is an ACP candidate", () => {
  const question = { number: 1, text: "Write 180 min in hours." };
  assert.deepEqual(assessAcpPage({ faQuestions: [question], completedInteractives: 0 }), {
    status: "candidate",
    reason: "one FA Math question needs one ACP interactive",
    question,
  });
});

test("an existing interactive makes a one-question page complete", () => {
  const result = assessAcpPage({
    faQuestions: [{ number: 1, text: "Write 180 min in hours." }],
    completedInteractives: 1,
  });
  assert.equal(result.status, "complete");
});

test("multiple FA Math questions on one page are guarded", () => {
  const result = assessAcpPage({
    faQuestions: [{ text: "Q1" }, { text: "Q2" }],
    completedInteractives: 0,
  });
  assert.equal(result.status, "blocked");
  assert.match(result.reason, /page breaks/i);
});

test("question text is compacted before it becomes a prompt topic", () => {
  assert.equal(
    normalizeQuestionText("Q1  Write   180 min in hours.  FEEDBACK ASSISTANT boilerplate"),
    "Write 180 min in hours.",
  );
});

test("the demonstrated Primary 5-6 Mathematics prompt defaults are retained", () => {
  assert.deepEqual(normalizeAcpOptions(), {
    grade: "Primary 5-6",
    subject: "Mathematics",
    generationTimeoutMs: 600000,
    maximumInteractives: 100,
  });
});
