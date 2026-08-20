// Diagnostic: dumps what the section sidebar actually contains, so an activity
// lookup that finds nothing can be compared against the real rows.
//
//   node scripts/probe-sidebar.mjs <moduleId> <sectionId>
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
  await page.goto(
    `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/section/${sectionId}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForTimeout(7000);
  if (/\/login/i.test(new URL(page.url()).pathname)) {
    console.log("SESSION_EXPIRED - run npm run sls:auth first.");
    process.exit(2);
  }

  // --open-first clicks into the first section, to see what the section page shows
  // as its main title (SLS prefixes it with the section letter - or does it?).
  if (process.argv.includes("--open-first")) {
    const heading = page.locator("button.bx--accordion__heading").first();
    await heading.waitFor({ state: "visible", timeout: 15_000 });
    const label = await heading
      .locator("..")
      .locator(".section-label")
      .first()
      .getAttribute("data-section-icon-text")
      .catch(() => null);
    console.log(`section-label attribute on the heading: ${JSON.stringify(label)}`);
    await heading.click();
    await page.waitForTimeout(5000);
    console.log(`url after opening: ${page.url()}`);
    const mains = await page.evaluate(() =>
      Array.from(document.querySelectorAll("span.ellipsis-text.title, h1, h2, h6"))
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => (element.innerText || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 8)
    );
    console.log("visible titles on the section page:");
    for (const title of mains) console.log(`   "${title}"`);
  }

  const report = await page.evaluate(() => {
    const rows = (selector) =>
      Array.from(document.querySelectorAll(selector)).map((element) => ({
        text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
        visible: element.getClientRects().length > 0
      }));
    return {
      sideNavLinkText: rows(".bx--side-nav__link-text"),
      ellipsisTitle: rows("span.ellipsis-text.title"),
      sideNavItems: document.querySelectorAll(".bx--side-nav__item").length,
      links: Array.from(document.querySelectorAll(".bx--side-nav__item a, .bx--side-nav__item [href], .bx--side-nav__link")).map((element) => ({
        href: element.getAttribute("href") || "",
        id: element.id || "",
        text: (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40)
      })).slice(0, 20),
      inner: Array.from(document.querySelectorAll(".bx--side-nav__link-text")).slice(0, 12).map((element) => ({
        outer: (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40),
        children: Array.from(element.querySelectorAll("*")).map((child) => (child.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4)
      }))
    };
  });

  console.log(`.bx--side-nav__link-text  (${report.sideNavLinkText.length} rows)`);
  for (const row of report.sideNavLinkText) console.log(`   ${row.visible ? "visible" : "HIDDEN "}  "${row.text}"`);
  console.log(`\nspan.ellipsis-text.title  (${report.ellipsisTitle.length} rows)`);
  for (const row of report.ellipsisTitle) console.log(`   ${row.visible ? "visible" : "HIDDEN "}  "${row.text}"`);
  console.log(`\n.bx--side-nav__item count: ${report.sideNavItems}`);
  console.log("\nlinks (href / id):");
  for (const link of report.links) console.log(`   href="${link.href}" id="${link.id}" text="${link.text}"`);
  console.log("\ninner structure of link-text rows:");
  for (const row of report.inner) console.log(`   outer="${row.outer}"  children=${JSON.stringify(row.children)}`);

  const nesting = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".bx--side-nav__link-text")).map((element) => {
      const first = (element.querySelector("*")?.textContent || element.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 42);
      const chain = [];
      for (let node = element.parentElement, hops = 0; node && hops < 5; node = node.parentElement, hops += 1) {
        chain.push(`${node.tagName.toLowerCase()}.${(node.className || "").toString().split(" ")[0]}`);
      }
      return { first, chain: chain.join(" < ") };
    })
  );
  console.log("\nrow -> ancestor chain:");
  for (const row of nesting) console.log(`   "${row.first}"\n        ${row.chain}`);
} catch (error) {
  console.error(`probe stopped: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
