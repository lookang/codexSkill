import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("the expensive page-break reopen audit is opt-in", async () => {
  const launcher = await fs.readFile(new URL("../RUN-SLS-PAGE-BREAK.cmd", import.meta.url), "utf8");
  const pageBreak = await fs.readFile(new URL("../scripts/page-break.mjs", import.meta.url), "utf8");
  const runner = await fs.readFile(new URL("../src/page-break-runner.mjs", import.meta.url), "utf8");

  assert.match(launcher, /full reopen audit is skipped by default/i);
  assert.match(launcher, /Add --verify/i);
  assert.match(pageBreak, /args\.includes\("--verify"\)/);
  assert.match(pageBreak, /verifyAfterApply,/);
  assert.match(runner, /if \(apply && report\.verificationRequested\)/);
  assert.match(runner, /save response[\s\S]*verified page-count increase/);
});
