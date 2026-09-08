import process from "node:process";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { pickAndRememberModule } from "../src/module-picker.mjs";
import {
  isReusableSlsAuthFailure,
  INDIVIDUAL_STAGE_BEHAVIOR_FLAG,
  parseSelectedWorkflowSteps,
  SELECTED_WORKFLOW_CHILD_FLAG,
  SELECTED_WORKFLOW_STAGES,
} from "../src/selected-workflow.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const defaultUrl =
  "https://vle.learning.moe.edu.sg/community-gallery/module/view/" +
  "b9d790d6-8775-4fd7-bc11-7d86d2077fbe";

console.log("\nSLS Selected Finalization Workflow");
console.log("Selects the module once and runs the chosen guarded stages in order.");
console.log("Each stage inventories SLS first and leaves already-complete work unchanged.\n");

const target = await pickAndRememberModule({ root, defaultUrl, ask, stop, argv: args });
const selection = readFlag("--steps") ?? (
  args.includes("--auto")
    ? "AUTO"
    : (args.includes("--complete") ? "COMPLETE" : await askForSteps())
);
const unattended = args.includes("--unattended");
let stages;
try {
  stages = parseSelectedWorkflowSteps(selection);
} catch (error) {
  stop(error.message);
}

console.log(`\nModule: ${target.sourceUrl}`);
console.log("Selected stages:");
for (const stage of stages) console.log(`  ${stage.number}. ${stage.label}`);

for (let index = 0; index < stages.length; index += 1) {
  const stage = stages[index];
  console.log(`\n========== Stage ${index + 1} of ${stages.length}: ${stage.label} ==========`);
  const childArgs = [
    stage.script,
    ...stage.args,
    "--url",
    target.sourceUrl,
    SELECTED_WORKFLOW_CHILD_FLAG,
  ];
  if (!unattended) childArgs.push(INDIVIDUAL_STAGE_BEHAVIOR_FLAG);
  if (args.includes("--headless")) childArgs.push("--headless");
  if (stage.script !== "scripts/module-action.mjs") forwardPair(childArgs, "--slow-mo");
  if (stage.id === "automation") {
    forwardSwitch(childArgs, "--tag-questions");
    forwardSwitch(childArgs, "--refresh-taxonomy");
    forwardSwitch(childArgs, "--duplicate-and-replace");
    forwardSwitch(childArgs, "--section-tags-only");
    forwardPair(childArgs, "--tag-only-question");
  }
  if (stage.id === "page-break") {
    forwardSwitch(childArgs, "--verify");
    forwardPair(childArgs, "--timeout");
    forwardPair(childArgs, "--long-page-viewports");
    forwardPair(childArgs, "--chunk-viewports");
    forwardPair(childArgs, "--max-breaks-per-activity");
  }
  if (stage.id === "thumbnail") {
    forwardPair(childArgs, "--prompt");
    if (args.includes("--replace-existing")) childArgs.push("--replace-existing");
  }
  if (stage.id === "acp-interactive") {
    forwardPair(childArgs, "--grade");
    forwardPair(childArgs, "--subject");
    forwardPair(childArgs, "--generation-timeout");
    forwardPair(childArgs, "--max-interactives");
  }
  let result = await runNode(childArgs, { captureOutput: true });
  if (result.code !== 0 && isReusableSlsAuthFailure(result.output)) {
    console.log(
      "\nThe reusable SLS session is missing or expired. " +
        "The selected workflow will refresh it once in visible Chrome, then resume this stage.",
    );
    const authResult = await runNode(["scripts/auth.mjs", "--url", target.sourceUrl]);
    if (authResult.code !== 0) {
      stop(
        "Authentication refresh was not completed. Later stages were not started. " +
          "Finish or close the visible sign-in window, then retry.",
        authResult.code,
      );
    }
    console.log(`\nAuthentication refreshed. Retrying: ${stage.label}`);
    result = await runNode(childArgs, { captureOutput: true });
  }
  if (result.code !== 0) {
    stop(
      `${stage.label} stopped at a guard (exit ${result.code}). ` +
        "Later stages were not started; review the report shown above.",
      result.code,
    );
  }
}

console.log("\nAll selected stages finished successfully.");

async function askForSteps() {
  console.log("Choose any combination:");
  for (const stage of SELECTED_WORKFLOW_STAGES) {
    console.log(`  ${stage.number}. ${stage.label}`);
  }
  return ask(
    "\nType 1-7, a range/subset such as 1-4,6,7, or individual choices such as 1,2,5. " +
      "Press Enter or type COMPLETE for Automation, Page Break, Thumbnail, and Add Wee Loo Kang. " +
      "Type AUTO only when you want all seven stages: ",
  );
}

function readFlag(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) stop(`${flag} requires a value.`);
  return value;
}

function forwardPair(targetArgs, flag) {
  const value = readFlag(flag);
  if (value !== null) targetArgs.push(flag, value);
}

function forwardSwitch(targetArgs, flag) {
  if (args.includes(flag)) targetArgs.push(flag);
}

function runNode(childArgs, { captureOutput = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, childArgs, {
      cwd: root,
      stdio: captureOutput ? ["inherit", "pipe", "pipe"] : "inherit",
      windowsHide: false,
    });
    let captured = "";
    if (captureOutput) {
      child.stdout.on("data", (chunk) => {
        captured += chunk.toString();
        process.stdout.write(chunk);
      });
      child.stderr.on("data", (chunk) => {
        captured += chunk.toString();
        process.stderr.write(chunk);
      });
    }
    child.on("error", (error) => resolve({ code: 1, output: `${captured}\n${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, output: captured }));
  });
}

async function ask(question) {
  const prompt = readline.createInterface({ input, output });
  const answer = await prompt.question(question);
  prompt.close();
  return answer;
}

function stop(message, code = 1) {
  console.error(`\n${message}`);
  process.exit(code);
}
