import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import {
  assessAcpPage,
  assessAcpPreAddState,
  buildAcpSpecificRequirements,
  inferRandomizationSourceValues,
  moduleWideAcpTarget,
  normalizeAcpOptions,
  normalizeQuestionText,
  normalizeRandomizationParameters,
} from "../src/acp-interactive.mjs";
import {
  acpTargetIncludes,
  findAcpPreviewAddButton,
  formatAcpFailureSummary,
  readStableAcpPageState,
  selectTextComponentFromAddMenu,
} from "../src/acp-interactive-runner.mjs";

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

test("hydrated AlgebraKit duplicates do not repeat rendered number values", () => {
  assert.equal(
    normalizeQuestionText("John has 17 17 17 apples and receives 9 9 9 more."),
    "John has 17 apples and receives 9 more.",
  );
});

test("the demonstrated Primary 5-6 Mathematics prompt defaults are retained", () => {
  assert.deepEqual(normalizeAcpOptions(), {
    grade: "Primary 5-6",
    subject: "Mathematics",
    generationTimeoutMs: 600000,
    maximumInteractives: null,
  });
});

test("the ACP launcher expands a nested URL to the whole supplied module", () => {
  const target = moduleWideAcpTarget({
    id: "3cdf23c6-0a73-4b12-88dd-9c2dbe776d69",
    scope: "activity",
    sectionId: "105854770",
    activityId: "105854771",
    sourceUrl: "https://vle.learning.moe.edu.sg/community-gallery/module/view/3cdf23c6-0a73-4b12-88dd-9c2dbe776d69/section/105854770/activity/105854771?pageNo=1",
  });
  assert.equal(target.id, "3cdf23c6-0a73-4b12-88dd-9c2dbe776d69");
  assert.equal(target.scope, "module");
  assert.equal(target.sectionId, null);
  assert.equal(target.activityId, null);
  assert.match(target.sourceUrl, /activity\/105854771/);
});

test("ACP generation is unlimited unless an explicit cap is supplied", () => {
  assert.equal(normalizeAcpOptions().maximumInteractives, null);
  assert.equal(normalizeAcpOptions({ maximumInteractives: 7 }).maximumInteractives, 7);
});

test("FA Math randomization rows retain exact ranges and dependent bounds", () => {
  const parameters = normalizeRandomizationParameters([
    { cells: ["Name", "", "Type", "", "Description"] },
    { cells: ["𝑐 1 c1", "", "Number", "", "[ 11 , 20 ] [11,20]"] },
    { cells: ["𝑐 2 c2", "", "Number", "", "[ 2 , 𝑐 1 − 1 ] [2,c1−1]"] },
  ]);
  assert.deepEqual(parameters, [
    { name: "c1", type: "Number", description: "[11,20]" },
    { name: "c2", type: "Number", description: "[2,c1-1]" },
  ]);
});

test("source parameter values are inferred from the rendered randomized question", () => {
  const values = inferRandomizationSourceValues(
    "John has c1 apples. His mother gives him c2 more apples. How many apples does John have now?",
    "John has 14 apples. His mother gives him 2 more apples. How many apples does John have now?",
    [{ name: "c1" }, { name: "c2" }],
  );
  assert.deepEqual(values, { c1: 14, c2: 2 });
});

test("randomized FA Math requirements request constrained sliders and exact replay", () => {
  const requirements = buildAcpSpecificRequirements({
    questionText: "John has 14 apples. His mother gives him 2 more apples. How many apples does John have now?",
    randomization: {
      instructionTemplate: "John has c1 apples. His mother gives him c2 more apples. How many apples does John have now?",
      answerExpression: "c1+c2",
      parameters: [
        { name: "c1", type: "Number", description: "[11,20]" },
        { name: "c2", type: "Number", description: "[2,c1-1]" },
      ],
    },
  });
  assert.match(requirements, /c1 \(Number\): \[11,20\]; source value 14/);
  assert.match(requirements, /c2 \(Number\): \[2,c1-1\]; source value 2/);
  assert.match(requirements, /one clearly labelled slider for every Number parameter/i);
  assert.match(requirements, /step 1/i);
  assert.match(requirements, /Reset to source values/i);
  assert.match(requirements, /must update when c1 changes/i);
  assert.match(requirements, /c1\+c2/);
});

test("non-randomized questions do not receive invented slider requirements", () => {
  assert.equal(buildAcpSpecificRequirements({ questionText: "What is 2 + 3?", randomization: null }), "");
});

test("ACP ADD is blocked when another runner creates an interactive during generation", () => {
  const result = assessAcpPreAddState({
    completedBefore: 0,
    textComponentIdsBefore: ["existing-text"],
    ownTextComponentId: "our-empty-host",
  }, {
    completedInteractives: 1,
    textComponentIds: ["existing-text", "our-empty-host", "concurrent-acp"],
    pendingTextComponentIds: [],
  });
  assert.equal(result.safe, false);
  assert.match(result.reason, /changed from 0 to 1/i);
  assert.deepEqual(result.unexpectedTextComponentIds, ["concurrent-acp"]);
});

