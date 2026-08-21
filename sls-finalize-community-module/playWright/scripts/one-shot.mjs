import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { applyTargetUrl, loadConfig, mergeDefaults, questionTagState, unreviewedPlaceholders } from "../src/io.mjs";
import { parseArgs } from "../src/cli.mjs";
import { pickAndRememberModule } from "../src/module-picker.mjs";
import { createSlsContext, launchSlsBrowser, runSlsWorkflow } from "../src/sls-runner.mjs";

// Browser speed can come from an argument (npm run sls:one-shot -- --slow-mo 800)
// or the SLS_SLOW_MO environment variable, so it works from cmd.exe, PowerShell
// and bash alike without any shell-specific prefix syntax.
const slowMoArgs = readSlowMo();
// Flags typed on the launcher must reach the workflow; it builds its own argument
// list, so anything not forwarded here is silently dropped.
const argvFlags = process.argv.slice(2);
const passThroughArgs = ["--tag-questions", "--refresh-taxonomy", "--headless"].filter((flag) =>
  argvFlags.includes(flag)
);
const onlyQuestionFlag = argvFlags.indexOf("--tag-only-question");
if (onlyQuestionFlag >= 0) passThroughArgs.push("--tag-only-question", argvFlags[onlyQuestionFlag + 1]);

function readSlowMo() {
  const argv = process.argv.slice(2);
  const flag = argv.indexOf("--slow-mo");
  const value = flag >= 0 ? argv[flag + 1] : process.env.SLS_SLOW_MO;
  return value ? ["--slow-mo", value] : [];
}

// All phases share one browser and one context, so a single Chrome window
// stays open for the whole pipeline instead of one opening and closing per
// phase. Declared before any top-level code that can reach closeSharedBrowser.
const shared = { browser: null, context: null };

const root = process.cwd();
const authStatePath = path.join(root, ".auth", "sls-state.json");
const configDir = path.join(root, "configs");
const defaultUrl =
  "https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/428156f1-90f1-4b64-865f-66b354b5501f";

console.log("\nSLS Community Gallery Automation");
console.log("This launcher handles authentication, inspection, guarded editing, and optional replacement.\n");

const target = await pickAndRememberModule({ root, defaultUrl, ask, stop });
const scope = target.scope;
if (scope === "activity") {
  console.log(`\nActivity URL detected. Playwright will first open the module view, then navigate into the activity.`);
} else if (target.converted) {
  console.log(`\nOpening admin Module View, then Playwright will click Edit:\n${target.adminViewUrl}`);
}

let matchingConfig = await findConfigForModule(target.id);
const inspectionConfig = matchingConfig ?? (await firstConfig());
if (!inspectionConfig) await stop("No JSON configuration was found under configs.");

if (!(await exists(authStatePath))) {
  console.log("\nNo reusable SLS session was found. Chrome will open for manual authentication.");
  if ((await runNode("scripts/auth.mjs")).status !== 0) await stop("Authentication was not completed.");
}

console.log("\nStep 1 of 3: read-only inspection");
console.log("A visible Chrome window will open so you can watch Playwright.");
let inspectionResult = await runWorkflow("inspect", inspectionConfig, target.url);
if (inspectionResult.status !== 0) {
  const authExpired = /authentication is required/i.test(inspectionResult.output) || /SLS authentication/i.test(inspectionResult.output);
  if (authExpired) {
    console.log("\nThe saved SLS session has expired or is missing. Chrome will open for manual authentication.");
    await resetSharedContext();
    if ((await runNode("scripts/auth.mjs")).status !== 0) await stop("Authentication refresh was not completed.");
    inspectionResult = await runWorkflow("inspect", inspectionConfig, target.url);
  }
}
if (inspectionResult.status !== 0) {
  await stop("Inspection did not pass. No edits were started; review the newest report and trace.");
}

if (!matchingConfig) {
  // Rather than dead-ending, build the module its own draft config: scaffold the
  // structure from the inspection, scan the content map and questions, then
  // propose an outcome per section. Nothing is edited in SLS by any of this.
  console.log("");
  console.log("No config exists for this module yet. Preparing a draft.");
  console.log("Step A: scaffolding sections and activities from the inspection...");
  if ((await runNode("scripts/scaffold-config.mjs", [target.id])).status !== 0) {
    await stop("Could not scaffold a config from the inspection report.");
  }

  const draftConfig = await findConfigForModule(target.id);
  if (!draftConfig) await stop("The scaffolded config could not be found under configs.");

  if (!(await completeConfigForTagging(draftConfig, target))) {
    await stop(
      `A draft config for module ${target.id} is ready at ${path.relative(root, draftConfig)}, ` +
        "but its curriculum could not be resolved confidently. Review the placeholders and run again.",
      0
    );
  }
  matchingConfig = draftConfig;
  console.log("The new config is complete; continuing in this same run.");
}

