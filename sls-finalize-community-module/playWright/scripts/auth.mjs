import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const profileFlag = args.indexOf("--profile");
const urlFlag = args.indexOf("--url");
const authStateFlag = args.indexOf("--auth-state");
const profileDir = path.resolve(
  process.cwd(),
  profileFlag >= 0 ? args[profileFlag + 1] : path.join(".auth", "chrome-profile")
);
const targetUrl =
  urlFlag >= 0
    ? args[urlFlag + 1]
    : "https://vle.learning.moe.edu.sg/admin/community-gallery";
const authStatePath = path.resolve(
  process.cwd(),
  authStateFlag >= 0 ? args[authStateFlag + 1] : path.join(".auth", "sls-state.json")
);

// The sign-in profile is a single-instance Chrome user-data-dir: if another run
// (or a leftover window) still holds it, Chrome hands off to that instance and
// Playwright throws. Report that plainly instead of a stack trace.
let context;
let closing = false;
for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, async () => {
    if (closing) return;
    closing = true;
    // A cancelled authentication prompt must release Chrome's single-instance
    // profile lock. Without this, the next launcher misleadingly reports that
    // authentication is blocked even though only an abandoned helper window owns
    // the profile.
    await context?.close().catch(() => {});
    process.exit(exitCode);
  });
}
try {
  context = await chromium.launchPersistentContext(profileDir, {
  channel: "chrome",
  headless: false,
  viewport: null,
  args: ["--start-maximized"]
  });
} catch (error) {
  if (/existing browser session|already in use|ProcessSingleton/i.test(error.message)) {
    console.error("");
    console.error("The automation's Chrome profile is already open somewhere else.");
    console.error("This is a profile lock, not a failed SLS login.");
    console.error("Finish or close the earlier automation sign-in window, then try again.");
    console.error(`Profile: ${profileDir}`);
    process.exit(1);
  }
  console.error(`Could not open Chrome for sign-in: ${error.message.split(String.fromCharCode(10))[0]}`);
  process.exit(1);
}

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

console.log(`\nDedicated SLS profile: ${profileDir}`);
console.log("Sign in in the opened Chrome window.");
console.log("Do not enter credentials in this terminal or commit the .auth folder.\n");

const autoSignedIn = await attemptSlsLogin(page).catch((error) => {
  console.log(`Automatic login step skipped: ${error.message}`);
  return false;
});

// Only stop for a keypress when a human actually has something to do.
if (!autoSignedIn) {
  const prompt = readline.createInterface({ input, output });
  try {
    await prompt.question("After SLS is fully open, press Enter here to verify the session... ");
  } catch (error) {
    // On Windows a Ctrl+C received while readline owns stdin rejects the pending
    // question with ABORT_ERR instead of emitting SIGINT. Close the persistent
    // browser here as well so either cancellation route releases the profile.
    if (error?.code === "ABORT_ERR") {
      prompt.close();
      closing = true;
      await context.close().catch(() => {});
      process.exit(130);
    }
    throw error;
  } finally {
    prompt.close();
  }
}

const currentUrl = page.url();
const bodyText = await page.locator("body").innerText().catch(() => "");
if (
  !currentUrl.startsWith("https://vle.learning.moe.edu.sg/") ||
  /mims|sign in|log in/i.test(`${currentUrl}\n${bodyText.slice(0, 2_000)}`)
) {
  console.error(`Authentication was not verified. Current URL: ${currentUrl}`);
  await context.close();
  process.exitCode = 1;
} else {
  console.log(`Authenticated SLS session verified at: ${currentUrl}`);
  await fs.mkdir(path.dirname(authStatePath), { recursive: true });
  await context.storageState({ path: authStatePath, indexedDB: true });
  console.log(`Reusable Playwright authentication saved to: ${authStatePath}`);
  await context.close();
}

// Credentials are never typed, read or logged here. Only the *length* of the
// fields is inspected, to tell a profile that already holds a saved sign-in from
// one that does not. Returns true only when SLS was reached unaided.
async function attemptSlsLogin(page) {
  // <button class="cv-button bx--btn bx--btn--primary button login">Login With SLS</button>
  // SLS renders this after domcontentloaded, so it has to be WAITED for. Asking
  // "is it visible right now?" on a still-rendering page returned false and the
  // whole auto sign-in was skipped without a word.
  const loginButton = page
    .locator("button.login")
    .filter({ hasText: /login with sls/i })
    .first();
  try {
    await loginButton.waitFor({ state: "visible", timeout: 20_000 });
    console.log("Clicking 'LOGIN WITH SLS'...");
    await loginButton.click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(2000);
  } catch {
    console.log("No 'LOGIN WITH SLS' button appeared; assuming a session is already open.");
  }

  const password = page.locator('input[type="password"]').first();
  try {
    await password.waitFor({ state: "visible", timeout: 25_000 });
    // Give saved-credential autofill time to land before measuring the fields.
    await page.waitForTimeout(1500);
  } catch {
    // No password step at all: either already signed in, or a flow we do not drive.
    return !/\/login/i.test(new URL(page.url()).pathname);
  }

  const username = page.locator('input[type="text"], input[type="email"]').first();
  const usernameFilled = (await isVisible(username))
    ? (await username.inputValue().catch(() => "")).length > 0
    : true;
  const passwordFilled = (await password.inputValue().catch(() => "")).length > 0;

  if (!usernameFilled || !passwordFilled) {
    // Deliberately no auto-submit here. Watching for the first keystroke would
    // submit a half-typed password, so the person finishes sign-in themselves.
    console.log("");
    console.log("No saved credentials in this Chrome profile.");
    console.log("Please sign in yourself in the Chrome window that just opened.");
    return false;
  }

  console.log("Saved credentials are already filled in. Signing in automatically...");
  // The SLS sign-in button is "Login for Teaching and Learning". An anchored
  // /^login$/ never matched it, which is why auto sign-in used to fall through
  // to the manual prompt. Try the real name first, then looser fallbacks.
  const submitNames = [
    /login for teaching and learning/i,
    /^(log ?in|sign ?in|continue|submit|next)$/i,
    /log ?in|sign ?in/i
  ];
  let submit = null;
  for (const name of submitNames) {
    const candidate = page.getByRole("button", { name }).first();
    if (await isVisible(candidate)) {
      submit = candidate;
      console.log(`Submitting via "${(await candidate.innerText().catch(() => "")).trim().slice(0, 40)}"...`);
      break;
    }
  }
  if (submit) {
    await submit.click().catch(() => {});
  } else {
    console.log("No sign-in button found; pressing Enter in the password field.");
    await password.press("Enter").catch(() => {});
  }

  try {
    await page.waitForURL((url) => !/\/login/i.test(url.pathname), { timeout: 60_000 });
  } catch {
    console.log("Sign-in did not finish on its own - an extra step may be needed.");
    console.log("Please complete it in the Chrome window.");
    return false;
  }
  console.log("Signed in automatically.");
  return true;
}

async function isVisible(locator) {
  if ((await locator.count().catch(() => 0)) === 0) return false;
  return locator.isVisible().catch(() => false);
}
