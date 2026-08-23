import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { pickAndRememberModule } from "../src/module-picker.mjs";
import { runRemoveCopyWorkflow } from "../src/remove-copy-runner.mjs";
import { isSelectedWorkflowChild } from "../src/selected-workflow.mjs";

const root = process.cwd();
const defaultUrl =
  "https://vle.learning.moe.edu.sg/community-gallery/module/view/" +
  "b9d790d6-8775-4fd7-bc11-7d86d2077fbe";
const args = process.argv.slice(2);
const headless = args.includes("--headless");
const explicitApply = args.includes("--apply");
const explicitDryRun = args.includes("--dry-run");
const selectedWorkflow = isSelectedWorkflowChild(args);

if (explicitApply && explicitDryRun) stop("Use either --apply or --dry-run, not both.");

console.log("\nSLS Remove Leftover Copies");
console.log("Reviews every section before renaming anything.");
console.log('Only exact activity titles ending in " - Copy" are considered.');
console.log("The suffix is removed only when the clean title is not already present.\n");

const target = await pickAndRememberModule({ root, defaultUrl, ask, stop, argv: args });
const options = {
  authStatePath: path.join(root, ".auth", "sls-state.json"),
  profileDir: path.join(root, ".auth", "chrome-profile"),
  outputRoot: path.join(root, "output"),
  stateRoot: path.join(root, ".state"),
  timeoutMs: readInteger("--timeout", 20_000),
  slowMoMs: readInteger("--slow-mo", 150),
  headless,
  holdOpen: null,
};

const review = await runWithAuthRetry(false, false);
console.log(`\nReview report: ${review.reportPath}`);
console.log(`Safe suffix-removal candidates: ${review.candidateCount}; skipped copies: ${review.skippedCount}.`);

let finalResult = review;
if (explicitDryRun || review.candidateCount === 0) {
  console.log(
    explicitDryRun
      ? "Dry-run complete. Nothing was changed in SLS."
      : "No safely renameable copies were found. Nothing was changed in SLS.",
  );
} else {
  console.log("\nContinuing automatically with the safe suffix-removal candidates...");
  finalResult = await runWithAuthRetry(true);
  console.log(`\nRenamed and reopened-verified activities: ${finalResult.report.renamedCopies.length}.`);
}

console.log(`\nReport: ${finalResult.reportPath}`);
console.log(`Trace:  ${finalResult.tracePath}`);

async function runWithAuthRetry(apply) {
  const runOptions = { ...options };
  try {
    return await runRemoveCopyWorkflow({ target, options: runOptions, apply });
  } catch (error) {
    if (!/authentication is required|authentication was not found/i.test(error.message)) throw error;
    if (selectedWorkflow) {
      stop(
        "The reusable SLS session is missing or expired. Selected workflow requires a reusable " +
          "SLS session so its coordinator can refresh authentication and retry this stage.",
      );
    }
    console.log("\nThe reusable SLS session is missing or expired. Chrome will open for manual authentication.");
    if ((await runAuth()).status !== 0) stop("Authentication refresh was not completed.");
    return runRemoveCopyWorkflow({ target, options: runOptions, apply });
  }
}

function runAuth() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/auth.mjs"], {
      cwd: root,
      stdio: "inherit",
      windowsHide: false,
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

function readInteger(flag, fallback) {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value)) stop(`${flag} requires an integer.`);
  return value;
}

function stop(message, code = 1) {
  console.error(`\n${message}`);
  process.exit(code);
}

process.on("uncaughtException", (error) => {
  console.error(`\nSLS copy-suffix cleanup stopped: ${error.message}`);
  process.exitCode = 1;
});

process.on("unhandledRejection", (error) => {
  console.error(`\nSLS copy-suffix cleanup stopped: ${error?.message ?? error}`);
  process.exitCode = 1;
});