console.log(`\nMatching configuration: ${path.relative(root, matchingConfig)}`);

// Two ways to tag a module, and which one suits depends on the module.
//
// Surgical tagging walks the existing activities and appends tags to the questions
// that need them. Nothing is created, renamed or deleted.
//
// Duplicate-and-replace is the original method, written for early modules that
// carried no tagging: the copy is how section tagging reached the questions, and
// the original is deleted afterwards. On a module that already carries tagging it
// is a lot of churn for no gain.
// A config scaffolded but never scanned still holds placeholders, and tagging
// cannot run on those. Scanning is read-only and discovers the module's real
// subject, level and content map, so do it here rather than dead-ending.
const loaded = mergeDefaults(await loadConfig(matchingConfig));
if (unreviewedPlaceholders(loaded).length > 0) {
  console.log("\nThis config has not been scanned yet; discovering its tagging first (read-only)...");
  if (!(await completeConfigForTagging(matchingConfig, target))) {
    const stillMissing = unreviewedPlaceholders(mergeDefaults(await loadConfig(matchingConfig)));
    await stop(
      "The module carries no usable curriculum metadata, and the cached SLS taxonomies " +
        "did not produce one strong, unique match.\n\n" +
        `Review these fields in ${path.relative(root, matchingConfig)}:\n` +
        stillMissing.map((field) => `  ${field}`).join("\n") +
        "\n\nThe best candidates were printed above for review.\n" +
        "Nothing was written to SLS.",
      0
    );
  }
  console.log("The config is complete; continuing directly to tagging.");
}

const census = await taggedQuestionCensus(target.id);
if (census) {
  console.log(
    `\nFrom the last scan of this module: ${census.tagged} of ${census.total} questions ` +
      "already carry a question-level tag."
  );
}
let methodAnswer;
if (census?.total > 0 && census.tagged === 0) {
  methodAnswer = "2";
  console.log(
    "No question-level tags exist yet. Selecting duplicate-and-replace preparation automatically " +
      "so section outcomes flow into the copied activities. Originals will still be retained until the DELETE checkpoint."
  );
} else if (census?.total > 0 && census.tagged === census.total) {
  methodAnswer = "1";
  console.log("Every question is already tagged. Selecting the non-copying surgical verification pass automatically.");
} else {
  methodAnswer = await ask(
    "\nHow should this module be tagged?\n" +
      "  1  Surgical - tag the existing questions in place (nothing created or deleted)\n" +
      "  2  Duplicate and replace - the original method, copies each activity and can delete originals\n" +
      "\nChoose 1 or 2 (Enter for 1): "
  );
}

if (methodAnswer.trim() !== "2") {
  console.log("\nSurgical tagging: appending question tags in place. No activity is copied or deleted.");
  if ((await runWorkflow("tag", matchingConfig, target.url)).status !== 0) {
    await stop("The surgical tagging pass stopped at a guard. Nothing was created or deleted.");
  }
  await closeSharedBrowser();
  console.log("\nSurgical tagging completed. Review the newest report.json under output for what changed.");
  process.exit(0);
}

console.log(
  "\nStep 2 of 3: starting the guarded edit pass automatically.\n" +
  "Visible Chrome will reopen and remain visible while Playwright sets outcomes, creates or reuses copies, " +
  "and verifies question settings. Originals will remain."
);

if ((await runWorkflow("apply", matchingConfig, target.url, ["--keep-originals"])).status !== 0) {
  await stop("The non-deleting pass stopped at a guard. Originals were not requested for deletion.");
}

console.log("\nStep 2 completed. The copied activities and question settings passed the scripted checks.");
const deletionAnswer = await ask(
  "Step 3 of 3 can delete only verified originals and rename their retained copies.\n" +
  "Type DELETE to continue, or press Enter to stop with originals retained: "
);
if (deletionAnswer.trim() !== "DELETE") {
  await stop("Stopped after the non-deleting pass. Original activities were retained.", 0);
}

if (
  (await runWorkflow("resume", matchingConfig, target.url, ["--delete-originals", "--rename-copies"])).status !== 0
) {
  await stop("The replacement pass stopped at a guard. Review the newest report and trace before retrying.");
}

await closeSharedBrowser();
console.log("\nSLS workflow completed successfully.");
console.log("Review the newest report.json and trace.zip under output for the final evidence.");

