import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { pickAndRememberModule } from "../src/module-picker.mjs";
import { runPageBreakWorkflow } from "../src/page-break-runner.mjs";
import { decidePageBreakReview } from "../src/page-break.mjs";
import { isSelectedWorkflowChild } from "../src/selected-workflow.mjs";

const root = process.cwd();
const defaultUrl =
  "https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/" +
  "b9d790d6-8775-4fd7-bc11-7d86d2077fbe/section/105854425/activity/109477492?pageNo=1";
const args = process.argv.slice(2);
const headless = args.includes("--headless");
const explicitApply = args.includes("--apply");
const explicitDryRun = args.includes("--dry-run");
const verifyAfterApply = args.includes("--verify");
const selectedWorkflow = isSelectedWorkflowChild(args);

if (explicitApply && explicitDryRun) stop("Use either --apply or --dry-run, not both.");

console.log("\nSLS Meaningful Page Breaks");
console.log("Reviews every section and activity before changing anything.");
console.log("Places each visual question row on its own page when SLS exposes a safe divider.");
console.log("Side-by-side questions in the same row remain together.");
console.log("Single-question pages retain the existing length-based chunking rule.");
console.log(
  verifyAfterApply
    ? "Final full-module reopen audit: enabled (--verify).\n"
    : "Final full-module reopen audit: skipped; each split is still save-checked. Use --verify to enable it.\n",
);

const target = await pickAndRememberModule({ root, defaultUrl, ask, stop, argv: args });

const options = {
  authStatePath: path.join(root, ".auth", "sls-state.json"),
  profileDir: path.join(root, ".auth", "chrome-profile"),
  outputRoot: path.join(root, "output"),
  stateRoot: path.join(root, ".state"),
  timeoutMs: readInteger("--timeout", 20_000),
  slowMoMs: readInteger("--slow-mo", 150),
  headless,
  verifyAfterApply,
  pageBreakPolicy: {
    longPageViewports: readNumber("--long-page-viewports", 1.75),
    targetChunkViewports: readNumber("--chunk-viewports", 1.1),
    maximumBreaksPerActivity: readInteger("--max-breaks-per-activity", 20),
  },
  holdOpen: selectedWorkflow
    ? null
    : async () => {
        await ask("Press Enter after reviewing the final Module View to close Chrome... ");
      },
};

let finalResult;
if (explicitApply) {
  finalResult = await runWithAuthRetry(true);
} else {
  const review = await runWithAuthRetry(false, explicitDryRun);
  finalResult = review;
  const decision = decidePageBreakReview(review, { dryRun: explicitDryRun });
  console.log(`\nReview report: ${review.reportPath}`);
  console.log(
    `Candidates: ${decision.candidateCount}; ` +
      `skipped ambiguous pages: ${decision.skippedAmbiguousPages}.`,
  );

  if (decision.skippedAmbiguousPages > 0) {
    console.log(
      `Leaving ${decision.skippedAmbiguousPages} non-standard or ambiguous page(s) unchanged.`,
    );
  }

  if (decision.apply) {
    console.log("\nContinuing automatically with the clear, guarded page-break candidates...");
    finalResult = await runWithAuthRetry(true);
  } else if (decision.candidateCount === 0) {
    console.log("No safe page-break candidates were found. Nothing was changed in SLS.");
  } else {
    console.log("Dry-run review complete. Nothing was changed in SLS.");
  }
}

console.log(`\nReport: ${finalResult.reportPath}`);
console.log(`Trace:  ${finalResult.tracePath}`);
if (finalResult.report.mode === "apply") {
  console.log(`Inserted page breaks: ${finalResult.report.insertedBreaks.length}.`);
  console.log(`Full reopen audit: ${finalResult.report.verificationRequested ? "completed" : "skipped"}.`);
  console.log(
    `Ambiguous pages left unchanged: ${finalResult.report.skippedAmbiguousPages.length}.`,
  );
}

async function runWithAuthRetry(apply, holdOpen = true) {
  const runOptions = { ...options, holdOpen: holdOpen ? options.holdOpen : null };
  try {
    return await runPageBreakWorkflow({ target, options: runOptions, apply });
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
    return runPageBreakWorkflow({ target, options: runOptions, apply });
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

function readNumber(flag, fallback) {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value)) stop(`${flag} requires a number.`);
  return value;
}

function readInteger(flag, fallback) {
  const value = readNumber(flag, fallback);
  if (!Number.isInteger(value)) stop(`${flag} requires an integer.`);
  return value;
}

function stop(message, code = 1) {
  console.error(`\n${message}`);
  process.exit(code);
}

process.on("uncaughtException", (error) => {
  console.error(`\nSLS page-break automation stopped: ${error.message}`);
  process.exitCode = 1;
});

process.on("unhandledRejection", (error) => {
  console.error(`\nSLS page-break automation stopped: ${error?.message ?? error}`);
  process.exitCode = 1;
});
