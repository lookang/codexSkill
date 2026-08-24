import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { assessAcpPage, normalizeAcpOptions, normalizeQuestionText } from "../src/acp-interactive.mjs";
import { selectTextComponentFromAddMenu } from "../src/acp-interactive-runner.mjs";

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