// Completes a scaffolded config without requiring a second launcher run. Existing
// section metadata is authoritative and is scanned first. When the module has none,
// the resolver uses only exact wording from locally harvested SLS taxonomies and
// proceeds only when one syllabus is a strong, unique match.
async function completeConfigForTagging(configPath, selectedTarget) {
  console.log("Scanning the content map and every question (read-only)...");
  let scan = await runWorkflow("scan", configPath, selectedTarget.url);
  if (scan.status !== 0) {
    console.log("\nNo existing section taxonomy could be read. Trying cached SLS taxonomies...");
    const inferred = await runNode("scripts/resolve-config.mjs", [configPath, "--interactive"]);
    if (inferred.status !== 0) return false;

    console.log("Re-running the read-only question scan with the resolved curriculum...");
    scan = await runWorkflow("scan", configPath, selectedTarget.url);
    if (scan.status !== 0) return false;
  }

  let current = mergeDefaults(await loadConfig(configPath));
  if (unreviewedPlaceholders(current).length > 0) {
    console.log("Completing the remaining placeholders from cached SLS taxonomy wording...");
    if ((await runNode("scripts/resolve-config.mjs", [configPath, "--interactive"])).status !== 0) return false;
  }

  console.log("Proposing a learning outcome for each section from the scanned questions...");
  if ((await runNode("scripts/propose-outcomes.mjs", [selectedTarget.id, "--write", configPath])).status !== 0) {
    return false;
  }

  current = mergeDefaults(await loadConfig(configPath));
  return unreviewedPlaceholders(current).length === 0;
}

// How many questions already carry a question-level tag, read from the newest scan
// report rather than by revisiting every question. The settings card prints
// "Question Tags -" when a question has none, which is what the scan captured.
async function taggedQuestionCensus(moduleId) {
  const dir = path.join(root, "output", moduleId);
  const entries = (await fs.readdir(dir).catch(() => [])).sort().reverse();
  for (const entry of entries) {
    const raw = await fs.readFile(path.join(dir, entry, "report.json"), "utf8").catch(() => null);
    if (!raw) continue;
    let report;
    try {
      report = JSON.parse(raw);
    } catch {
      continue;
    }
    if (report.mode !== "scan" || !report.scan) continue;

    let tagged = 0;
    let total = 0;
    for (const section of report.scan.sections ?? []) {
      for (const activity of section.activities ?? []) {
        for (const question of activity.questions ?? []) {
          total += 1;
          if (questionTagState(question.text).alreadyTagged) tagged += 1;
        }
      }
    }
    return total > 0 ? { tagged, total } : null;
  }
  return null;
}

async function findConfigForModule(moduleId) {
  const entries = await fs.readdir(configDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(configDir, entry.name);
    try {
      const config = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (config?.module?.id === moduleId) return filePath;
    } catch {
      // Invalid configs are reported by the normal runner when selected directly.
    }
  }
  return null;
}

async function firstConfig() {
  const entries = await fs.readdir(configDir, { withFileTypes: true }).catch(() => []);
  const entry = entries.find((item) => item.isFile() && item.name.endsWith(".json"));
  return entry ? path.join(configDir, entry.name) : null;
}


async function runWorkflow(mode, configPath, url, extraArgs = []) {
  let options;
  try {
    options = parseArgs([mode, "--config", configPath, "--url", url, ...slowMoArgs, ...passThroughArgs, ...extraArgs]);
    if (!shared.browser) shared.browser = await launchSlsBrowser(options);
    if (!shared.context) shared.context = await createSlsContext(shared.browser, options);
  } catch (error) {
    console.error(`
Could not start the ${mode} phase: ${error.message}`);
    return { status: 1, output: error.message };
  }

  try {
    const config = applyTargetUrl(mergeDefaults(await loadConfig(options.configPath)), options);
    const result = await runSlsWorkflow(config, options, shared);
    console.log(`
SLS ${mode} run completed.`);
    console.log(`Report: ${result.reportPath}`);
    console.log(`Trace:  ${result.tracePath}`);
    return { status: 0, output: "" };
  } catch (error) {
    console.error(`
SLS run stopped: ${error.message}`);
    if (error.cause) console.error(`Cause: ${error.cause.message}`);
    return { status: 1, output: `${error.message} ${error.cause?.message ?? ""}` };
  }
}

// A refreshed sign-in writes a new storage state, which the open context cannot
// pick up, so drop it and let the next phase build one from the new state.
async function resetSharedContext() {
  if (shared.context) await shared.context.close().catch(() => {});
  shared.context = null;
}

async function closeSharedBrowser() {
  if (shared.context) await shared.context.close().catch(() => {});
  if (shared.browser) await shared.browser.close().catch(() => {});
  shared.context = null;
  shared.browser = null;
}

function runNode(script, args = []) {
  return new Promise((resolve) => {
    const capture = script === "scripts/run.mjs";
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root,
      stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
      windowsHide: false
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        process.stdout.write(text);
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
      });
    }
    child.on("error", (error) => {
      stderr += `${error.message}\n`;
    });
    child.on("close", (code) => {
      resolve({ status: code ?? 1, output: `${stdout}\n${stderr}` });
    });
  });
}


async function ask(question) {
  const prompt = readline.createInterface({ input, output });
  const answer = await prompt.question(question);
  prompt.close();
  return answer;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function stop(message, exitCode = 1) {
  await closeSharedBrowser();
  console.log(`\n${message}`);
  process.exit(exitCode);
}
