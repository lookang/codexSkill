import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig, mergeDefaults } from "../src/io.mjs";
import { runModuleAction, validateModuleAction } from "../src/module-actions.mjs";
import { pickAndRememberModule } from "../src/module-picker.mjs";
import { isSelectedWorkflowChild } from "../src/selected-workflow.mjs";

const root = process.cwd();
const configDir = path.join(root, "configs");
const defaultUrl = "https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/428156f1-90f1-4b64-865f-66b354b5501f";
const action = process.argv[2];
const selectedWorkflow = isSelectedWorkflowChild(process.argv.slice(2));
const labels = {
  gamify: "Gamify SLS Module",
  "add-teacher": "Add WEE LOO KANG as Credited Teacher",
  thumbnail: "Generate the Module Thumbnail"
};

if (!labels[action]) stop("Use module-action.mjs with gamify, add-teacher, or thumbnail.");
// --headless is for unattended runs: no window, no pause to review it. The saved
// state is still verified by reopening it, and a screenshot is written either way.
const headless = process.argv.includes("--headless");
console.log(`\n${labels[action]}`);
console.log(
  headless
    ? "Running headless. The saved state is verified by reopening it, and a screenshot is written.\n"
    : "The browser stays visible, and the command verifies the saved state after reopening it.\n"
);

const target = await pickAndRememberModule({
  root: process.cwd(),
  defaultUrl,
  ask,
  stop: async (message) => {
    console.error(message);
    process.exit(1);
  }
});

let configPath = await findConfigForModule(target.id);
if (!configPath && action === "gamify") {
  // Match the one-shot launcher: a module without a config gets one prepared
  // rather than a dead end. Inspect it read-only for its structure, then
  // scaffold a config (which now includes a gamification block).
  console.log(`No config exists for module ${target.id} yet. Preparing one.`);
  const seedConfig = await firstConfig();
  if (!seedConfig) stop("No JSON configuration was found under configs to inspect with.");

  console.log("Step 1 of 2: read-only inspection to read the module's structure...");
  const inspected = await runNode("scripts/run.mjs", [
    "inspect",
    "--config",
    seedConfig,
    "--url",
    target.url
  ]);
  if (inspected.status !== 0) stop("The read-only inspection did not complete; no changes were made.");

  console.log("Step 2 of 2: scaffolding a config from that inspection...");
  if ((await runNode("scripts/scaffold-config.mjs", [target.id])).status !== 0) {
    stop("Could not scaffold a config from the inspection report.");
  }

  configPath = await findConfigForModule(target.id);
  if (!configPath) stop("The scaffolded config could not be found under configs.");
  console.log(`Using ${path.relative(root, configPath)}.`);
}
const config = configPath
  ? mergeDefaults(await loadConfig(configPath))
  : { module: { id: target.id, title: null } };
try {
  validateModuleAction(action, config);
} catch (error) {
  stop(error.message);
}

const options = {
  authStatePath: path.join(root, ".auth", "sls-state.json"),
  profileDir: path.join(root, ".auth", "chrome-profile"),
  outputRoot: path.join(root, "output"),
  stateRoot: path.join(root, ".state"),
  timeoutMs: 20_000,
  headless,
  imagePrompt: readPrompt(),
  replaceExisting: process.argv.includes("--replace-existing"),
  holdOpen: selectedWorkflow
    ? null
    : async () => {
        await ask("Press Enter after reviewing the verified browser state to close Chrome... ");
      }
};

if (!(await exists(options.authStatePath))) {
  if (selectedWorkflow) {
    stop(
      "Selected workflow requires a reusable SLS session so its coordinator can refresh " +
        "authentication and retry this stage.",
    );
  }
  console.log("No reusable SLS session was found. Chrome will open for manual authentication.");
  if ((await runAuth()).status !== 0) stop("Authentication was not completed.");
}

let result;
try {
  result = await runModuleAction({ action, config, target, options });
} catch (error) {
  if (!/authentication is required/i.test(error.message)) throw error;
  if (selectedWorkflow) {
    stop(
      "The reusable SLS session expired. Selected workflow will not pause for authentication so " +
        "its coordinator can refresh and retry this stage.",
    );
  }
  console.log("\nThe saved SLS session has expired. Chrome will open for manual authentication.");
  if ((await runAuth()).status !== 0) stop("Authentication refresh was not completed.");
  result = await runModuleAction({ action, config, target, options });
}

console.log(`\n${labels[action]} completed successfully.`);
console.log(`Report: ${result.reportPath}`);
console.log(`Trace:  ${result.tracePath}`);


async function firstConfig() {
  const dir = path.join(root, "configs");
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const entry = entries.find((item) => item.isFile() && item.name.endsWith(".json"));
  return entry ? path.join(dir, entry.name) : null;
}

function runNode(script, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: "inherit" });
    child.on("error", () => resolve({ status: 1 }));
    child.on("close", (code) => resolve({ status: code ?? 1 }));
  });
}

async function findConfigForModule(moduleId) {
  const entries = await fs.readdir(configDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(configDir, entry.name);
    try {
      const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (raw?.module?.id === moduleId) return filePath;
    } catch {
      // Invalid JSON is ignored here and remains detectable by the normal config validation.
    }
  }
  return null;
}

function runAuth() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/auth.mjs"], {
      cwd: root,
      stdio: "inherit",
      windowsHide: false
    });
    child.on("close", (code) => resolve({ status: code ?? 1 }));
    child.on("error", () => resolve({ status: 1 }));
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

function stop(message, code = 1) {
  console.error(`\n${message}`);
  process.exit(code);
}

process.on("uncaughtException", (error) => {
  console.error(`\nSLS action stopped: ${error.message}`);
  process.exitCode = 1;
});

process.on("unhandledRejection", (error) => {
  console.error(`\nSLS action stopped: ${error?.message ?? error}`);
  process.exitCode = 1;
});

// --prompt "..." describes the picture to generate. Without it the action builds a
// prompt from the module title.
function readPrompt() {
  const argv = process.argv.slice(2);
  const flag = argv.indexOf("--prompt");
  return flag >= 0 && argv[flag + 1] ? argv[flag + 1] : null;
}
