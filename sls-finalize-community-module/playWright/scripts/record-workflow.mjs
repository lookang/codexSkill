import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { readRememberedModuleUrl, rememberModuleUrlIfSls } from "../src/module-picker.mjs";
import { repairUndeclaredPages } from "../src/workflow-recording.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const authState = path.join(root, ".auth", "sls-state.json");
const playwrightCli = path.join(root, "node_modules", "playwright", "cli.js");
const fallbackUrl = "https://vle.learning.moe.edu.sg/";

if (args.includes("--check")) {
  await assertReady();
  console.log("Playwright workflow recording is ready.");
  process.exit(0);
}

await assertReady();
const startUrl = await chooseStartUrl();
await rememberModuleUrlIfSls(root, startUrl);
const suppliedOutput = readFlag("--output");
const sessionName = new Date().toISOString().replace(/[:.]/g, "-");
const sessionDir = path.resolve(root, "recordings", sessionName);
const scriptPath = suppliedOutput
  ? path.resolve(root, suppliedOutput)
  : path.join(sessionDir, "recorded-workflow.spec.ts");
await fs.mkdir(path.dirname(scriptPath), { recursive: true });

console.log("\nPlaywright Workflow Recorder");
console.log(`Starting page: ${startUrl}`);
console.log(`Generated script: ${scriptPath}`);
console.log("\nUse the opened Chrome window normally. Codegen records browser-page actions.");
console.log("You may navigate to other websites or open additional tabs/pages.");
console.log("For copied text, demonstrate the transfer; the generated literal will later be");
console.log("replaced with an explicit source-text variable and destination fill step.");
console.log("Do not type passwords or private learner data into a recording.");
console.log("Close the Playwright Inspector and Chrome when the demonstration is complete.\n");

const code = await run(process.execPath, [
  playwrightCli,
  "codegen",
  "--channel",
  "chrome",
  "--target",
  "playwright-test",
  "--load-storage",
  authState,
  "--save-storage",
  authState,
  "--output",
  scriptPath,
  startUrl,
]);

if (code !== 0) {
  console.error(`\nPlaywright Codegen stopped with exit code ${code}.`);
  process.exit(code);
}

const stat = await fs.stat(scriptPath).catch(() => null);
if (!stat?.isFile() || stat.size === 0) {
  console.error("\nThe recording closed without producing a script.");
  process.exit(1);
}
const recordedSource = await fs.readFile(scriptPath, "utf8");
const repaired = repairUndeclaredPages(recordedSource);
if (repaired.source !== recordedSource) {
  await fs.writeFile(scriptPath, repaired.source, "utf8");
  console.log(`Repaired undeclared recorded tab(s): ${repaired.repairedPages.join(", ")}`);
}
console.log(`\nRecording saved: ${scriptPath}`);
console.log("The recording is ready for review and a headed replay after its copied values are checked.");
console.log("Copied text is recorded as a literal; tell Codex which transfer must remain dynamic so it can be converted to a variable.");

async function assertReady() {
  const state = await fs.stat(authState).catch(() => null);
  if (!state?.isFile()) {
    throw new Error(`Reusable SLS authentication was not found: ${authState}`);
  }
  const executable = await fs.stat(playwrightCli).catch(() => null);
  if (!executable?.isFile()) {
    throw new Error("Playwright is not installed. Run 00-install-and-check.cmd first.");
  }
}

async function chooseStartUrl() {
  const flagged = readFlag("--url");
  const positional = args.find((value) => /^https?:\/\//i.test(value));
  const remembered = await readRememberedModuleUrl(root);
  const fallback = remembered || fallbackUrl;
  if (flagged || positional) return validateUrl(flagged || positional);

  console.log("\nDefault starting page:");
  console.log(`  ${fallback}`);
  const prompt = readline.createInterface({ input, output });
  const answer = await prompt.question("\nPaste a starting URL, or press Enter for the page above: ");
  prompt.close();
  return validateUrl(answer.trim() || fallback);
}

function validateUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Not a valid URL: ${value}`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("The starting URL must use HTTP or HTTPS.");
  }
  return parsed.toString();
}

function readFlag(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      stdio: "inherit",
      windowsHide: false,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}
