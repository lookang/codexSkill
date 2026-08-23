import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  isReusableSlsAuthFailure,
  isSelectedWorkflowChild,
  parseSelectedWorkflowSteps,
  SELECTED_WORKFLOW_CHILD_FLAG,
} from "../src/selected-workflow.mjs";

test("AUTO selects every stage in the safe canonical order", () => {
  assert.deepEqual(
    parseSelectedWorkflowSteps("AUTO").map((stage) => stage.id),
    [
      "automation",
      "remove-copy",
      "page-break",
      "acp-interactive",
      "thumbnail",
      "gamification",
      "add-teacher",
    ],
  );
});

test("a numeric subset is accepted and reordered safely", () => {
  assert.deepEqual(
    parseSelectedWorkflowSteps("3, 1").map((stage) => stage.id),
    ["automation", "thumbnail"],
  );
});

test("friendly stage names and plus signs are accepted", () => {
  assert.deepEqual(
    parseSelectedWorkflowSteps("gamify + acp + teacher").map((stage) => stage.id),
    ["acp-interactive", "gamification", "add-teacher"],
  );
});

test("new numeric choices map to the requested launchers", () => {
  assert.deepEqual(
    parseSelectedWorkflowSteps("4,5,6,7").map((stage) => [stage.number, stage.id]),
    [
      ["7", "remove-copy"],
      ["5", "acp-interactive"],
      ["4", "gamification"],
      ["6", "add-teacher"],
    ],
  );
});

test("numeric ranges can be combined with another choice", () => {
  assert.deepEqual(
    parseSelectedWorkflowSteps("1-4,6").map((stage) => stage.number),
    ["1", "2", "3", "4", "6"],
  );
});

test("a full stop can separate a range from another choice", () => {
  assert.deepEqual(
    parseSelectedWorkflowSteps("1-4.6").map((stage) => stage.number),
    ["1", "2", "3", "4", "6"],
  );
});

test("descending and out-of-menu ranges are rejected clearly", () => {
  assert.throws(() => parseSelectedWorkflowSteps("4-1"), /lower choice/);
  assert.throws(() => parseSelectedWorkflowSteps("1-8"), /choice 8/);
});

test("remove-copy aliases run immediately after automation", () => {
  assert.deepEqual(
    parseSelectedWorkflowSteps("page + cleanup + automation").map((stage) => stage.id),
    ["automation", "remove-copy", "page-break"],
  );
});

test("an unknown stage is rejected instead of silently ignored", () => {
  assert.throws(() => parseSelectedWorkflowSteps("1,delete"), /Unknown stage/);
});

test("only coordinated child processes recognize the selected-workflow mode", () => {
  assert.equal(SELECTED_WORKFLOW_CHILD_FLAG, "--selected-workflow");
  assert.equal(isSelectedWorkflowChild(["--url", "SLS-URL", SELECTED_WORKFLOW_CHILD_FLAG]), true);
  assert.equal(isSelectedWorkflowChild(["--url", "SLS-URL"]), false);
});

test("the coordinator retries only reusable SLS authentication failures", () => {
  assert.equal(
    isReusableSlsAuthFailure(
      "SLS authentication is required. Run npm.cmd run sls:auth and sign in manually.",
    ),
    true,
  );
  assert.equal(
    isReusableSlsAuthFailure("The reusable SLS session expired. Selected workflow stopped."),
    true,
  );
  assert.equal(
    isReusableSlsAuthFailure(
      "This is an upstream Authoring Copilot authentication failure, not an expired SLS login.",
    ),
    false,
  );
  assert.equal(isReusableSlsAuthFailure("An ambiguous curriculum stopped the run."), false);
});

test("the selected coordinator refreshes authentication once and retries the same stage", async () => {
  const coordinator = await fs.readFile(
    new URL("../scripts/selected-workflow.mjs", import.meta.url),
    "utf8",
  );
  assert.match(coordinator, /isReusableSlsAuthFailure\(result\.output\)/);
  assert.match(coordinator, /\["scripts\/auth\.mjs", "--url", target\.sourceUrl\]/);
  assert.match(coordinator, /Authentication refreshed\. Retrying/);
});

test("the selected workflow exposes the automatic remove-copy launcher", async () => {
  const coordinator = await fs.readFile(new URL("../scripts/selected-workflow.mjs", import.meta.url), "utf8");
  const removeCopy = await fs.readFile(new URL("../scripts/remove-copy.mjs", import.meta.url), "utf8");

  assert.equal(parseSelectedWorkflowSteps("7")[0].script, "scripts/remove-copy.mjs");
  assert.match(coordinator, /check all seven/i);
  assert.match(removeCopy, /isSelectedWorkflowChild\(args\)/);
  assert.match(removeCopy, /coordinator can refresh authentication and retry this stage/);
});

test("every selected child recognizes coordinated no-pause mode", async () => {
  for (const relativePath of [
    "../scripts/one-shot.mjs",
    "../scripts/page-break.mjs",
    "../scripts/acp-interactive.mjs",
    "../scripts/module-action.mjs",
    "../scripts/remove-copy.mjs",
  ]) {
    const source = await fs.readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /isSelectedWorkflowChild/);
  }
});

test("the selected CMD pauses only on failure while individual scripts retain review prompts", async () => {
  const selectedCmd = await fs.readFile(new URL("../RUN-SLS-SELECTED.cmd", import.meta.url), "utf8");
  const pageBreak = await fs.readFile(new URL("../scripts/page-break.mjs", import.meta.url), "utf8");
  assert.match(selectedCmd, /without review pauses or DELETE prompts/i);
  const successBranch = /if "%result%"=="0" \(([\s\S]*?)\) else \(([\s\S]*?)\)/i.exec(selectedCmd);
  assert.ok(successBranch, "the CMD keeps distinct success and failure branches");
  assert.doesNotMatch(successBranch[1], /\bpause\b/i);
  assert.match(successBranch[2], /\bpause\b/i);
  assert.match(successBranch[2], /window remains open only because the workflow did not finish/i);
  assert.match(pageBreak, /Press Enter after reviewing the final Module View/);
  assert.match(pageBreak, /selectedWorkflow\s*\?\s*null/);
});

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
