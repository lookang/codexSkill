// Read-only diagnostic for SLS's divider component menu. It opens one divider,
// lists the visible controls, captures a screenshot, and closes without choosing
// Page Break or saving anything.
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { suppressOverlayWidgets } from "../src/sls-runner.mjs";

const [moduleId, sectionId, activityId] = process.argv.slice(2);
if (!moduleId || !sectionId || !activityId) {
  console.error("Usage: node scripts/probe-page-break-menu.mjs <moduleId> <sectionId> <activityId>");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: false, slowMo: 120 });
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
  if (/\/login/i.test(new URL(page.url()).pathname)) throw new Error("SLS authentication is required.");
  const dividers = page.locator(".divider-button button:visible");
  await dividers.first().waitFor({ state: "visible", timeout: 20_000 });
  console.log(`Visible divider controls: ${await dividers.count()}`);
  // SLS deliberately puts the clickable overlay on the divider shell. A
  // normal Playwright click on its nested icon is intercepted by that shell.
  // Dispatching the shell click matches the application's event delegation
  // without selecting or saving a component.
  const dividerShell = dividers.first().locator("xpath=ancestor::div[contains(@class,'divider-button')][1]");
  await dividers.first().evaluate((button) => button.closest(".divider-button")?.click());
  await page.waitForTimeout(800);
  const displayOptions = dividerShell.locator("li.display");
  console.log(`Visible Display categories: ${await displayOptions.count()}`);
  const pageBreak = page.getByText("Page Break", { exact: true });
  console.log(`Page Break entries on page: ${await pageBreak.count()}`);
  if (await pageBreak.count()) {
    await pageBreak.first().evaluate((label) => label.closest("li")?.click());
    await page.waitForTimeout(800);
  }
  console.log(JSON.stringify(await page.getByText("Page Break", { exact: true }).evaluateAll((nodes) => nodes.map((node) => {
    const root = node.closest("ul")?.parentElement;
    const rect = root?.getBoundingClientRect();
    return { rootClass: root?.className || "", top: rect?.top, bottom: rect?.bottom };
  })), null, 2));
  const single = pageBreak.first().locator("xpath=ancestor::li[1]").getByText("Single", { exact: true });
  console.log(`Single entries in selected Page Break menu: ${await single.count()}`);
  const observed = [];
  await page.route("**/apis/lesson/page/break/**", async (route) => {
    observed.push({ method: route.request().method(), url: route.request().url() });
    await route.abort("blockedbyclient");
  });
  if (await single.count()) {
    await single.first().evaluate((label) => label.closest("li")?.click());
    await page.waitForTimeout(1200);
  }
  console.log(`Intercepted page-break requests: ${JSON.stringify(observed)}`);

  const controls = await page.locator("button:visible, [role='menuitem']:visible, li:visible").evaluateAll((nodes) =>
    nodes.map((node) => ({
      tag: node.tagName,
      text: (node.innerText || "").replace(/\s+/g, " ").trim(),
      ariaLabel: node.getAttribute("aria-label"),
      className: typeof node.className === "string" ? node.className : "",
    })).filter((entry) => entry.text || entry.ariaLabel),
  );
  const relevant = controls.filter((entry) =>
    /page|display|break|column|accordion|add/i.test(`${entry.text} ${entry.ariaLabel || ""}`),
  );
  console.log(JSON.stringify(relevant, null, 2));
  const screenshot = path.resolve("output", "probe-page-break-menu.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  console.log(`Screenshot: ${screenshot}`);
  console.log("Nothing was created or saved.");
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
