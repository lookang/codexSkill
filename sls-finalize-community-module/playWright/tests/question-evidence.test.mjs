import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { createQuestionImageOcr, shouldUseImageOcr } from "../src/question-evidence.mjs";
import { readQuestionMetadata, readQuestionStems } from "../src/sls-runner.mjs";

async function paginatedActivityPage() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.setContent(`
    <div class="activity-navigator">
      ${[1, 2, 3, 4]
        .map(
          (number) => `<div class="activity-navigator-button page-button">
            <button onclick="showPage(${number})">${number}</button>
          </div>`,
        )
        .join("")}
    </div>
    <main id="question"></main>
    ${[1, 2, 3, 4]
      .map(
        (number) => `<aside id="settings-card-q${number}">
          Q${number} Question ${number} Keyword Tags - Question Tags -
          <svg name="Settings24"></svg>
        </aside>`,
      )
      .join("")}
    <script>
      const stems = {
        1: 'Calculate the circumference and area of the open cylindrical container shown.',
        2: 'Find the total surface area of the given prism using its trapezium and four rectangles.',
        3: 'Calculate the volume of the prism from its cross-sectional area and length.',
        4: 'Calculate the curved surface area and total surface area of the cylinder.'
      };
      function showPage(number) {
        for (const wrapper of document.querySelectorAll('.page-button')) wrapper.classList.remove('selected');
        document.querySelectorAll('.page-button')[number - 1].classList.add('selected');
        document.querySelector('#question').innerHTML =
          '<section class="lesson-activity-component" id="component-q' + number + '"><div>Q' + number +
          ' <div class="question-body">' + stems[number] +
          '</div><div>MARKS [2]</div></div></section>';
      }
      showPage(1);
    </script>
  `);
  return { browser, page };
}

test("ordinary SLS activity pagination is visited before question stems are cached", async () => {
  const { browser, page } = await paginatedActivityPage();
  try {
    const stems = await readQuestionStems(page, ["q1", "q2", "q3", "q4"], { enableOcr: false });
    assert.equal(stems.size, 4);
    assert.match(stems.get("q2"), /total surface area.*trapezium/i);
    assert.match(stems.get("q4"), /curved surface area/i);
    assert.equal(await page.locator(".page-button").first().getAttribute("class"), "activity-navigator-button page-button selected");
  } finally {
    await browser.close();
  }
});

test("ordinary SLS activity pagination is also walked for marks and question metadata", async () => {
  const { browser, page } = await paginatedActivityPage();
  try {
    const metadata = await readQuestionMetadata(page);
    assert.equal(metadata.size, 4);
    assert.equal(metadata.get(3).marks, true);
    assert.match(metadata.get(3).text, /cross-sectional area and length/i);
  } finally {
    await browser.close();
  }
});

test("OCR is reserved for concise or diagram-dependent question evidence", () => {
  assert.equal(shouldUseImageOcr("Find the total surface area of the given prism."), true);
  assert.equal(
    shouldUseImageOcr(
      "Expand and simplify the quadratic expression, showing every algebraic step and collecting like terms carefully.",
    ),
    false,
  );
});

test("bundled local OCR reads diagram labels without a network language download", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ocr = createQuestionImageOcr();
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
    await page.setContent(`
      <div id="diagram" style="width:700px;height:260px;background:white;color:black;
        font:700 48px Arial;padding:35px;box-sizing:border-box">
        TRAPEZIUM PRISM<br>16 m &nbsp; 15 m &nbsp; 8 m
      </div>
    `);
    const image = await page.locator("#diagram").screenshot({ type: "png" });
    const result = await ocr.recognize(image);
    assert.ok(result.confidence >= 35, `OCR confidence was ${result.confidence}`);
    assert.match(result.text, /TRAPEZIUM PRISM/i);
    assert.match(result.text, /16\s*m/i);
  } finally {
    await ocr.terminate();
    await browser.close();
  }
});