test("ACP ADD permits only the runner's own pending Text host", () => {
  const result = assessAcpPreAddState({
    completedBefore: 0,
    textComponentIdsBefore: ["existing-text"],
    ownTextComponentId: "our-empty-host",
  }, {
    completedInteractives: 0,
    textComponentIds: ["existing-text", "our-empty-host"],
    pendingTextComponentIds: ["our-empty-host"],
  });
  assert.equal(result.safe, true);
});

test("an activity-scoped ACP run excludes every other section and activity", () => {
  const target = { sectionId: "105854770", activityId: "105854771" };
  assert.equal(acpTargetIncludes(target, { sectionId: "105854770" }), true);
  assert.equal(
    acpTargetIncludes(target, { sectionId: "105854770", activityId: "105854771" }),
    true,
  );
  assert.equal(
    acpTargetIncludes(target, { sectionId: "105854770", activityId: "105854772" }),
    false,
  );
  assert.equal(
    acpTargetIncludes(target, { sectionId: "105854769", activityId: "105854771" }),
    false,
  );
});

test("ACP failures are summarized with exact section, activity, and page", () => {
  const lines = formatAcpFailureSummary({
    failures: [{
      stage: "apply",
      section: { label: "A", title: "Untitled", id: "109240916" },
      activity: {
        index: 4,
        title: "Compare numbers to 40 - WPLN23 P1 FA Math",
        id: "109614759",
      },
      pageIndex: 1,
      pageNo: 2,
      message: "ACP did not expose ADD within 600 seconds.",
    }],
  });
  assert.deepEqual(lines, [
    'Section A; Activity 5 "Compare numbers to 40 - WPLN23 P1 FA Math"; Page 2; apply: ACP did not expose ADD within 600 seconds.',
  ]);
});

test("ACP preview Add button detection ignores hidden message text and mixed case", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="bx--modal-container">
        <h1>Preview Interactive</h1>
        <button class="cv-button bx--btn bx--btn--primary" type="button">
          <div class="message-component message" style="display: none;">
            <span>Something went wrong while performing this action. Please try again later.</span>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" name="Plus24"></svg>
          <span>Add</span>
        </button>
      </div>
      <script>
        document.querySelector("button").addEventListener("click", () => {
          document.body.dataset.added = "true";
        });
      </script>
    `);

    const addButton = await findAcpPreviewAddButton(page);
    assert.equal(await addButton.isVisible(), true);
    assert.equal(await addButton.isEnabled(), true);
    await addButton.click();
    assert.equal(await page.locator("body").getAttribute("data-added"), "true");
  } finally {
    await browser.close();
  }
});

test("the current Text/Media menu opens Text through a real hover", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <style>
        .menu, .submenu { list-style: none; margin: 0; padding: 0; }
        .submenu { display: none; position: absolute; left: 120px; top: 0; }
        li { position: relative; width: 120px; min-height: 32px; }
        li:hover > .submenu { display: block; }
        .item-wrapper { display: block; height: 32px; }
      </style>
      <div class="add-component-bar">
        <div class="multi-layer-menu">
          <ul class="menu">
            <li class="text-media">
              <span class="item-wrapper"><div>Text/Media</div></span>
              <ul class="submenu">
                <li class="multi-layer-menu-item last-used"><span><div id="text-option">Text</div></span></li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
      <script>
        document.querySelector("#text-option").addEventListener("click", () => {
          document.body.dataset.selected = "text";
        });
      </script>
    `);

    await selectTextComponentFromAddMenu(page, { timeoutMs: 1000 });
    assert.equal(await page.locator("body").getAttribute("data-selected"), "text");
  } finally {
    await browser.close();
  }
});

test("ACP inventory waits for a delayed existing ZIP before declaring a candidate", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div id="component-1" class="lesson-activity-component text" style="width:200px;height:50px">
        Move Up Move Down
      </div>
      <script>
        setTimeout(() => {
          document.querySelector("#component-1").insertAdjacentHTML(
            "beforeend",
            "<button>Interactive_delayed.zip</button>",
          );
        }, 700);
      </script>
    `);
    const state = await readStableAcpPageState(page, { timeoutMs: 4_000, reloadOnPending: false });
    assert.equal(state.completedInteractives, 1);
    assert.deepEqual(state.completedInteractiveFiles, ["Interactive_delayed.zip"]);
    assert.equal(state.pendingTextComponents, 0);
  } finally {
    await browser.close();
  }
});

test("an unhydrated Text component blocks ACP candidate status", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div id="component-1" class="lesson-activity-component text" style="width:200px;height:50px">
        Move Up Move Down
      </div>
    `);
    await assert.rejects(
      readStableAcpPageState(page, { timeoutMs: 1_200, reloadOnPending: false }),
      /cannot be decided safely/i,
    );
  } finally {
    await browser.close();
  }
});
