import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { loadTab, useSheet } from "../src/sheet.mjs";
import { saveJson } from "../src/io.mjs";
import { launchSlsBrowser, createSlsContext } from "../src/sls-runner.mjs";
import { createTitleBrowser, assertTitleSession, TitleLoginRequired } from "../src/title-browser.mjs";
import { DEFAULT_TITLE_SHEET, DEFAULT_TITLE_PREFIX, parseTitleSheet, sheetTitleTargets, purposeTitle, previewTitles, previewPrefixRemovals, applyTitles } from "../src/title-batch.mjs";
import { findTrackingColumn, isGoogleSheetEditable, prepareGoogleSheet } from "../src/google-sheet-writer.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const memoryPath = path.join(root, ".state", "title-prefix.json");
const authStatePath = path.join(root, ".auth", "sls-state.json");
let rl;
let browser;
let context;
let page;
let sheetPage;
let tracing = false;
let report;
let reportPath;
let runDir;
let checkpointPlan;
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function ask(question, fallback) {
  if (!interactive) return fallback;
  rl ??= createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim();
  return answer || fallback;
}

async function checkpoint(plan) {
  report.modules = checkpointPlan ?? plan;
  report.updatedAt = new Date().toISOString();
  await saveJson(reportPath, report);
}

try {
  const { values } = parseArgs({ options: {
    sheet: { type: "string" }, prefix: { type: "string" }, rows: { type: "string" },
    list: { type: "boolean" }, "dry-run": { type: "boolean" }, apply: { type: "boolean" },
    help: { type: "boolean", short: "h" }, "no-pause": { type: "boolean" },
    "with-curriculum": { type: "boolean" }, "no-curriculum": { type: "boolean" },
    "no-sheet-update": { type: "boolean" }, "remove-prefix": { type: "boolean" },
    contains: { type: "string" }, exclude: { type: "string" }, "include-ast": { type: "boolean" }
  } });
  const removePrefix = Boolean(values["remove-prefix"]);
  if (values.help) {
    console.log(`${removePrefix ? "SLS Conditional Module Title Prefix Remover" : "SLS Sheet Module Title Prefixer"}
Double-click ${removePrefix ? "RUN-SLS-REVERT-AST-TITLES.cmd" : "RUN-SLS-RENAME-TITLES.cmd"} to choose the Sheet, rows and prefix.

--sheet URL       Google Sheets URL with the target tab's gid
--prefix TEXT     Purpose label placed before the verified curriculum and topic
--rows 7-10,12    Optional Sheet row numbers; default is all module rows
--list            List Sheet titles only; no browser or changes
--dry-run         Read live titles and save a preview; no changes
--apply           Apply without confirmation; removal mode also requires explicit --contains
--with-curriculum Add saved Level and Subject to the visible title
--remove-prefix   Remove the leading prefix only from matching live titles
--contains TEXT   Required standalone title text in removal mode (default: AST)
--exclude TEXT    Title text excluded from an ordinary prefix batch (default: AST)
--include-ast     Allow AST titles in an ordinary prefix batch
--no-sheet-update Do not write verified titles to the New Module Title Sheet column
--no-pause        Close Chrome when finished without waiting for Enter

By default, each verified title is written to the Sheet's New Module Title column.
Activities, tags and other Sheet columns remain untouched.
Default pattern: Topical Revision - Original topic (FA-Math).
The known authoring-process phrase is simplified for children. A save/reopen mismatch stops the batch.
Reports: output/title-prefix/<timestamp>/report.json and trace.zip (keep private).`);
  } else {
    if (values.apply && (values["dry-run"] || values.list)) throw new Error("--apply cannot be combined with --dry-run or --list.");
    if (values.apply && (!values.sheet || !values.prefix || (values["remove-prefix"] && !values.contains))) {
      throw new Error(`--apply requires explicit --sheet and --prefix${values["remove-prefix"] ? " and --contains" : ""} to avoid silently reusing remembered choices.`);
    }
    let remembered = {};
    try { remembered = JSON.parse(await fs.readFile(memoryPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") console.warn(`Ignoring unreadable title preferences: ${error.message}`); }
    // Migrate the original lowercase built-in default without changing any custom prefix.
    if (remembered.prefix === "Topical revision -") remembered.prefix = DEFAULT_TITLE_PREFIX;
    console.log(removePrefix
      ? "\nSLS Conditional Module Title Prefix Remover\nOnly matching live SLS titles lose the requested leading prefix. Verified results are recorded in the Sheet.\n"
      : "\nSLS Sheet Module Title Prefixer\nModule titles are updated in SLS and recorded in the Sheet's New Module Title column.\n");
    const sheet = parseTitleSheet(values.sheet ?? await ask(`Sheet URL [Enter = ${remembered.sheet ?? DEFAULT_TITLE_SHEET}]:\n`, remembered.sheet ?? DEFAULT_TITLE_SHEET));
    useSheet(sheet);
    const rows = await loadTab(root, sheet.gid, { refresh: true });
    const all = sheetTitleTargets(rows);
    console.log(`\nFound ${all.length} unique modules in this tab:`);
    for (const item of all) console.log(`  ${item.rows.join(", ")}: ${item.sheetTitle}`);
    const rowSpec = values.rows ?? (values.list ? "all" : await ask("\nSheet rows [Enter = all; e.g. 7-10,12]: ", "all"));
    const targets = sheetTitleTargets(rows, rowSpec);
    const defaultPrefix = removePrefix ? remembered.removePrefix ?? DEFAULT_TITLE_PREFIX : remembered.prefix ?? DEFAULT_TITLE_PREFIX;
    const prefix = values.prefix ?? (values.list ? defaultPrefix : await ask(`Prefix [Enter = ${defaultPrefix}]: `, defaultPrefix));
    purposeTitle("Example title", prefix);
    const requiredText = removePrefix
      ? values.contains ?? (values.list ? "AST" : await ask(`Required title text [Enter = ${remembered.removeContains ?? "AST"}]: `, remembered.removeContains ?? "AST"))
      : null;
    const excludedText = !removePrefix && !values["include-ast"] ? values.exclude ?? "AST" : null;
    if (values["with-curriculum"] && values["no-curriculum"]) throw new Error("Choose either --with-curriculum or --no-curriculum, not both.");
    if (removePrefix && values["with-curriculum"]) throw new Error("--with-curriculum cannot be combined with --remove-prefix.");
    const useCurriculum = Boolean(values["with-curriculum"]);
    console.log(`\nSelected ${targets.length} unique modules.`);
    console.log(removePrefix
      ? `Scanning live titles for standalone text "${requiredText}" and leading prefix "${prefix.trim()}".`
      : useCurriculum
      ? `Live preview will add the verified SLS Level and Subject after the prefix.${excludedText ? ` Titles containing standalone "${excludedText}" are excluded.` : ""}`
      : `Child-facing title example: ${purposeTitle(targets[0].sheetTitle || "Original title", prefix)}${excludedText ? `\nTitles containing standalone "${excludedText}" are excluded.` : ""}`);
    if (values.list) {
      console.log("Sheet-only listing complete. No browser was opened and no SLS titles were changed.");
    } else {
      await saveJson(memoryPath, {
        ...remembered,
        sheet: sheet.url,
        ...(removePrefix
          ? { removePrefix: prefix.trim(), removeContains: requiredText.trim() }
          : { prefix: prefix.trim() }),
      });
      runDir = path.join(root, "output", "title-prefix", new Date().toISOString().replace(/[:.]/g, "-"));
      reportPath = path.join(runDir, "report.json");
      const updateSheet = !values["no-sheet-update"];
      const tracking = findTrackingColumn(rows);
      report = { mode: removePrefix ? "remove-prefix" : "add-prefix", sheet: sheet.url, rowSpec, prefix, requiredText, excludedText, curriculum: useCurriculum, updateSheet, tracking, startedAt: new Date().toISOString(), status: "previewing", modules: [], selectedModules: targets.map(({ id, rows, sheetTitle }) => ({ id, rows, sheetTitle })) };
      await checkpoint([]);
      const stateExists = await fs.stat(authStatePath).then(() => true, () => false);
      const options = { headless: false, slowMoMs: 150, authStatePath: stateExists ? authStatePath : undefined };
      browser = await launchSlsBrowser(options);
      context = await createSlsContext(browser, options);
      page = await context.newPage();
      page.setDefaultTimeout(45_000);
      await page.goto(targets[0].adminViewUrl, { waitUntil: "domcontentloaded" });
      try { await page.getByRole("button", { name: /^(Edit|LOGIN WITH SLS|LOGIN WITH MIMS)$/i }).first().waitFor({ state: "visible" }); }
      catch (error) { await assertTitleSession(page); throw error; }
      try { await assertTitleSession(page); }
      catch (error) {
        if (!(error instanceof TitleLoginRequired) || !interactive) throw error;
        console.log(`\n${error.message}\nLogin is not recorded in the trace.`);
        await ask("After SLS is fully open, press Enter here to continue: ", "");
        await assertTitleSession(page);
        await fs.mkdir(path.dirname(authStatePath), { recursive: true });
        await context.storageState({ path: authStatePath });
      }
      const adapter = createTitleBrowser(page);
      const scanned = removePrefix
        ? await previewPrefixRemovals(targets, prefix, requiredText, adapter, checkpoint)
        : await previewTitles(targets, prefix, adapter, checkpoint, { curriculum: useCurriculum, excludeText: excludedText });
      checkpointPlan = scanned;
      const plan = removePrefix
        ? scanned.filter((item) => item.status === "planned")
        : scanned.filter((item) => item.status !== "skipped");
      report.status = "previewed";
      await checkpoint(scanned);
      console.log(removePrefix ? "\nDetected prefix-removal candidates:" : "\nLive SLS title preview:");
      for (const item of plan) console.log(
        `\nRows ${item.rows.join(", ")} [${item.status}]` +
        `${item.curriculumLabel ? `\n  TAG: ${item.curriculumLabel}` : ""}` +
        `\n  OLD: ${item.before}\n  NEW: ${item.after}`
      );
      if (removePrefix) {
        console.log(`\nScanned ${scanned.length} module(s): ${plan.length} candidate(s), ${scanned.length - plan.length} left untouched.`);
        if (!plan.length) console.log("No live title met both conditions. Nothing will be changed.");
      } else if (excludedText) {
        const excluded = scanned.filter((item) => item.status === "skipped");
        console.log(`\nExcluded ${excluded.length} title(s) containing standalone "${excludedText}"; they will not be changed or written to the Sheet.`);
        for (const item of excluded) console.log(`  Rows ${item.rows.join(", ")}: ${item.before}`);
      }
      const count = plan.filter((item) => item.status === "planned").length;
      const workCount = removePrefix ? count : (updateSheet ? plan.length : count);
      const approved = !values["dry-run"] && workCount > 0 && (values.apply ||
        (interactive && (await ask(
          `\n${removePrefix ? "Remove the prefix from" : "Apply"} ${count} SLS title${removePrefix ? "" : " change"}(s)${updateSheet ? ` and update ${plan.length} Sheet row group(s)` : ""}? Type YES, or press Enter to stop: `,
          ""
        )).toUpperCase() === "YES"));
      if (approved) {
        let sheetWriter = null;
        if (updateSheet) {
          sheetPage = await context.newPage();
          try {
            sheetWriter = await prepareGoogleSheet(sheetPage, sheet.url, tracking);
          } catch (error) {
            if (!interactive || !/not editable/i.test(error.message)) throw error;
            console.log("\nThe Sheet is currently view-only. Sign in to Google in the visible Sheet tab using an account with edit access.");
            const signIn = sheetPage.getByText("Sign in", { exact: true }).first();
            if (await signIn.isVisible().catch(() => false)) await signIn.click().catch(() => {});
            await ask("After the Sheet is editable, press Enter here to continue: ", "");
            if (!(await isGoogleSheetEditable(sheetPage))) {
              await sheetPage.goto(sheet.url, { waitUntil: "domcontentloaded" }).catch(() => {});
            }
            sheetWriter = await prepareGoogleSheet(sheetPage, sheet.url, tracking);
          }
          await context.storageState({ path: authStatePath, indexedDB: true });
          console.log(`Tracking verified titles in Sheet column ${tracking.column}: ${tracking.header}`);
        }
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        tracing = true;
        report.status = "applying";
        await checkpoint(plan);
        await applyTitles(plan, adapter, checkpoint, {
          afterVerified: sheetWriter ? async (item) => {
            const cells = [];
            for (const rowNumber of item.rows) {
              const reference = `${tracking.column}${rowNumber}`;
              const before = await sheetWriter.readCell(reference);
              await sheetWriter.writeCell(reference, item.after);
              cells.push({ reference, before, after: item.after });
            }
            console.log(`Recorded verified title in ${cells.map((cell) => cell.reference).join(", ")}.`);
            return { column: tracking.header, cells };
          } : undefined
        });
        report.status = "complete";
        console.log(`\nComplete: ${plan.filter((item) => item.status === "verified").length} title changes saved and verified after reopening.`);
        if (updateSheet) console.log(`${plan.filter((item) => item.sheetStatus === "verified").length} module title(s) recorded and verified in the Sheet.`);
      } else {
        report.status = "preview-only";
        console.log("\nPreview only. No SLS titles or Sheet cells were changed.");
      }
      await checkpoint(scanned);
      if (interactive && !values["no-pause"]) await ask("\nPress Enter when you are ready to close Chrome: ", "");
    }
  }
} catch (error) {
  console.error(`\nTitle batch stopped: ${error.message}`);
  process.exitCode = 1;
  if (report) {
    report.status = "stopped";
    report.error = error.message;
    await checkpoint(report.modules);
  }
  if (page && !(error instanceof TitleLoginRequired)) await page.screenshot({ path: path.join(runDir, "stopped.png"), fullPage: true }).catch(() => {});
} finally {
  if (tracing) await context.tracing.stop({ path: path.join(runDir, "trace.zip") }).catch((error) => console.warn(`Trace could not be saved: ${error.message}`));
  await browser?.close();
  rl?.close();
  if (reportPath) console.log(`\nReport: ${reportPath}`);
}
