import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { pickAndRememberModule } from "../src/module-picker.mjs";
import { moduleWideAcpTarget } from "../src/acp-interactive.mjs";
import { formatAcpFailureSummary, runAcpInteractiveWorkflow } from "../src/acp-interactive-runner.mjs";
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
const provider = readText("--provider", "sls").toLowerCase();
if (!new Set(["sls", "chatgpt"]).has(provider)) {
  stop("--provider must be either sls or chatgpt.");
}
const usingChatGpt = provider === "chatgpt";

if (explicitApply && explicitDryRun) stop("Use either --apply or --dry-run, not both.");

console.log(usingChatGpt ? "\nSLS FA Math ChatGPT Interactives" : "\nSLS FA Math ACP Interactives");
console.log("Reviews every section, activity and page before changing anything.");
if (usingChatGpt) {
  console.log("For each eligible FA Math question, it sends the matching Prompt Library");
  console.log("text to ChatGPT, preferring GPT-5.6 Sol High when available, downloads a real ZIP,");
  console.log("and warns before continuing with the currently selected fallback model.");
  console.log("validates root-level index.html, and uploads the ZIP to the same SLS page.");
  console.log("Existing native ACP ZIPs are preserved for side-by-side comparison.");
} else {
  console.log("For each FA Math question without an existing interactive, it generates the");
  console.log("matching Prompt Library prompt and adds one ACP Interactive component.");
}
console.log("Randomized FA Math variables and bounds become source-matching interactive sliders.");
console.log("Multipart questions keep their shared context and nested parts in one interactive.");
console.log("Pages with several top-level FA Math questions stop until page breaks exist.\n");

const selectedTarget = await pickAndRememberModule({ root, defaultUrl, ask, stop, argv: args });
const target = moduleWideAcpTarget(selectedTarget);
if (selectedTarget.scope !== "module") {
  console.log(
    `The supplied nested URL selected this module; ${usingChatGpt ? "GPT" : "ACP"} traversal will still continue through ` +
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
    generationTimeoutMs: readInteger("--generation-timeout", usingChatGpt ? 1800 : 200) * 1000,
    maximumInteractives: args.includes("--max-interactives")
      ? readInteger("--max-interactives", null)
      : null,
  },
  gptInteractive: {
    profileDir: path.join(root, ".auth", "chatgpt-profile"),
    waitForUser: ask,
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

  if (!explicitDryRun && review.failureCount > 0) {
    printAcpFailures(review);
    stop(
      `Review hit ${review.failureCount} page error(s). Nothing was changed; ` +
        "inspect the report and trace before applying.",
    );
  } else if (!explicitDryRun && review.blockedCount > 0) {
    stop(
      `Review found ${review.blockedCount} ambiguous page(s). Nothing was changed; ` +
        "run RUN-SLS-PAGE-BREAK.cmd first, then retry.",
    );
  } else if (!explicitDryRun && review.candidateCount > 0) {
    console.log(
      `\nReview is clear. Continuing automatically with the guarded ${usingChatGpt ? "ChatGPT" : "ACP"} apply pass...`,
    );
    finalResult = await runWithAuthRetry(true);
  } else if (review.candidateCount === 0) {
    console.log(
      `No FA Math questions need a new ${usingChatGpt ? "ChatGPT" : "ACP"} interactive. Nothing was changed in SLS.`,
    );
  } else {
    console.log("Dry-run review complete. Nothing was changed in SLS.");
  }
}

console.log(`\nReport: ${finalResult.reportPath}`);
console.log(`Trace:  ${finalResult.tracePath}`);
if (finalResult.report.mode === "apply") {
  console.log(
    `Added ${usingChatGpt ? "ChatGPT" : "ACP"} interactives with reopen evidence: ` +
      `${finalResult.verifiedGeneratedCount}.`,
  );
}
printAcpFailures(finalResult);

async function runWithAuthRetry(apply, holdOpen = !headless) {
  const runOptions = { ...options, holdOpen: holdOpen ? options.holdOpen : null };
  try {
    return await runAcpInteractiveWorkflow({ target, options: runOptions, apply, provider });
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
    return runAcpInteractiveWorkflow({ target, options: runOptions, apply, provider });
  }
}

function printAcpFailures(result) {
  if (!result?.failureCount) return;
  console.log(`\n${usingChatGpt ? "GPT" : "ACP"} pages needing follow-up: ${result.failureCount}.`);
  for (const line of formatAcpFailureSummary(result.report)) {
    console.log(`  - ${line}`);
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
  console.error(`\nSLS ${usingChatGpt ? "GPT" : "ACP"} interactive automation stopped: ${error.message}`);
  process.exitCode = 1;
});

process.on("unhandledRejection", (error) => {
  console.error(`\nSLS ${usingChatGpt ? "GPT" : "ACP"} interactive automation stopped: ${error?.message ?? error}`);
  process.exitCode = 1;
});
