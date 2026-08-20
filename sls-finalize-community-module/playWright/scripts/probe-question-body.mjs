// Diagnostic: for one activity, reports each question component and whether its
// question body (and the mathematics in it) can be read.
//
//   node scripts/probe-question-body.mjs <moduleId> <sectionId> <activityId>
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [moduleId, sectionId, activityId] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(process.cwd(), ".auth", "sls-state.json"),
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

try {
  await page.goto(
    `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/section/${sectionId}/activity/${activityId}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForTimeout(8000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }
  console.log(`url: ${page.url()}`);

  const report = await page.evaluate(() => {
    const components = Array.from(document.querySelectorAll('[id^="component-"]')).map((element) => {
      const bodies = Array.from(element.querySelectorAll(".question-body"));
      const wiris = element.querySelectorAll('img[src^="data:image/svg+xml"]').length;
      return {
        id: element.id,
        visible: element.getClientRects().length > 0,
        bodies: bodies.length,
        visibleBodies: bodies.filter((body) => body.getClientRects().length > 0).length,
        wiris,
        text: bodies
          .map((body) => (body.innerText || "").replace(/\s+/g, " ").trim())
          .join(" | ")
          .slice(0, 80)
      };
    });
    return {
      components,
      cards: document.querySelectorAll('[id^="settings-card-"]').length,
      anyBody: document.querySelectorAll(".question-body").length
    };
  });

  console.log(`settings cards: ${report.cards}   .question-body on page: ${report.anyBody}`);
  console.log(`components: ${report.components.length}`);
  for (const component of report.components) {
    console.log(
      `  ${component.id}  visible=${component.visible}  bodies=${component.bodies}` +
        ` (visible ${component.visibleBodies})  wirisImgs=${component.wiris}`
    );
    if (component.text) console.log(`      "${component.text}"`);
  }
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
