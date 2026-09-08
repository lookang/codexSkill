import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import {
  attachSharedQuestionContext,
  createQuestionImageOcr,
  primaryQuestionEvidenceText,
  shouldUseImageOcr
} from "../src/question-evidence.mjs";
import {
  readOpenQuestionEvidence,
  readQuestionMetadata,
  readQuestionStems,
  readSavedModuleOutcomeLabels,
  selectedOutcomesContainProposal
} from "../src/sls-runner.mjs";

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

test("ordinary activity pages wait for delayed question hydration", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.setContent(`
      <div class="activity-navigator">
        <div class="activity-navigator-button page-button selected"><button onclick="showPage(1)">1</button></div>
        <div class="activity-navigator-button page-button"><button onclick="showPage(2)">2</button></div>
      </div>
      <main id="question"></main>
      <aside id="settings-card-q1">Q1 <svg name="Settings24"></svg></aside>
      <aside id="settings-card-q2">Q2 <svg name="Settings24"></svg></aside>
      <script>
        function showPage(number) {
          for (const wrapper of document.querySelectorAll('.page-button')) wrapper.classList.remove('selected');
          document.querySelectorAll('.page-button')[number - 1].classList.add('selected');
          document.querySelector('#question').innerHTML = '';
          setTimeout(() => {
            document.querySelector('#question').innerHTML =
              '<section id="component-q' + number + '"><div class="question-body">' +
              (number === 1 ? 'AOB is a straight line. Find the value of a.' :
                'Angles at a point add to 360 degrees. Find x.') +
              '</div></section>';
          }, 1200);
        }
        showPage(1);
      </script>
    `);
    const stems = await readQuestionStems(page, ["q1", "q2"], { enableOcr: false });
    assert.match(stems.get("q1"), /straight line/i);
    assert.match(stems.get("q2"), /360 degrees/i);
    const metadata = await readQuestionMetadata(page);
    assert.match(metadata.get(2).text, /360 degrees/i);
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

test("FA-Math stem and suggested answer are captured as separate evidence", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  try {
    await page.setContent(`
      <section id="component-q1">
        <akit-interaction id="stem"></akit-interaction>
        <akit-interaction id="answer"></akit-interaction>
      </section>
      <script>
        document.querySelector('#stem').attachShadow({ mode: 'open' }).innerHTML =
          '<div>There were 100 students who ate apples. How many ate papaya?</div>';
        document.querySelector('#answer').attachShadow({ mode: 'open' }).innerHTML =
          '<div>100 ÷ 25 × 15 = 60 students</div>';
      </script>
    `);
    const evidence = await readOpenQuestionEvidence(page, "q1");
    assert.match(evidence.stem, /How many ate papaya/);
    assert.match(evidence.suggestedAnswer, /100 ÷ 25 × 15/);
    assert.doesNotMatch(evidence.stem, /60 students/);
  } finally {
    await browser.close();
  }
});

test("multipart FA-Math children inherit only their parent common question body", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  try {
    await page.setContent(`
      <section id="component-parent" class="component question-component mpq">
        <div class="multiple-part-editor-view"><form>
          <dl class="field-set type-text question-body">
            A bag contains n red marbles, 7 white marbles and 5 blue marbles.
            The probability of picking a red marble is now 7/11.
          </dl>
          <div class="multiple-part-editor-sub-question">
            <section id="component-q1a"><div class="question-body">Find the value of n.</div></section>
          </div>
          <div class="multiple-part-editor-sub-question">
            <section id="component-q1b"><div class="question-body">Sibling text must not leak.</div></section>
          </div>
        </form></div>
      </section>
    `);
    const evidence = await readOpenQuestionEvidence(page, "q1a");
    assert.match(evidence.stem, /Find the value of n/i);
    assert.match(evidence.sharedStimulus, /probability of picking a red marble/i);
    assert.equal(evidence.sharedFromQuestionId, "parent");
    assert.doesNotMatch(evidence.sharedStimulus, /Sibling text must not leak/i);
  } finally {
    await browser.close();
  }
});

test("saved read-only Module Tag outcome labels are recovered from the summary", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <li class="bx--accordion__item">
        <button class="bx--accordion__heading"><p class="bx--accordion__title">Module Tags</p></button>
        <div class="bx--accordion__content">
          <dl class="field-set topic"><ul>
            <li><div class="output-text">Probability of simple combined events</div></li>
            <li><div class="output-text">Addition and multiplication of probabilities</div></li>
          </ul></dl>
        </div>
      </li>
      <aside><dl class="field-set topic"><ul><li>Unrelated question tag</li></ul></dl></aside>
    `);
    assert.deepEqual(await readSavedModuleOutcomeLabels(page), [
      "Probability of simple combined events",
      "Addition and multiplication of probabilities"
    ]);
  } finally {
    await browser.close();
  }
});

test("an existing content map is complete only when the exact proposed outcome is selected", () => {
  const contentMap = "Sec 3 & 4 Mathematics (G3) (2020)";
  const selected = [{
    contentMap,
    outcome: "Positive, negative, zero and fractional indices",
    outcomePath: ["Number and Algebra", "Numbers and their operations"]
  }];
  assert.equal(selectedOutcomesContainProposal(selected, {
    contentMap,
    outcome: "Probability of simple combined events"
  }), false);
  assert.equal(selectedOutcomesContainProposal(selected, {
    contentMap,
    outcome: "Positive, negative, zero and fractional indices"
  }), true);
});

test("pie-chart context and OCR labels follow related page-broken subquestions", () => {
  const enriched = attachSharedQuestionContext(new Map([
    ["q1", {
      stem: "The pie chart below shows the type of fruits students ate in a school canteen.",
      diagramOcr: "Apple Banana Orange Papaya"
    }],
    ["q2", {
      stem: "There were 100 students who ate apples. How many students ate papaya?",
      suggestedAnswer: "100 ÷ 25 × 15 = 60"
    }],
    ["q3", { stem: "Calculate the area of a rectangle measuring 8 cm by 4 cm." }]
  ]), ["q1", "q2", "q3"]);

  assert.match(enriched.get("q2").sharedStimulus, /pie chart/i);
  assert.match(enriched.get("q2").sharedDiagramOcr, /Papaya/);
  assert.equal(enriched.get("q2").sharedFromQuestionId, "q1");
  assert.match(primaryQuestionEvidenceText(enriched.get("q2")), /Shared stimulus:.*pie chart/i);
  assert.equal(enriched.get("q3").sharedStimulus, "", "unrelated questions do not inherit chart context");
});

test("OCR is reserved for concise or diagram-dependent question evidence", () => {
  assert.equal(shouldUseImageOcr("Find the total surface area of the given prism."), true);
  assert.equal(
    shouldUseImageOcr("The pie chart below shows the type of fruits students ate in a school canteen."),
    true
  );
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
