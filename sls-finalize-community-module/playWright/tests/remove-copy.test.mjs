import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { copyBaseTitle, planCopyRemoval } from "../src/remove-copy.mjs";

test("only exact trailing Copy suffixes are recognised", () => {
  assert.equal(copyBaseTitle("Quiz 1 - Copy"), "Quiz 1");
  assert.equal(copyBaseTitle("Quiz 1 - Copy - Copy"), "Quiz 1");
  assert.equal(copyBaseTitle("Copy this quiz"), null);
  assert.equal(copyBaseTitle("Quiz 1 copy"), null);
});

test("an orphaned retained copy is a suffix-removal candidate", () => {
  const plan = planCopyRemoval(["Quiz 1 - Copy", "Lesson 2"]);
  assert.deepEqual(plan.candidates.map((entry) => entry.title), ["Quiz 1 - Copy"]);
  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.ignoredCount, 1);
});

test("a copy is skipped when its clean title already exists", () => {
  const plan = planCopyRemoval(["Quiz 1", "Quiz 1 - Copy"]);
  assert.equal(plan.candidates.length, 0);
  assert.match(plan.skipped[0].reason, /already exists/);
});

test("duplicate exact copy titles are skipped as ambiguous", () => {
  const plan = planCopyRemoval(["Quiz 1", "Quiz 1 - Copy", "Quiz 1 - Copy"]);
  assert.equal(plan.candidates.length, 0);
  assert.equal(plan.skipped.length, 2);
  assert.match(plan.skipped[0].reason, /2 activities share/);
});

test("multiple clean base titles still prevent a colliding rename", () => {
  const plan = planCopyRemoval(["Quiz 1", "Quiz 1", "Quiz 1 - Copy"]);
  assert.equal(plan.candidates.length, 0);
  assert.match(plan.skipped[0].reason, /already exists/);
});

test("a repeated copy suffix is removed back to the clean base", () => {
  const plan = planCopyRemoval(["Quiz 1 - Copy - Copy"]);
  assert.equal(plan.candidates[0].baseTitle, "Quiz 1");
});

test("different copy depths that resolve to one base are skipped", () => {
  const plan = planCopyRemoval(["Quiz 1 - Copy", "Quiz 1 - Copy - Copy"]);
  assert.equal(plan.candidates.length, 0);
  assert.match(plan.skipped[0].reason, /would all become/);
});

test("normal copy-suffix cleanup applies safe candidates without typed confirmation", async () => {
  const launcher = await fs.readFile(new URL("../RUN-SLS-REMOVE-COPY.cmd", import.meta.url), "utf8");
  const script = await fs.readFile(new URL("../scripts/remove-copy.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(launcher, /REMOVE COPY SUFFIXES/);
  assert.doesNotMatch(script, /REMOVE COPY SUFFIXES/);
  assert.match(launcher, /continue automatically/i);
  assert.match(script, /Continuing automatically with the safe suffix-removal candidates/);
  assert.match(script, /holdOpen:\s*null/);
});
