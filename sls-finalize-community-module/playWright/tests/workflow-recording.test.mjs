import assert from "node:assert/strict";
import test from "node:test";
import { repairUndeclaredPages } from "../src/workflow-recording.mjs";

test("repairs an undeclared tab emitted by Codegen", () => {
  const input = `test('demo', async ({ page }) => {
  await page.goto('https://source.example/');
  await page1.goto('https://destination.example/');
});`;

  const result = repairUndeclaredPages(input);

  assert.deepEqual(result.repairedPages, ["page1"]);
  assert.match(result.source, /async \(\{ page, context \}\) =>/);
  assert.match(result.source, /const page1 = await context\.newPage\(\);\n  await page1\.goto/);
});

test("does not alter a recording whose second page is already declared", () => {
  const input = `test('demo', async ({ page, context }) => {
  const page1 = await context.newPage();
  await page1.goto('https://destination.example/');
});`;

  const result = repairUndeclaredPages(input);

  assert.deepEqual(result.repairedPages, []);
  assert.equal(result.source, input);
});

test("repairs each undeclared page immediately before its first use", () => {
  const input = `test('demo', async ({ page }) => {
  await page2.goto('https://two.example/');
  await page1.goto('https://one.example/');
});`;

  const result = repairUndeclaredPages(input);

  assert.deepEqual(result.repairedPages, ["page2", "page1"]);
  assert.match(result.source, /const page2 = await context\.newPage\(\);/);
  assert.match(result.source, /const page1 = await context\.newPage\(\);/);
});
