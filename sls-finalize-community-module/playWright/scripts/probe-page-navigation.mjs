// Read-only diagnostic for SLS activity pagination after a Page Break is saved.
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { suppressOverlayWidgets } from "../src/sls-runner.mjs";

const [moduleId, sectionId, activityId] = process.argv.slice(2);
if (!moduleId || !sectionId || !activityId) {
  console.error("Usage: node scripts/probe-page-navigation.mjs <moduleId> <sectionId> <activityId>");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: false, slowMo: 75 });
const context = await browser.newContext({
  storageState: path.resolve(".auth", "sls-state.json"),
  viewport: null,
});
await suppressOverlayWidgets(context);
const page = await context.newPage();
const url =
  `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}` +
  `/section/${sectionId}/activity/${activityId}?pageNo=1`;

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator(".component.question-component").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(1200);
  const controls = await page.locator("button, a, [role='button']").evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      text: (node.innerText || "").replace(/\s+/g, " ").trim(),
      ariaLabel: node.getAttribute("aria-label"),
      title: node.getAttribute("title"),
      className: typeof node.className === "string" ? node.className : "",
      parentClass: typeof node.parentElement?.className === "string" ? node.parentElement.className : "",
      grandparentClass: typeof node.parentElement?.parentElement?.className === "string"
        ? node.parentElement.parentElement.className
        : "",
      svgNames: Array.from(node.querySelectorAll("svg[name]")).map((svg) => svg.getAttribute("name")),
      visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
      top: Math.round(rect.top + window.scrollY),
    };
  }).filter((entry) =>
    /page|next|previous|navigator|nav-button/i.test(
      `${entry.text} ${entry.ariaLabel || ""} ${entry.title || ""} ${entry.className}`,
    ) || entry.svgNames.some((name) => /arrow|chevron|pagination/i.test(name || "")),
  ));
  const pageNumberControls = await page.locator("button:visible").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      text: (node.innerText || "").replace(/\s+/g, " ").trim(),
      className: typeof node.className === "string" ? node.className : "",
      parentClass: typeof node.parentElement?.className === "string" ? node.parentElement.className : "",
      grandparentClass: typeof node.parentElement?.parentElement?.className === "string"
        ? node.parentElement.parentElement.className
        : "",
      ariaCurrent: node.getAttribute("aria-current"),
      top: Math.round(rect.top + window.scrollY),
      outerHTML: node.outerHTML.slice(0, 700),
    };
  }).filter((entry) => /^\d+$/.test(entry.text) && entry.top < 400));
  console.log(JSON.stringify({ url: page.url(), controls, pageNumberControls }, null, 2));
  const screenshot = path.resolve("output", "probe-page-navigation.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  console.log(`Screenshot: ${screenshot}`);
  console.log("Nothing was changed or saved.");
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
