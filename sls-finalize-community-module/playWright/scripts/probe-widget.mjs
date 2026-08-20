// Diagnostic: finds the floating "Help us improve" widget and reports exactly what
// element it is, so the overlay suppression can target it.
//
//   node scripts/probe-widget.mjs <moduleId> <sectionId>
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [moduleId, sectionId] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(process.cwd(), ".auth", "sls-state.json"),
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

try {
  const url = sectionId
    ? `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/section/${sectionId}`
    : `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/module-plan`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }

  const found = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const record = (element, why) => {
      if (!element || seen.has(element)) return;
      seen.add(element);
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      out.push({
        why,
        tag: element.tagName.toLowerCase(),
        id: element.id || "",
        cls: (element.className || "").toString().slice(0, 60),
        position: style.position,
        zIndex: style.zIndex,
        rect: `${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)}`,
        text: (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40)
      });
    };

    // Anything pinned to the viewport, and anything mentioning the widget's label.
    for (const element of document.querySelectorAll("body *")) {
      const style = window.getComputedStyle(element);
      if (style.position === "fixed" || style.position === "sticky") record(element, "fixed/sticky");
    }
    for (const element of document.querySelectorAll("*")) {
      const text = (element.innerText || "").trim();
      if (/help us improve/i.test(text) && element.children.length <= 3) record(element, "label match");
    }

    // What is actually at the bottom-left corner, where the widget sits?
    const corner = document.elementFromPoint(80, window.innerHeight - 30);
    if (corner) record(corner, "bottom-left corner");
    return out;
  });

  console.log(`floating / candidate elements: ${found.length}\n`);
  for (const element of found) {
    console.log(`[${element.why}] <${element.tag}> id="${element.id}" class="${element.cls}"`);
    console.log(`     position=${element.position} z=${element.zIndex} rect=${element.rect}`);
    if (element.text) console.log(`     text="${element.text}"`);
  }
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
