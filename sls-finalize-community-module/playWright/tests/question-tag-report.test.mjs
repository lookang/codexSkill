import assert from "node:assert/strict";
import test from "node:test";
import {
  isQuestionRunComplete,
  proposalForReport,
  summarizeQuestionResults,
  summarizeReportSections
} from "../src/question-tag-report.mjs";

test("proposal reports retain tied candidates and serializable feature evidence", () => {
  const report = proposalForReport({
    decision: "skip",
    reason: "2 outcomes tied",
    tiedCount: 2,
    candidates: [
      { contentMap: "Pri 4 Mathematics (2021)", outcome: "decimal place value", score: 7 },
      { contentMap: "Pri 6 Mathematics (2021)", outcome: "ratio notation", score: 7 }
    ],
    features: {
      clean: "Find the value",
      operations: new Set(["add"]),
      operands: new Set(["fraction"]),
      topics: new Set(["place value"])
    }
  });

  assert.equal(report.candidates.length, 2);
  assert.deepEqual(report.features.operations, ["add"]);
  assert.deepEqual(report.features.topics, ["place value"]);
  assert.doesNotThrow(() => JSON.stringify(report));
});

test("question summaries distinguish tagged, skipped, and failed questions", () => {
  const summary = summarizeQuestionResults([
    { id: "1", status: "tagged" },
    { id: "2", status: "already-tagged" },
    { id: "3", status: "skipped" },
    { id: "4", status: "error" }
  ]);

  assert.deepEqual(summary, {
    total: 4,
    newlyTagged: 1,
    alreadyTagged: 1,
    partiallyTagged: 0,
    skipped: 1,
    errors: 1,
    notTargeted: 0,
    notRequested: 0,
    fullyTagged: 2,
    unresolved: 2
  });
  assert.equal(isQuestionRunComplete(summary), false);
});

test("module summaries aggregate the actual per-question records", () => {
  const summary = summarizeReportSections([
    { activities: [{ questions: [{ status: "tagged" }, { status: "skipped" }] }] },
    { activities: [{ questions: [{ status: "already-tagged" }] }] }
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.fullyTagged, 2);
  assert.equal(summary.skipped, 1);
});
