// Read-only diagnostic for the module-level curriculum metadata used by
// RUN-SLS-AUTOMATION. It opens the Introduction page, reports visible module
// text and saved Subject / Level / Content Map values, and never clicks Save.
//
//   node scripts/probe-module-evidence.mjs <module-id>
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [moduleId] = process.argv.slice(2);
if (!moduleId) throw new Error("Supply one SLS module ID.");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: path.resolve(process.cwd(), ".auth", "sls-state.json"),
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

try {
  await page.goto(
    `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForTimeout(5_000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED");
    process.exitCode = 2;
  } else {
    console.log(`URL: ${page.url()}`);
    console.log(`TITLE: ${await page.title()}`);
    const elements = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[id^='component-'], .card-component, input, button"))
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => ({
          tag: element.tagName,
          id: element.id,
          className: String(element.className ?? "").slice(0, 180),
          placeholder: element.getAttribute("placeholder"),
          value: "value" in element ? String(element.value ?? "") : "",
          text: String(element.innerText || element.getAttribute("aria-label") || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500),
        }))
        .filter((entry) =>
          entry.id || entry.placeholder || /Module|Learning Outcomes|Subject|Level|Content Map|Description|selected/i.test(entry.text),
        ),
    );
    for (const entry of elements) console.log(JSON.stringify(entry));
  }
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
