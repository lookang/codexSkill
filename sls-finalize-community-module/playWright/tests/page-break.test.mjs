import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PAGE_BREAK_POLICY,
  advancePageBreakScan,
  assessPageForBreak,
  normalizePageBreakPolicy,
} from "../src/page-break.mjs";

const viewportHeight = 1000;

test("a short question page is left unchanged", () => {
  const result = assessPageForBreak({
    viewportHeight,
    contentTop: 100,
    contentBottom: 1200,
    questions: [{ id: "q1", top: 300, bottom: 900, text: "Q1" }],
    dividers: [{ index: 0, top: 250, bottom: 270 }],
  });

  assert.equal(result.needsBreak, false);
  assert.equal(result.longPage, false);
  assert.match(result.reason, /not long enough/);
});

test("a page breaks before its second question regardless of rendered length", () => {
  const result = assessPageForBreak({
    viewportHeight,
    contentTop: 100,
    contentBottom: 1200,
    questions: [
      { id: "q1", top: 200, bottom: 500, text: "Q1 First question" },
      { id: "q2", top: 650, bottom: 1000, text: "Q2 Second question" },
    ],
    dividers: [
      { index: 0, top: 120, bottom: 140 },
      { index: 1, top: 590, bottom: 610 },
    ],
  });

  assert.equal(result.needsBreak, true);
  assert.equal(result.longPage, false);
  assert.equal(result.candidate.dividerIndex, 1);
  assert.equal(result.candidate.questionId, "q2");
  assert.match(result.reason, /each question/);
});

test("three questions separate at Q2 first so iterative application can later separate Q3", () => {
  const firstPass = assessPageForBreak({
    viewportHeight,
    contentTop: 100,
    contentBottom: 1700,
    questions: [
      { id: "q1", top: 150, bottom: 450, text: "Q1" },
      { id: "q2", top: 600, bottom: 950, text: "Q2" },
      { id: "q3", top: 1100, bottom: 1500, text: "Q3" },
    ],
    dividers: [
      { index: 0, top: 540, bottom: 560 },
      { index: 1, top: 1040, bottom: 1060 },
    ],
  });

  assert.equal(firstPass.needsBreak, true);
  assert.equal(firstPass.candidate.questionId, "q2");
  assert.equal(firstPass.candidate.dividerIndex, 0);

  const secondPass = assessPageForBreak({
    viewportHeight,
    contentTop: 600,
    contentBottom: 1700,
    questions: [
      { id: "q2", top: 600, bottom: 950, text: "Q2" },
      { id: "q3", top: 1100, bottom: 1500, text: "Q3" },
    ],
    dividers: [{ index: 0, top: 1040, bottom: 1060 }],
  });

  assert.equal(secondPass.needsBreak, true);
  assert.equal(secondPass.candidate.questionId, "q3");
});

test("a verified split advances the apply scan without revisiting earlier pages", () => {
  const pages = [0, 1, 2, 3, 4, 5].map((pageIndex) => ({
    pageIndex,
    metrics: { questions: [{ id: `q${pageIndex + 1}` }] },
    assessment: {
      blocked: false,
      needsBreak: pageIndex === 4,
      candidate: pageIndex === 4 ? { questionId: "q6" } : null,
      reason: pageIndex === 4 ? "each question starts on its own page" : "already complete",
    },
  }));

  const result = advancePageBreakScan(pages, 4);

  assert.equal(result.nextPageIndex, 5);
  assert.deepEqual(result.completedPages.map((entry) => entry.pageIndex), [0, 1, 2, 3, 4]);
  assert.deepEqual(result.shiftedFollowingPages.map((entry) => entry.pageIndex), [6]);
  assert.equal(result.shiftedFollowingPages[0].metrics.questions[0].id, "q6");
  assert.equal(result.completedPages.at(-1).assessment.needsBreak, false);
  assert.equal(result.completedPages.at(-1).assessment.candidate, null);
  assert.match(result.completedPages.at(-1).assessment.reason, /verified split/);
});

test("forward page scanning rejects a missing split checkpoint", () => {
  assert.throws(() => advancePageBreakScan([{ pageIndex: 0 }], 2), /Page 3 is missing/);
});

test("long introductory material can be separated from the first question", () => {
  const result = assessPageForBreak({
    viewportHeight,
    contentTop: 100,
    contentBottom: 2500,
    questions: [{ id: "q1", top: 1550, bottom: 2200, text: "Q1 Apply the stimulus" }],
    dividers: [
      { index: 0, top: 800, bottom: 820 },
      { index: 1, top: 1490, bottom: 1510 },
    ],
  });

  assert.equal(result.needsBreak, true);
  assert.equal(result.candidate.dividerIndex, 1);
  assert.match(result.reason, /introductory content/);
});

test("multiple questions without a safe divider before Q2 are guarded even on a short page", () => {
  const result = assessPageForBreak({
    viewportHeight,
    contentTop: 100,
    contentBottom: 1200,
    questions: [
      { id: "q1", top: 200, bottom: 500, text: "Q1" },
      { id: "q2", top: 650, bottom: 1000, text: "Q2" },
    ],
    dividers: [{ index: 0, top: 120, bottom: 140 }],
  });

  assert.equal(result.needsBreak, false);
  assert.equal(result.blocked, true);
  assert.match(result.reason, /no safe divider/);
});

test("an existing page-break control is never selected again", () => {
  const result = assessPageForBreak({
    viewportHeight,
    contentTop: 100,
    contentBottom: 2800,
    questions: [
      { id: "q1", top: 200, bottom: 900, text: "Q1" },
      { id: "q2", top: 1700, bottom: 2400, text: "Q2" },
    ],
    dividers: [{ index: 0, top: 1640, bottom: 1660, existingBreak: true }],
  });

  assert.equal(result.needsBreak, false);
  assert.equal(result.blocked, true);
});

test("policy validation keeps the safety bounds", () => {
  assert.deepEqual(normalizePageBreakPolicy(), DEFAULT_PAGE_BREAK_POLICY);
  assert.throws(
    () => normalizePageBreakPolicy({ maximumBreaksPerActivity: 0 }),
    /between 1 and 100/,
  );
  assert.throws(
    () => normalizePageBreakPolicy({ targetChunkViewports: 7 }),
    /between 0.5 and 5/,
  );
});
