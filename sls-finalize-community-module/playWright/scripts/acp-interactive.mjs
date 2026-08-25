import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { pickAndRememberModule } from "../src/module-picker.mjs";
import { moduleWideAcpTarget } from "../src/acp-interactive.mjs";
import { runAcpInteractiveWorkflow } from "../src/acp-interactive-runner.mjs";
import { isSelectedWorkflowChild } from "../src/selected-workflow.mjs";

const root = process.cwd();
const defaultUrl =
  "https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/" +
  "b8482fad-7fa0-4c4a-a7a1-eb0c8316d91c/section/105854354/activity/109497578";
const args = process.argv.slice(2);
const headless = args.includes("--headless");
const explicitApply = args.includes("--apply");
const explicitDryRun = args.includes("--dry-run");
const selectedWorkflow = isSelectedWorkflowChild(args);

if (explicitApply && explicitDryRun) stop("Use either --apply or --dry-run, not both.");

console.log("\nSLS FA Math ACP Interactives");
console.log("Reviews every section, activity and page before changing anything.");
console.log("For each FA Math question without an existing interactive, it generates the");
console.log("matching Prompt Library prompt and adds one ACP Interactive component.");
console.log("Randomized FA Math variables and bounds become source-matching ACP sliders.");
console.log("Pages with several FA Math questions stop at a guard until page breaks exist.\n");

const selectedTarget = await pickAndRememberModule({ root, defaultUrl, ask, stop, argv: args });
const target = moduleWideAcpTarget(selectedTarget);
if (selectedTarget.scope !== "module") {
  console.log(
    "The supplied nested URL selected this module; ACP traversal will still continue through " +
      "every section, activity and page.",
  );
}

const options = {
  authStatePath: path.join(root, ".auth", "sls-state.json"),
  profileDir: path.join(root, ".auth", "chrome-profile"),
  outputRoot: path.join(root, "output"),
  stateRoot: path.join(root, ".state"),
  timeoutMs: readInteger("--timeout", 25_000),
  slowMoMs: readInteger("--slow-mo", 150),
  headless,
  acpInteractive: {
    grade: readText("--grade", "Primary 5-6"),
    subject: readText("--subject", "Mathematics"),
    generationTimeoutMs: readInteger("--generation-timeout", 600) * 1000,
    maximumInteractives: args.includes("--max-interactives")
      ? readInteger("--max-interactives", null)
      : null,
  },
  holdOpen: selectedWorkflow
    ? null
    : async () => {
        await ask("Press Enter after reviewing the verified Module View to close Chrome... ");
      },
};

let finalResult;
if (explicitApply) {
  finalResult = await runWithAuthRetry(true);
} else {
  const review = await runWithAuthRetry(false, explicitDryRun && !headless);
  finalResult = review;
  console.log(`\nReview report: ${review.reportPath}`);
  console.log(`Candidates: ${review.candidateCount}; guarded pages: ${review.blockedCount}.`);

  if (!explicitDryRun && review.blockedCount > 0) {
    stop(
      `Review found ${review.blockedCount} ambiguous page(s). Nothing was changed; ` +
        "run RUN-SLS-PAGE-BREAK.cmd first, then retry.",
    );
  } else if (!explicitDryRun && review.candidateCount > 0) {
    console.log("\nReview is clear. Continuing automatically with the guarded ACP apply pass...");
    finalResult = await runWithAuthRetry(true);
  } else if (review.candidateCount === 0) {
    console.log("No FA Math questions need a new ACP interactive. Nothing was changed in SLS.");
  } else {
    console.log("Dry-run review complete. Nothing was changed in SLS.");
  }
}

console.log(`\nReport: ${finalResult.reportPath}`);
console.log(`Trace:  ${finalResult.tracePath}`);
if (finalResult.report.mode === "apply") {
  console.log(`Added and reopened-verified ACP interactives: ${finalResult.generatedCount}.`);
}

async function runWithAuthRetry(apply, holdOpen = !headless) {
  const runOptions = { ...options, holdOpen: holdOpen ? options.holdOpen : null };
  try {
    return await runAcpInteractiveWorkflow({ target, options: runOptions, apply });
  } catch (error) {
    if (!/authentication is required|authentication was not found/i.test(error.message)) throw error;
    if (selectedWorkflow) {
      stop(
        "The reusable SLS session is missing or expired. Selected workflow will not pause for " +
          "authentication; run npm run sls:auth (npm.cmd on Windows) separately, then retry.",
      );
    }
    console.log("\nThe reusable SLS session is missing or expired. Chrome will open for manual authentication.");
    if ((await runAuth()).status !== 0) stop("Authentication refresh was not completed.");
    return runAcpInteractiveWorkflow({ target, options: runOptions, apply });
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

function readText(flag, fallback) {
  return args.includes(flag) ? requiredFlagValue(flag) : fallback;
}

function readNumber(flag, fallback) {
  if (!args.includes(flag)) return fallback;
  const value = Number(requiredFlagValue(flag));
  if (!Number.isFinite(value)) stop(`${flag} requires a number.`);
  return value;
}

function readInteger(flag, fallback) {
  const value = readNumber(flag, fallback);
  if (!Number.isInteger(value)) stop(`${flag} requires an integer.`);
  return value;
}

function requiredFlagValue(flag) {
  const index = args.indexOf(flag);
  const value = args[index + 1];
  if (!value || value.startsWith("--")) stop(`${flag} requires a value.`);
  return value;
}

function stop(message, code = 1) {
  console.error(`\n${message}`);
  process.exit(code);
}

process.on("uncaughtException", (error) => {
  console.error(`\nSLS ACP interactive automation stopped: ${error.message}`);
  process.exitCode = 1;
});

process.on("unhandledRejection", (error) => {
  console.error(`\nSLS ACP interactive automation stopped: ${error?.message ?? error}`);
  process.exitCode = 1;
});
